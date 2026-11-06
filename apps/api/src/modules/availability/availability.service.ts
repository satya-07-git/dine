import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { RestaurantPolicyService } from '../restaurants/restaurant-policy.service';
import {
  ValidationError,
  NotFoundError,
} from '../../common/errors/app-error';
import {
  TableAvailabilityDto,
  TableAvailabilityState,
  TableUnavailabilityReason,
  DiningIntervalDto,
  RestaurantAvailabilityResponseDto,
  SingleTableAvailabilityResponseDto,
} from '@dine/contracts';

/**
 * Parses an ISO UTC string or local datetime into a canonical UTC Date object
 * using the restaurant's IANA timezone.
 */
export function parseLocalOrUtcToDate(dateStr: string, timezone: string): Date {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new ValidationError('Date string must be a non-empty string');
  }

  const trimmed = dateStr.trim();

  // If explicit UTC 'Z' or timezone offset (+HH:mm / -HH:mm) is present
  if (trimmed.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) {
      throw new ValidationError(`Invalid timestamp: ${dateStr}`);
    }
    return d;
  }

  // Handle local ISO format: YYYY-MM-DDTHH:mm[:ss]
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) {
      throw new ValidationError(`Invalid timestamp: ${dateStr}`);
    }
    return d;
  }

  const [, yearStr, monthStr, dayStr, hrStr, minStr, secStr] = match;
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hrStr, 10);
  const minute = parseInt(minStr, 10);
  const second = secStr ? parseInt(secStr, 10) : 0;

  // Approximate UTC representation
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (isNaN(approxUtc.getTime())) {
    throw new ValidationError(`Invalid local datetime components: ${dateStr}`);
  }

  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const partMap: Record<string, string> = {};
    for (const p of dtf.formatToParts(approxUtc)) {
      partMap[p.type] = p.value;
    }

    const localInTz = new Date(
      Date.UTC(
        parseInt(partMap.year, 10),
        parseInt(partMap.month, 10) - 1,
        parseInt(partMap.day, 10),
        parseInt(partMap.hour, 10) % 24,
        parseInt(partMap.minute, 10),
        parseInt(partMap.second, 10)
      )
    );

    const offsetDiffMs = localInTz.getTime() - approxUtc.getTime();
    return new Date(approxUtc.getTime() - offsetDiffMs);
  } catch (err: any) {
    throw new ValidationError(`Failed to parse local datetime with timezone ${timezone}: ${err.message}`);
  }
}

/**
 * Pure calculator for dining interval and turnover protection buffer.
 * Enforces [start, end) semantics: end = start + duration + cleanup buffer.
 */
export function calculateDiningInterval(
  requestedStart: string | Date,
  durationMin: number,
  bufferMin: number,
  timezone: string
): {
  requestedStart: Date;
  derivedEnd: Date;
  diningDurationMin: number;
  turnoverBufferMin: number;
  protectionDurationMin: number;
  timezone: string;
} {
  if (!durationMin || !Number.isInteger(durationMin) || durationMin <= 0) {
    throw new ValidationError('Dining duration must be a positive integer in minutes');
  }
  if (bufferMin === undefined || bufferMin === null || !Number.isInteger(bufferMin) || bufferMin < 0) {
    throw new ValidationError('Turnover buffer must be a non-negative integer in minutes');
  }

  const startDate = typeof requestedStart === 'string'
    ? parseLocalOrUtcToDate(requestedStart, timezone)
    : requestedStart;

  if (isNaN(startDate.getTime())) {
    throw new ValidationError('Invalid requested start timestamp');
  }

  const totalProtectionMin = durationMin + bufferMin;
  const endDate = new Date(startDate.getTime() + totalProtectionMin * 60 * 1000);

  if (startDate.getTime() >= endDate.getTime()) {
    throw new ValidationError('Invalid time range: requested start must be strictly before derived end');
  }

  return {
    requestedStart: startDate,
    derivedEnd: endDate,
    diningDurationMin: durationMin,
    turnoverBufferMin: bufferMin,
    protectionDurationMin: totalProtectionMin,
    timezone,
  };
}

/**
 * Checks whether two half-open continuous intervals [A_start, A_end) and [B_start, B_end) overlap.
 * Adjacent ranges [19:00, 20:45) and [20:45, 22:30) do NOT overlap.
 */
export function doIntervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return Math.max(aStart.getTime(), bStart.getTime()) < Math.min(aEnd.getTime(), bEnd.getTime());
}

/**
 * Evaluates individual physical table availability against capacity, blocks, and allocations.
 */
export function evaluateTableAvailability(
  table: { capacity: number; minCovers?: number; isActive: boolean },
  partySize: number,
  isBlocked: boolean,
  isAllocated: boolean
): { state: TableAvailabilityState; reason?: TableUnavailabilityReason | null } {
  if (!table.isActive) {
    return { state: 'UNAVAILABLE', reason: 'TABLE_INACTIVE' };
  }

  const minCovers = table.minCovers ?? 1;
  if (partySize > table.capacity || partySize < minCovers) {
    return { state: 'UNAVAILABLE', reason: 'CAPACITY_MISMATCH' };
  }

  if (isBlocked) {
    return { state: 'UNAVAILABLE', reason: 'BLOCKED' };
  }

  if (isAllocated) {
    return { state: 'UNAVAILABLE', reason: 'ALLOCATED' };
  }

  return { state: 'AVAILABLE', reason: null };
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly policyService: RestaurantPolicyService
  ) {}

  /**
   * Computes time-range availability and table eligibility for a restaurant.
   * Inputs: requested local/absolute time, party size.
   * Outputs: server-derived interval, snapshot timestamp, floor plan version, and table-specific states/reasons.
   * Invariant: Never leaks another guest's identity or private booking information.
   */
  async getRestaurantAvailability(
    restaurantId: string,
    partySize: number,
    requestedStartStr?: string
  ): Promise<RestaurantAvailabilityResponseDto> {
    if (!partySize || !Number.isInteger(partySize) || partySize <= 0) {
      throw new ValidationError('party_size must be a positive integer');
    }

    if (!requestedStartStr || typeof requestedStartStr !== 'string' || requestedStartStr.trim() === '') {
      throw new ValidationError('requested_start or date timestamp is required');
    }

    const pool = this.db.getPool();

    // 1. Fetch restaurant policy & discovery metadata
    const restRes = await pool.query(
      `SELECT id, name, slug, timezone, policy_mode, default_duration_min,
              turnover_buffer_min, min_party_size, max_party_size,
              lead_time_min_minutes, lead_time_max_days, is_published, status
       FROM restaurants
       WHERE id = $1`,
      [restaurantId]
    );

    const restaurant = restRes.rows[0];
    if (!restaurant) {
      throw new NotFoundError(`Restaurant with ID ${restaurantId} not found`);
    }

    if (!restaurant.is_published || restaurant.status !== 'PUBLISHED') {
      throw new NotFoundError(`Restaurant with ID ${restaurantId} is not available for bookings`);
    }

    // 2. Derive canonical UTC interval [start, end)
    const interval = calculateDiningInterval(
      requestedStartStr,
      restaurant.default_duration_min,
      restaurant.turnover_buffer_min,
      restaurant.timezone
    );

    const snapshotAt = new Date();

    // 3. Fetch latest floor plan version number
    const floorPlanVerRes = await pool.query(
      `SELECT COALESCE(MAX(f.current_version), 1) as floor_plan_version
       FROM floors f
       WHERE f.restaurant_id = $1`,
      [restaurantId]
    );
    const floorPlanVersion = parseInt(floorPlanVerRes.rows[0]?.floor_plan_version || '1', 10);

    const intervalDto: DiningIntervalDto = {
      requested_start: interval.requestedStart.toISOString(),
      derived_end: interval.derivedEnd.toISOString(),
      dining_duration_min: interval.diningDurationMin,
      turnover_buffer_min: interval.turnoverBufferMin,
      protection_duration_min: interval.protectionDurationMin,
      timezone: interval.timezone,
    };

    // 4. Evaluate restaurant-level eligibility (hours, closures, party size, lead time)
    const eligibility = await this.policyService.evaluateReservationEligibility(
      restaurantId,
      interval.requestedStart,
      partySize
    );

    if (!eligibility.eligible) {
      return {
        restaurant_id: restaurantId,
        eligible: false,
        reason: eligibility.reason,
        message: eligibility.message,
        availability_snapshot_at: snapshotAt.toISOString(),
        floor_plan_version: floorPlanVersion,
        interval: intervalDto,
        party_size: partySize,
        tables: [],
        available_tables_count: 0,
        total_tables_count: 0,
      };
    }

    // 5. Query all physical tables across restaurant floors
    const tablesRes = await pool.query(
      `SELECT t.id, t.table_number, t.capacity, t.min_covers, t.zone, t.is_active,
              f.id as floor_id, f.name as floor_name
       FROM restaurant_tables t
       JOIN floors f ON f.id = t.floor_id
       WHERE f.restaurant_id = $1
       ORDER BY f.floor_number ASC, t.table_number ASC`,
      [restaurantId]
    );

    const tableRows = tablesRes.rows;
    if (tableRows.length === 0) {
      return {
        restaurant_id: restaurantId,
        eligible: true,
        availability_snapshot_at: snapshotAt.toISOString(),
        floor_plan_version: floorPlanVersion,
        interval: intervalDto,
        party_size: partySize,
        tables: [],
        available_tables_count: 0,
        total_tables_count: 0,
      };
    }

    const tableIds = tableRows.map((r: any) => r.id);

    // 6. Query overlapping table blocks
    const blocksRes = await pool.query(
      `SELECT table_id, reason
       FROM table_blocks
       WHERE table_id = ANY($1::uuid[])
         AND block_period && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [tableIds, interval.requestedStart.toISOString(), interval.derivedEnd.toISOString()]
    );
    const blockedTableIds = new Set(blocksRes.rows.map((b: any) => b.table_id));

    // 7. Query overlapping protected table allocations
    // Conservative rule: Expired timestamps alone do not make a protected allocation safe to ignore.
    const allocationsRes = await pool.query(
      `SELECT table_id, status, expires_at
       FROM table_allocations
       WHERE table_id = ANY($1::uuid[])
         AND dining_period && tstzrange($2::timestamptz, $3::timestamptz, '[)')
         AND status IN (
           'HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW',
           'CONFIRMED', 'READY', 'SEATED', 'COMPLETED'
         )`,
      [tableIds, interval.requestedStart.toISOString(), interval.derivedEnd.toISOString()]
    );
    const allocatedTableIds = new Set(allocationsRes.rows.map((a: any) => a.table_id));

    // 8. Evaluate each table state and reason (pure projection, NO guest identity leak)
    const tables: TableAvailabilityDto[] = tableRows.map((t: any) => {
      const evaluation = evaluateTableAvailability(
        {
          capacity: t.capacity,
          minCovers: t.min_covers,
          isActive: t.is_active,
        },
        partySize,
        blockedTableIds.has(t.id),
        allocatedTableIds.has(t.id)
      );

      return {
        table_id: t.id,
        table_number: t.table_number,
        floor_id: t.floor_id,
        floor_name: t.floor_name,
        capacity: t.capacity,
        min_covers: t.min_covers,
        zone: t.zone,
        state: evaluation.state,
        reason: evaluation.reason ?? null,
      };
    });

    const availableCount = tables.filter((t) => t.state === 'AVAILABLE').length;

    return {
      restaurant_id: restaurantId,
      eligible: true,
      availability_snapshot_at: snapshotAt.toISOString(),
      floor_plan_version: floorPlanVersion,
      interval: intervalDto,
      party_size: partySize,
      tables,
      available_tables_count: availableCount,
      total_tables_count: tables.length,
    };
  }

  /**
   * Evaluates availability for a specific physical table.
   * Invariant: Never leaks other guest identities or booking details.
   */
  async getTableAvailability(
    tableId: string,
    requestedStartStr?: string,
    partySize?: number
  ): Promise<SingleTableAvailabilityResponseDto> {
    if (!requestedStartStr || typeof requestedStartStr !== 'string' || requestedStartStr.trim() === '') {
      throw new ValidationError('requested_start or date timestamp is required');
    }

    if (partySize !== undefined && (!Number.isInteger(partySize) || partySize <= 0)) {
      throw new ValidationError('party_size must be a positive integer');
    }

    const pool = this.db.getPool();

    // 1. Fetch table, floor, and restaurant policy details
    const tableRes = await pool.query(
      `SELECT t.id as table_id, t.table_number, t.capacity, t.min_covers, t.zone, t.is_active,
              f.id as floor_id, f.name as floor_name, f.current_version as floor_version,
              r.id as restaurant_id, r.name as restaurant_name, r.timezone,
              r.default_duration_min, r.turnover_buffer_min, r.min_party_size, r.max_party_size,
              r.lead_time_min_minutes, r.lead_time_max_days, r.is_published, r.status as restaurant_status
       FROM restaurant_tables t
       JOIN floors f ON f.id = t.floor_id
       JOIN restaurants r ON r.id = f.restaurant_id
       WHERE t.id = $1`,
      [tableId]
    );

    const table = tableRes.rows[0];
    if (!table) {
      throw new NotFoundError(`Table with ID ${tableId} not found`);
    }

    if (!table.is_published || table.restaurant_status !== 'PUBLISHED') {
      throw new NotFoundError(`Restaurant for table ${tableId} is not available for bookings`);
    }

    // 2. Derive canonical UTC interval [start, end)
    const interval = calculateDiningInterval(
      requestedStartStr,
      table.default_duration_min,
      table.turnover_buffer_min,
      table.timezone
    );

    const snapshotAt = new Date();
    const intervalDto: DiningIntervalDto = {
      requested_start: interval.requestedStart.toISOString(),
      derived_end: interval.derivedEnd.toISOString(),
      dining_duration_min: interval.diningDurationMin,
      turnover_buffer_min: interval.turnoverBufferMin,
      protection_duration_min: interval.protectionDurationMin,
      timezone: interval.timezone,
    };

    // 3. Evaluate restaurant policy eligibility
    const testPartySize = partySize ?? table.min_covers;
    const eligibility = await this.policyService.evaluateReservationEligibility(
      table.restaurant_id,
      interval.requestedStart,
      testPartySize
    );

    if (!eligibility.eligible) {
      return {
        table_id: table.table_id,
        restaurant_id: table.restaurant_id,
        table_number: table.table_number,
        floor_id: table.floor_id,
        floor_name: table.floor_name,
        capacity: table.capacity,
        min_covers: table.min_covers,
        zone: table.zone,
        floor_plan_version: table.floor_version,
        availability_snapshot_at: snapshotAt.toISOString(),
        state: 'UNAVAILABLE',
        reason: 'RESTAURANT_INELIGIBLE',
        interval: intervalDto,
        eligible: false,
      };
    }

    // 4. Check table active
    if (!table.is_active) {
      return {
        table_id: table.table_id,
        restaurant_id: table.restaurant_id,
        table_number: table.table_number,
        floor_id: table.floor_id,
        floor_name: table.floor_name,
        capacity: table.capacity,
        min_covers: table.min_covers,
        zone: table.zone,
        floor_plan_version: table.floor_version,
        availability_snapshot_at: snapshotAt.toISOString(),
        state: 'UNAVAILABLE',
        reason: 'TABLE_INACTIVE',
        interval: intervalDto,
        eligible: true,
      };
    }

    // 5. Check party size capacity bounds if supplied
    if (partySize !== undefined && (partySize > table.capacity || partySize < table.min_covers)) {
      return {
        table_id: table.table_id,
        restaurant_id: table.restaurant_id,
        table_number: table.table_number,
        floor_id: table.floor_id,
        floor_name: table.floor_name,
        capacity: table.capacity,
        min_covers: table.min_covers,
        zone: table.zone,
        floor_plan_version: table.floor_version,
        availability_snapshot_at: snapshotAt.toISOString(),
        state: 'UNAVAILABLE',
        reason: 'CAPACITY_MISMATCH',
        interval: intervalDto,
        eligible: true,
      };
    }

    // 6. Query overlapping table blocks
    const blockRes = await pool.query(
      `SELECT id, reason
       FROM table_blocks
       WHERE table_id = $1
         AND block_period && tstzrange($2::timestamptz, $3::timestamptz, '[)')
       LIMIT 1`,
      [tableId, interval.requestedStart.toISOString(), interval.derivedEnd.toISOString()]
    );

    if (blockRes.rows.length > 0) {
      return {
        table_id: table.table_id,
        restaurant_id: table.restaurant_id,
        table_number: table.table_number,
        floor_id: table.floor_id,
        floor_name: table.floor_name,
        capacity: table.capacity,
        min_covers: table.min_covers,
        zone: table.zone,
        floor_plan_version: table.floor_version,
        availability_snapshot_at: snapshotAt.toISOString(),
        state: 'UNAVAILABLE',
        reason: 'BLOCKED',
        interval: intervalDto,
        eligible: true,
      };
    }

    // 7. Query overlapping protected table allocations
    const allocRes = await pool.query(
      `SELECT id, status
       FROM table_allocations
       WHERE table_id = $1
         AND dining_period && tstzrange($2::timestamptz, $3::timestamptz, '[)')
         AND status IN (
           'HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW',
           'CONFIRMED', 'READY', 'SEATED', 'COMPLETED'
         )
       LIMIT 1`,
      [tableId, interval.requestedStart.toISOString(), interval.derivedEnd.toISOString()]
    );

    if (allocRes.rows.length > 0) {
      return {
        table_id: table.table_id,
        restaurant_id: table.restaurant_id,
        table_number: table.table_number,
        floor_id: table.floor_id,
        floor_name: table.floor_name,
        capacity: table.capacity,
        min_covers: table.min_covers,
        zone: table.zone,
        floor_plan_version: table.floor_version,
        availability_snapshot_at: snapshotAt.toISOString(),
        state: 'UNAVAILABLE',
        reason: 'ALLOCATED',
        interval: intervalDto,
        eligible: true,
      };
    }

    // 8. All checks passed -> Table is available
    return {
      table_id: table.table_id,
      restaurant_id: table.restaurant_id,
      table_number: table.table_number,
      floor_id: table.floor_id,
      floor_name: table.floor_name,
      capacity: table.capacity,
      min_covers: table.min_covers,
      zone: table.zone,
      floor_plan_version: table.floor_version,
      availability_snapshot_at: snapshotAt.toISOString(),
      state: 'AVAILABLE',
      reason: null,
      interval: intervalDto,
      eligible: true,
    };
  }

  /**
   * Backward-compatible alias for checking restaurant table availability.
   */
  async checkAvailability(restaurantId: string, partySize: number, dateStr: string) {
    return this.getRestaurantAvailability(restaurantId, partySize, dateStr);
  }
}
