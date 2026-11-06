const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateDiningInterval,
  doIntervalsOverlap,
  evaluateTableAvailability,
  parseLocalOrUtcToDate,
  AvailabilityService,
} = require('../../apps/api/dist/modules/availability/availability.service');
const {
  ValidationError,
  NotFoundError,
} = require('../../apps/api/dist/common/errors/app-error');

test('EPIC-007: Dining Interval & Buffer Calculator (T01)', async (t) => {
  await t.test('calculateDiningInterval computes 19:00 start with 90m duration + 15m buffer -> 20:45 end', () => {
    const result = calculateDiningInterval('2026-11-10T19:00:00Z', 90, 15, 'UTC');
    assert.equal(result.requestedStart.toISOString(), '2026-11-10T19:00:00.000Z');
    assert.equal(result.derivedEnd.toISOString(), '2026-11-10T20:45:00.000Z');
    assert.equal(result.diningDurationMin, 90);
    assert.equal(result.turnoverBufferMin, 15);
    assert.equal(result.protectionDurationMin, 105);
    assert.equal(result.timezone, 'UTC');
  });

  await t.test('calculateDiningInterval parses local ISO datetime with restaurant timezone Asia/Kolkata', () => {
    // 19:00 IST is 13:30 UTC
    const result = calculateDiningInterval('2026-11-10T19:00:00', 90, 15, 'Asia/Kolkata');
    assert.equal(result.requestedStart.toISOString(), '2026-11-10T13:30:00.000Z');
    // 13:30 + 105 minutes = 15:15 UTC (20:45 IST)
    assert.equal(result.derivedEnd.toISOString(), '2026-11-10T15:15:00.000Z');
  });

  await t.test('calculateDiningInterval rejects non-positive or invalid duration', () => {
    assert.throws(
      () => calculateDiningInterval('2026-11-10T19:00:00Z', 0, 15, 'UTC'),
      (err) => err instanceof ValidationError && err.message.includes('positive integer')
    );
    assert.throws(
      () => calculateDiningInterval('2026-11-10T19:00:00Z', -30, 15, 'UTC'),
      (err) => err instanceof ValidationError && err.message.includes('positive integer')
    );
    assert.throws(
      () => calculateDiningInterval('2026-11-10T19:00:00Z', 45.5, 15, 'UTC'),
      (err) => err instanceof ValidationError && err.message.includes('positive integer')
    );
  });

  await t.test('calculateDiningInterval rejects negative turnover buffer', () => {
    assert.throws(
      () => calculateDiningInterval('2026-11-10T19:00:00Z', 90, -5, 'UTC'),
      (err) => err instanceof ValidationError && err.message.includes('non-negative integer')
    );
  });

  await t.test('calculateDiningInterval accepts zero turnover buffer', () => {
    const result = calculateDiningInterval('2026-11-10T19:00:00Z', 90, 0, 'UTC');
    assert.equal(result.derivedEnd.toISOString(), '2026-11-10T20:30:00.000Z');
    assert.equal(result.turnoverBufferMin, 0);
  });

  await t.test('calculateDiningInterval rejects invalid timestamp string', () => {
    assert.throws(
      () => calculateDiningInterval('invalid-date', 90, 15, 'UTC'),
      (err) => err instanceof ValidationError
    );
  });
});

test('EPIC-007: Half-Open [start, end) Interval Overlap & Adjacency Rules (T01, T02)', async (t) => {
  const baseStart = new Date('2026-11-10T19:00:00Z');
  const baseEnd = new Date('2026-11-10T20:45:00Z');

  await t.test('Acceptance: 19:00-20:45 allocation rejects a 20:00 overlapping request (20:00-21:45)', () => {
    const reqStart = new Date('2026-11-10T20:00:00Z');
    const reqEnd = new Date('2026-11-10T21:45:00Z');
    const overlaps = doIntervalsOverlap(baseStart, baseEnd, reqStart, reqEnd);
    assert.equal(overlaps, true, '19:00-20:45 and 20:00-21:45 must overlap');
  });

  await t.test('Acceptance: adjacent eligible range beginning at 20:45 (20:45-22:30) is NOT rejected solely for adjacency', () => {
    const adjacentStart = new Date('2026-11-10T20:45:00Z');
    const adjacentEnd = new Date('2026-11-10T22:30:00Z');
    const overlaps = doIntervalsOverlap(baseStart, baseEnd, adjacentStart, adjacentEnd);
    assert.equal(overlaps, false, 'Adjacent range starting exactly when previous ends must NOT overlap');
  });

  await t.test('Acceptance: adjacent preceding range ending at 19:00 (17:15-19:00) does NOT overlap', () => {
    const precedingStart = new Date('2026-11-10T17:15:00Z');
    const precedingEnd = new Date('2026-11-10T19:00:00Z');
    const overlaps = doIntervalsOverlap(baseStart, baseEnd, precedingStart, precedingEnd);
    assert.equal(overlaps, false, 'Adjacent range ending exactly when next starts must NOT overlap');
  });

  await t.test('Range fully contained within allocation overlaps', () => {
    const innerStart = new Date('2026-11-10T19:30:00Z');
    const innerEnd = new Date('2026-11-10T20:15:00Z');
    assert.equal(doIntervalsOverlap(baseStart, baseEnd, innerStart, innerEnd), true);
  });

  await t.test('Range fully enclosing allocation overlaps', () => {
    const outerStart = new Date('2026-11-10T18:00:00Z');
    const outerEnd = new Date('2026-11-10T22:00:00Z');
    assert.equal(doIntervalsOverlap(baseStart, baseEnd, outerStart, outerEnd), true);
  });
});

test('EPIC-007: Table State & Reason Evaluation Contract (T03)', async (t) => {
  const validTable = { capacity: 4, minCovers: 2, isActive: true };

  await t.test('Eligible table with no blocks or allocations is AVAILABLE', () => {
    const result = evaluateTableAvailability(validTable, 4, false, false);
    assert.deepEqual(result, { state: 'AVAILABLE', reason: null });
  });

  await t.test('Inactive table is UNAVAILABLE with reason TABLE_INACTIVE', () => {
    const inactiveTable = { capacity: 4, minCovers: 2, isActive: false };
    const result = evaluateTableAvailability(inactiveTable, 4, false, false);
    assert.deepEqual(result, { state: 'UNAVAILABLE', reason: 'TABLE_INACTIVE' });
  });

  await t.test('Capacity mismatch (party size > capacity) is UNAVAILABLE with reason CAPACITY_MISMATCH', () => {
    const result = evaluateTableAvailability(validTable, 6, false, false);
    assert.deepEqual(result, { state: 'UNAVAILABLE', reason: 'CAPACITY_MISMATCH' });
  });

  await t.test('Capacity mismatch (party size < min_covers) is UNAVAILABLE with reason CAPACITY_MISMATCH', () => {
    const result = evaluateTableAvailability(validTable, 1, false, false);
    assert.deepEqual(result, { state: 'UNAVAILABLE', reason: 'CAPACITY_MISMATCH' });
  });

  await t.test('Table with overlapping block is UNAVAILABLE with reason BLOCKED', () => {
    const result = evaluateTableAvailability(validTable, 4, true, false);
    assert.deepEqual(result, { state: 'UNAVAILABLE', reason: 'BLOCKED' });
  });

  await t.test('Table with overlapping protected allocation is UNAVAILABLE with reason ALLOCATED', () => {
    const result = evaluateTableAvailability(validTable, 4, false, true);
    assert.deepEqual(result, { state: 'UNAVAILABLE', reason: 'ALLOCATED' });
  });
});

test('EPIC-007: Service Integration & Invariants (T02, T03, T05)', async (t) => {
  const mockRestaurant = {
    id: 'b0000000-0000-0000-0000-000000000001',
    name: 'The Royal Dine Bistro',
    slug: 'the-royal-dine-bistro',
    timezone: 'Asia/Kolkata',
    policy_mode: 'FREE_RESERVATION',
    default_duration_min: 90,
    turnover_buffer_min: 15,
    min_party_size: 1,
    max_party_size: 12,
    lead_time_min_minutes: 30,
    lead_time_max_days: 60,
    is_published: true,
    status: 'PUBLISHED',
  };

  const mockTables = [
    { id: 'tbl_01', table_number: 'T01', capacity: 2, min_covers: 1, zone: 'WINDOW', is_active: true, floor_id: 'fl_01', floor_name: 'Main', floor_version: 1 },
    { id: 'tbl_04', table_number: 'T04', capacity: 4, min_covers: 2, zone: 'CENTER', is_active: true, floor_id: 'fl_01', floor_name: 'Main', floor_version: 1 },
    { id: 'tbl_05', table_number: 'T05', capacity: 6, min_covers: 4, zone: 'PRIVATE', is_active: true, floor_id: 'fl_01', floor_name: 'Main', floor_version: 1 },
    { id: 'tbl_06', table_number: 'T06', capacity: 4, min_covers: 2, zone: 'WINDOW', is_active: false, floor_id: 'fl_01', floor_name: 'Main', floor_version: 1 },
  ];

  // tbl_04 has active allocation 19:00-20:45
  const mockAllocations = [
    { table_id: 'tbl_04', status: 'CONFIRMED', expires_at: null, start: '2026-11-10T13:30:00Z', end: '2026-11-10T15:15:00Z' },
  ];

  // tbl_05 has block 14:00-16:00
  const mockBlocks = [
    { table_id: 'tbl_05', reason: 'VIP Private Setup', start: '2026-11-10T14:00:00Z', end: '2026-11-10T16:00:00Z' },
  ];

  const createMockDb = () => ({
    getPool: () => ({
      query: async (sql, params = []) => {
        const norm = sql.replace(/\s+/g, ' ');
        if (norm.includes('FROM restaurants WHERE id = $1')) {
          if (params[0] === mockRestaurant.id) return { rows: [mockRestaurant] };
          return { rows: [] };
        }
        if (norm.includes('SELECT COALESCE(MAX(f.current_version), 1) as floor_plan_version')) {
          return { rows: [{ floor_plan_version: 1 }] };
        }
        if (norm.includes('FROM restaurant_tables t JOIN floors f')) {
          if (norm.includes('WHERE f.restaurant_id = $1')) {
            return { rows: mockTables };
          }
          if (norm.includes('WHERE t.id = $1')) {
            const tbl = mockTables.find((t) => t.id === params[0]);
            if (tbl) {
              return {
                rows: [{
                  ...tbl,
                  table_id: tbl.id,
                  restaurant_id: mockRestaurant.id,
                  restaurant_name: mockRestaurant.name,
                  timezone: mockRestaurant.timezone,
                  default_duration_min: mockRestaurant.default_duration_min,
                  turnover_buffer_min: mockRestaurant.turnover_buffer_min,
                  min_party_size: mockRestaurant.min_party_size,
                  max_party_size: mockRestaurant.max_party_size,
                  lead_time_min_minutes: mockRestaurant.lead_time_min_minutes,
                  lead_time_max_days: mockRestaurant.lead_time_max_days,
                  is_published: mockRestaurant.is_published,
                  restaurant_status: mockRestaurant.status,
                }],
              };
            }
            return { rows: [] };
          }
        }
        if (norm.includes('FROM table_blocks WHERE table_id = ANY($1::uuid[])')) {
          // Check overlap with mockBlocks
          return { rows: [{ table_id: 'tbl_05', reason: 'VIP Private Setup' }] };
        }
        if (norm.includes('FROM table_allocations WHERE table_id = ANY($1::uuid[])')) {
          return { rows: [{ table_id: 'tbl_04', status: 'CONFIRMED', expires_at: null }] };
        }
        if (norm.includes('FROM table_blocks WHERE table_id = $1')) {
          const b = mockBlocks.find((b) => b.table_id === params[0]);
          return { rows: b ? [b] : [] };
        }
        if (norm.includes('FROM table_allocations WHERE table_id = $1')) {
          const a = mockAllocations.find((a) => a.table_id === params[0]);
          return { rows: a ? [a] : [] };
        }
        return { rows: [] };
      },
    }),
  });

  const mockPolicyService = {
    evaluateReservationEligibility: async (_restId, _start, partySize) => {
      if (partySize > 12) {
        return { eligible: false, reason: 'INVALID_PARTY_SIZE', message: 'Party size exceeds 12' };
      }
      return { eligible: true };
    },
  };

  const service = new AvailabilityService(createMockDb(), mockPolicyService);

  await t.test('getRestaurantAvailability evaluates table states, version, and snapshot correctly', async () => {
    // Check availability for party size 2 at 19:00 IST (13:30 UTC)
    const result = await service.getRestaurantAvailability(
      mockRestaurant.id,
      2,
      '2026-11-10T19:00:00'
    );

    assert.equal(result.restaurant_id, mockRestaurant.id);
    assert.equal(result.eligible, true);
    assert.ok(result.availability_snapshot_at, 'Must contain server snapshot timestamp');
    assert.equal(result.floor_plan_version, 1);
    assert.equal(result.party_size, 2);
    assert.equal(result.interval.dining_duration_min, 90);
    assert.equal(result.interval.turnover_buffer_min, 15);
    assert.equal(result.interval.protection_duration_min, 105);

    // Verify individual table states
    const t01 = result.tables.find((t) => t.table_number === 'T01');
    assert.equal(t01.state, 'AVAILABLE');
    assert.equal(t01.reason, null);

    const t04 = result.tables.find((t) => t.table_number === 'T04');
    assert.equal(t04.state, 'UNAVAILABLE');
    assert.equal(t04.reason, 'ALLOCATED');

    const t05 = result.tables.find((t) => t.table_number === 'T05');
    assert.equal(t05.state, 'UNAVAILABLE');
    // For partySize=2 on a min_covers=4 table: CAPACITY_MISMATCH (or BLOCKED)
    assert.ok(['CAPACITY_MISMATCH', 'BLOCKED'].includes(t05.reason));

    const t06 = result.tables.find((t) => t.table_number === 'T06');
    assert.equal(t06.state, 'UNAVAILABLE');
    assert.equal(t06.reason, 'TABLE_INACTIVE');

    // Acceptance Criteria: Another guest identity is never returned
    result.tables.forEach((t) => {
      assert.equal(t.user_id, undefined, 'Must not leak user_id');
      assert.equal(t.guest_name, undefined, 'Must not leak guest_name');
      assert.equal(t.booking_id, undefined, 'Must not leak booking_id');
      assert.equal(t.payment_id, undefined, 'Must not leak payment_id');
    });
  });

  await t.test('getRestaurantAvailability rejects invalid or non-positive party_size', async () => {
    await assert.rejects(
      async () => service.getRestaurantAvailability(mockRestaurant.id, 0, '2026-11-10T19:00:00'),
      (err) => err instanceof ValidationError && err.message.includes('positive integer')
    );
    await assert.rejects(
      async () => service.getRestaurantAvailability(mockRestaurant.id, -2, '2026-11-10T19:00:00'),
      (err) => err instanceof ValidationError
    );
  });

  await t.test('getRestaurantAvailability rejects non-existent restaurant with 404 NotFoundError', async () => {
    await assert.rejects(
      async () => service.getRestaurantAvailability('00000000-0000-0000-0000-000000000000', 2, '2026-11-10T19:00:00'),
      (err) => err instanceof NotFoundError
    );
  });

  await t.test('getTableAvailability checks single physical table eligibility without leaking guest data', async () => {
    const resT01 = await service.getTableAvailability('tbl_01', '2026-11-10T19:00:00', 2);
    assert.equal(resT01.table_number, 'T01');
    assert.equal(resT01.state, 'AVAILABLE');
    assert.equal(resT01.eligible, true);
    assert.equal(resT01.user_id, undefined);

    const resT04 = await service.getTableAvailability('tbl_04', '2026-11-10T19:00:00', 4);
    assert.equal(resT04.table_number, 'T04');
    assert.equal(resT04.state, 'UNAVAILABLE');
    assert.equal(resT04.reason, 'ALLOCATED');
    assert.equal(resT04.user_id, undefined);
  });

  await t.test('getTableAvailability rejects non-existent table with 404 NotFoundError', async () => {
    await assert.rejects(
      async () => service.getTableAvailability('non-existent-table', '2026-11-10T19:00:00'),
      (err) => err instanceof NotFoundError
    );
  });
});
