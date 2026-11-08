import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
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
  WaitlistStatus,
  WaitlistOfferStatus,
  WaitlistSkipReason,
  BookingStatus,
  AllocationStatus,
  PolicyMode,
  ErrorCode,
  CreateWaitlistEntryRequestDto,
  WaitlistEntryResponseDto,
  WaitlistOfferResponseDto,
  AcceptWaitlistOfferResponseDto,
  DeclineWaitlistOfferResponseDto,
  LeaveWaitlistResponseDto,
  WaitlistPromotionResultDto,
} from '@dine/contracts';
import { calculateDiningInterval } from '../availability/availability.service';

/**
 * Prototype default offer validity window: 60 seconds per Blueprint §9.4 and ADR-005.
 * Configurable per restaurant in future iterations.
 */
export const DEFAULT_OFFER_TTL_SECONDS = 60;

/**
 * Pure helper to evaluate waiter eligibility for a given table and interval.
 * Fulfills Blueprint §10.2 and ADR-005:
 * Checks table active status, capacity bounds, and interval conflicts.
 */
export function evaluateWaiterEligibility(
  waiter: { party_size: number; requested_start?: string | Date },
  table: { min_capacity: number; max_capacity: number; is_active?: boolean },
  options: { hasConflictingAllocation?: boolean; isRestaurantOpen?: boolean } = {}
): { eligible: boolean; reason?: WaitlistSkipReason } {
  if (options.isRestaurantOpen === false) {
    return { eligible: false, reason: WaitlistSkipReason.RESTAURANT_CLOSED };
  }

  if (table.is_active === false) {
    return { eligible: false, reason: WaitlistSkipReason.CAPACITY_MISMATCH };
  }

  if (waiter.party_size > table.max_capacity) {
    return { eligible: false, reason: WaitlistSkipReason.PARTY_SIZE_TOO_LARGE };
  }

  if (waiter.party_size < table.min_capacity) {
    return { eligible: false, reason: WaitlistSkipReason.PARTY_SIZE_TOO_SMALL };
  }

  if (options.hasConflictingAllocation) {
    return { eligible: false, reason: WaitlistSkipReason.INTERVAL_CONFLICT };
  }

  return { eligible: true };
}

/**
 * Checks whether an offer has passed its server expiry timestamp.
 */
export function isOfferExpired(
  offer: { expires_at: string | Date; status: string },
  now: Date = new Date()
): boolean {
  if (offer.status !== WaitlistOfferStatus.OFFERED && offer.status !== 'OFFERED') {
    return false;
  }
  const expiryDate = offer.expires_at instanceof Date ? offer.expires_at : new Date(offer.expires_at);
  return !isNaN(expiryDate.getTime()) && expiryDate.getTime() <= now.getTime();
}

/**
 * Calculates remaining seconds for an offer countdown.
 */
export function calculateOfferRemainingSeconds(
  expiresAt: string | Date,
  now: Date = new Date()
): number {
  const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (isNaN(expiryDate.getTime())) return 0;
  return Math.max(0, Math.floor((expiryDate.getTime() - now.getTime()) / 1000));
}

/**
 * Deterministically sorts waitlist entries in strict FIFO order (created_at ASC, id ASC).
 */
export function sortWaitlistFifo<T extends { created_at: string | Date; id: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * Calculates 1-indexed queue position for a target entry among active waiting entries.
 */
export function calculateQueuePosition(
  entries: Array<{ id: string; status: string; created_at: string | Date }>,
  targetEntryId: string
): number {
  const activeWaiters = sortWaitlistFifo(
    entries.filter((e) => e.status === WaitlistStatus.WAITING || e.status === 'WAITING')
  );
  const index = activeWaiters.findIndex((e) => e.id === targetEntryId);
  return index >= 0 ? index + 1 : 1;
}

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * T01: Join restaurant waitlist queue with duplicate active-entry prevention and interval derivation.
   */
  async joinWaitlist(
    userId: string,
    restaurantId: string,
    partySize: number,
    requestedStart: string,
    tableId?: string,
    notes?: string
  ): Promise<WaitlistEntryResponseDto> {
    if (!partySize || partySize <= 0) {
      throw new ValidationError('Party size must be greater than zero');
    }

    const startDate = new Date(requestedStart);
    if (isNaN(startDate.getTime())) {
      throw new ValidationError('Invalid requested_start ISO timestamp');
    }

    const pool = this.db.getPool();

    // Verify restaurant exists and fetch operating policy
    const restRes = await pool.query(
      'SELECT id, name, default_duration_min, turnover_buffer_min, timezone, is_published FROM restaurants WHERE id = $1',
      [restaurantId]
    );
    if (restRes.rows.length === 0) {
      throw new NotFoundError('Restaurant not found');
    }
    const restaurant = restRes.rows[0];

    // Check for duplicate active entry for the same user, restaurant, and requested slot
    const dupRes = await pool.query(
      `SELECT id FROM waitlist_entries 
       WHERE restaurant_id = $1 AND user_id = $2 AND requested_start = $3 
         AND status IN ('WAITING', 'OFFER_EXTENDED') 
       LIMIT 1`,
      [restaurantId, userId, startDate.toISOString()]
    );
    if (dupRes.rows.length > 0) {
      throw new ConflictError(
        'An active waitlist entry already exists for this restaurant and time slot',
        ErrorCode.WAITLIST_DUPLICATE_ENTRY
      );
    }

    // Derive interval using restaurant turn times
    const interval = calculateDiningInterval(
      startDate.toISOString(),
      restaurant.default_duration_min || 90,
      restaurant.turnover_buffer_min || 15,
      restaurant.timezone || 'UTC'
    );
    const requestedEnd = interval.derivedEnd.toISOString();

    // Insert new waitlist entry
    const insertRes = await pool.query(
      `INSERT INTO waitlist_entries 
         (restaurant_id, user_id, party_size, requested_start, requested_end, table_id, status, priority_score) 
       VALUES ($1, $2, $3, $4, $5, $6, 'WAITING', 0) 
       RETURNING id, restaurant_id, user_id, party_size, requested_start, requested_end, table_id, status, priority_score, created_at`,
      [restaurantId, userId, partySize, startDate.toISOString(), requestedEnd, tableId || null]
    );
    const entry = insertRes.rows[0];

    // Compute queue position
    const posRes = await pool.query(
      `SELECT COUNT(*)::int as count 
       FROM waitlist_entries 
       WHERE restaurant_id = $1 AND status = 'WAITING' 
         AND (created_at < $2 OR (created_at = $2 AND id <= $3))`,
      [restaurantId, entry.created_at, entry.id]
    );
    const position = posRes.rows[0]?.count || 1;
    const estimatedWaitMinutes = position * (restaurant.default_duration_min || 90);

    // Emit transactional outbox event & audit log
    await pool.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) 
       VALUES ($1, $2, $3, $4)`,
      [
        'waitlist_entry',
        entry.id,
        'waitlist.joined',
        JSON.stringify({
          entry_id: entry.id,
          user_id: userId,
          restaurant_id: restaurantId,
          party_size: partySize,
          position,
        }),
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, restaurantId, 'WAITLIST_ENTRY_CREATED', 'waitlist_entry', entry.id, JSON.stringify(entry)]
    );

    return {
      id: entry.id,
      restaurant_id: entry.restaurant_id,
      user_id: entry.user_id,
      party_size: entry.party_size,
      requested_start: new Date(entry.requested_start).toISOString(),
      requested_end: entry.requested_end ? new Date(entry.requested_end).toISOString() : null,
      table_id: entry.table_id || null,
      priority_score: entry.priority_score,
      status: entry.status,
      position,
      estimated_wait_minutes: estimatedWaitMinutes,
      skip_reason: null,
      created_at: new Date(entry.created_at).toISOString(),
    };
  }

  /**
   * T05: Get waitlist entry snapshot and current FIFO position.
   */
  async getWaitlistEntry(id: string, userId?: string): Promise<WaitlistEntryResponseDto> {
    const pool = this.db.getPool();

    const entryRes = await pool.query(
      `SELECT id, restaurant_id, user_id, party_size, requested_start, requested_end, table_id, status, priority_score, skip_reason, created_at 
       FROM waitlist_entries 
       WHERE id = $1`,
      [id]
    );
    if (entryRes.rows.length === 0) {
      throw new NotFoundError('Waitlist entry not found', ErrorCode.WAITLIST_ENTRY_NOT_FOUND);
    }
    const entry = entryRes.rows[0];

    // Enforce resource ownership if caller userId is provided
    if (userId && entry.user_id !== userId) {
      throw new ForbiddenError(
        'FORBIDDEN_RESOURCE_ACCESS: Customer cannot access waitlist entry belonging to another customer'
      );
    }

    // Compute position among active waiting entries
    let position = 1;
    if (entry.status === 'WAITING') {
      const posRes = await pool.query(
        `SELECT COUNT(*)::int as count 
         FROM waitlist_entries 
         WHERE restaurant_id = $1 AND status = 'WAITING' 
           AND (created_at < $2 OR (created_at = $2 AND id <= $3))`,
        [entry.restaurant_id, entry.created_at, entry.id]
      );
      position = posRes.rows[0]?.count || 1;
    }

    return {
      id: entry.id,
      restaurant_id: entry.restaurant_id,
      user_id: entry.user_id,
      party_size: entry.party_size,
      requested_start: new Date(entry.requested_start).toISOString(),
      requested_end: entry.requested_end ? new Date(entry.requested_end).toISOString() : null,
      table_id: entry.table_id || null,
      priority_score: entry.priority_score,
      status: entry.status,
      position,
      skip_reason: entry.skip_reason || null,
      created_at: new Date(entry.created_at).toISOString(),
    };
  }

  /**
   * Leave waitlist queue (cancel active waiting entry or decline offer).
   */
  async leaveWaitlist(id: string, userId: string): Promise<LeaveWaitlistResponseDto> {
    return this.db.withTransaction(async (client) => {
      const res = await client.query(
        'SELECT id, user_id, restaurant_id, status FROM waitlist_entries WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError('Waitlist entry not found', ErrorCode.WAITLIST_ENTRY_NOT_FOUND);
      }
      const entry = res.rows[0];

      if (entry.user_id !== userId) {
        throw new ForbiddenError('Customer cannot cancel a waitlist entry belonging to another customer');
      }

      if (entry.status === 'CANCELLED' || entry.status === 'EXPIRED') {
        return {
          entry_id: entry.id,
          status: entry.status,
          message: 'Waitlist entry is already inactive',
        };
      }

      // If an offer was extended, decline it and safely release allocation
      if (entry.status === 'OFFER_EXTENDED') {
        const offerRes = await client.query(
          `SELECT id FROM waitlist_offers WHERE waitlist_entry_id = $1 AND status = 'OFFERED' LIMIT 1`,
          [entry.id]
        );
        if (offerRes.rows.length > 0) {
          await this.declineOfferInternal(offerRes.rows[0].id, userId, client);
        }
      }

      await client.query('UPDATE waitlist_entries SET status = $1 WHERE id = $2', ['CANCELLED', entry.id]);

      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id) 
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, entry.restaurant_id, 'WAITLIST_ENTRY_CANCELLED', 'waitlist_entry', entry.id]
      );

      return {
        entry_id: entry.id,
        status: 'CANCELLED',
        message: 'Successfully removed from waitlist queue',
      };
    });
  }

  /**
   * T02 & T04: Promote next eligible waiter in strict FIFO order on safely released inventory.
   * Concurrency invariant: Two promotion workers produce only ONE active exclusive offer.
   * If a candidate is ineligible (capacity mismatch, interval conflict), skip with recorded reason.
   * If no eligible waiter remains, release allocation back to public availability.
   */
  async promoteNextEligibleWaiter(
    restaurantId: string,
    tableId: string,
    startTime: string | Date,
    endTime: string | Date,
    options: { offerTtlSeconds?: number; existingAllocationId?: string } = {}
  ): Promise<WaitlistPromotionResultDto> {
    const offerTtl = options.offerTtlSeconds || DEFAULT_OFFER_TTL_SECONDS;
    const startIso = (startTime instanceof Date ? startTime : new Date(startTime)).toISOString();
    const endIso = (endTime instanceof Date ? endTime : new Date(endTime)).toISOString();
    const tstzrangeSql = `[${startIso},${endIso})`;

    return this.db.withTransaction(async (client) => {
      // 1. Take row lock on table to serialize concurrent promotion attempts for this table
      const tableRes = await client.query(
        'SELECT id, restaurant_id, table_number, min_capacity, max_capacity, is_active FROM restaurant_tables WHERE id = $1 FOR UPDATE',
        [tableId]
      );
      if (tableRes.rows.length === 0) {
        throw new NotFoundError('Table not found');
      }
      const table = tableRes.rows[0];

      // 2. Check if an active OFFERED record already exists for this table & interval
      const existingOfferRes = await client.query(
        `SELECT id, allocation_id, expires_at 
         FROM waitlist_offers 
         WHERE table_id = $1 AND status = 'OFFERED' AND expires_at > NOW() 
         LIMIT 1 FOR UPDATE`,
        [tableId]
      );
      if (existingOfferRes.rows.length > 0) {
        this.logger.warn(`Active exclusive offer already exists for table ${tableId}`);
        return {
          promoted: false,
          table_id: tableId,
          allocation_status: 'OFFER_HELD',
          skipped_count: 0,
          reason: 'ACTIVE_OFFER_EXISTS',
        };
      }

      // 3. Query waiting candidates in deterministic FIFO order (created_at ASC, id ASC)
      const waitersRes = await client.query(
        `SELECT id, user_id, party_size, requested_start, requested_end, created_at 
         FROM waitlist_entries 
         WHERE restaurant_id = $1 AND status = 'WAITING' 
         ORDER BY created_at ASC, id ASC 
         FOR UPDATE`,
        [restaurantId]
      );

      let skippedCount = 0;
      let eligibleCandidate: any = null;

      for (const waiter of waitersRes.rows) {
        const eligibility = evaluateWaiterEligibility(
          { party_size: waiter.party_size, requested_start: waiter.requested_start },
          { min_capacity: table.min_capacity, max_capacity: table.max_capacity, is_active: table.is_active }
        );

        if (!eligibility.eligible) {
          skippedCount++;
          // Record skip in waitlist_skip_logs (T04)
          await client.query(
            `INSERT INTO waitlist_skip_logs 
               (waitlist_entry_id, restaurant_id, table_id, skip_reason, details, evaluated_at) 
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              waiter.id,
              restaurantId,
              tableId,
              eligibility.reason || 'CAPACITY_MISMATCH',
              JSON.stringify({
                party_size: waiter.party_size,
                min_capacity: table.min_capacity,
                max_capacity: table.max_capacity,
                requested_start: waiter.requested_start,
              }),
            ]
          );

          // Update entry skip reason
          await client.query('UPDATE waitlist_entries SET skip_reason = $1 WHERE id = $2', [
            eligibility.reason,
            waiter.id,
          ]);

          continue;
        }

        // Candidate is eligible!
        eligibleCandidate = waiter;
        break;
      }

      // 4. If no eligible candidate found, release table to public availability
      if (!eligibleCandidate) {
        if (options.existingAllocationId) {
          await client.query('UPDATE table_allocations SET status = $1 WHERE id = $2', [
            'RELEASED',
            options.existingAllocationId,
          ]);
        }
        return {
          promoted: false,
          table_id: tableId,
          allocation_status: 'RELEASED',
          skipped_count: skippedCount,
          reason: 'NO_ELIGIBLE_WAITERS',
        };
      }

      // 5. Create or transition allocation to OFFER_HELD
      const expiresAt = new Date(Date.now() + offerTtl * 1000);
      let allocationId = options.existingAllocationId;

      if (allocationId) {
        await client.query(
          `UPDATE table_allocations 
           SET status = 'OFFERED', expires_at = $1 
           WHERE id = $2`,
          [expiresAt.toISOString(), allocationId]
        );
      } else {
        const allocRes = await client.query(
          `INSERT INTO table_allocations 
             (table_id, dining_period, status, expires_at) 
           VALUES ($1, $2::tstzrange, 'OFFER_HELD', $3) 
           RETURNING id`,
          [tableId, tstzrangeSql, expiresAt.toISOString()]
        );
        allocationId = allocRes.rows[0].id;
      }

      // 6. Insert exclusive waitlist offer record (T02)
      const offerRes = await client.query(
        `INSERT INTO waitlist_offers 
           (waitlist_entry_id, restaurant_id, table_id, allocation_id, offered_start, offered_end, expires_at, status, version) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'OFFERED', 1) 
         RETURNING id`,
        [
          eligibleCandidate.id,
          restaurantId,
          tableId,
          allocationId,
          startIso,
          endIso,
          expiresAt.toISOString(),
        ]
      );
      const offerId = offerRes.rows[0].id;

      // 7. Update candidate waitlist entry to OFFER_EXTENDED
      await client.query('UPDATE waitlist_entries SET status = $1 WHERE id = $2', [
        'OFFER_EXTENDED',
        eligibleCandidate.id,
      ]);

      // 8. Outbox notification & Audit log emission
      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) 
         VALUES ($1, $2, $3, $4)`,
        [
          'waitlist_offer',
          offerId,
          'waitlist.offer_extended',
          JSON.stringify({
            offer_id: offerId,
            waitlist_entry_id: eligibleCandidate.id,
            user_id: eligibleCandidate.user_id,
            restaurant_id: restaurantId,
            table_id: tableId,
            expires_at: expiresAt.toISOString(),
            seconds_valid: offerTtl,
          }),
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          eligibleCandidate.user_id,
          restaurantId,
          'WAITLIST_OFFER_EXTENDED',
          'waitlist_offer',
          offerId,
          JSON.stringify({
            waitlist_entry_id: eligibleCandidate.id,
            allocation_id: allocationId,
            expires_at: expiresAt.toISOString(),
          }),
        ]
      );

      return {
        promoted: true,
        offer_id: offerId,
        waitlist_entry_id: eligibleCandidate.id,
        table_id: tableId,
        allocation_status: 'OFFER_HELD',
        skipped_count: skippedCount,
      };
    });
  }

  /**
   * T05: Get waitlist offer snapshot and countdown.
   * If expired while in OFFERED status, resolves expiry and triggers next waiter cascade.
   */
  async getWaitlistOffer(offerId: string, userId?: string): Promise<WaitlistOfferResponseDto> {
    const pool = this.db.getPool();

    const res = await pool.query(
      `SELECT o.id, o.waitlist_entry_id, o.restaurant_id, o.table_id, o.allocation_id, 
              o.offered_start, o.offered_end, o.expires_at, o.status, o.created_at,
              w.user_id, r.policy_mode, r.deposit_amount_minor, r.currency
       FROM waitlist_offers o
       JOIN waitlist_entries w ON o.waitlist_entry_id = w.id
       LEFT JOIN restaurants r ON o.restaurant_id = r.id
       WHERE o.id = $1`,
      [offerId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Waitlist offer not found', ErrorCode.OFFER_NOT_FOUND);
    }
    const offer = res.rows[0];

    if (userId && offer.user_id !== userId) {
      throw new ForbiddenError(
        'FORBIDDEN_RESOURCE_ACCESS: Customer cannot access offer belonging to another customer'
      );
    }

    const now = new Date();
    const isExpired = isOfferExpired(offer, now);

    // If offer expired in OFFERED state, resolve it
    if (isExpired && offer.status === 'OFFERED') {
      await this.expireSingleOffer(offerId);
      offer.status = 'EXPIRED';
    }

    const secondsRemaining = offer.status === 'OFFERED' ? calculateOfferRemainingSeconds(offer.expires_at, now) : 0;
    const isDepositRequired = offer.policy_mode === PolicyMode.DEPOSIT_REQUIRED || offer.policy_mode === 'DEPOSIT_REQUIRED';

    return {
      id: offer.id,
      waitlist_entry_id: offer.waitlist_entry_id,
      restaurant_id: offer.restaurant_id,
      table_id: offer.table_id,
      allocation_id: offer.allocation_id,
      offered_start: offer.offered_start ? new Date(offer.offered_start).toISOString() : undefined,
      offered_end: offer.offered_end ? new Date(offer.offered_end).toISOString() : undefined,
      expires_at: new Date(offer.expires_at).toISOString(),
      server_time: now.toISOString(),
      status: offer.status,
      seconds_remaining: secondsRemaining,
      deposit_required: isDepositRequired,
      deposit_amount_minor: isDepositRequired ? (offer.deposit_amount_minor || 0) : 0,
      currency: offer.currency || 'INR',
      created_at: new Date(offer.created_at).toISOString(),
    };
  }

  /**
   * T03: Accept waitlist priority offer.
   * Core Invariants (ADR-005):
   * 1. Accepting an offer NEVER automatically charges the customer.
   * 2. If FREE_RESERVATION: directly confirms booking and table allocation.
   * 3. If DEPOSIT_REQUIRED: transitions to PAYMENT_PENDING and requires explicit customer checkout.
   * 4. Late accept past expiry is rejected and cannot take a different allocation.
   */
  async acceptOffer(
    offerId: string,
    userId: string,
    idempotencyKey?: string
  ): Promise<AcceptWaitlistOfferResponseDto> {
    return this.db.withTransaction(async (client) => {
      // 1. Fetch offer and allocation under lock
      const offerRes = await client.query(
        `SELECT o.id, o.waitlist_entry_id, o.restaurant_id, o.table_id, o.allocation_id, 
                o.offered_start, o.offered_end, o.expires_at, o.status,
                w.user_id, w.party_size, w.requested_start, w.requested_end,
                a.status as allocation_status, a.dining_period,
                r.policy_mode, r.deposit_amount_minor, r.currency, r.default_duration_min, r.turnover_buffer_min, r.timezone
         FROM waitlist_offers o
         JOIN waitlist_entries w ON o.waitlist_entry_id = w.id
         JOIN table_allocations a ON o.allocation_id = a.id
         JOIN restaurants r ON o.restaurant_id = r.id
         WHERE o.id = $1 
         FOR UPDATE`,
        [offerId]
      );

      if (offerRes.rows.length === 0) {
        throw new NotFoundError('Waitlist offer not found', ErrorCode.OFFER_NOT_FOUND);
      }
      const offer = offerRes.rows[0];

      // 2. IDOR ownership check
      if (offer.user_id !== userId) {
        throw new ForbiddenError(
          'FORBIDDEN_RESOURCE_ACCESS: Customer cannot accept an offer belonging to another customer'
        );
      }

      // 3. Repeat-safe / Idempotent check
      if (offer.status === 'ACCEPTED') {
        const existingBookingRes = await client.query(
          `SELECT id, status FROM bookings WHERE table_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
          [offer.table_id, userId]
        );
        const bookingId = existingBookingRes.rows[0]?.id || 'unknown';
        const bStatus = existingBookingRes.rows[0]?.status || 'CONFIRMED';
        return {
          offer_id: offer.id,
          booking_id: bookingId,
          status: bStatus,
          policy_mode: offer.policy_mode,
          payment_order_required: offer.policy_mode === PolicyMode.DEPOSIT_REQUIRED,
          amount_minor: offer.deposit_amount_minor,
          currency: offer.currency,
          message: 'Offer was already accepted',
        };
      }

      if (offer.status === 'DECLINED') {
        throw new ConflictError('Offer has already been declined', ErrorCode.OFFER_ALREADY_RESOLVED);
      }

      // 4. Expiry validation (Acceptance Criterion 3)
      const now = new Date();
      if (offer.status === 'EXPIRED' || new Date(offer.expires_at).getTime() <= now.getTime()) {
        // Mark offer & entry expired, release allocation, and trigger promotion of next waiter
        await client.query('UPDATE waitlist_offers SET status = $1 WHERE id = $2', ['EXPIRED', offer.id]);
        await client.query('UPDATE waitlist_entries SET status = $1 WHERE id = $2', ['EXPIRED', offer.waitlist_entry_id]);
        await client.query('UPDATE table_allocations SET status = $1 WHERE id = $2', ['RELEASED', offer.allocation_id]);

        // Release trigger for next eligible waiter
        if (offer.table_id && (offer.offered_start || offer.requested_start)) {
          setImmediate(() => {
            this.promoteNextEligibleWaiter(
              offer.restaurant_id,
              offer.table_id,
              offer.offered_start || offer.requested_start,
              offer.offered_end || offer.requested_end
            ).catch((e) => this.logger.error('Error promoting next waiter after offer expiry:', e));
          });
        }

        throw new ExpiredError(
          'Waitlist offer has expired and cannot be accepted',
          ErrorCode.OFFER_EXPIRED
        );
      }

      // 5. Allocation status validation
      if (offer.allocation_status !== 'OFFER_HELD') {
        throw new ConflictError(
          'Protected allocation is no longer held exclusively for this offer',
          ErrorCode.OFFER_ALLOCATION_CONFLICT
        );
      }

      const isDepositRequired = offer.policy_mode === PolicyMode.DEPOSIT_REQUIRED || offer.policy_mode === 'DEPOSIT_REQUIRED';
      const targetBookingStatus = isDepositRequired ? BookingStatus.PAYMENT_PENDING : BookingStatus.CONFIRMED;
      const targetAllocationStatus = isDepositRequired ? AllocationStatus.PAYMENT_PENDING : AllocationStatus.CONFIRMED;

      // 6. Create booking record
      const startIso = (offer.offered_start || offer.requested_start ? new Date(offer.offered_start || offer.requested_start) : new Date()).toISOString();
      const endIso = (offer.offered_end || offer.requested_end ? new Date(offer.offered_end || offer.requested_end) : new Date()).toISOString();

      const bookingRes = await client.query(
        `INSERT INTO bookings 
           (restaurant_id, user_id, table_id, party_size, requested_start, requested_end, status, version, policy_snapshot) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8) 
         RETURNING id`,
        [
          offer.restaurant_id,
          userId,
          offer.table_id,
          offer.party_size,
          startIso,
          endIso,
          targetBookingStatus,
          JSON.stringify({
            policy_mode: offer.policy_mode,
            deposit_amount_minor: offer.deposit_amount_minor,
            currency: offer.currency,
            accepted_from_waitlist_offer: offer.id,
          }),
        ]
      );
      const bookingId = bookingRes.rows[0].id;

      // 7. Advance allocation and bind to booking
      await client.query(
        `UPDATE table_allocations 
         SET status = $1, booking_id = $2 
         WHERE id = $3`,
        [targetAllocationStatus, bookingId, offer.allocation_id]
      );

      // 8. Update offer and waitlist entry statuses
      await client.query('UPDATE waitlist_offers SET status = $1 WHERE id = $2', ['ACCEPTED', offer.id]);
      await client.query('UPDATE waitlist_entries SET status = $1 WHERE id = $2', ['SEATED', offer.waitlist_entry_id]);

      // 9. Record status event
      await client.query(
        `INSERT INTO booking_status_events 
           (booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number) 
         VALUES ($1, $2, $3, $4, $5, $6, 1)`,
        [
          bookingId,
          null,
          targetBookingStatus,
          userId,
          'CUSTOMER',
          `Waitlist offer ${offer.id} accepted by customer`,
        ]
      );

      // 10. Audit log & Outbox event
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          offer.restaurant_id,
          'WAITLIST_OFFER_ACCEPTED',
          'waitlist_offer',
          offer.id,
          JSON.stringify({ booking_id: bookingId, policy_mode: offer.policy_mode }),
        ]
      );

      await client.query(
        `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) 
         VALUES ($1, $2, $3, $4)`,
        [
          'booking',
          bookingId,
          isDepositRequired ? 'booking.payment_pending' : 'booking.confirmed',
          JSON.stringify({
            booking_id: bookingId,
            user_id: userId,
            offer_id: offer.id,
            policy_mode: offer.policy_mode,
          }),
        ]
      );

      if (isDepositRequired) {
        // Deposit required: customer must explicitly proceed to payment checkout! Zero auto-charge!
        return {
          offer_id: offer.id,
          booking_id: bookingId,
          status: BookingStatus.PAYMENT_PENDING,
          policy_mode: PolicyMode.DEPOSIT_REQUIRED,
          payment_order_required: true,
          amount_minor: offer.deposit_amount_minor,
          currency: offer.currency,
          message: 'Offer accepted. Please proceed to payment checkout to finalize booking.',
        };
      }

      // Free reservation: confirmed immediately
      return {
        offer_id: offer.id,
        booking_id: bookingId,
        status: BookingStatus.CONFIRMED,
        policy_mode: PolicyMode.FREE_RESERVATION,
        payment_order_required: false,
        message: 'Reservation confirmed successfully without payment.',
      };
    });
  }

  /**
   * T03: Decline waitlist offer and safely release inventory to cascade to next eligible waiter.
   */
  async declineOffer(offerId: string, userId: string): Promise<DeclineWaitlistOfferResponseDto> {
    return this.db.withTransaction(async (client) => {
      return this.declineOfferInternal(offerId, userId, client);
    });
  }

  private async declineOfferInternal(
    offerId: string,
    userId: string,
    client: any
  ): Promise<DeclineWaitlistOfferResponseDto> {
    const res = await client.query(
      `SELECT o.id, o.waitlist_entry_id, o.restaurant_id, o.table_id, o.allocation_id, 
              o.offered_start, o.offered_end, o.status, w.user_id 
       FROM waitlist_offers o
       JOIN waitlist_entries w ON o.waitlist_entry_id = w.id
       WHERE o.id = $1 
       FOR UPDATE`,
      [offerId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError('Waitlist offer not found', ErrorCode.OFFER_NOT_FOUND);
    }
    const offer = res.rows[0];

    if (offer.user_id !== userId) {
      throw new ForbiddenError(
        'FORBIDDEN_RESOURCE_ACCESS: Customer cannot decline an offer belonging to another customer'
      );
    }

    if (offer.status === 'DECLINED') {
      return {
        offer_id: offer.id,
        status: 'DECLINED',
        released: true,
        message: 'Offer was already declined',
      };
    }

    // Mark offer declined, entry cancelled, allocation released
    await client.query('UPDATE waitlist_offers SET status = $1 WHERE id = $2', ['DECLINED', offer.id]);
    await client.query('UPDATE waitlist_entries SET status = $1 WHERE id = $2', ['CANCELLED', offer.waitlist_entry_id]);
    await client.query('UPDATE table_allocations SET status = $1 WHERE id = $2', ['RELEASED', offer.allocation_id]);

    await client.query(
      `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id) 
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, offer.restaurant_id, 'WAITLIST_OFFER_DECLINED', 'waitlist_offer', offer.id]
    );

    // Trigger promotion of next eligible waiter on freed inventory
    if (offer.table_id && offer.offered_start && offer.offered_end) {
      setImmediate(() => {
        this.promoteNextEligibleWaiter(
          offer.restaurant_id,
          offer.table_id,
          offer.offered_start,
          offer.offered_end
        ).catch((e) => this.logger.error('Error promoting next waiter after offer decline:', e));
      });
    }

    return {
      offer_id: offer.id,
      status: 'DECLINED',
      released: true,
      message: 'Offer declined and table returned to queue',
    };
  }

  /**
   * Helper to safely expire a single offer.
   */
  private async expireSingleOffer(offerId: string): Promise<void> {
    try {
      await this.db.withTransaction(async (client) => {
        const res = await client.query(
          `SELECT id, waitlist_entry_id, restaurant_id, table_id, allocation_id, offered_start, offered_end, status 
           FROM waitlist_offers 
           WHERE id = $1 AND status = 'OFFERED' 
           FOR UPDATE`,
          [offerId]
        );
        if (res.rows.length === 0) return;
        const offer = res.rows[0];

        await client.query('UPDATE waitlist_offers SET status = $1 WHERE id = $2', ['EXPIRED', offer.id]);
        await client.query('UPDATE waitlist_entries SET status = $1 WHERE id = $2', ['EXPIRED', offer.waitlist_entry_id]);
        await client.query('UPDATE table_allocations SET status = $1 WHERE id = $2', ['RELEASED', offer.allocation_id]);

        // Release trigger for next waiter
        setImmediate(() => {
          this.promoteNextEligibleWaiter(
            offer.restaurant_id,
            offer.table_id,
            offer.offered_start,
            offer.offered_end
          ).catch((e) => this.logger.error('Error cascading promotion after offer expiry:', e));
        });
      });
    } catch (err) {
      this.logger.error(`Failed to safely expire offer ${offerId}:`, err);
    }
  }

  /**
   * T04: Sweep expired offers and cascade promotion to next eligible waiters.
   */
  async sweepExpiredOffers(): Promise<number> {
    const pool = this.db.getPool();
    const expiredRes = await pool.query(
      `SELECT id FROM waitlist_offers WHERE status = 'OFFERED' AND expires_at <= NOW()`
    );

    let expiredCount = 0;
    for (const row of expiredRes.rows) {
      await this.expireSingleOffer(row.id);
      expiredCount++;
    }
    return expiredCount;
  }
}
