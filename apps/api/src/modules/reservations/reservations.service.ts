import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/db/database.service';
import { bookings } from '../../common/db/schema';
import { eq } from 'drizzle-orm';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  InvalidStateTransitionError,
  AppError,
} from '../../common/errors/app-error';
import {
  CreateHoldRequestDto,
  BookingHoldResponseDto,
  CancelHoldResponseDto,
  CreateFreeBookingRequestDto,
  CancelBookingRequestDto,
  UpdateBookingStatusRequestDto,
  BookingStatusEventDto,
  BookingLifecycleDetailDto,
  BookingListQueryDto,
  BookingStatus,
  AllocationStatus,
  ErrorCode,
} from '@dine/contracts';
import { calculateDiningInterval } from '../availability/availability.service';

/**
 * List of allocation statuses that are protected from concurrent overlap
 * per Blueprint §5.3, §7, and the PostgreSQL GiST exclusion constraint.
 */
export const PROTECTED_ALLOCATION_STATUSES = new Set([
  'HELD',
  'OFFER_HELD',
  'PAYMENT_PENDING',
  'PAYMENT_REVIEW',
  'CONFIRMED',
  'READY',
  'SEATED',
  'COMPLETED',
]);

/**
 * Valid state transitions for bookings per Blueprint §8 and ADR-001/007.
 */
export const VALID_BOOKING_TRANSITIONS: Record<string, Set<string>> = {
  HOLD_ACTIVE: new Set(['CONFIRMED', 'PAYMENT_PENDING', 'EXPIRED', 'CANCELLED']),
  PAYMENT_PENDING: new Set(['CONFIRMED', 'PAYMENT_REVIEW', 'PAYMENT_FAILED', 'CANCELLED']),
  PAYMENT_REVIEW: new Set(['CONFIRMED', 'EXPIRED']),
  CONFIRMED: new Set(['READY', 'SEATED', 'CANCELLED', 'NO_SHOW']),
  READY: new Set(['SEATED', 'CANCELLED', 'NO_SHOW']),
  SEATED: new Set(['COMPLETED']),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
  NO_SHOW: new Set(),
  EXPIRED: new Set(),
  PAYMENT_FAILED: new Set(),
};

/**
 * Verifies whether a requested booking state transition is permitted.
 */
export function isValidBookingTransition(fromStatus: string, toStatus: string): boolean {
  const allowed = VALID_BOOKING_TRANSITIONS[fromStatus];
  return Boolean(allowed && allowed.has(toStatus));
}

/**
 * Canonical mapping from BookingStatus to Table Allocation status.
 * Used to keep physical table inventory protection in sync with booking state.
 */
export const BOOKING_TO_ALLOCATION_STATUS_MAP: Record<string, string> = {
  HOLD_ACTIVE: 'HELD',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_REVIEW: 'PAYMENT_REVIEW',
  CONFIRMED: 'CONFIRMED',
  READY: 'READY',
  SEATED: 'SEATED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'RELEASED',
  EXPIRED: 'RELEASED',
  PAYMENT_FAILED: 'RELEASED',
};

/**
 * Maps a booking status to its corresponding table allocation status.
 */
export function mapBookingToAllocationStatus(bookingStatus: string): string {
  return BOOKING_TO_ALLOCATION_STATUS_MAP[bookingStatus] || 'RELEASED';
}

/**
 * Returns true if the booking status is a terminal state (no further transitions allowed).
 */
export function isTerminalBookingStatus(status: string): boolean {
  return ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'PAYMENT_FAILED'].includes(status);
}

/**
 * Returns true if the booking status can be cancelled by a customer or staff.
 */
export function isCancellableBookingStatus(status: string): boolean {
  return ['HOLD_ACTIVE', 'PAYMENT_PENDING', 'CONFIRMED', 'READY'].includes(status);
}

/**
 * Deterministic JSON stringifier that sorts object keys recursively.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => JSON.stringify(key) + ':' + canonicalJson(obj[key]));
  return '{' + parts.join(',') + '}';
}

/**
 * Computes deterministic SHA-256 scope key for idempotency storage.
 * Formula: sha256(user_id + ":" + endpoint + ":" + idempotency_key)
 */
export function computeScopeKey(userId: string, endpoint: string, idempotencyKey: string): string {
  return crypto
    .createHash('sha256')
    .update(`${userId}:${endpoint}:${idempotencyKey}`)
    .digest('hex');
}

/**
 * Computes deterministic SHA-256 hash of normalized request payload.
 */
export function hashPayload(payload: any): string {
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

/**
 * Evaluates whether an allocation status is currently protected by GiST exclusion.
 */
export function isAllocationProtected(status: string): boolean {
  return PROTECTED_ALLOCATION_STATUSES.has(status);
}

/**
 * Determines whether a protected allocation is safely expired.
 * Invariant: Only HELD allocations whose server expires_at timestamp has passed
 * can be safely transitioned to RELEASED/EXPIRED.
 * Unresolved states (PAYMENT_PENDING, PAYMENT_REVIEW, CONFIRMED) CANNOT be automatically expired.
 */
export function isHoldSafelyExpired(
  status: string,
  expiresAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (status !== 'HELD') {
    return false;
  }
  if (!expiresAt) {
    return false;
  }
  const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !isNaN(expiryDate.getTime()) && expiryDate.getTime() < now.getTime();
}

/**
 * Calculates server-controlled hold expiry instant. Default TTL: 15 minutes.
 */
export function calculateHoldExpiry(now: Date = new Date(), ttlMinutes: number = 15): Date {
  return new Date(now.getTime() + ttlMinutes * 60 * 1000);
}

/**
 * Parses PostgreSQL tstzrange string format: '["2026-11-10 19:00:00+00","2026-11-10 20:45:00+00")'
 */
export function parseRangeBounds(rangeStr: string): { start: string; end: string } {
  if (!rangeStr || typeof rangeStr !== 'string') {
    return { start: '', end: '' };
  }
  const cleaned = rangeStr.replace(/^[[()]/, '').replace(/[\])]$/, '');
  const parts = cleaned.split(',');
  if (parts.length >= 2) {
    const rawStart = parts[0].replace(/^"/, '').replace(/"$/, '').trim();
    const rawEnd = parts[1].replace(/^"/, '').replace(/"$/, '').trim();
    const startDate = new Date(rawStart);
    const endDate = new Date(rawEnd);
    return {
      start: isNaN(startDate.getTime()) ? rawStart : startDate.toISOString(),
      end: isNaN(endDate.getTime()) ? rawEnd : endDate.toISOString(),
    };
  }
  return { start: '', end: '' };
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Retrieves single booking by ID (legacy endpoint).
   */
  async getReservation(id: string) {
    try {
      const pool = this.db.getPool();
      if (pool && typeof pool.query === 'function') {
        const res = await pool.query('SELECT * FROM bookings WHERE id = $1 LIMIT 1', [id]);
        if (res.rows.length > 0) {
          return res.rows[0];
        }
      }
    } catch {}

    const result = await this.db.getDb().select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!result[0]) {
      throw new NotFoundError(`Booking ${id} not found`);
    }
    return result[0];
  }

  /**
   * Creates an atomic booking hold with idempotency protection and GiST overlap safety.
   * Fulfills EPIC-008 tasks T01 through T06.
   */
  async createHold(
    userId: string,
    idempotencyKey: string,
    dto: CreateHoldRequestDto,
    meta?: { requestId?: string; ipAddress?: string }
  ): Promise<{ result: BookingHoldResponseDto; isReplay: boolean }> {
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new ValidationError('Idempotency-Key header is required for hold creation');
    }

    if (!dto || !dto.restaurant_id || !dto.table_id || !dto.requested_start || dto.party_size === undefined) {
      throw new ValidationError(
        'restaurant_id, table_id, requested_start, and party_size are required parameters'
      );
    }

    if (typeof dto.party_size !== 'number' || !Number.isInteger(dto.party_size) || dto.party_size <= 0) {
      throw new ValidationError('party_size must be a positive integer');
    }

    const endpoint = 'POST /booking-holds';
    const scopeKey = computeScopeKey(userId, endpoint, idempotencyKey.trim());
    const normalizedPayload = {
      party_size: dto.party_size,
      requested_start: dto.requested_start,
      restaurant_id: dto.restaurant_id,
      table_id: dto.table_id,
    };
    const payloadHash = hashPayload(normalizedPayload);

    const pool = this.db.getPool();

    // 1. Initial Idempotency Cache Replay Check
    if (pool && typeof pool.query === 'function') {
      const existingIdemp = await pool.query(
        'SELECT payload_hash, status_code, response_body FROM idempotency_records WHERE scope_key = $1',
        [scopeKey]
      );
      if (existingIdemp.rows.length > 0) {
        const cached = existingIdemp.rows[0];
        if (cached.payload_hash === payloadHash) {
          this.logger.log(`Idempotent replay served for scope_key ${scopeKey}`);
          return {
            result: cached.response_body as BookingHoldResponseDto,
            isReplay: true,
          };
        } else {
          throw new ConflictError(
            'The idempotency key was already used with a different request payload.',
            ErrorCode.IDEMPOTENCY_CONFLICT
          );
        }
      }
    }

    // 2. Transactional Hold Orchestration
    return this.db.withTransaction(async (client) => {
      // 2.1 Recheck idempotency with lock inside transaction
      const idempTx = await client.query(
        'SELECT payload_hash, status_code, response_body FROM idempotency_records WHERE scope_key = $1 FOR UPDATE',
        [scopeKey]
      );
      if (idempTx.rows.length > 0) {
        const cached = idempTx.rows[0];
        if (cached.payload_hash === payloadHash) {
          return {
            result: cached.response_body as BookingHoldResponseDto,
            isReplay: true,
          };
        } else {
          throw new ConflictError(
            'The idempotency key was already used with a different request payload.',
            ErrorCode.IDEMPOTENCY_CONFLICT
          );
        }
      }

      // 2.2 Table Row Lock (SELECT ... FOR UPDATE)
      const tableRes = await client.query(
        `SELECT id, floor_id, table_number, capacity, min_covers, is_active 
         FROM restaurant_tables 
         WHERE id = $1 FOR UPDATE`,
        [dto.table_id]
      );
      if (tableRes.rows.length === 0) {
        throw new NotFoundError(`Table ${dto.table_id} not found`);
      }
      const table = tableRes.rows[0];
      if (!table.is_active) {
        throw new ConflictError(`Table ${table.table_number} is inactive`, ErrorCode.TABLE_UNAVAILABLE);
      }

      // 2.3 Restaurant Policy & Bounds Evaluation
      const restRes = await client.query(
        `SELECT id, name, timezone, policy_mode, deposit_amount_minor, deposit_currency, 
                default_duration_min, turnover_buffer_min, policy_version, min_party_size, 
                max_party_size, is_published, status 
         FROM restaurants 
         WHERE id = $1`,
        [dto.restaurant_id]
      );
      if (restRes.rows.length === 0 || !restRes.rows[0].is_published || restRes.rows[0].status !== 'PUBLISHED') {
        throw new NotFoundError(`Restaurant ${dto.restaurant_id} not found or unpublished`);
      }
      const rest = restRes.rows[0];

      // Capacity & bounds check
      if (
        dto.party_size < rest.min_party_size ||
        dto.party_size > rest.max_party_size ||
        dto.party_size < table.min_covers ||
        dto.party_size > table.capacity
      ) {
        throw new ConflictError(
          `Party size ${dto.party_size} does not match table capacity (${table.min_covers}-${table.capacity}) or restaurant bounds (${rest.min_party_size}-${rest.max_party_size})`,
          ErrorCode.CAPACITY_MISMATCH
        );
      }

      // 2.4 Server Interval & Buffer Calculation
      const interval = calculateDiningInterval(
        dto.requested_start,
        rest.default_duration_min,
        rest.turnover_buffer_min,
        rest.timezone
      );
      const startIso = interval.requestedStart.toISOString();
      const endIso = interval.derivedEnd.toISOString();
      const tstzrangeSql = `[${startIso},${endIso})`;

      // 2.5 Maintenance / Table Blocks Check
      const blockRes = await client.query(
        `SELECT id, reason FROM table_blocks 
         WHERE table_id = $1 AND block_period && $2::tstzrange 
         LIMIT 1`,
        [dto.table_id, tstzrangeSql]
      );
      if (blockRes.rows.length > 0) {
        throw new ConflictError(
          `Table ${table.table_number} is blocked: ${blockRes.rows[0].reason}`,
          ErrorCode.TABLE_UNAVAILABLE
        );
      }

      // 2.6 Safe-Expiry Resolution & Protected Allocation Overlap Checks
      const now = new Date();
      const overlapRes = await client.query(
        `SELECT id, booking_id, status, expires_at 
         FROM table_allocations 
         WHERE table_id = $1 
           AND dining_period && $2::tstzrange 
           AND status IN ('HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED', 'COMPLETED')
         FOR UPDATE`,
        [dto.table_id, tstzrangeSql]
      );

      for (const alloc of overlapRes.rows) {
        if (isHoldSafelyExpired(alloc.status, alloc.expires_at, now)) {
          // Conclusively safe expired HELD row: transition to RELEASED so it exits the exclusion constraint
          await client.query('UPDATE table_allocations SET status = $1 WHERE id = $2', ['RELEASED', alloc.id]);
          if (alloc.booking_id) {
            await client.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2', [
              'EXPIRED',
              alloc.booking_id,
            ]);
            await client.query(
              `INSERT INTO booking_status_events (booking_id, from_status, to_status, actor_id, reason) 
               VALUES ($1, $2, $3, $4, $5)`,
              [alloc.booking_id, 'HOLD_ACTIVE', 'EXPIRED', null, 'Safe-expiry sweep on competing hold creation']
            );
            await client.query(
              `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status) 
               VALUES ($1, $2, $3, $4, $5)`,
              [
                'BOOKING',
                alloc.booking_id,
                'HOLD_EXPIRED',
                JSON.stringify({ allocation_id: alloc.id, expired_at: alloc.expires_at }),
                'PENDING',
              ]
            );
          }
        } else {
          // Unexpired or non-releasable protected allocation
          throw new ConflictError(
            `Table ${table.table_number} is no longer available for the requested dining interval.`,
            ErrorCode.TABLE_UNAVAILABLE
          );
        }
      }

      // 2.7 Insert New Booking Record (Status: HOLD_ACTIVE)
      const expiresAt = calculateHoldExpiry(now, 15);
      const policySnapshot = {
        policy_mode: rest.policy_mode,
        deposit_amount_minor: rest.deposit_amount_minor,
        deposit_currency: rest.deposit_currency,
        policy_version: rest.policy_version,
        default_duration_min: rest.default_duration_min,
        turnover_buffer_min: rest.turnover_buffer_min,
      };

      let bookingId: string;
      try {
        const bookingInsert = await client.query(
          `INSERT INTO bookings (id, user_id, restaurant_id, party_size, requested_start, dining_period, status, policy_snapshot) 
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::tstzrange, $6, $7) 
           RETURNING id`,
          [
            userId,
            rest.id,
            dto.party_size,
            startIso,
            tstzrangeSql,
            'HOLD_ACTIVE',
            JSON.stringify(policySnapshot),
          ]
        );
        bookingId = bookingInsert.rows[0].id;
      } catch (err: any) {
        if (err.code === '23P01' || err.message?.includes('no_protected_table_overlap')) {
          throw new ConflictError(
            `Table ${table.table_number} is no longer available for the requested dining interval.`,
            ErrorCode.TABLE_UNAVAILABLE
          );
        }
        throw err;
      }

      // 2.8 Insert New Table Allocation Record (Mapped: HOLD_ACTIVE -> HELD)
      let allocationId: string;
      try {
        const allocInsert = await client.query(
          `INSERT INTO table_allocations (id, table_id, booking_id, dining_period, status, expires_at) 
           VALUES (gen_random_uuid(), $1, $2, $3::tstzrange, $4, $5) 
           RETURNING id`,
          [table.id, bookingId, tstzrangeSql, 'HELD', expiresAt.toISOString()]
        );
        allocationId = allocInsert.rows[0].id;
      } catch (err: any) {
        if (err.code === '23P01' || err.message?.includes('no_protected_table_overlap')) {
          throw new ConflictError(
            `Table ${table.table_number} is no longer available for the requested dining interval.`,
            ErrorCode.TABLE_UNAVAILABLE
          );
        }
        throw err;
      }

      // 2.9 Emit Outbox Event
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'BOOKING',
          bookingId,
          'HOLD_CREATED',
          JSON.stringify({
            hold_id: allocationId,
            booking_id: bookingId,
            table_id: table.id,
            restaurant_id: rest.id,
            user_id: userId,
            dining_period: {
              start: startIso,
              end: endIso,
            },
            expires_at: expiresAt.toISOString(),
            deposit: {
              policy_mode: rest.policy_mode,
              amount_minor: rest.deposit_amount_minor,
              currency: rest.deposit_currency,
            },
          }),
          'PENDING',
        ]
      );

      // 2.10 Emit Audit Log Record
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          rest.id,
          'CREATE_HOLD',
          'BOOKING',
          bookingId,
          JSON.stringify({
            allocation_id: allocationId,
            table_id: table.id,
            dining_period: tstzrangeSql,
            expires_at: expiresAt.toISOString(),
          }),
          meta?.requestId || null,
        ]
      );

      // 2.11 Construct Response DTO
      const responsePayload: BookingHoldResponseDto = {
        hold_id: allocationId,
        booking_id: bookingId,
        table_id: table.id,
        restaurant_id: rest.id,
        status: 'HELD',
        dining_period: {
          start: startIso,
          end: endIso,
        },
        expires_at: expiresAt.toISOString(),
        server_time: now.toISOString(),
        deposit: {
          policy_mode: rest.policy_mode,
          amount_minor: rest.deposit_amount_minor,
          currency: rest.deposit_currency,
        },
      };

      // 2.12 Persist Idempotency Record
      const idempExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO idempotency_records (scope_key, user_id, endpoint, payload_hash, status_code, response_body, expires_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [scopeKey, userId, endpoint, payloadHash, 201, JSON.stringify(responsePayload), idempExpiry.toISOString()]
      );

      return {
        result: responsePayload,
        isReplay: false,
      };
    });
  }

  /**
   * Fetches hold details scoped by customer identity.
   * Returns 410 HOLD_EXPIRED if the server clock has elapsed.
   */
  async getHold(userId: string, holdId: string): Promise<BookingHoldResponseDto> {
    if (!holdId || typeof holdId !== 'string') {
      throw new ValidationError('Valid hold UUID is required');
    }

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Database pool unavailable');
    }

    const res = await pool.query(
      `SELECT 
         a.id AS hold_id,
         a.table_id,
         a.booking_id,
         a.dining_period,
         a.status AS allocation_status,
         a.expires_at,
         b.user_id,
         b.restaurant_id,
         b.party_size,
         b.status AS booking_status,
         b.policy_snapshot
       FROM table_allocations a
       JOIN bookings b ON b.id = a.booking_id
       WHERE a.id = $1`,
      [holdId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Hold ${holdId} not found`);
    }

    const row = res.rows[0];

    // Ownership check (IDOR prevention)
    if (row.user_id !== userId) {
      throw new ForbiddenError('Forbidden: customer cannot access another customer hold');
    }

    // Safe-expiry verification
    const now = new Date();
    if (row.allocation_status === 'HELD' && row.expires_at && new Date(row.expires_at).getTime() < now.getTime()) {
      throw new ExpiredError('Hold has expired on the server clock');
    }

    const bounds = parseRangeBounds(row.dining_period);
    const snap = typeof row.policy_snapshot === 'string' ? JSON.parse(row.policy_snapshot) : row.policy_snapshot || {};

    return {
      hold_id: row.hold_id,
      booking_id: row.booking_id,
      table_id: row.table_id,
      restaurant_id: row.restaurant_id,
      status: row.allocation_status,
      dining_period: bounds,
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : '',
      server_time: now.toISOString(),
      deposit: {
        policy_mode: snap.policy_mode || 'FREE_RESERVATION',
        amount_minor: snap.deposit_amount_minor || 0,
        currency: snap.deposit_currency || 'INR',
      },
    };
  }

  /**
   * Cancels active booking hold, releases table allocation, and emits outbox/audit records.
   */
  async cancelHold(
    userId: string,
    holdId: string,
    meta?: { requestId?: string }
  ): Promise<CancelHoldResponseDto> {
    if (!holdId || typeof holdId !== 'string') {
      throw new ValidationError('Valid hold UUID is required');
    }

    return this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT 
           a.id AS hold_id,
           a.table_id,
           a.booking_id,
           a.status AS allocation_status,
           a.expires_at,
           b.user_id,
           b.restaurant_id
         FROM table_allocations a
         JOIN bookings b ON b.id = a.booking_id
         WHERE a.id = $1
         FOR UPDATE`,
        [holdId]
      );

      if (res.rows.length === 0) {
        throw new NotFoundError(`Hold ${holdId} not found`);
      }

      const row = res.rows[0];

      // Ownership enforcement
      if (row.user_id !== userId) {
        throw new ForbiddenError('Forbidden: customer cannot cancel another customer hold');
      }

      // Expired hold verification
      const now = new Date();
      if (row.allocation_status === 'HELD' && row.expires_at && new Date(row.expires_at).getTime() < now.getTime()) {
        throw new ExpiredError('Hold has already expired');
      }

      // Transition allocation out of protected states
      await client.query('UPDATE table_allocations SET status = $1 WHERE id = $2', ['CANCELLED', row.hold_id]);
      await client.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2', [
        'CANCELLED',
        row.booking_id,
      ]);

      // Emit status event
      await client.query(
        `INSERT INTO booking_status_events (booking_id, from_status, to_status, actor_id, reason) 
         VALUES ($1, $2, $3, $4, $5)`,
        [row.booking_id, 'HOLD_ACTIVE', 'CANCELLED', userId, 'Customer cancelled hold']
      );

      // Emit outbox event
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status) 
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'BOOKING',
          row.booking_id,
          'HOLD_CANCELLED',
          JSON.stringify({ hold_id: row.hold_id, table_id: row.table_id, user_id: userId }),
          'PENDING',
        ]
      );

      // Emit audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, row.restaurant_id, 'CANCEL_HOLD', 'BOOKING', row.booking_id, null, meta?.requestId || null]
      );

      return {
        message: 'Hold cancelled successfully',
        hold_id: row.hold_id,
        status: 'CANCELLED',
      };
    });
  }

  // ============================================================================
  // EPIC-009: Reservation Lifecycle & Service Status Methods
  // ============================================================================

  /**
   * Helper to format a booking row into BookingLifecycleDetailDto.
   */
  private formatBookingDetail(row: any, events: BookingStatusEventDto[] = []): BookingLifecycleDetailDto {
    const bounds = parseRangeBounds(row.dining_period);
    const snap =
      typeof row.policy_snapshot === 'string'
        ? JSON.parse(row.policy_snapshot)
        : row.policy_snapshot || {};

    return {
      id: row.id,
      user_id: row.user_id,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name || undefined,
      table_id: row.table_id || undefined,
      table_number: row.table_number || undefined,
      floor_id: row.floor_id || undefined,
      floor_name: row.floor_name || undefined,
      party_size: row.party_size,
      requested_start:
        row.requested_start instanceof Date ? row.requested_start.toISOString() : String(row.requested_start),
      dining_period: bounds.start && bounds.end ? bounds : undefined,
      status: row.status as BookingStatus,
      allocation_status: (row.allocation_status || mapBookingToAllocationStatus(row.status)) as AllocationStatus,
      version: row.version ?? 1,
      policy_snapshot: snap,
      checked_in_at: row.checked_in_at ? new Date(row.checked_in_at).toISOString() : null,
      seated_at: row.seated_at ? new Date(row.seated_at).toISOString() : null,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      cancelled_at: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
      cancellation_reason: row.cancellation_reason || null,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      events,
    };
  }

  /**
   * Creates an immediate free reservation and confirmed allocation.
   * Fulfills EPIC-009 T02.
   */
  async createFreeBooking(
    userId: string,
    dto: CreateFreeBookingRequestDto,
    meta?: { requestId?: string }
  ): Promise<BookingLifecycleDetailDto> {
    if (!dto || !dto.restaurant_id || !dto.table_id || !dto.requested_start || dto.party_size === undefined) {
      throw new ValidationError(
        'restaurant_id, table_id, requested_start, and party_size are required for free reservation'
      );
    }

    if (typeof dto.party_size !== 'number' || !Number.isInteger(dto.party_size) || dto.party_size <= 0) {
      throw new ValidationError('party_size must be a positive integer');
    }

    return this.db.withTransaction(async (client) => {
      // 1. Lock table row FOR UPDATE
      const tableRes = await client.query(
        `SELECT t.id, t.floor_id, t.table_number, t.capacity, t.min_covers, t.is_active,
                f.name AS floor_name, f.restaurant_id
         FROM restaurant_tables t
         JOIN floors f ON f.id = t.floor_id
         WHERE t.id = $1 FOR UPDATE`,
        [dto.table_id]
      );
      if (tableRes.rows.length === 0) {
        throw new NotFoundError(`Table ${dto.table_id} not found`);
      }
      const table = tableRes.rows[0];
      if (!table.is_active) {
        throw new ConflictError(`Table ${table.table_number} is inactive`, ErrorCode.TABLE_UNAVAILABLE);
      }
      if (table.restaurant_id !== dto.restaurant_id) {
        throw new ConflictError(
          `Table ${table.table_number} does not belong to specified restaurant`,
          ErrorCode.TABLE_UNAVAILABLE
        );
      }

      // 2. Restaurant Profile & Policy Check
      const restRes = await client.query(
        `SELECT id, name, timezone, policy_mode, deposit_amount_minor, deposit_currency,
                default_duration_min, turnover_buffer_min, policy_version, min_party_size,
                max_party_size, is_published, status
         FROM restaurants
         WHERE id = $1`,
        [dto.restaurant_id]
      );
      if (restRes.rows.length === 0 || !restRes.rows[0].is_published || restRes.rows[0].status !== 'PUBLISHED') {
        throw new NotFoundError(`Restaurant ${dto.restaurant_id} not found or unpublished`);
      }
      const rest = restRes.rows[0];

      if (rest.policy_mode === 'DEPOSIT_REQUIRED' && rest.deposit_amount_minor > 0) {
        throw new AppError(
          'Restaurant requires a deposit. Free booking not permitted on this route.',
          422,
          ErrorCode.PAYMENT_REQUIRED
        );
      }

      if (
        dto.party_size < rest.min_party_size ||
        dto.party_size > rest.max_party_size ||
        dto.party_size < table.min_covers ||
        dto.party_size > table.capacity
      ) {
        throw new ConflictError(
          `Party size ${dto.party_size} does not match table capacity (${table.min_covers}-${table.capacity}) or restaurant bounds (${rest.min_party_size}-${rest.max_party_size})`,
          ErrorCode.CAPACITY_MISMATCH
        );
      }

      // 3. Compute Dining Interval & tstzrange
      const interval = calculateDiningInterval(
        dto.requested_start,
        rest.default_duration_min,
        rest.turnover_buffer_min,
        rest.timezone
      );
      const startIso = interval.requestedStart.toISOString();
      const endIso = interval.derivedEnd.toISOString();
      const tstzrangeSql = `[${startIso},${endIso})`;

      // 4. Check Table Maintenance Blocks
      const blockRes = await client.query(
        `SELECT id, reason FROM table_blocks
         WHERE table_id = $1 AND block_period && $2::tstzrange
         LIMIT 1`,
        [dto.table_id, tstzrangeSql]
      );
      if (blockRes.rows.length > 0) {
        throw new ConflictError(
          `Table ${table.table_number} is blocked: ${blockRes.rows[0].reason}`,
          ErrorCode.TABLE_UNAVAILABLE
        );
      }

      // 5. Check Active Protected Allocations & Safe-Expiry
      const now = new Date();
      const overlapRes = await client.query(
        `SELECT id, booking_id, status, expires_at
         FROM table_allocations
         WHERE table_id = $1
           AND dining_period && $2::tstzrange
           AND status IN ('HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED', 'COMPLETED')
         FOR UPDATE`,
        [dto.table_id, tstzrangeSql]
      );

      for (const alloc of overlapRes.rows) {
        if (isHoldSafelyExpired(alloc.status, alloc.expires_at, now)) {
          await client.query('UPDATE table_allocations SET status = $1 WHERE id = $2', ['RELEASED', alloc.id]);
          if (alloc.booking_id) {
            await client.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2', [
              'EXPIRED',
              alloc.booking_id,
            ]);
            await client.query(
              `INSERT INTO booking_status_events (booking_id, from_status, to_status, actor_id, reason, sequence_number)
               VALUES ($1, $2, $3, $4, $5, 2)`,
              [alloc.booking_id, 'HOLD_ACTIVE', 'EXPIRED', null, 'Safe-expiry sweep on competing free reservation']
            );
          }
        } else {
          throw new ConflictError(
            `Table ${table.table_number} is already reserved for requested interval.`,
            ErrorCode.INVENTORY_HOLD_CONFLICT
          );
        }
      }

      // 6. Insert Booking Record (Status: CONFIRMED, Version: 1)
      const policySnapshot = {
        policy_mode: rest.policy_mode,
        deposit_amount_minor: 0,
        deposit_currency: rest.deposit_currency,
        policy_version: rest.policy_version,
        default_duration_min: rest.default_duration_min,
        turnover_buffer_min: rest.turnover_buffer_min,
      };

      let bookingId: string;
      try {
        const bookingInsert = await client.query(
          `INSERT INTO bookings (id, user_id, restaurant_id, party_size, requested_start, dining_period, status, version, policy_snapshot)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::tstzrange, 'CONFIRMED', 1, $6)
           RETURNING id, created_at, updated_at`,
          [userId, rest.id, dto.party_size, startIso, tstzrangeSql, JSON.stringify(policySnapshot)]
        );
        bookingId = bookingInsert.rows[0].id;
      } catch (err: any) {
        if (err.code === '23P01' || err.message?.includes('no_protected_table_overlap')) {
          throw new ConflictError(
            `Table ${table.table_number} is already reserved for requested interval.`,
            ErrorCode.INVENTORY_HOLD_CONFLICT
          );
        }
        throw err;
      }

      // 7. Insert Table Allocation (Status: CONFIRMED)
      let allocationId: string;
      try {
        const allocInsert = await client.query(
          `INSERT INTO table_allocations (id, table_id, booking_id, dining_period, status)
           VALUES (gen_random_uuid(), $1, $2, $3::tstzrange, 'CONFIRMED')
           RETURNING id`,
          [table.id, bookingId, tstzrangeSql]
        );
        allocationId = allocInsert.rows[0].id;
      } catch (err: any) {
        if (err.code === '23P01' || err.message?.includes('no_protected_table_overlap')) {
          throw new ConflictError(
            `Table ${table.table_number} is already reserved for requested interval.`,
            ErrorCode.INVENTORY_HOLD_CONFLICT
          );
        }
        throw err;
      }

      // 8. Insert Initial Sequenced Booking Status Event (sequence_number: 1)
      const eventRes = await client.query(
        `INSERT INTO booking_status_events (id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id, metadata)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1, $7, $8)
         RETURNING id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id, created_at`,
        [
          bookingId,
          null,
          'CONFIRMED',
          userId,
          'CUSTOMER',
          'Free reservation confirmed',
          meta?.requestId || null,
          JSON.stringify({ allocation_id: allocationId, party_size: dto.party_size }),
        ]
      );

      // 9. Emit Outbox Event (Transactional Event Contract)
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'BOOKING',
          bookingId,
          'BOOKING_CONFIRMED',
          JSON.stringify({
            booking_id: bookingId,
            allocation_id: allocationId,
            restaurant_id: rest.id,
            user_id: userId,
            table_id: table.id,
            dining_period: { start: startIso, end: endIso },
          }),
          'PENDING',
        ]
      );

      // 10. Emit Audit Log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, 'CREATE_FREE_BOOKING', 'BOOKING', $3, $4, $5)`,
        [
          userId,
          rest.id,
          bookingId,
          JSON.stringify({ allocation_id: allocationId, table_id: table.id }),
          meta?.requestId || null,
        ]
      );

      return {
        id: bookingId,
        user_id: userId,
        restaurant_id: rest.id,
        restaurant_name: rest.name,
        table_id: table.id,
        table_number: table.table_number,
        floor_id: table.floor_id,
        floor_name: table.floor_name,
        party_size: dto.party_size,
        requested_start: startIso,
        dining_period: { start: startIso, end: endIso },
        status: 'CONFIRMED',
        allocation_status: 'CONFIRMED',
        version: 1,
        policy_snapshot: policySnapshot,
        checked_in_at: null,
        seated_at: null,
        completed_at: null,
        cancelled_at: null,
        cancellation_reason: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        events: [
          {
            id: eventRes.rows[0].id,
            booking_id: bookingId,
            from_status: null,
            to_status: 'CONFIRMED',
            actor_id: userId,
            actor_role: 'CUSTOMER',
            reason: 'Free reservation confirmed',
            sequence_number: 1,
            request_id: meta?.requestId || null,
            created_at: now.toISOString(),
          },
        ],
      };
    });
  }

  /**
   * Confirms an existing hold for a free reservation restaurant.
   * Fulfills EPIC-009 T02.
   */
  async confirmFreeHold(
    userId: string,
    bookingId: string,
    meta?: { requestId?: string }
  ): Promise<BookingLifecycleDetailDto> {
    if (!bookingId || typeof bookingId !== 'string') {
      throw new ValidationError('Valid booking UUID is required');
    }

    return this.db.withTransaction(async (client) => {
      const bookingRes = await client.query(
        `SELECT b.*, r.name AS restaurant_name, r.policy_mode, r.deposit_amount_minor
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurant_id
         WHERE b.id = $1 FOR UPDATE`,
        [bookingId]
      );
      if (bookingRes.rows.length === 0) {
        throw new NotFoundError(`Booking ${bookingId} not found`);
      }
      const b = bookingRes.rows[0];

      // Ownership check (IDOR protection)
      if (b.user_id !== userId) {
        throw new ForbiddenError('Forbidden: customer cannot access another customer booking');
      }

      // Idempotency: if already confirmed, return current details
      if (b.status === 'CONFIRMED') {
        const events = await this.fetchEventsInternal(client, bookingId);
        return this.formatBookingDetail(b, events);
      }

      if (b.status !== 'HOLD_ACTIVE') {
        throw new InvalidStateTransitionError(`Cannot confirm booking in status ${b.status}`);
      }

      if (b.policy_mode === 'DEPOSIT_REQUIRED' && b.deposit_amount_minor > 0) {
        throw new AppError(
          'Restaurant requires a deposit. Free confirmation not permitted.',
          422,
          ErrorCode.PAYMENT_REQUIRED
        );
      }

      // Check allocation and hold expiry
      const allocRes = await client.query(
        `SELECT * FROM table_allocations WHERE booking_id = $1 FOR UPDATE`,
        [bookingId]
      );
      if (allocRes.rows.length === 0) {
        throw new NotFoundError(`Allocation for booking ${bookingId} not found`);
      }
      const alloc = allocRes.rows[0];
      if (alloc.status === 'HELD' && alloc.expires_at && new Date(alloc.expires_at).getTime() < Date.now()) {
        throw new ExpiredError('Hold has expired on the server clock');
      }

      // Determine next sequence number
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM booking_status_events WHERE booking_id = $1`,
        [bookingId]
      );
      const nextSeq = parseInt(seqRes.rows[0].next_seq, 10);
      const nextVersion = (b.version ?? 1) + 1;

      // Update booking and allocation
      await client.query(
        `UPDATE bookings SET status = 'CONFIRMED', version = $1, updated_at = NOW() WHERE id = $2`,
        [nextVersion, bookingId]
      );
      await client.query(
        `UPDATE table_allocations SET status = 'CONFIRMED' WHERE id = $1`,
        [alloc.id]
      );

      // Append sequenced status event
      const eventRes = await client.query(
        `INSERT INTO booking_status_events (id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id)
         VALUES (gen_random_uuid(), $1, 'HOLD_ACTIVE', 'CONFIRMED', $2, 'CUSTOMER', 'Customer confirmed free reservation', $3, $4)
         RETURNING id, created_at`,
        [bookingId, userId, nextSeq, meta?.requestId || null]
      );

      // Outbox and audit log
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ('BOOKING', $1, 'BOOKING_CONFIRMED', $2, 'PENDING')`,
        [bookingId, JSON.stringify({ booking_id: bookingId, allocation_id: alloc.id })]
      );
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, 'CONFIRM_FREE_HOLD', 'BOOKING', $3, $4, $5)`,
        [userId, b.restaurant_id, bookingId, JSON.stringify({ version: nextVersion }), meta?.requestId || null]
      );

      b.status = 'CONFIRMED';
      b.version = nextVersion;
      b.allocation_status = 'CONFIRMED';
      const events = await this.fetchEventsInternal(client, bookingId);
      return this.formatBookingDetail(b, events);
    });
  }

  /**
   * Lists bookings belonging to an authenticated customer.
   * Fulfills EPIC-009 T02.
   */
  async listCustomerBookings(
    userId: string,
    query?: BookingListQueryDto
  ): Promise<{ items: BookingLifecycleDetailDto[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(Number(query?.limit) || 20, 1), 100);
    const offset = Math.max(Number(query?.offset) || 0, 0);

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      return { items: [], total: 0, limit, offset };
    }

    const whereClauses = ['b.user_id = $1'];
    const params: any[] = [userId];

    if (query?.status) {
      params.push(query.status);
      whereClauses.push(`b.status = $${params.length}`);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM bookings b WHERE ${whereSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;

    params.push(limit, offset);
    const querySql = `
      SELECT b.*, r.name AS restaurant_name,
             t.id AS table_id, t.table_number,
             f.id AS floor_id, f.name AS floor_name,
             a.status AS allocation_status
      FROM bookings b
      LEFT JOIN restaurants r ON r.id = b.restaurant_id
      LEFT JOIN table_allocations a ON a.booking_id = b.id
      LEFT JOIN restaurant_tables t ON t.id = a.table_id
      LEFT JOIN floors f ON f.id = t.floor_id
      WHERE ${whereSql}
      ORDER BY b.requested_start DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await pool.query(querySql, params);
    const items = res.rows.map((r: any) => this.formatBookingDetail(r));

    return { items, total, limit, offset };
  }

  /**
   * Retrieves single booking details for an authenticated customer with ownership enforcement.
   * Fulfills EPIC-009 T02.
   */
  async getCustomerBooking(userId: string, bookingId: string): Promise<BookingLifecycleDetailDto> {
    if (!bookingId || typeof bookingId !== 'string') {
      throw new ValidationError('Valid booking UUID is required');
    }

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Database pool unavailable');
    }

    const res = await pool.query(
      `SELECT b.*, r.name AS restaurant_name,
              t.id AS table_id, t.table_number,
              f.id AS floor_id, f.name AS floor_name,
              a.status AS allocation_status
       FROM bookings b
       LEFT JOIN restaurants r ON r.id = b.restaurant_id
       LEFT JOIN table_allocations a ON a.booking_id = b.id
       LEFT JOIN restaurant_tables t ON t.id = a.table_id
       LEFT JOIN floors f ON f.id = t.floor_id
       WHERE b.id = $1`,
      [bookingId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Booking ${bookingId} not found`);
    }

    const row = res.rows[0];
    if (row.user_id !== userId) {
      throw new ForbiddenError('FORBIDDEN_RESOURCE_ACCESS: Customer cannot access another customer booking');
    }

    const events = await this.getBookingEvents(userId, bookingId);
    return this.formatBookingDetail(row, events);
  }

  /**
   * Orchestrates policy-checked cancellation by customer or staff.
   * Releases physical table inventory from PostgreSQL GiST overlap exclusion.
   * Fulfills EPIC-009 T03.
   */
  async cancelBooking(
    callerId: string,
    bookingId: string,
    reason?: string,
    meta?: { isStaff?: boolean; userRole?: string; restaurantId?: string; requestId?: string }
  ): Promise<BookingLifecycleDetailDto> {
    if (!bookingId || typeof bookingId !== 'string') {
      throw new ValidationError('Valid booking UUID is required');
    }

    return this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT b.*, r.name AS restaurant_name, r.lead_time_min_minutes
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurant_id
         WHERE b.id = $1 FOR UPDATE`,
        [bookingId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError(`Booking ${bookingId} not found`);
      }
      const b = res.rows[0];

      // Authorization & Ownership checks
      if (!meta?.isStaff) {
        if (b.user_id !== callerId) {
          throw new ForbiddenError('FORBIDDEN_RESOURCE_ACCESS: Customer cannot cancel another customer booking');
        }
        // Customer cannot cancel an elapsed/started booking
        const reqStart = new Date(b.requested_start).getTime();
        if (reqStart <= Date.now()) {
          throw new ValidationError('Cannot cancel booking that has already started or elapsed');
        }
      } else {
        // Staff cancellation: must have active membership in booking's restaurant
        const memRes = await client.query(
          `SELECT role, status FROM restaurant_memberships WHERE restaurant_id = $1 AND user_id = $2 LIMIT 1`,
          [b.restaurant_id, callerId]
        );
        if (memRes.rows.length === 0 || memRes.rows[0].status !== 'ACTIVE') {
          throw new ForbiddenError(`FORBIDDEN_TENANT_ACCESS: Caller lacks active membership in restaurant ${b.restaurant_id}`);
        }
      }

      // Idempotency: duplicate cancellation returns existing without duplicate events or side-effects
      if (b.status === 'CANCELLED') {
        const events = await this.fetchEventsInternal(client, bookingId);
        return this.formatBookingDetail(b, events);
      }

      // Terminal state guard: cannot cancel completed, no-show, or expired bookings
      if (['COMPLETED', 'NO_SHOW', 'EXPIRED', 'PAYMENT_FAILED'].includes(b.status)) {
        throw new InvalidStateTransitionError(
          `INVALID_STATE_TRANSITION: Cannot cancel booking in terminal status ${b.status}`
        );
      }

      if (!isCancellableBookingStatus(b.status)) {
        throw new InvalidStateTransitionError(
          `INVALID_STATE_TRANSITION: Booking in status ${b.status} is not cancellable`
        );
      }

      // Next sequence number
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM booking_status_events WHERE booking_id = $1`,
        [bookingId]
      );
      const nextSeq = parseInt(seqRes.rows[0].next_seq, 10);
      const nextVersion = (b.version ?? 1) + 1;
      const cancelReason = reason || 'Booking cancelled';

      // Update booking status to CANCELLED
      await client.query(
        `UPDATE bookings
         SET status = 'CANCELLED', version = $1, cancelled_at = NOW(), cancellation_reason = $2, updated_at = NOW()
         WHERE id = $3`,
        [nextVersion, cancelReason, bookingId]
      );

      // Release table allocation from protected GiST exclusion
      await client.query(
        `UPDATE table_allocations SET status = 'CANCELLED' WHERE booking_id = $1`,
        [bookingId]
      );

      // Append sequenced status event
      const actorRole = meta?.isStaff ? (meta.userRole || 'STAFF') : 'CUSTOMER';
      await client.query(
        `INSERT INTO booking_status_events (id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id)
         VALUES (gen_random_uuid(), $1, $2, 'CANCELLED', $3, $4, $5, $6, $7)`,
        [bookingId, b.status, callerId, actorRole, cancelReason, nextSeq, meta?.requestId || null]
      );

      // Transactional outbox event
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ('BOOKING', $1, 'BOOKING_CANCELLED', $2, 'PENDING')`,
        [
          bookingId,
          JSON.stringify({
            booking_id: bookingId,
            restaurant_id: b.restaurant_id,
            cancelled_by: callerId,
            reason: cancelReason,
            prior_status: b.status,
          }),
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, 'CANCEL_BOOKING', 'BOOKING', $3, $4, $5)`,
        [callerId, b.restaurant_id, bookingId, JSON.stringify({ prior_status: b.status, reason: cancelReason }), meta?.requestId || null]
      );

      b.status = 'CANCELLED';
      b.version = nextVersion;
      b.cancelled_at = new Date().toISOString();
      b.cancellation_reason = cancelReason;
      b.allocation_status = 'CANCELLED';
      const events = await this.fetchEventsInternal(client, bookingId);
      return this.formatBookingDetail(b, events);
    });
  }

  /**
   * Guarded staff status transitions with optimistic versioning and multi-tenant isolation.
   * Fulfills EPIC-009 T04 and T05.
   */
  async transitionStaffBookingStatus(
    staffUserId: string,
    bookingId: string,
    targetStatus: string,
    expectedVersion?: number,
    reason?: string,
    meta?: { requestId?: string }
  ): Promise<BookingLifecycleDetailDto> {
    if (!bookingId || typeof bookingId !== 'string') {
      throw new ValidationError('Valid booking UUID is required');
    }
    if (!targetStatus || typeof targetStatus !== 'string') {
      throw new ValidationError('targetStatus is required');
    }

    return this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT b.*, r.name AS restaurant_name
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurant_id
         WHERE b.id = $1 FOR UPDATE`,
        [bookingId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError(`Booking ${bookingId} not found`);
      }
      const b = res.rows[0];

      // Multi-tenant staff membership check
      const memRes = await client.query(
        `SELECT role, status FROM restaurant_memberships WHERE restaurant_id = $1 AND user_id = $2 LIMIT 1`,
        [b.restaurant_id, staffUserId]
      );
      if (memRes.rows.length === 0 || memRes.rows[0].status !== 'ACTIVE') {
        throw new ForbiddenError(
          `FORBIDDEN_TENANT_ACCESS: Caller lacks active staff membership in restaurant ${b.restaurant_id}`
        );
      }
      const staffRole = memRes.rows[0].role;
      if (!['OWNER', 'MANAGER', 'HOST'].includes(staffRole)) {
        throw new ForbiddenError(
          `ROLE_NOT_AUTHORIZED: Caller role ${staffRole} lacks permission to transition booking status`
        );
      }

      // Idempotency: duplicate logical transition cannot duplicate history or side effects
      if (b.status === targetStatus) {
        const events = await this.fetchEventsInternal(client, bookingId);
        return this.formatBookingDetail(b, events);
      }

      // Optimistic concurrency check
      if (expectedVersion !== undefined && b.version !== expectedVersion) {
        throw new ConflictError(
          `VERSION_CONFLICT: Expected booking version ${expectedVersion} but current version is ${b.version}`,
          ErrorCode.VERSION_CONFLICT
        );
      }

      // State machine validation
      if (!isValidBookingTransition(b.status, targetStatus)) {
        throw new InvalidStateTransitionError(
          `INVALID_STATE_TRANSITION: Cannot transition booking from ${b.status} to ${targetStatus}`
        );
      }

      // Staff allowed target statuses
      const staffAllowedTargets = new Set(['READY', 'SEATED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']);
      if (!staffAllowedTargets.has(targetStatus)) {
        throw new InvalidStateTransitionError(
          `INVALID_STATE_TRANSITION: Staff cannot transition booking to ${targetStatus}`
        );
      }

      // Next sequence number
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM booking_status_events WHERE booking_id = $1`,
        [bookingId]
      );
      const nextSeq = parseInt(seqRes.rows[0].next_seq, 10);
      const nextVersion = (b.version ?? 1) + 1;
      const transitionReason = reason || `Staff transitioned status to ${targetStatus}`;

      // Update lifecycle timestamps
      const now = new Date();
      let extraSet = '';
      const setParams: any[] = [targetStatus, nextVersion, bookingId];

      if (targetStatus === 'READY') {
        extraSet = ', ready_at = NOW()';
      } else if (targetStatus === 'SEATED') {
        extraSet = ', seated_at = NOW(), checked_in_at = COALESCE(checked_in_at, NOW())';
      } else if (targetStatus === 'COMPLETED') {
        extraSet = ', completed_at = NOW()';
      } else if (targetStatus === 'NO_SHOW') {
        extraSet = ', no_show_at = NOW()';
      } else if (targetStatus === 'CANCELLED') {
        setParams.splice(2, 0, transitionReason);
        extraSet = `, cancelled_at = NOW(), cancellation_reason = $3`;
        // adjust bookingId index
      }

      const updateSql =
        targetStatus === 'CANCELLED'
          ? `UPDATE bookings SET status = $1, version = $2${extraSet}, updated_at = NOW() WHERE id = $4`
          : `UPDATE bookings SET status = $1, version = $2${extraSet}, updated_at = NOW() WHERE id = $3`;

      await client.query(updateSql, setParams);

      // Update table allocation mapped status
      const mappedAllocStatus = mapBookingToAllocationStatus(targetStatus);
      await client.query(
        `UPDATE table_allocations SET status = $1 WHERE booking_id = $2`,
        [mappedAllocStatus, bookingId]
      );

      // Append sequenced status event
      await client.query(
        `INSERT INTO booking_status_events (id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8)`,
        [bookingId, b.status, targetStatus, staffUserId, staffRole, transitionReason, nextSeq, meta?.requestId || null]
      );

      // Outbox event
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ('BOOKING', $1, $2, $3, 'PENDING')`,
        [
          bookingId,
          `BOOKING_${targetStatus}`,
          JSON.stringify({
            booking_id: bookingId,
            restaurant_id: b.restaurant_id,
            prior_status: b.status,
            new_status: targetStatus,
            staff_user_id: staffUserId,
            version: nextVersion,
          }),
        ]
      );

      // Audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, $3, 'BOOKING', $4, $5, $6)`,
        [
          staffUserId,
          b.restaurant_id,
          `TRANSITION_TO_${targetStatus}`,
          bookingId,
          JSON.stringify({ prior_status: b.status, new_status: targetStatus, version: nextVersion }),
          meta?.requestId || null,
        ]
      );

      b.status = targetStatus;
      b.version = nextVersion;
      b.allocation_status = mappedAllocStatus;
      const events = await this.fetchEventsInternal(client, bookingId);
      return this.formatBookingDetail(b, events);
    });
  }

  /**
   * Internal helper to fetch sequenced events for a booking.
   */
  private async fetchEventsInternal(client: any, bookingId: string): Promise<BookingStatusEventDto[]> {
    try {
      const res = await client.query(
        `SELECT id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id, created_at, metadata
         FROM booking_status_events
         WHERE booking_id = $1
         ORDER BY sequence_number ASC`,
        [bookingId]
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        booking_id: r.booking_id,
        from_status: r.from_status,
        to_status: r.to_status,
        actor_id: r.actor_id,
        actor_role: r.actor_role,
        reason: r.reason,
        sequence_number: r.sequence_number ?? 1,
        request_id: r.request_id,
        metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {},
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Retrieves sequenced event history for a booking.
   * Fulfills EPIC-009 T05.
   */
  async getBookingEvents(
    callerId: string,
    bookingId: string,
    meta?: { isStaff?: boolean }
  ): Promise<BookingStatusEventDto[]> {
    if (!bookingId || typeof bookingId !== 'string') {
      throw new ValidationError('Valid booking UUID is required');
    }

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      return [];
    }

    const res = await pool.query(
      `SELECT b.user_id, b.restaurant_id FROM bookings b WHERE b.id = $1`,
      [bookingId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundError(`Booking ${bookingId} not found`);
    }
    const b = res.rows[0];

    // Authorization check
    if (!meta?.isStaff) {
      if (b.user_id !== callerId) {
        throw new ForbiddenError('FORBIDDEN_RESOURCE_ACCESS: Customer cannot access events for another customer booking');
      }
    } else {
      const memRes = await pool.query(
        `SELECT role, status FROM restaurant_memberships WHERE restaurant_id = $1 AND user_id = $2 LIMIT 1`,
        [b.restaurant_id, callerId]
      );
      if (memRes.rows.length === 0 || memRes.rows[0].status !== 'ACTIVE') {
        throw new ForbiddenError(`FORBIDDEN_TENANT_ACCESS: Caller lacks active membership in restaurant ${b.restaurant_id}`);
      }
    }

    return this.fetchEventsInternal(pool, bookingId);
  }
}
