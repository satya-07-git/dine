import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/db/database.service';
import { RestaurantPolicyService } from '../restaurants/restaurant-policy.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { FloorPlansService } from '../floor-plans/floor-plans.service';
import {
  ReservationsService,
  isHoldSafelyExpired,
  parseRangeBounds,
} from '../reservations/reservations.service';
import { specialClosures, tableBlocks } from '../../common/db/schema';
import { eq, asc } from 'drizzle-orm';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  AppError,
} from '../../common/errors/app-error';
import {
  UpdateBookingStatusRequestDto,
  OwnerBookingListQueryDto,
  OwnerBookingResponseDto,
  OwnerBookingListResponseDto,
  GenerateCheckInQrResponseDto,
  CheckInRequestDto,
  CheckInResponseDto,
  RecordWalkInRequestDto,
  WalkInResponseDto,
  CreateTableBlockRequestDto,
  TableBlockResponseDto,
  TableBlockListQueryDto,
  BookingStatus,
  AllocationStatus,
  ErrorCode,
} from '@dine/contracts';

/**
 * Creates HMAC-SHA256 signed QR check-in token.
 */
export function signCheckInToken(payload: object, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verifies HMAC-SHA256 signature and expiration of QR check-in token.
 */
export function verifyCheckInToken(token: string, secret: string): any {
  if (!token || typeof token !== 'string') {
    throw new ValidationError('QR token must be a non-empty string');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AppError('Invalid QR check-in token structure', 400, ErrorCode.QR_TOKEN_INVALID);
  }
  const [header, body, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  if (sig !== expectedSig) {
    throw new AppError('Invalid QR check-in token signature', 400, ErrorCode.QR_TOKEN_INVALID);
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      throw new AppError('QR check-in token has expired', 410, ErrorCode.QR_TOKEN_EXPIRED);
    }
    return payload;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError('Malformed QR token payload', 400, ErrorCode.QR_TOKEN_INVALID);
  }
}

@Injectable()
export class OwnerOperationsService {
  private readonly logger = new Logger(OwnerOperationsService.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly policyService: RestaurantPolicyService,
    private readonly restaurantsService: RestaurantsService,
    private readonly floorPlansService: FloorPlansService,
    private readonly reservationsService: ReservationsService
  ) {
    this.jwtSecret = process.env.SUPABASE_JWT_SECRET || 'super-secret-jwt-key-min-16-chars-long';
  }

  /**
   * Bounded restaurant booking projection for authorized staff (T01).
   * Strips private customer credentials while providing operational table and status info.
   */
  async getRestaurantBookings(
    restaurantId: string,
    query?: OwnerBookingListQueryDto
  ): Promise<OwnerBookingListResponseDto> {
    const limit = Math.min(Math.max(Number(query?.limit) || 50, 1), 100);
    const offset = Math.max(Number(query?.offset) || 0, 0);

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      return { items: [], total: 0, limit, offset };
    }

    const whereClauses = ['b.restaurant_id = $1'];
    const params: any[] = [restaurantId];

    if (query?.status) {
      params.push(query.status);
      whereClauses.push(`b.status = $${params.length}`);
    }

    if (query?.is_walk_in !== undefined) {
      params.push(Boolean(query.is_walk_in));
      whereClauses.push(`b.is_walk_in = $${params.length}`);
    }

    if (query?.date) {
      // Filter by UTC calendar day
      params.push(`${query.date}T00:00:00.000Z`, `${query.date}T23:59:59.999Z`);
      whereClauses.push(
        `b.requested_start >= $${params.length - 1} AND b.requested_start <= $${params.length}`
      );
    }

    const whereSql = whereClauses.join(' AND ');

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM bookings b WHERE ${whereSql}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;

    params.push(limit, offset);
    const querySql = `
      SELECT b.id, b.user_id, b.restaurant_id, b.party_size, b.requested_start, b.dining_period,
             b.status, b.version, b.is_walk_in, b.guest_name, b.guest_phone, b.guest_email,
             b.checked_in_at, b.ready_at, b.seated_at, b.completed_at, b.cancelled_at, b.no_show_at,
             b.created_at, b.updated_at,
             t.id AS table_id, t.table_number,
             f.id AS floor_id, f.name AS floor_name,
             a.status AS allocation_status
      FROM bookings b
      LEFT JOIN table_allocations a ON a.booking_id = b.id
      LEFT JOIN restaurant_tables t ON t.id = a.table_id
      LEFT JOIN floors f ON f.id = t.floor_id
      WHERE ${whereSql}
      ORDER BY b.requested_start ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const res = await pool.query(querySql, params);

    const items: OwnerBookingResponseDto[] = res.rows.map((r: any) => {
      const bounds = parseRangeBounds(r.dining_period);
      return {
        id: r.id,
        restaurant_id: r.restaurant_id,
        user_id: r.user_id || null,
        guest_name: r.guest_name || null,
        guest_phone: r.guest_phone || null,
        guest_email: r.guest_email || null,
        party_size: r.party_size,
        requested_start:
          r.requested_start instanceof Date ? r.requested_start.toISOString() : String(r.requested_start),
        dining_period: bounds.start && bounds.end ? bounds : undefined,
        status: r.status as BookingStatus,
        allocation_status: r.allocation_status as AllocationStatus,
        table_id: r.table_id || null,
        table_number: r.table_number || null,
        floor_id: r.floor_id || null,
        floor_name: r.floor_name || null,
        is_walk_in: Boolean(r.is_walk_in),
        version: r.version ?? 1,
        checked_in_at: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null,
        ready_at: r.ready_at ? new Date(r.ready_at).toISOString() : null,
        seated_at: r.seated_at ? new Date(r.seated_at).toISOString() : null,
        completed_at: r.completed_at ? new Date(r.completed_at).toISOString() : null,
        cancelled_at: r.cancelled_at ? new Date(r.cancelled_at).toISOString() : null,
        no_show_at: r.no_show_at ? new Date(r.no_show_at).toISOString() : null,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
      };
    });

    return { items, total, limit, offset };
  }

  /**
   * Generates a cryptographically signed QR check-in token for a confirmed booking (T02).
   */
  async generateCheckInQr(
    staffUserId: string,
    bookingId: string,
    ttlHours: number = 24
  ): Promise<GenerateCheckInQrResponseDto> {
    const pool = this.db.getPool();
    const bRes = await pool.query(
      `SELECT id, restaurant_id, status FROM bookings WHERE id = $1`,
      [bookingId]
    );
    if (bRes.rows.length === 0) {
      throw new NotFoundError(`Booking ${bookingId} not found`);
    }
    const booking = bRes.rows[0];

    // Staff membership check
    const memRes = await pool.query(
      `SELECT role, status FROM restaurant_memberships WHERE restaurant_id = $1 AND user_id = $2 LIMIT 1`,
      [booking.restaurant_id, staffUserId]
    );
    if (memRes.rows.length === 0 || memRes.rows[0].status !== 'ACTIVE') {
      throw new ForbiddenError(`Caller lacks active staff membership in restaurant ${booking.restaurant_id}`);
    }

    const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    const nonce = crypto.randomUUID();
    const payload = {
      booking_id: booking.id,
      restaurant_id: booking.restaurant_id,
      exp,
      nonce,
    };

    const qrToken = signCheckInToken(payload, this.jwtSecret);
    const tokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');
    const expiresAt = new Date(exp * 1000).toISOString();

    // Persist token hash in booking_check_in_tokens
    await pool.query(
      `INSERT INTO booking_check_in_tokens (booking_id, restaurant_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO NOTHING`,
      [booking.id, booking.restaurant_id, tokenHash, expiresAt]
    );

    return {
      booking_id: booking.id,
      restaurant_id: booking.restaurant_id,
      qr_token: qrToken,
      expires_at: expiresAt,
      qr_payload: JSON.stringify({ token: qrToken, booking_id: booking.id, restaurant_id: booking.restaurant_id }),
    };
  }

  /**
   * Verified QR check-in with repeat safety (T02, AC1, AC3).
   * Enforces restaurant binding (host from A cannot check in booking for B).
   * Idempotent replay: if already checked in, returns success without duplicate events.
   */
  async verifyAndCheckIn(
    staffUserId: string,
    staffRestaurantId: string,
    checkInDto: CheckInRequestDto,
    meta?: { requestId?: string }
  ): Promise<CheckInResponseDto> {
    const pool = this.db.getPool();

    // Verify caller staff membership in staffRestaurantId
    const memRes = await pool.query(
      `SELECT role, status FROM restaurant_memberships WHERE restaurant_id = $1 AND user_id = $2 LIMIT 1`,
      [staffRestaurantId, staffUserId]
    );
    if (memRes.rows.length === 0 || memRes.rows[0].status !== 'ACTIVE') {
      throw new ForbiddenError(`Caller lacks active membership in restaurant ${staffRestaurantId}`);
    }
    const staffRole = memRes.rows[0].role;
    if (!['OWNER', 'MANAGER', 'HOST'].includes(staffRole)) {
      throw new ForbiddenError(`Role ${staffRole} is not authorized for check-in operations`);
    }

    let targetBookingId = checkInDto.booking_id;
    let tokenPayload: any = null;

    if (checkInDto.qr_token) {
      // 1. Decrypt and verify HMAC signature & expiration
      tokenPayload = verifyCheckInToken(checkInDto.qr_token, this.jwtSecret);

      // 2. Acceptance Criterion 1: Host from restaurant A cannot operate restaurant B check-in QR
      if (tokenPayload.restaurant_id !== staffRestaurantId) {
        throw new ForbiddenError(
          `FORBIDDEN_TENANT_ACCESS: Host from restaurant ${staffRestaurantId} cannot check in booking belonging to restaurant ${tokenPayload.restaurant_id}`,
          ErrorCode.QR_RESTAURANT_MISMATCH
        );
      }

      if (targetBookingId && targetBookingId !== tokenPayload.booking_id) {
        throw new ConflictError(
          `QR token booking ID mismatch`,
          ErrorCode.QR_TOKEN_INVALID
        );
      }
      targetBookingId = tokenPayload.booking_id;
    }

    if (!targetBookingId) {
      throw new ValidationError('qr_token or booking_id is required for check-in');
    }

    return this.db.withTransaction(async (client) => {
      // 3. Lock booking row FOR UPDATE
      const bRes = await client.query(
        `SELECT b.*, r.name AS restaurant_name
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurant_id
         WHERE b.id = $1 FOR UPDATE`,
        [targetBookingId]
      );
      if (bRes.rows.length === 0) {
        throw new NotFoundError(`Booking ${targetBookingId} not found`);
      }
      const b = bRes.rows[0];

      // Multi-tenant check
      if (b.restaurant_id !== staffRestaurantId) {
        throw new ForbiddenError(
          `FORBIDDEN_TENANT_ACCESS: Host from restaurant ${staffRestaurantId} cannot check in booking belonging to restaurant ${b.restaurant_id}`,
          ErrorCode.QR_RESTAURANT_MISMATCH
        );
      }

      // 4. Acceptance Criterion 3: Replayed QR/check-in is safe and does not duplicate arrival events
      if (b.checked_in_at || ['READY', 'SEATED', 'COMPLETED'].includes(b.status)) {
        this.logger.log(`Repeat check-in for booking ${b.id}; returning existing checked-in state`);
        return {
          success: true,
          booking_id: b.id,
          restaurant_id: staffRestaurantId,
          status: b.status,
          checked_in_at: b.checked_in_at ? new Date(b.checked_in_at).toISOString() : new Date().toISOString(),
          is_repeat: true,
          message: 'Booking already checked in (repeat-safe idempotent replay)',
        };
      }

      // 5. Valid state transition check
      if (['CANCELLED', 'NO_SHOW', 'EXPIRED', 'PAYMENT_FAILED'].includes(b.status)) {
        throw new AppError(
          `Cannot check in booking with status ${b.status}`,
          422,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      const now = new Date();
      const nextVersion = (b.version ?? 1) + 1;
      const targetStatus = b.status === 'CONFIRMED' ? 'READY' : b.status;

      // Update booking with checked_in_at and ready_at
      await client.query(
        `UPDATE bookings
         SET checked_in_at = NOW(),
             ready_at = COALESCE(ready_at, NOW()),
             status = $1,
             version = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [targetStatus, nextVersion, b.id]
      );

      // Synchronize table allocation status
      if (targetStatus === 'READY') {
        await client.query(
          `UPDATE table_allocations SET status = 'READY' WHERE booking_id = $1 AND status = 'CONFIRMED'`,
          [b.id]
        );
      }

      // Append sequenced status event
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM booking_status_events WHERE booking_id = $1`,
        [b.id]
      );
      const nextSeq = parseInt(seqRes.rows[0].next_seq, 10);

      await client.query(
        `INSERT INTO booking_status_events (id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'Guest checked in via QR code', $6, $7)`,
        [b.id, b.status, targetStatus, staffUserId, staffRole, nextSeq, meta?.requestId || null]
      );

      // Emit transactional outbox event
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ('BOOKING', $1, 'BOOKING_CHECKED_IN', $2, 'PENDING')`,
        [
          b.id,
          JSON.stringify({
            booking_id: b.id,
            restaurant_id: staffRestaurantId,
            status: targetStatus,
            checked_in_at: now.toISOString(),
            version: nextVersion,
          }),
        ]
      );

      // Emit audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, 'CHECK_IN', 'BOOKING', $3, $4, $5)`,
        [staffUserId, staffRestaurantId, b.id, JSON.stringify({ from_status: b.status, to_status: targetStatus }), meta?.requestId || null]
      );

      // Mark token as used if tokenHash exists
      if (checkInDto.qr_token) {
        const tokenHash = crypto.createHash('sha256').update(checkInDto.qr_token).digest('hex');
        await client.query(
          `UPDATE booking_check_in_tokens SET is_used = true, used_at = NOW() WHERE token_hash = $1`,
          [tokenHash]
        );
      }

      return {
        success: true,
        booking_id: b.id,
        restaurant_id: staffRestaurantId,
        status: targetStatus,
        checked_in_at: now.toISOString(),
        is_repeat: false,
        message: 'Guest checked in successfully',
      };
    });
  }

  /**
   * Route walk-ins through the reservation core application service (T03, AC2).
   * Competes with online customers and offers under PostgreSQL GiST exclusion locks.
   */
  async recordWalkIn(
    staffUserId: string,
    walkInDto: RecordWalkInRequestDto,
    meta?: { requestId?: string }
  ): Promise<WalkInResponseDto> {
    if (!walkInDto || !walkInDto.restaurant_id || !walkInDto.table_id || !walkInDto.party_size) {
      throw new ValidationError('restaurant_id, table_id, and party_size are required for walk-ins');
    }

    if (typeof walkInDto.party_size !== 'number' || !Number.isInteger(walkInDto.party_size) || walkInDto.party_size <= 0) {
      throw new ValidationError('party_size must be a positive integer');
    }

    const pool = this.db.getPool();

    // Verify staff membership
    const memRes = await pool.query(
      `SELECT role, status FROM restaurant_memberships WHERE restaurant_id = $1 AND user_id = $2 LIMIT 1`,
      [walkInDto.restaurant_id, staffUserId]
    );
    if (memRes.rows.length === 0 || memRes.rows[0].status !== 'ACTIVE') {
      throw new ForbiddenError(`Caller lacks active membership in restaurant ${walkInDto.restaurant_id}`);
    }
    const staffRole = memRes.rows[0].role;
    if (!['OWNER', 'MANAGER', 'HOST'].includes(staffRole)) {
      throw new ForbiddenError(`Role ${staffRole} is not authorized to seat walk-ins`);
    }

    return this.db.withTransaction(async (client) => {
      // 1. Lock table row FOR UPDATE
      const tableRes = await client.query(
        `SELECT t.id, t.floor_id, t.table_number, t.capacity, t.min_covers, t.is_active,
                f.restaurant_id, f.name AS floor_name
         FROM restaurant_tables t
         JOIN floors f ON f.id = t.floor_id
         WHERE t.id = $1 FOR UPDATE`,
        [walkInDto.table_id]
      );
      if (tableRes.rows.length === 0) {
        throw new NotFoundError(`Table ${walkInDto.table_id} not found`);
      }
      const table = tableRes.rows[0];
      if (!table.is_active) {
        throw new ConflictError(`Table ${table.table_number} is inactive`, ErrorCode.TABLE_UNAVAILABLE);
      }
      if (table.restaurant_id !== walkInDto.restaurant_id) {
        throw new ConflictError(
          `Table ${table.table_number} does not belong to specified restaurant`,
          ErrorCode.TABLE_UNAVAILABLE
        );
      }

      // 2. Restaurant details and policy validation
      const restRes = await client.query(
        `SELECT id, name, timezone, policy_mode, default_duration_min, turnover_buffer_min,
                policy_version, min_party_size, max_party_size, is_published, status
         FROM restaurants
         WHERE id = $1`,
        [walkInDto.restaurant_id]
      );
      if (restRes.rows.length === 0 || !restRes.rows[0].is_published || restRes.rows[0].status !== 'PUBLISHED') {
        throw new NotFoundError(`Restaurant ${walkInDto.restaurant_id} not found or unpublished`);
      }
      const rest = restRes.rows[0];

      if (
        walkInDto.party_size < rest.min_party_size ||
        walkInDto.party_size > rest.max_party_size ||
        walkInDto.party_size < table.min_covers ||
        walkInDto.party_size > table.capacity
      ) {
        throw new ConflictError(
          `Party size ${walkInDto.party_size} does not match table capacity (${table.min_covers}-${table.capacity}) or restaurant bounds (${rest.min_party_size}-${rest.max_party_size})`,
          ErrorCode.CAPACITY_MISMATCH
        );
      }

      // 3. Compute continuous UTC dining interval [now, now + duration + buffer)
      const now = new Date();
      const durationMin = walkInDto.duration_min || rest.default_duration_min;
      const bufferMin = rest.turnover_buffer_min;
      const end = new Date(now.getTime() + (durationMin + bufferMin) * 60 * 1000);
      const startIso = now.toISOString();
      const endIso = end.toISOString();
      const tstzrangeSql = `[${startIso},${endIso})`;

      // 4. Table blocks check
      const blockRes = await client.query(
        `SELECT id, reason FROM table_blocks
         WHERE table_id = $1 AND block_period && $2::tstzrange
         LIMIT 1`,
        [walkInDto.table_id, tstzrangeSql]
      );
      if (blockRes.rows.length > 0) {
        throw new ConflictError(
          `Table ${table.table_number} is blocked: ${blockRes.rows[0].reason}`,
          ErrorCode.TABLE_BLOCK_CONFLICT
        );
      }

      // 5. Protected allocation overlap check & safe-expiry (AC2)
      const overlapRes = await client.query(
        `SELECT id, booking_id, status, expires_at
         FROM table_allocations
         WHERE table_id = $1
           AND dining_period && $2::tstzrange
           AND status IN ('HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED', 'COMPLETED')
         FOR UPDATE`,
        [walkInDto.table_id, tstzrangeSql]
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
              [alloc.booking_id, 'HOLD_ACTIVE', 'EXPIRED', null, 'Safe-expiry sweep on competing walk-in']
            );
          }
        } else {
          // Walk-in competes with customers and offers under range exclusion
          throw new ConflictError(
            `Table ${table.table_number} is already reserved for the requested interval.`,
            ErrorCode.INVENTORY_HOLD_CONFLICT
          );
        }
      }

      // 6. Insert walk-in booking record (Status: SEATED, is_walk_in: true)
      const policySnapshot = {
        policy_mode: rest.policy_mode,
        policy_version: rest.policy_version,
        default_duration_min: durationMin,
        turnover_buffer_min: bufferMin,
      };

      let bookingId: string;
      try {
        const bookingInsert = await client.query(
          `INSERT INTO bookings (
             id, user_id, restaurant_id, party_size, requested_start, dining_period,
             status, version, policy_snapshot, is_walk_in, guest_name, guest_phone, guest_email,
             checked_in_at, seated_at
           )
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::tstzrange, 'SEATED', 1, $6, true, $7, $8, $9, NOW(), NOW())
           RETURNING id`,
          [
            staffUserId,
            rest.id,
            walkInDto.party_size,
            startIso,
            tstzrangeSql,
            JSON.stringify(policySnapshot),
            walkInDto.guest_name || 'Walk-in Guest',
            walkInDto.guest_phone || null,
            walkInDto.guest_email || null,
          ]
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

      // 7. Insert table allocation record (Status: SEATED - protected by GiST exclusion)
      let allocationId: string;
      try {
        const allocInsert = await client.query(
          `INSERT INTO table_allocations (id, table_id, booking_id, dining_period, status)
           VALUES (gen_random_uuid(), $1, $2, $3::tstzrange, 'SEATED')
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

      // 8. Insert initial sequenced status event (seq: 1)
      await client.query(
        `INSERT INTO booking_status_events (
           id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id, metadata
         )
         VALUES (gen_random_uuid(), $1, null, 'SEATED', $2, $3, 'Walk-in seated immediately by staff', 1, $4, $5)`,
        [
          bookingId,
          staffUserId,
          staffRole,
          meta?.requestId || null,
          JSON.stringify({ table_id: table.id, party_size: walkInDto.party_size, walk_in: true }),
        ]
      );

      // 9. Emit transactional outbox event
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
         VALUES ('BOOKING', $1, 'BOOKING_WALK_IN_SEATED', $2, 'PENDING')`,
        [
          bookingId,
          JSON.stringify({
            booking_id: bookingId,
            allocation_id: allocationId,
            restaurant_id: rest.id,
            table_id: table.id,
            party_size: walkInDto.party_size,
            dining_period: { start: startIso, end: endIso },
            seated_at: now.toISOString(),
          }),
        ]
      );

      // 10. Audit log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, 'RECORD_WALK_IN', 'BOOKING', $3, $4, $5)`,
        [
          staffUserId,
          rest.id,
          bookingId,
          JSON.stringify({ allocation_id: allocationId, table_id: table.id, party_size: walkInDto.party_size }),
          meta?.requestId || null,
        ]
      );

      return {
        booking_id: bookingId,
        allocation_id: allocationId,
        restaurant_id: rest.id,
        table_id: table.id,
        table_number: table.table_number,
        party_size: walkInDto.party_size,
        status: 'SEATED',
        allocation_status: 'SEATED',
        seated_at: now.toISOString(),
        dining_period: { start: startIso, end: endIso },
        is_walk_in: true,
        version: 1,
        message: `Walk-in party of ${walkInDto.party_size} seated at Table ${table.table_number}`,
      };
    });
  }

  /**
   * Guarded staff service status transitions + POL-008 NO_SHOW grace period check (T05).
   * Lateness grace period: 15 minutes from requested_start.
   */
  async updateBookingStatus(
    bookingId: string,
    updateDto: UpdateBookingStatusRequestDto,
    staffUserId: string,
    requestId?: string
  ) {
    if (updateDto.status === 'NO_SHOW') {
      const pool = this.db.getPool();
      const bRes = await pool.query(
        `SELECT requested_start FROM bookings WHERE id = $1`,
        [bookingId]
      );
      if (bRes.rows.length > 0) {
        const reqStart = new Date(bRes.rows[0].requested_start).getTime();
        const gracePeriodEnds = reqStart + 15 * 60 * 1000;
        if (Date.now() < gracePeriodEnds) {
          throw new AppError(
            `Cannot mark booking as NO_SHOW before 15-minute grace period has elapsed. Grace period ends at ${new Date(gracePeriodEnds).toISOString()}`,
            422,
            ErrorCode.NO_SHOW_GRACE_PERIOD_ACTIVE
          );
        }
      }
    }

    return this.reservationsService.transitionStaffBookingStatus(
      staffUserId,
      bookingId,
      updateDto.status,
      updateDto.expected_version,
      updateDto.reason,
      { requestId }
    );
  }

  /**
   * Schedules table maintenance block with conflict check against active bookings (T04).
   */
  async addTableBlock(
    restaurantId: string,
    blockDto: CreateTableBlockRequestDto,
    staffUserId: string,
    requestId?: string
  ): Promise<TableBlockResponseDto> {
    if (!blockDto || !blockDto.table_id || !blockDto.start_time || !blockDto.end_time || !blockDto.reason) {
      throw new ValidationError('table_id, start_time, end_time, and reason are required');
    }

    const start = new Date(blockDto.start_time);
    const end = new Date(blockDto.end_time);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      throw new ValidationError('Invalid block interval: end_time must be greater than start_time');
    }

    const pool = this.db.getPool();

    // Check table belongs to restaurant
    const tableRes = await pool.query(
      `SELECT t.id, t.table_number, f.restaurant_id
       FROM restaurant_tables t
       JOIN floors f ON f.id = t.floor_id
       WHERE t.id = $1`,
      [blockDto.table_id]
    );
    if (tableRes.rows.length === 0) {
      throw new NotFoundError(`Table ${blockDto.table_id} not found`);
    }
    if (tableRes.rows[0].restaurant_id !== restaurantId) {
      throw new ForbiddenError(`Table does not belong to restaurant ${restaurantId}`);
    }

    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const tstzrangeSql = `[${startIso},${endIso})`;

    // Check conflict with active allocations unless force=true
    if (!blockDto.force) {
      const overlapRes = await pool.query(
        `SELECT id, status FROM table_allocations
         WHERE table_id = $1
           AND dining_period && $2::tstzrange
           AND status IN ('HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED')
         LIMIT 1`,
        [blockDto.table_id, tstzrangeSql]
      );
      if (overlapRes.rows.length > 0) {
        throw new ConflictError(
          `Cannot block table: active reservation or hold exists during requested interval`,
          ErrorCode.TABLE_BLOCK_CONFLICT
        );
      }
    }

    const insertRes = await pool.query(
      `INSERT INTO table_blocks (id, table_id, block_period, reason, created_at)
       VALUES (gen_random_uuid(), $1, $2::tstzrange, $3, NOW())
       RETURNING id, table_id, block_period, reason, created_at`,
      [blockDto.table_id, tstzrangeSql, blockDto.reason]
    );

    const row = insertRes.rows[0];
    await pool.query(
      `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
       VALUES ($1, $2, 'CREATE_TABLE_BLOCK', 'TABLE_BLOCK', $3, $4, $5)`,
      [staffUserId, restaurantId, row.id, JSON.stringify({ reason: blockDto.reason }), requestId || null]
    );

    return {
      id: row.id,
      table_id: row.table_id,
      restaurant_id: restaurantId,
      block_period: {
        start: startIso,
        end: endIso,
      },
      reason: row.reason,
      created_by: staffUserId,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  /**
   * Lists table maintenance blocks for a restaurant.
   */
  async getTableBlocks(restaurantId: string, query?: TableBlockListQueryDto): Promise<TableBlockResponseDto[]> {
    const pool = this.db.getPool();
    let sql = `
      SELECT tb.id, tb.table_id, tb.block_period, tb.reason, tb.created_at, f.restaurant_id
      FROM table_blocks tb
      JOIN restaurant_tables t ON t.id = tb.table_id
      JOIN floors f ON f.id = t.floor_id
      WHERE f.restaurant_id = $1
    `;
    const params: any[] = [restaurantId];

    if (query?.table_id) {
      params.push(query.table_id);
      sql += ` AND tb.table_id = $${params.length}`;
    }

    sql += ` ORDER BY tb.created_at DESC`;
    const res = await pool.query(sql, params);

    return res.rows.map((r: any) => {
      const bounds = parseRangeBounds(r.block_period);
      return {
        id: r.id,
        table_id: r.table_id,
        restaurant_id: r.restaurant_id,
        block_period: bounds,
        reason: r.reason,
        created_at: new Date(r.created_at).toISOString(),
      };
    });
  }

  async updatePolicies(
    restaurantId: string,
    updateDto: any,
    actorId?: string,
    requestId?: string
  ) {
    return this.policyService.updatePolicies(restaurantId, updateDto, actorId, requestId);
  }

  async addClosure(
    restaurantId: string,
    closureDto: { start_time: string; end_time: string; reason?: string; force?: boolean },
    actorId?: string,
    requestId?: string
  ) {
    return this.policyService.addSpecialClosure(
      restaurantId,
      closureDto.start_time,
      closureDto.end_time,
      closureDto.reason,
      Boolean(closureDto.force),
      actorId,
      requestId
    );
  }

  async getClosures(restaurantId: string) {
    return this.db
      .getDb()
      .select()
      .from(specialClosures)
      .where(eq(specialClosures.restaurantId, restaurantId))
      .orderBy(asc(specialClosures.startTime));
  }

  async getPolicyHistory(restaurantId: string) {
    return this.restaurantsService.getPolicyHistory(restaurantId);
  }

  async updateFloorPlan(
    restaurantId: string,
    floorPlanDto: any,
    actorId?: string,
    requestId?: string
  ) {
    return this.floorPlansService.updateFloorPlan(restaurantId, floorPlanDto, actorId, requestId);
  }
}
