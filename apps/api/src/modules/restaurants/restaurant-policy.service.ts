import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import {
  restaurants,
  openingHours,
  specialClosures,
  restaurantPolicyHistory,
  auditLogs,
  bookings,
} from '../../common/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../common/errors/app-error';
import { PolicyMode } from '@dine/contracts';

export interface EligibilityResult {
  eligible: boolean;
  reason?: 'OUT_OF_OPERATING_HOURS' | 'SPECIAL_CLOSURE' | 'INVALID_PARTY_SIZE' | 'INVALID_LEAD_TIME';
  message?: string;
  policySnapshot?: {
    policy_version: number;
    policy_mode: string;
    deposit_amount_minor: number;
    deposit_currency: string;
    default_duration_min: number;
    turnover_buffer_min: number;
    timezone: string;
  };
}

export function isValidIanaTimezone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== 'string' || tz.trim() === '') {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a UTC Date into local components in a given IANA timezone.
 */
export function getLocalTimeParts(date: Date, timezone: string): {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  hours: number;
  minutes: number;
  totalMinutes: number;
  year: number;
  month: number;
  day: number;
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayOfWeek = weekdayMap[partMap.weekday] ?? 0;
  const hours = parseInt(partMap.hour, 10) % 24;
  const minutes = parseInt(partMap.minute, 10);
  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);

  return {
    dayOfWeek,
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
    year,
    month,
    day,
  };
}

/**
 * Parse HH:MM[:SS] time string to minutes from midnight.
 */
export function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  return h * 60 + (m || 0);
}

/**
 * Checks if a requested local interval [startMinutes, startMinutes + durationMin]
 * is fully contained in an opening interval [openMinutes, closeMinutes].
 * Handles overnight opening intervals (e.g. 18:00 to 02:00 where closeMinutes < openMinutes).
 */
export function isWithinOpeningHours(
  localStartMinutes: number,
  durationMin: number,
  openMinutes: number,
  closeMinutes: number
): boolean {
  const localEndMinutes = localStartMinutes + durationMin;

  if (closeMinutes > openMinutes) {
    // Normal same-day schedule (e.g. 11:00 to 23:00 -> 660 to 1380)
    return localStartMinutes >= openMinutes && localEndMinutes <= closeMinutes;
  } else {
    // Overnight schedule (e.g. 18:00 to 02:00 -> 1080 to 120 next day)
    // Overnight window effectively spans openMinutes to 1440 + closeMinutes (1080 to 1560)
    const effectiveClose = closeMinutes + 1440;

    // Sub-case A: Booking starts in the evening on day D (localStartMinutes >= openMinutes)
    if (localStartMinutes >= openMinutes) {
      return localEndMinutes <= effectiveClose;
    }

    // Sub-case B: Booking starts after midnight on day D+1 (localStartMinutes < closeMinutes)
    const normalizedStart = localStartMinutes + 1440;
    const normalizedEnd = localEndMinutes + 1440;
    return normalizedStart >= openMinutes && normalizedEnd <= effectiveClose;
  }
}

@Injectable()
export class RestaurantPolicyService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Validate policy configuration attributes.
   * Throws ValidationError on invalid timezone or non-positive deposit amount.
   */
  validatePolicyConfig(dto: {
    timezone?: string;
    policy_mode?: string;
    deposit_amount_minor?: number;
    deposit_currency?: string;
    default_duration_min?: number;
    turnover_buffer_min?: number;
    min_party_size?: number;
    max_party_size?: number;
  }) {
    // 1. Timezone validation
    if (dto.timezone !== undefined) {
      if (!dto.timezone || !isValidIanaTimezone(dto.timezone)) {
        throw new ValidationError('Invalid or missing timezone is rejected at configuration');
      }
    }

    // 2. Deposit mode and positive integer validation
    if (dto.policy_mode === PolicyMode.DEPOSIT_REQUIRED) {
      if (
        dto.deposit_amount_minor === undefined ||
        dto.deposit_amount_minor <= 0 ||
        !Number.isInteger(dto.deposit_amount_minor)
      ) {
        throw new ValidationError('DEPOSIT_REQUIRED validates positive integer minor-unit amount and currency');
      }
      if (dto.deposit_currency && dto.deposit_currency.length !== 3) {
        throw new ValidationError('Currency must be a valid 3-letter ISO code');
      }
    }

    // 3. Durations and party sizes
    if (dto.default_duration_min !== undefined && dto.default_duration_min <= 0) {
      throw new ValidationError('Default duration must be a positive integer in minutes');
    }
    if (dto.turnover_buffer_min !== undefined && dto.turnover_buffer_min < 0) {
      throw new ValidationError('Turnover buffer cannot be negative');
    }
    if (dto.min_party_size !== undefined && dto.min_party_size <= 0) {
      throw new ValidationError('Minimum party size must be at least 1');
    }
    if (
      dto.min_party_size !== undefined &&
      dto.max_party_size !== undefined &&
      dto.max_party_size < dto.min_party_size
    ) {
      throw new ValidationError('Maximum party size must be greater than or equal to minimum party size');
    }
  }

  /**
   * Evaluate reservation eligibility against operating hours, special closures,
   * party size limits, and lead time policies.
   */
  async evaluateReservationEligibility(
    restaurantId: string,
    requestedStart: Date | string,
    partySize: number
  ): Promise<EligibilityResult> {
    const startDate = typeof requestedStart === 'string' ? new Date(requestedStart) : requestedStart;
    if (isNaN(startDate.getTime())) {
      throw new ValidationError('Invalid requested_start ISO timestamp');
    }

    const rest = await this.db.getDb().select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
    const restaurant = rest[0];
    if (!restaurant) {
      throw new NotFoundError(`Restaurant with ID ${restaurantId} not found`);
    }

    // 1. Party Size Check
    if (partySize < restaurant.minPartySize || partySize > restaurant.maxPartySize) {
      return {
        eligible: false,
        reason: 'INVALID_PARTY_SIZE',
        message: `Requested party size ${partySize} is outside allowed range (${restaurant.minPartySize} - ${restaurant.maxPartySize})`,
      };
    }

    // 2. Lead Time Check
    const now = new Date();
    const diffMs = startDate.getTime() - now.getTime();
    const minLeadMs = restaurant.leadTimeMinMinutes * 60 * 1000;
    const maxLeadMs = restaurant.leadTimeMaxDays * 24 * 60 * 60 * 1000;

    if (diffMs < minLeadMs) {
      return {
        eligible: false,
        reason: 'INVALID_LEAD_TIME',
        message: `Reservation must be made at least ${restaurant.leadTimeMinMinutes} minutes in advance`,
      };
    }
    if (diffMs > maxLeadMs) {
      return {
        eligible: false,
        reason: 'INVALID_LEAD_TIME',
        message: `Reservation cannot be booked more than ${restaurant.leadTimeMaxDays} days in advance`,
      };
    }

    // 3. Special Closures Check
    const diningDurationMin = restaurant.defaultDurationMin;
    const bufferMin = restaurant.turnoverBufferMin;
    const endDate = new Date(startDate.getTime() + (diningDurationMin + bufferMin) * 60 * 1000);

    const closures = await this.db
      .getDb()
      .select()
      .from(specialClosures)
      .where(eq(specialClosures.restaurantId, restaurantId));

    for (const closure of closures) {
      const cStart = new Date(closure.startTime).getTime();
      const cEnd = new Date(closure.endTime).getTime();
      const reqStart = startDate.getTime();
      const reqEnd = endDate.getTime();

      // Check overlap: max(reqStart, cStart) < min(reqEnd, cEnd)
      if (Math.max(reqStart, cStart) < Math.min(reqEnd, cEnd)) {
        return {
          eligible: false,
          reason: 'SPECIAL_CLOSURE',
          message: `Restaurant is closed during requested time: ${closure.reason || 'Special closure'}`,
        };
      }
    }

    // 4. Operating Hours Check (evaluated in restaurant's local timezone)
    const localTime = getLocalTimeParts(startDate, restaurant.timezone);
    const dayHours = await this.db
      .getDb()
      .select()
      .from(openingHours)
      .where(
        and(
          eq(openingHours.restaurantId, restaurantId),
          eq(openingHours.dayOfWeek, localTime.dayOfWeek)
        )
      );

    // Also fetch previous day's hours to support overnight schedules that started yesterday
    const prevDay = (localTime.dayOfWeek + 6) % 7;
    const prevDayHours = await this.db
      .getDb()
      .select()
      .from(openingHours)
      .where(
        and(
          eq(openingHours.restaurantId, restaurantId),
          eq(openingHours.dayOfWeek, prevDay)
        )
      );

    let isOpen = false;

    // Check today's scheduled slots
    for (const slot of dayHours) {
      const openMin = parseTimeToMinutes(slot.openTime);
      const closeMin = parseTimeToMinutes(slot.closeTime);
      if (isWithinOpeningHours(localTime.totalMinutes, diningDurationMin, openMin, closeMin)) {
        isOpen = true;
        break;
      }
    }

    // If not covered by today, check if an overnight slot from yesterday covers this morning
    if (!isOpen) {
      for (const slot of prevDayHours) {
        const openMin = parseTimeToMinutes(slot.openTime);
        const closeMin = parseTimeToMinutes(slot.closeTime);
        if (closeMin < openMin) {
          // Overnight schedule started yesterday
          if (localTime.totalMinutes + diningDurationMin <= closeMin) {
            isOpen = true;
            break;
          }
        }
      }
    }

    if (!isOpen) {
      return {
        eligible: false,
        reason: 'OUT_OF_OPERATING_HOURS',
        message: 'Requested reservation time is outside restaurant operating hours',
      };
    }

    // All checks passed! Build immutable policy snapshot
    return {
      eligible: true,
      policySnapshot: {
        policy_version: restaurant.policyVersion,
        policy_mode: restaurant.policyMode,
        deposit_amount_minor: restaurant.depositAmountMinor,
        deposit_currency: restaurant.depositCurrency,
        default_duration_min: restaurant.defaultDurationMin,
        turnover_buffer_min: restaurant.turnoverBufferMin,
        timezone: restaurant.timezone,
      },
    };
  }

  /**
   * Check for closure conflicts against future bookings.
   */
  async checkClosureConflicts(restaurantId: string, startTime: Date, endTime: Date) {
    try {
      const pool = this.db.getPool();
      const res = await pool.query(
        `SELECT b.id, b.requested_start, b.party_size, b.status
         FROM bookings b
         JOIN restaurants r ON r.id = b.restaurant_id
         WHERE b.restaurant_id = $1
           AND b.status IN ('CONFIRMED', 'HOLD_ACTIVE', 'PAYMENT_PENDING')
           AND b.requested_start < $3
           AND (b.requested_start + (r.default_duration_min + r.turnover_buffer_min) * interval '1 minute') > $2`,
        [restaurantId, startTime.toISOString(), endTime.toISOString()]
      );
      return res.rows;
    } catch {
      return [];
    }
  }

  /**
   * Update restaurant policies, archiving previous policy version into history
   * and logging audit event.
   */
  async updatePolicies(
    restaurantId: string,
    updateDto: any,
    actorId?: string,
    requestId?: string
  ) {
    const existing = await this.db.getDb().select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
    const current = existing[0];
    if (!current) {
      throw new NotFoundError(`Restaurant with ID ${restaurantId} not found`);
    }

    this.validatePolicyConfig(updateDto);

    const newVersion = current.policyVersion + 1;

    // 1. Record archive history row for previous version
    await this.db.getDb().insert(restaurantPolicyHistory).values({
      restaurantId: current.id,
      version: current.policyVersion,
      policyMode: current.policyMode,
      depositAmountMinor: current.depositAmountMinor,
      depositCurrency: current.depositCurrency,
      defaultDurationMin: current.defaultDurationMin,
      turnoverBufferMin: current.turnoverBufferMin,
      minPartySize: current.minPartySize,
      maxPartySize: current.maxPartySize,
      leadTimeMinMinutes: current.leadTimeMinMinutes,
      leadTimeMaxDays: current.leadTimeMaxDays,
      changedBy: actorId || null,
      changeReason: updateDto.change_reason || 'Owner policy configuration update',
    });

    // 2. Update restaurant with new version
    const updated = await this.db
      .getDb()
      .update(restaurants)
      .set({
        policyVersion: newVersion,
        timezone: updateDto.timezone ?? current.timezone,
        policyMode: updateDto.policy_mode ?? current.policyMode,
        depositAmountMinor:
          updateDto.deposit_amount_minor !== undefined
            ? updateDto.deposit_amount_minor
            : current.depositAmountMinor,
        depositCurrency: updateDto.deposit_currency ?? current.depositCurrency,
        defaultDurationMin: updateDto.default_duration_min ?? current.defaultDurationMin,
        turnoverBufferMin: updateDto.turnover_buffer_min ?? current.turnoverBufferMin,
        minPartySize: updateDto.min_party_size ?? current.minPartySize,
        maxPartySize: updateDto.max_party_size ?? current.maxPartySize,
        leadTimeMinMinutes: updateDto.lead_time_min_minutes ?? current.leadTimeMinMinutes,
        leadTimeMaxDays: updateDto.lead_time_max_days ?? current.leadTimeMaxDays,
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId))
      .returning();

    // 3. Insert audit log record
    await this.db.getDb().insert(auditLogs).values({
      actorId: actorId || null,
      restaurantId: current.id,
      action: 'RESTAURANT_POLICY_UPDATED',
      entityType: 'RESTAURANT',
      entityId: current.id,
      diff: {
        before: {
          policy_version: current.policyVersion,
          policy_mode: current.policyMode,
          deposit_amount_minor: current.depositAmountMinor,
          default_duration_min: current.defaultDurationMin,
        },
        after: {
          policy_version: newVersion,
          policy_mode: updated[0].policyMode,
          deposit_amount_minor: updated[0].depositAmountMinor,
          default_duration_min: updated[0].defaultDurationMin,
        },
      },
      requestId: requestId || null,
    });

    return updated[0];
  }

  /**
   * Add a special closure, checking for conflicts with existing bookings.
   */
  async addSpecialClosure(
    restaurantId: string,
    startTime: string,
    endTime: string,
    reason?: string,
    force: boolean = false,
    actorId?: string,
    requestId?: string
  ) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Invalid start_time or end_time ISO format');
    }
    if (end.getTime() <= start.getTime()) {
      throw new ValidationError('Closure end_time must be strictly after start_time');
    }

    const rest = await this.db.getDb().select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
    if (!rest[0]) {
      throw new NotFoundError(`Restaurant with ID ${restaurantId} not found`);
    }

    // Check conflicts with confirmed bookings
    const conflicts = await this.checkClosureConflicts(restaurantId, start, end);
    if (conflicts.length > 0 && !force) {
      throw new ConflictError(
        `Closure interval conflicts with ${conflicts.length} existing booking(s). Booking IDs: ${conflicts.map((b) => b.id).join(', ')}`
      );
    }

    const inserted = await this.db
      .getDb()
      .insert(specialClosures)
      .values({
        restaurantId,
        startTime: start,
        endTime: end,
        reason: reason || 'Scheduled closure',
      })
      .returning();

    // Record audit log
    await this.db.getDb().insert(auditLogs).values({
      actorId: actorId || null,
      restaurantId,
      action: 'SPECIAL_CLOSURE_CREATED',
      entityType: 'SPECIAL_CLOSURE',
      entityId: inserted[0].id,
      diff: {
        start_time: startTime,
        end_time: endTime,
        reason,
        conflict_count: conflicts.length,
        forced: force,
      },
      requestId: requestId || null,
    });

    return inserted[0];
  }
}
