const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateCapacityFitScore,
  calculatePreferenceMatchScore,
  calculateLocationSuitabilityScore,
  calculateOperationalEfficiencyScore,
  calculateRecommendationScore,
  rankEligibleTablesPure,
  acquireAutoHoldWithBoundedFallbackPure,
  WEIGHT_CAPACITY,
  WEIGHT_PREFERENCE,
  WEIGHT_LOCATION,
  WEIGHT_OPERATIONAL,
} = require('../../apps/api/dist/modules/recommendations/recommendations.service');

const { ErrorCode } = require('../../packages/contracts/dist');

test('EPIC-023 Task T01: Normalized component scoring formulas, weights, and missing-input defaults', async (t) => {
  await t.test('Weights adhere strictly to PRD §13 and Realtime §8 specification', () => {
    assert.equal(WEIGHT_CAPACITY, 0.40, 'Capacity weight must be 0.40');
    assert.equal(WEIGHT_PREFERENCE, 0.25, 'Preference weight must be 0.25');
    assert.equal(WEIGHT_LOCATION, 0.20, 'Location weight must be 0.20');
    assert.equal(WEIGHT_OPERATIONAL, 0.15, 'Operational weight must be 0.15');
    assert.equal(
      WEIGHT_CAPACITY + WEIGHT_PREFERENCE + WEIGHT_LOCATION + WEIGHT_OPERATIONAL,
      1.0,
      'Weights must sum exactly to 1.0',
    );
  });

  await t.test('Capacity fit score C normalizes [0, 100] and penalizes capacity waste', () => {
    // 2-person party
    assert.equal(calculateCapacityFitScore(2, 1, 2), 100, 'Exact 2-top fit gives 100');
    assert.equal(calculateCapacityFitScore(4, 1, 2), 60, '4-top for 2 people gives 60 (waste 2)');
    assert.equal(calculateCapacityFitScore(6, 1, 2), 20, '6-top for 2 people gives 20 (waste 4)');
    assert.equal(calculateCapacityFitScore(8, 1, 2), 0, '8-top for 2 people gives 0 (waste 6)');

    // Ineligible capacities give 0
    assert.equal(calculateCapacityFitScore(2, 1, 4), 0, 'Party size > max capacity gives 0');
    assert.equal(calculateCapacityFitScore(8, 4, 2), 0, 'Party size < min capacity gives 0');
  });

  await t.test('Preference match score P handles missing defaults, ANY, and zone matching', () => {
    // Missing input default
    assert.equal(calculatePreferenceMatchScore('Patio'), 70, 'Missing preference returns default 70');
    assert.equal(calculatePreferenceMatchScore('Patio', ''), 70, 'Empty preference returns default 70');

    // ANY / NO_PREFERENCE
    assert.equal(calculatePreferenceMatchScore('Patio', 'ANY'), 85, 'ANY returns 85');
    assert.equal(calculatePreferenceMatchScore('Main Dining', 'NO_PREFERENCE'), 85, 'NO_PREFERENCE returns 85');

    // Exact and keyword matches
    assert.equal(calculatePreferenceMatchScore('Patio Terrace', 'OUTDOOR'), 100, 'OUTDOOR matches Patio Terrace');
    assert.equal(calculatePreferenceMatchScore('Main Dining Room', 'INDOOR'), 100, 'INDOOR matches Main Dining');
    assert.equal(calculatePreferenceMatchScore('Window Section', 'WINDOW'), 100, 'WINDOW matches Window');
    assert.equal(calculatePreferenceMatchScore('Main Dining', 'OUTDOOR'), 30, 'Mismatch returns 30');
  });

  await t.test('Location suitability score L evaluates floor zone topology with default', () => {
    assert.equal(calculateLocationSuitabilityScore({ zone: 'Window Terrace' }), 90, 'Prime zone gives 90');
    assert.equal(calculateLocationSuitabilityScore({ zone: 'Main Dining' }), 80, 'Main dining gives 80');
    assert.equal(calculateLocationSuitabilityScore({ zone: 'Bar Counter' }), 55, 'Bar gives 55');
    assert.equal(calculateLocationSuitabilityScore({ zone: '' }), 75, 'Missing location metadata gives default 75');
  });

  await t.test('Operational efficiency score O balances table turns and section load with default', () => {
    assert.equal(calculateOperationalEfficiencyScore({ activeTurns: 0 }), 95, '0 active turns gives 95');
    assert.equal(calculateOperationalEfficiencyScore({ activeTurns: 1 }), 85, '1 active turn gives 85');
    assert.equal(calculateOperationalEfficiencyScore({ activeTurns: 2 }), 70, '2 active turns gives 70');
    assert.equal(calculateOperationalEfficiencyScore({ activeTurns: 4 }), 50, '>=3 active turns gives 50');
    assert.equal(calculateOperationalEfficiencyScore({}), 70, 'Missing operational metadata gives default 70');
  });

  await t.test('Weighted score calculation S = 0.40C + 0.25P + 0.20L + 0.15O', () => {
    const res = calculateRecommendationScore(100, 100, 90, 95);
    // 0.40*100 + 0.25*100 + 0.20*90 + 0.15*95 = 40 + 25 + 18 + 14.25 = 97.25
    assert.equal(res.score, 97.25);
    assert.equal(res.breakdown.capacity_fit.weighted, 40);
    assert.equal(res.breakdown.preference_match.weighted, 25);
    assert.equal(res.breakdown.location_suitability.weighted, 18);
    assert.equal(res.breakdown.operational_efficiency.weighted, 14.25);
  });
});

test('EPIC-023 Task T02 & AC 1: Shared eligibility-first ranking filters out incompatible tables', () => {
  const tables = [
    { id: 't_01', table_number: 'T01', capacity: 2, min_covers: 1, zone: 'Main Dining', state: 'AVAILABLE', is_active: true },
    { id: 't_02', table_number: 'T02', capacity: 4, min_covers: 1, zone: 'Main Dining', state: 'AVAILABLE', is_active: true },
    { id: 't_03', table_number: 'T03', capacity: 2, min_covers: 1, zone: 'Main Dining', state: 'UNAVAILABLE', is_active: true }, // UNAVAILABLE (already allocated)
    { id: 't_04', table_number: 'T04', capacity: 6, min_covers: 4, zone: 'Main Dining', state: 'AVAILABLE', is_active: true }, // min_covers = 4 (too big for party of 2)
    { id: 't_05', table_number: 'T05', capacity: 1, min_covers: 1, zone: 'Main Dining', state: 'AVAILABLE', is_active: true }, // capacity = 1 (too small for party of 2)
    { id: 't_06', table_number: 'T06', capacity: 4, min_covers: 1, zone: 'Main Dining', state: 'AVAILABLE', is_active: false }, // Inactive table
  ];

  const ranked = rankEligibleTablesPure(tables, 2);

  // Only t_01 and t_02 should be eligible
  assert.equal(ranked.length, 2, 'Only eligible tables must be ranked');
  const rankedIds = ranked.map((r) => r.table_id);
  assert.ok(rankedIds.includes('t_01'));
  assert.ok(rankedIds.includes('t_02'));
  assert.ok(!rankedIds.includes('t_03'), 'Allocated table must be filtered out');
  assert.ok(!rankedIds.includes('t_04'), 'Table with min_covers > party_size must be filtered out');
  assert.ok(!rankedIds.includes('t_05'), 'Table with capacity < party_size must be filtered out');
  assert.ok(!rankedIds.includes('t_06'), 'Inactive table must be filtered out');
});

test('EPIC-023 Task T03 & AC 2: Deterministic scoring and stable tie-breaking', () => {
  const tables = [
    { id: 'b_uuid_02', table_number: 'T02', capacity: 4, min_covers: 1, zone: 'Main Dining', is_active: true },
    { id: 'a_uuid_01', table_number: 'T01', capacity: 4, min_covers: 1, zone: 'Main Dining', is_active: true },
    { id: 'c_uuid_03', table_number: 'T03', capacity: 4, min_covers: 1, zone: 'Main Dining', is_active: true },
  ];

  // Identical tables with identical attributes -> tie-breaking by table_number then UUID
  const run1 = rankEligibleTablesPure(tables, 4, { seating_preference: 'INDOOR' });
  const run2 = rankEligibleTablesPure(tables, 4, { seating_preference: 'INDOOR' });

  assert.equal(run1.length, 3);
  assert.deepEqual(
    run1.map((r) => r.table_number),
    ['T01', 'T02', 'T03'],
    'Tie break must order alphabetically by table_number: T01, T02, T03',
  );
  assert.deepEqual(run1, run2, 'Same snapshot and input must produce 100% deterministic ordered scores');
});

test('EPIC-023 AC 3: Two-person group prefers fit per approved formula rather than wasting larger tables', () => {
  const tables = [
    { id: 't_6top', table_number: 'T06', capacity: 6, min_covers: 1, zone: 'Main Dining', is_active: true },
    { id: 't_4top', table_number: 'T04', capacity: 4, min_covers: 1, zone: 'Main Dining', is_active: true },
    { id: 't_2top', table_number: 'T02', capacity: 2, min_covers: 1, zone: 'Main Dining', is_active: true },
  ];

  const partySize = 2;
  const ranked = rankEligibleTablesPure(tables, partySize);

  assert.equal(ranked.length, 3);
  // Rank 1 must be T02 (exact fit), followed by T04 (2 waste), then T06 (4 waste)
  assert.equal(ranked[0].table_number, 'T02', '2-top table must be ranked #1 for a 2-person group');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].table_number, 'T04', '4-top table must be ranked #2');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[2].table_number, 'T06', '6-top table must be ranked #3');
  assert.equal(ranked[2].rank, 3);

  // Scores must be strictly descending due to capacity fit component
  assert.ok(
    ranked[0].score > ranked[1].score,
    `T02 score (${ranked[0].score}) must be greater than T04 score (${ranked[1].score})`,
  );
  assert.ok(
    ranked[1].score > ranked[2].score,
    `T04 score (${ranked[1].score}) must be greater than T06 score (${ranked[2].score})`,
  );
});

test('EPIC-023 Task T04 & AC 6: Bounded automatic retry without manual substitution', async (t) => {
  await t.test('Retries next ranked candidate when candidate #1 experiences concurrent conflict', async () => {
    const candidates = [
      { table_id: 't_01', table_number: 'T01', rank: 1, score: 95.0, score_breakdown: {} },
      { table_id: 't_02', table_number: 'T02', rank: 2, score: 90.0, score_breakdown: {} },
      { table_id: 't_03', table_number: 'T03', rank: 3, score: 85.0, score_breakdown: {} },
    ];

    const attemptedTables = [];
    const mockAcquireHold = async (tableId) => {
      attemptedTables.push(tableId);
      if (tableId === 't_01') {
        const err = new Error('Table T01 unavailable: concurrent hold race');
        err.status = 409;
        err.code = ErrorCode.INVENTORY_HOLD_CONFLICT;
        throw err;
      }
      return { hold_id: 'hold_success_t02', table_id: tableId, status: 'ACTIVE' };
    };

    const res = await acquireAutoHoldWithBoundedFallbackPure(candidates, mockAcquireHold, { retryCap: 3 });

    assert.equal(res.chosenCandidate.table_id, 't_02', 'Must safely fall back to candidate #2');
    assert.equal(res.chosenCandidate.rank, 2);
    assert.equal(res.retriesAttempted, 1, 'Exactly 1 retry attempt recorded');
    assert.deepEqual(attemptedTables, ['t_01', 't_02']);
  });

  await t.test('Stops at configured retry budget and raises AUTO_RECOMMENDATION_EXHAUSTED', async () => {
    const candidates = [
      { table_id: 't_01', table_number: 'T01', rank: 1, score: 95.0, score_breakdown: {} },
      { table_id: 't_02', table_number: 'T02', rank: 2, score: 90.0, score_breakdown: {} },
      { table_id: 't_03', table_number: 'T03', rank: 3, score: 85.0, score_breakdown: {} },
      { table_id: 't_04', table_number: 'T04', rank: 4, score: 80.0, score_breakdown: {} },
    ];

    const attemptedTables = [];
    const mockAcquireHoldAllConflict = async (tableId) => {
      attemptedTables.push(tableId);
      const err = new Error(`Table ${tableId} unavailable`);
      err.status = 409;
      err.code = ErrorCode.INVENTORY_HOLD_CONFLICT;
      throw err;
    };

    let errorThrown = null;
    try {
      await acquireAutoHoldWithBoundedFallbackPure(candidates, mockAcquireHoldAllConflict, { retryCap: 2 });
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown, 'Must throw when retry budget is exhausted');
    assert.equal(errorThrown.status, 409);
    assert.equal(errorThrown.code, ErrorCode.AUTO_RECOMMENDATION_EXHAUSTED);
    assert.equal(attemptedTables.length, 2, 'Must stop strictly at retry budget of 2');
    assert.deepEqual(attemptedTables, ['t_01', 't_02']);
  });

  await t.test('Non-conflict error (e.g. validation failure) aborts immediately without fallback', async () => {
    const candidates = [
      { table_id: 't_01', table_number: 'T01', rank: 1, score: 95.0, score_breakdown: {} },
      { table_id: 't_02', table_number: 'T02', rank: 2, score: 90.0, score_breakdown: {} },
    ];

    const attemptedTables = [];
    const mockAcquireHoldValidationFail = async (tableId) => {
      attemptedTables.push(tableId);
      const err = new Error('Invalid party size: 0');
      err.status = 400;
      err.code = ErrorCode.VALIDATION_ERROR;
      throw err;
    };

    let errorThrown = null;
    try {
      await acquireAutoHoldWithBoundedFallbackPure(candidates, mockAcquireHoldValidationFail, { retryCap: 3 });
    } catch (err) {
      errorThrown = err;
    }

    assert.ok(errorThrown);
    assert.equal(errorThrown.status, 400);
    assert.equal(attemptedTables.length, 1, 'Must not retry on non-conflict error');
  });
});

test('EPIC-023 Task T05 & AC 5: Manual versus automatic allocation race on shared atomic inventory', async () => {
  // Simulate concurrent contender scenario:
  // Contender A: Manual customer choosing Table T04 explicitly.
  // Contender B: Automatic customer with ranked candidates [T04, T05, T06].
  // Shared state of physical tables:
  const activeClaims = new Map(); // table_id -> hold

  const acquireAtomicHold = (tableId, customerId) => {
    if (activeClaims.has(tableId)) {
      const err = new Error(`Table ${tableId} already has an active inventory claim`);
      err.status = 409;
      err.code = ErrorCode.INVENTORY_HOLD_CONFLICT;
      throw err;
    }
    const hold = {
      hold_id: `hold_${customerId}_${tableId}`,
      table_id: tableId,
      customer_id: customerId,
      status: 'HELD',
    };
    activeClaims.set(tableId, hold);
    return hold;
  };

  // Contender A (Manual) wins Table T04 first
  const manualHold = acquireAtomicHold('T04', 'customer_manual_A');
  assert.equal(manualHold.table_id, 'T04');
  assert.equal(manualHold.customer_id, 'customer_manual_A');

  // Contender B (Automatic) requests automatic allocation with ranked candidates [T04, T05, T06]
  const autoCandidates = [
    { table_id: 'T04', table_number: 'T04', rank: 1, score: 96.0 },
    { table_id: 'T05', table_number: 'T05', rank: 2, score: 88.0 },
    { table_id: 'T06', table_number: 'T06', rank: 3, score: 80.0 },
  ];

  const autoResult = await acquireAutoHoldWithBoundedFallbackPure(
    autoCandidates,
    async (tableId) => acquireAtomicHold(tableId, 'customer_auto_B'),
    { retryCap: 3 },
  );

  // Invariant verification:
  // 1. Manual customer A holds T04
  assert.equal(activeClaims.get('T04').customer_id, 'customer_manual_A');
  // 2. Automatic customer B cleanly fell back to T05
  assert.equal(autoResult.chosenCandidate.table_id, 'T05');
  assert.equal(autoResult.chosenCandidate.rank, 2);
  assert.equal(autoResult.retriesAttempted, 1);
  assert.equal(activeClaims.get('T05').customer_id, 'customer_auto_B');
  // 3. ZERO overlapping active claims
  assert.equal(activeClaims.size, 2);
  assert.notEqual(activeClaims.get('T04').customer_id, activeClaims.get('T05').customer_id);
});
