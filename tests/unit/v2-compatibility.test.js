const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSourceProvenancePure,
  getCompatibilityMapPure,
  getStateMatrixPure,
  createInitialBookingState,
  acquireHoldPure,
  confirmFreeReservationPure,
  reconcileLatePaymentPure,
  runConcurrencySimulationPure,
  V2CompatibilityService,
} = require('../../apps/api/dist/modules/v2-compatibility/v2-compatibility.service');

const {
  InventoryClaimState,
  ReservationHoldStatus,
  V2ReservationStatus,
  V2PaymentMode,
  ErrorCode,
} = require('../../packages/contracts/dist');

test('1. getSourceProvenance: verifies all 3 text sources and 4 diagrams with SHA-256 (Task T01)', () => {
  const provenance = getSourceProvenancePure();
  assert.ok(provenance);
  assert.equal(provenance.textSources.length, 3, 'Must index 3 text sources');
  assert.equal(provenance.diagrams.length, 4, 'Must index 4 architectural diagrams');

  const prd = provenance.textSources.find((s) => s.name === 'PRD-as-supplied-v1.md');
  assert.ok(prd);
  assert.equal(prd.sha256, '52b59f12d923ee4cafc26fb8fb821957f210c36af1274754903362cfef9f224a');

  const realtime = provenance.textSources.find((s) => s.name === 'finalized-realtime-and-delivery.txt');
  assert.ok(realtime);
  assert.equal(realtime.sha256, '329d712d5d482163b2dfccd62bd6e184480a87cb12e9ecf2193fd0f37dfe5288');

  const sql = provenance.textSources.find((s) => s.name === 'finalized-sql-and-api.txt');
  assert.ok(sql);
  assert.equal(sql.sha256, '7f9aaac565a0d77a80daca0868e645b6af5ee4262daeae2a6a7ea9eac4bdbf87');

  const archDiag = provenance.diagrams.find((d) => d.id === 'production-architecture');
  assert.ok(archDiag);
  assert.equal(archDiag.sha256, '513a594cfefe6fae80e536d91830d5d9c9e69bfc887a9b303fd4498834c4f4b3');

  const erdDiag = provenance.diagrams.find((d) => d.id === 'production-erd');
  assert.ok(erdDiag);
  assert.equal(erdDiag.sha256, 'edbc00eb6d9a61ca174529ab430a48815d84eb51311e1319d05357b7e2493319');

  const seqDiag = provenance.diagrams.find((d) => d.id === 'realtime-sequence');
  assert.ok(seqDiag);
  assert.equal(seqDiag.sha256, '08b21948bb474d36104cb3cc76d5ef1860d4cd8a18281db06050fc44e4af5b73');

  const lifeDiag = provenance.diagrams.find((d) => d.id === 'reservation-lifecycle');
  assert.ok(lifeDiag);
  assert.equal(lifeDiag.sha256, 'fabb3a9eee063de34e6563a47b2ee85b95e2e06e421b088d70ad7ac6613e0b21');
});

test('2. getCompatibilityMap: verifies 23 canonical routes and single migration authority (Tasks T03, T04, T08)', () => {
  const map = getCompatibilityMapPure();
  assert.equal(map.routeAliases.length, 23, 'Must include 23 canonical route pairs');
  assert.equal(map.schemaAuthority.singleMigrationAuthority, 'supabase/migrations');

  // Verify /api/v1 prefix on canonical routes
  for (const route of map.routeAliases) {
    assert.ok(route.canonicalRoute.startsWith('/api/v1'), `Canonical route ${route.canonicalRoute} must start with /api/v1`);
    assert.ok(route.legacyAlias.startsWith('/v1'), `Legacy alias ${route.legacyAlias} must start with /v1`);
  }
});

test('3. getStateMatrix: verifies claim, hold, reservation, payment and reconciliation rules (Tasks T04, T32)', () => {
  const matrix = getStateMatrixPure();
  assert.deepEqual(matrix.claimStates, ['HELD', 'RESERVED', 'BLOCKED', 'RELEASED']);
  assert.deepEqual(matrix.holdStates, ['ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED']);
  assert.ok(matrix.reservationStates.includes('CONFIRMED'));
  assert.ok(matrix.reservationStates.includes('COMPLETED'));
  assert.ok(matrix.paymentStates.includes('SUCCEEDED'));
  assert.ok(matrix.reconciliationRules.length >= 4);
});

test('4. acquireHoldPure: captures post-lock decision clock and derives 120-second hold (Tasks T13, T26)', () => {
  const state = createInitialBookingState();
  const fixedNow = new Date('2026-11-10T12:00:00.000Z');

  const res = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:00:00.000Z',
      partySize: 4,
      userId: 'user_01',
      now: fixedNow,
    },
    state
  );

  assert.equal(res.status, 'ACTIVE');
  assert.equal(res.serverTime, fixedNow.toISOString());

  // 120 seconds expiry: 12:00:00 + 120s = 12:02:00
  const expectedExpiry = new Date(fixedNow.getTime() + 120 * 1000).toISOString();
  assert.equal(res.expiresAt, expectedExpiry);
});

test('5. acquireHoldPure: separates effective claim range (with buffer) from visible dining interval (Task T19)', () => {
  const state = createInitialBookingState();
  const startsAt = '2026-11-10T19:00:00.000Z';

  const res = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt,
      partySize: 4,
      userId: 'user_01',
    },
    state
  );

  // Default duration = 90min, buffer = 15min
  // Visible endsAt = 19:00 + 90m = 20:30
  // Effective endsAt = 19:00 + 105m = 20:45
  assert.equal(res.endsAt, '2026-11-10T20:30:00.000Z');
  assert.equal(res.effectiveEndsAt, '2026-11-10T20:45:00.000Z');

  // Verify internal claim stored in state uses effectiveEndsAt
  const claim = state.claims.find((c) => c.id === res.claimId);
  assert.ok(claim);
  assert.equal(claim.endsAt.toISOString(), '2026-11-10T20:45:00.000Z');
});

test('6. acquireHoldPure: capacity validation rejects out-of-bounds party size (Task T28)', () => {
  const state = createInitialBookingState();

  // Too large (max is 6)
  assert.throws(
    () =>
      acquireHoldPure(
        {
          restaurantId: 'rest_01',
          tableId: 'table_01',
          startsAt: '2026-11-10T19:00:00.000Z',
          partySize: 10,
          userId: 'user_01',
        },
        state
      ),
    (err) => err.getStatus() === 422
  );
});

test('7. acquireHoldPure: rejects overlapping active claim with 409 TABLE_UNAVAILABLE (Task T20)', () => {
  const state = createInitialBookingState();

  // First hold: [19:00, 20:45)
  acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:00:00.000Z',
      partySize: 4,
      userId: 'user_01',
    },
    state
  );

  // Conflicting hold overlapping at 20:00
  assert.throws(
    () =>
      acquireHoldPure(
        {
          restaurantId: 'rest_01',
          tableId: 'table_01',
          startsAt: '2026-11-10T20:00:00.000Z',
          partySize: 4,
          userId: 'user_02',
        },
        state
      ),
    (err) => err.getStatus() === 409
  );
});

test('8. acquireHoldPure: permits adjacent non-overlapping requests (Task T20, C-002)', () => {
  const state = createInitialBookingState();

  // First hold: [18:00, 19:45) effective
  const r1 = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T18:00:00.000Z',
      partySize: 4,
      userId: 'user_01',
    },
    state
  );
  assert.equal(r1.effectiveEndsAt, '2026-11-10T19:45:00.000Z');

  // Second hold: [19:45, 21:30) immediately contiguous
  const r2 = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:45:00.000Z',
      partySize: 4,
      userId: 'user_02',
    },
    state
  );
  assert.equal(r2.status, 'ACTIVE');
});

test('9. acquireHoldPure: enforces idempotency replay and rejects mismatched payload (Task T29)', () => {
  const state = createInitialBookingState();
  const idempotencyKey = 'idem-key-unique-001';
  const payloadStr = JSON.stringify({ tableId: 'table_01', startsAt: '2026-11-10T19:00:00.000Z' });

  // First call
  const res1 = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:00:00.000Z',
      partySize: 4,
      userId: 'user_01',
      idempotencyKey,
      requestPayload: payloadStr,
    },
    state
  );

  // Repeat call with identical key and payload: returns same holdId
  const res2 = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:00:00.000Z',
      partySize: 4,
      userId: 'user_01',
      idempotencyKey,
      requestPayload: payloadStr,
    },
    state
  );
  assert.equal(res2.holdId, res1.holdId);

  // Mismatched payload with same key: rejects with 409
  assert.throws(
    () =>
      acquireHoldPure(
        {
          restaurantId: 'rest_01',
          tableId: 'table_01',
          startsAt: '2026-11-10T19:00:00.000Z',
          partySize: 6, // Changed party size
          userId: 'user_01',
          idempotencyKey,
          requestPayload: JSON.stringify({ tableId: 'table_01', partySize: 6 }),
        },
        state
      ),
    (err) => err.getStatus() === 409
  );
});

test('10. acquireHoldPure: serialized cleanup releases stale expired holds before allocating new hold (Task T26)', () => {
  const state = createInitialBookingState();
  const t0 = new Date('2026-11-10T12:00:00.000Z');

  // Customer A acquires hold at 12:00: expires at 12:02
  const r1 = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:00:00.000Z',
      partySize: 4,
      userId: 'cust_A',
      now: t0,
    },
    state
  );

  // At 12:03 (after expiry), Customer B requests same table
  const t1 = new Date('2026-11-10T12:03:00.000Z');
  const r2 = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:00:00.000Z',
      partySize: 4,
      userId: 'cust_B',
      now: t1,
    },
    state
  );

  assert.equal(r2.status, 'ACTIVE');
  assert.notEqual(r2.holdId, r1.holdId);

  // Stale claim transitioned to RELEASED
  const oldClaim = state.claims.find((c) => c.id === r1.claimId);
  assert.equal(oldClaim.state, InventoryClaimState.RELEASED);
});

test('11. confirmFreeReservationPure: repeat-safe FREE confirmation transitions claim to RESERVED (Tasks T33, T34)', () => {
  const state = createInitialBookingState();
  const hold = acquireHoldPure(
    {
      restaurantId: 'rest_01',
      tableId: 'table_01',
      startsAt: '2026-11-10T19:00:00.000Z',
      partySize: 4,
      userId: 'user_01',
    },
    state
  );

  // Confirm free
  const res1 = confirmFreeReservationPure(
    {
      holdId: hold.holdId,
      restaurantId: 'rest_01',
      partySize: 4,
      userId: 'user_01',
    },
    state
  );

  assert.equal(res1.status, V2ReservationStatus.CONFIRMED);
  assert.ok(res1.bookingReference.startsWith('BK-'));

  // Repeat call returns same reservation
  const res2 = confirmFreeReservationPure(
    {
      holdId: hold.holdId,
      restaurantId: 'rest_01',
      partySize: 4,
      userId: 'user_01',
    },
    state
  );
  assert.equal(res2.bookingReference, res1.bookingReference);

  // Claim must now be RESERVED
  const claim = state.claims.find((c) => c.id === hold.claimId);
  assert.equal(claim.state, InventoryClaimState.RESERVED);
});

test('12. confirmFreeReservationPure: rejects DEPOSIT venue bypass (Task T33)', () => {
  const state = createInitialBookingState();
  state.restaurantPolicy.paymentMode = V2PaymentMode.DEPOSIT;
  state.restaurantPolicy.depositAmountPaise = 20000;

  assert.throws(
    () =>
      confirmFreeReservationPure(
        {
          holdId: 'hold_001',
          restaurantId: 'rest_01',
          partySize: 4,
          userId: 'user_01',
        },
        state
      ),
    (err) => err.getStatus() === 422
  );
});

test('13. reconcileLatePaymentPure: preserves Customer B allocation and refunds Customer A (Tasks T37, T38, T39, C-003)', () => {
  const currentAllocations = {
    table_T04: {
      bookingId: 'booking_cust_B',
      customerId: 'cust_B',
      status: 'CONFIRMED',
    },
  };

  const latePayment = {
    paymentId: 'pay_late_123',
    bookingId: 'booking_cust_A',
    tableId: 'table_T04',
    amountPaise: 20000,
  };

  const outcome = reconcileLatePaymentPure(latePayment, currentAllocations);
  assert.equal(outcome.action, 'REFUND_DISPATCHED');
  assert.equal(outcome.bAllocatedKept, true, 'Customer B table allocation must be preserved');
  assert.equal(outcome.refundInitiated, true, 'Customer A must be refunded');
  assert.equal(outcome.refundAmountPaise, 20000);
});

test('14. runConcurrencySimulationPure: 100-client same-table race produces exactly 1 winner and 99 conflicts (Tasks T31, T43, C-001)', () => {
  const result = runConcurrencySimulationPure('table_T04', 'rest_01', 100);
  assert.equal(result.totalRequests, 100);
  assert.equal(result.winners, 1, 'Exactly 1 request must win the exclusive claim');
  assert.equal(result.conflicts, 99, 'Exactly 99 requests must be rejected with 409');
  assert.equal(result.exclusionEnforced, true);
  assert.equal(result.status, 'PASSED');
});
