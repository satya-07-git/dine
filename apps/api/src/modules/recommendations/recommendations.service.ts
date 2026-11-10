import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { AvailabilityService } from '../availability/availability.service';
import { ReservationsService } from '../reservations/reservations.service';
import { RestaurantPolicyService } from '../restaurants/restaurant-policy.service';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../../common/errors/app-error';
import {
  TableRecommendationRequestDto,
  TableRecommendationResponseDto,
  RecommendedCandidateDto,
  RecommendationScoreBreakdownDto,
  AutoHoldRequestDto,
  AutoHoldResponseDto,
  ErrorCode,
} from '@dine/contracts';

// ============================================================================
// Normalized Recommendation Scoring Model (PRD §13, Realtime §8, EPIC-023)
// S = 0.40 * C + 0.25 * P + 0.20 * L + 0.15 * O
// ============================================================================

export const WEIGHT_CAPACITY = 0.40;
export const WEIGHT_PREFERENCE = 0.25;
export const WEIGHT_LOCATION = 0.20;
export const WEIGHT_OPERATIONAL = 0.15;

/**
 * Calculates normalized capacity fit score C in [0, 100].
 * Evaluates tightness of fit / capacity waste.
 * - Perfect fit (waste = 0): 100
 * - Decreases as excess capacity increases: C = Math.max(0, 100 - waste * 20)
 * - Ineligible capacity (party_size > capacity or party_size < min_capacity): 0
 */
export function calculateCapacityFitScore(
  capacity: number,
  minCapacity: number,
  partySize: number,
): number {
  if (partySize > capacity || partySize < minCapacity) {
    return 0;
  }
  const waste = capacity - partySize;
  return Math.max(0, 100 - waste * 20);
}

/**
 * Normalizes string for zone and preference matching.
 */
function normalizeZoneOrPreference(val?: string): string {
  return (val || '').trim().toUpperCase();
}

/**
 * Calculates normalized customer preference match score P in [0, 100].
 * - Missing input default: 70 (neutral unconstrained diner baseline)
 * - 'ANY' or 'NO_PREFERENCE': 85
 * - Matching zone / preference: 100
 * - Non-matching zone: 30
 */
export function calculatePreferenceMatchScore(
  tableZone: string,
  requestedPreference?: string,
  userPreferences?: { dietary?: string[]; seating?: string },
): number {
  const pref = normalizeZoneOrPreference(
    requestedPreference || userPreferences?.seating,
  );

  if (!pref) {
    // Missing input default
    return 70;
  }

  if (pref === 'ANY' || pref === 'NO_PREFERENCE' || pref === 'NONE') {
    return 85;
  }

  const zone = normalizeZoneOrPreference(tableZone);

  // Keyword semantics
  const outdoorMatches = ['OUTDOOR', 'PATIO', 'TERRACE', 'GARDEN', 'BALCONY', 'ROOFTOP'];
  const indoorMatches = ['INDOOR', 'MAIN', 'DINING', 'INTERIOR', 'HALL'];
  const windowMatches = ['WINDOW', 'VIEW'];
  const boothMatches = ['BOOTH', 'BANQUETTE'];
  const barMatches = ['BAR', 'COUNTER', 'HIGH_TOP'];
  const quietMatches = ['QUIET', 'CORNER', 'PRIVATE'];

  let matched = false;
  if (outdoorMatches.includes(pref) && outdoorMatches.some((k) => zone.includes(k))) {
    matched = true;
  } else if (indoorMatches.includes(pref) && indoorMatches.some((k) => zone.includes(k))) {
    matched = true;
  } else if (windowMatches.includes(pref) && windowMatches.some((k) => zone.includes(k))) {
    matched = true;
  } else if (boothMatches.includes(pref) && boothMatches.some((k) => zone.includes(k))) {
    matched = true;
  } else if (barMatches.includes(pref) && barMatches.some((k) => zone.includes(k))) {
    matched = true;
  } else if (quietMatches.includes(pref) && quietMatches.some((k) => zone.includes(k))) {
    matched = true;
  } else if (zone.includes(pref) || pref.includes(zone)) {
    matched = true;
  }

  return matched ? 100 : 30;
}

/**
 * Calculates normalized location suitability score L in [0, 100].
 * Evaluates spatial ambiance and floor topology.
 * - Prime / View / Terrace zones: 90
 * - Main dining room: 80
 * - High-traffic / Service / Entrance: 55
 * - Missing location default: 75
 */
export function calculateLocationSuitabilityScore(table: {
  zone?: string;
  x_position?: number;
  y_position?: number;
}): number {
  const zone = normalizeZoneOrPreference(table.zone);
  if (!zone) {
    return 75; // Default neutral
  }

  if (['PATIO', 'TERRACE', 'GARDEN', 'WINDOW', 'VIEW', 'PRIME', 'ROOFTOP'].some((k) => zone.includes(k))) {
    return 90;
  }
  if (['MAIN', 'DINING', 'INDOOR', 'STANDARD', 'INTERIOR'].some((k) => zone.includes(k))) {
    return 80;
  }
  if (['BAR', 'COUNTER', 'ENTRANCE', 'KITCHEN', 'RESTROOM', 'HIGH_TOP'].some((k) => zone.includes(k))) {
    return 55;
  }
  return 75;
}

/**
 * Calculates normalized operational efficiency score O in [0, 100].
 * Evaluates server load balancing, turnaround buffer pacing, and active turn count.
 * - 0 active turns: 95 (table rested and ready)
 * - 1 active turn: 85 (steady rotation)
 * - 2 active turns: 70 (moderate load)
 * - >=3 active turns: 50 (heavy rotation)
 * - Missing operational metadata default: 70
 */
export function calculateOperationalEfficiencyScore(table: {
  id?: string;
  activeTurns?: number;
  sectionLoad?: number;
}): number {
  if (table.activeTurns === undefined && table.sectionLoad === undefined) {
    return 70; // Missing operational input default
  }

  const turns = table.activeTurns ?? 0;
  if (turns === 0) return 95;
  if (turns === 1) return 85;
  if (turns === 2) return 70;
  return 50;
}

/**
 * Combines normalized components into the authoritative recommendation score:
 * S = 0.40 * C + 0.25 * P + 0.20 * L + 0.15 * O
 */
export function calculateRecommendationScore(
  capacityScore: number,
  preferenceScore: number,
  locationScore: number,
  operationalScore: number,
): { score: number; breakdown: RecommendationScoreBreakdownDto } {
  const weightedC = Number((capacityScore * WEIGHT_CAPACITY).toFixed(4));
  const weightedP = Number((preferenceScore * WEIGHT_PREFERENCE).toFixed(4));
  const weightedL = Number((locationScore * WEIGHT_LOCATION).toFixed(4));
  const weightedO = Number((operationalScore * WEIGHT_OPERATIONAL).toFixed(4));

  const totalScore = Number((weightedC + weightedP + weightedL + weightedO).toFixed(2));

  return {
    score: totalScore,
    breakdown: {
      capacity_fit: {
        raw: capacityScore,
        weight: WEIGHT_CAPACITY,
        weighted: weightedC,
      },
      preference_match: {
        raw: preferenceScore,
        weight: WEIGHT_PREFERENCE,
        weighted: weightedP,
      },
      location_suitability: {
        raw: locationScore,
        weight: WEIGHT_LOCATION,
        weighted: weightedL,
      },
      operational_efficiency: {
        raw: operationalScore,
        weight: WEIGHT_OPERATIONAL,
        weighted: weightedO,
      },
    },
  };
}

/**
 * Pure function: Ranks eligible tables deterministically.
 * - Enforces mandatory eligibility filtering first
 * - Calculates component scores
 * - Stable tie-breaker:
 *   1. Score descending
 *   2. Capacity waste ascending (t.capacity - partySize)
 *   3. Total capacity ascending
 *   4. Min capacity ascending
 *   5. Table number ascending
 *   6. Table ID ascending
 */
export function rankEligibleTablesPure(
  eligibleTables: Array<{
    id: string;
    table_number: string;
    capacity: number;
    min_covers?: number;
    min_capacity?: number;
    zone: string;
    floor_id?: string;
    floor_name?: string;
    is_active?: boolean;
    state?: string;
    activeTurns?: number;
  }>,
  partySize: number,
  preferences?: {
    seating_preference?: string;
    dietary_requirements?: string[];
    special_requests?: string;
  },
  options?: {
    max_candidates?: number;
  },
): RecommendedCandidateDto[] {
  // 1. Filter strictly eligible tables
  const filtered = eligibleTables.filter((t) => {
    // If state is present, must be AVAILABLE
    if (t.state && t.state !== 'AVAILABLE') return false;
    // Must be active
    if (t.is_active === false) return false;
    // Capacity boundaries
    const minCap = t.min_covers ?? t.min_capacity ?? 1;
    if (partySize > t.capacity || partySize < minCap) return false;
    return true;
  });

  // 2. Score each eligible table
  const scored = filtered.map((t) => {
    const minCap = t.min_covers ?? t.min_capacity ?? 1;
    const cScore = calculateCapacityFitScore(t.capacity, minCap, partySize);
    const pScore = calculatePreferenceMatchScore(
      t.zone,
      preferences?.seating_preference,
      { dietary: preferences?.dietary_requirements, seating: preferences?.seating_preference },
    );
    const lScore = calculateLocationSuitabilityScore(t);
    const oScore = calculateOperationalEfficiencyScore(t);

    const { score, breakdown } = calculateRecommendationScore(
      cScore,
      pScore,
      lScore,
      oScore,
    );

    const waste = t.capacity - partySize;
    let explanation = `Table ${t.table_number} in ${t.zone}: capacity fit ${cScore}/100 (${waste === 0 ? 'exact fit' : `${waste} extra seats`}), preference match ${pScore}/100, location ${lScore}/100, operational ${oScore}/100. Overall score: ${score.toFixed(2)}.`;

    return {
      table_id: t.id,
      table_number: t.table_number,
      floor_id: t.floor_id || 'default_floor',
      floor_name: t.floor_name || 'Main Floor',
      zone: t.zone,
      capacity: t.capacity,
      min_capacity: minCap,
      score,
      score_breakdown: breakdown,
      explanation,
      _waste: waste,
    };
  });

  // 3. Deterministic Stable Tie-Breaking
  scored.sort((a, b) => {
    // 1. Final score descending
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // 2. Capacity waste ascending (tighter fit wins)
    if (a._waste !== b._waste) {
      return a._waste - b._waste;
    }
    // 3. Absolute capacity ascending
    if (a.capacity !== b.capacity) {
      return a.capacity - b.capacity;
    }
    // 4. Min capacity ascending
    if (a.min_capacity !== b.min_capacity) {
      return a.min_capacity - b.min_capacity;
    }
    // 5. Table number alphanumeric ascending
    const numCmp = a.table_number.localeCompare(b.table_number, undefined, { numeric: true });
    if (numCmp !== 0) {
      return numCmp;
    }
    // 6. UUID alphanumeric ascending
    return a.table_id.localeCompare(b.table_id);
  });

  // 4. Assign ranks (1-based)
  const maxCandidates = options?.max_candidates ?? 5;
  const sliced = scored.slice(0, maxCandidates);

  return sliced.map((item, idx) => {
    const { _waste, ...rest } = item;
    return {
      ...rest,
      rank: idx + 1,
    };
  });
}

/**
 * Pure function: Orchestrates bounded automatic retry across ranked candidates.
 * - Tries candidate #1.
 * - On concurrent conflict (409), safely falls back to candidate #2 up to retryCap.
 * - Manual substitution is STRICTLY PROHIBITED.
 * - Returns the actual chosen table, rank, and attempts count.
 * - If retry budget is exhausted, throws AUTO_RECOMMENDATION_EXHAUSTED.
 */
export async function acquireAutoHoldWithBoundedFallbackPure<T>(
  candidates: RecommendedCandidateDto[],
  tryAcquireHoldFn: (tableId: string, candidate: RecommendedCandidateDto) => Promise<T>,
  options?: {
    retryCap?: number;
  },
): Promise<{
  result: T;
  chosenCandidate: RecommendedCandidateDto;
  retriesAttempted: number;
}> {
  const retryCap = Math.max(1, options?.retryCap ?? 3);
  const eligibleAttempts = candidates.slice(0, retryCap);

  if (eligibleAttempts.length === 0) {
    throw new ConflictError(
      'No eligible tables available for automatic recommendation',
      ErrorCode.NO_ELIGIBLE_TABLES,
    );
  }

  let retriesAttempted = 0;
  let lastConflictError: any = null;

  for (let i = 0; i < eligibleAttempts.length; i++) {
    const candidate = eligibleAttempts[i];
    try {
      const result = await tryAcquireHoldFn(candidate.table_id, candidate);
      return {
        result,
        chosenCandidate: candidate,
        retriesAttempted,
      };
    } catch (err: any) {
      // Conflict error (409) indicates concurrent contention on candidate
      const isConflict =
        err?.status === 409 ||
        err?.code === ErrorCode.INVENTORY_HOLD_CONFLICT ||
        err?.code === ErrorCode.TABLE_UNAVAILABLE ||
        err?.message?.includes('unavailable') ||
        err?.message?.includes('conflict');

      if (isConflict) {
        retriesAttempted++;
        lastConflictError = err;
        // Proceed to next ranked candidate if within retry budget
        continue;
      }
      // Non-conflict errors (e.g. 400 validation, 401 unauth) should not fallback
      throw err;
    }
  }

  throw new ConflictError(
    `Automatic recommendation retry budget (${retryCap}) exhausted: all top candidates were claimed concurrently.`,
    ErrorCode.AUTO_RECOMMENDATION_EXHAUSTED,
  );
}

// ============================================================================
// RecommendationsService
// ============================================================================

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly availabilityService: AvailabilityService,
    private readonly reservationsService: ReservationsService,
    private readonly policyService: RestaurantPolicyService,
  ) {}

  /**
   * Retrieves deterministic, ranked table recommendations for requested party size and time.
   * INVARIANT: Recommendation output alone grants NO claim or lock (recommendation_only: true).
   */
  async getRecommendations(
    dto: TableRecommendationRequestDto,
  ): Promise<TableRecommendationResponseDto> {
    const { restaurant_id, party_size, requested_start } = dto;

    if (!restaurant_id) {
      throw new ValidationError('restaurant_id is required');
    }
    if (!party_size || party_size < 1) {
      throw new ValidationError('party_size must be a positive integer');
    }
    if (!requested_start) {
      throw new ValidationError('requested_start timestamp is required');
    }

    // 1. Fetch real-time table availability snapshot from shared availability engine
    const avail = await this.availabilityService.getRestaurantAvailability(
      restaurant_id,
      party_size,
      requested_start,
    );

    if (!avail.eligible) {
      return {
        restaurant_id,
        party_size,
        requested_start,
        dining_period: {
          start: avail.interval?.requested_start || requested_start,
          end: avail.interval?.derived_end || requested_start,
        },
        total_eligible_tables: 0,
        recommendations: [],
        recommended_table_id: null,
        recommendation_only: true,
        timestamp: new Date().toISOString(),
      };
    }

    // 2. Fetch operational data (active service turns) for load-balancing
    const pool = this.db.getPool();
    const activeTurnsRes = await pool.query(
      `SELECT table_id, COUNT(*)::int as active_turns
       FROM reservations
       WHERE restaurant_id = $1
         AND status IN ('CONFIRMED', 'CHECKED_IN', 'SEATED')
         AND starts_at >= CURRENT_DATE
       GROUP BY table_id`,
      [restaurant_id],
    );
    const turnsMap = new Map<string, number>();
    for (const r of activeTurnsRes.rows) {
      turnsMap.set(r.table_id, r.active_turns);
    }

    // 3. Map available tables with metadata
    const candidatesInput = avail.tables.map((t) => ({
      id: t.table_id,
      table_number: t.table_number,
      capacity: t.capacity,
      min_covers: t.min_covers,
      zone: t.zone,
      floor_id: t.floor_id,
      floor_name: t.floor_name,
      state: t.state,
      is_active: true,
      activeTurns: turnsMap.get(t.table_id) || 0,
    }));

    // 4. Rank candidates using pure deterministic scoring & stable tie-breaker
    const ranked = rankEligibleTablesPure(
      candidatesInput,
      party_size,
      {
        seating_preference: dto.seating_preference,
        dietary_requirements: dto.dietary_requirements,
        special_requests: dto.special_requests,
      },
      { max_candidates: dto.max_candidates ?? 5 },
    );

    return {
      restaurant_id,
      party_size,
      requested_start,
      dining_period: {
        start: avail.interval?.requested_start || requested_start,
        end: avail.interval?.derived_end || requested_start,
      },
      total_eligible_tables: ranked.length,
      recommendations: ranked,
      recommended_table_id: ranked[0]?.table_id || null,
      recommendation_only: true, // Guarantees advice does not allocate inventory
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Acquires an atomic hold with bounded automatic fallback.
   * - If manual table_id is specified: attempts hold for THAT TABLE ONLY. Never silently substitutes.
   * - If automatic recommendation: ranks candidates and retries next candidate up to retry_cap.
   */
  async acquireAutoHold(
    dto: AutoHoldRequestDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<AutoHoldResponseDto> {
    const {
      restaurant_id,
      party_size,
      requested_start,
      table_id,
      auto_recommend,
      retry_cap = 3,
    } = dto;

    if (!restaurant_id) {
      throw new ValidationError('restaurant_id is required');
    }
    if (!party_size || party_size < 1) {
      throw new ValidationError('party_size must be a positive integer');
    }
    if (!requested_start) {
      throw new ValidationError('requested_start timestamp is required');
    }

    const effectiveKey = idempotencyKey || randomUUID();

    // Rule: Customer explicit manual selection never silently switches tables
    if (table_id && auto_recommend !== true) {
      const holdRes = await this.reservationsService.createHold(
        userId,
        effectiveKey,
        {
          restaurant_id,
          table_id,
          party_size,
          requested_start,
        },
      );
      const hold = holdRes.result;

      return {
        hold_id: hold.hold_id,
        booking_id: hold.booking_id,
        restaurant_id,
        table_id: hold.table_id,
        table_number: table_id,
        party_size,
        dining_period: hold.dining_period,
        expires_at: hold.expires_at,
        server_time: hold.server_time,
        status: hold.status,
        deposit: hold.deposit as any,
        selection_mode: 'MANUAL',
        retries_attempted: 0,
        recommended_rank_chosen: 1,
        message: 'Manual table hold acquired successfully without substitution.',
      };
    }

    // Automatic recommendation flow
    const recs = await this.getRecommendations({
      restaurant_id,
      party_size,
      requested_start,
      seating_preference: dto.seating_preference,
      dietary_requirements: dto.dietary_requirements,
      special_requests: dto.special_requests,
      max_candidates: Math.max(retry_cap, 5),
    });

    if (recs.recommendations.length === 0) {
      throw new ConflictError(
        'No eligible tables available for automatic recommendation at this time',
        ErrorCode.NO_ELIGIBLE_TABLES,
      );
    }

    // Execute bounded fallback orchestration
    const fallbackResult = await acquireAutoHoldWithBoundedFallbackPure(
      recs.recommendations,
      async (candidateTableId) => {
        const tryKey = `${effectiveKey}:try:${candidateTableId}`;
        const holdRes = await this.reservationsService.createHold(
          userId,
          tryKey,
          {
            restaurant_id,
            table_id: candidateTableId,
            party_size,
            requested_start,
          },
        );
        return holdRes.result;
      },
      { retryCap: retry_cap },
    );

    const hold = fallbackResult.result;
    const chosen = fallbackResult.chosenCandidate;

    return {
      hold_id: hold.hold_id,
      booking_id: hold.booking_id,
      restaurant_id,
      table_id: hold.table_id,
      table_number: chosen.table_number,
      party_size,
      dining_period: hold.dining_period,
      expires_at: hold.expires_at,
      server_time: hold.server_time,
      status: hold.status,
      deposit: hold.deposit as any,
      selection_mode: 'AUTOMATIC',
      retries_attempted: fallbackResult.retriesAttempted,
      recommended_rank_chosen: chosen.rank,
      message: `Automatic hold acquired on Table ${chosen.table_number} (Rank #${chosen.rank}, Score: ${chosen.score.toFixed(2)}) after ${fallbackResult.retriesAttempted} retry fallback(s).`,
    };
  }
}
