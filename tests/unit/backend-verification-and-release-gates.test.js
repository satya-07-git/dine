const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  ReleaseVerificationService,
  getAcceptanceMatrix,
  simulate100ConcurrentHolds,
  verifyAdjacentIntervalsAndBuffers,
  simulatePaymentRecoveryReplay,
  simulateTwoQueuePromotersAndWalkInConflict,
  verifyTenantIsolationAndPrivateTopicSecurity,
  verifyRealtimeReconnectCanonicalSync,
  evaluateSecuritySecretsAndRestoreGates,
  evaluateStagingGoNoGo,
} = require('../../apps/api/dist/modules/release-verification/release-verification.service');

const {
  ReleaseGateStatus,
  ReleaseDecision,
  StagingEnvironment,
} = require('../../packages/contracts/dist');

// Mock Database Service
function createMockDb() {
  return {
    query: async () => ({ rows: [] }),
    getPool: () => ({
      query: async () => ({ rows: [] }),
    }),
  };
}

const mockStaffUser = {
  userId: 'u_staff_01',
  email: 'staff@dine.test',
  role: 'STAFF',
  memberships: [
    {
      restaurantId: '11111111-1111-1111-1111-111111111111',
      role: 'HOST',
      status: 'ACTIVE',
    },
  ],
};

test('1. getAcceptanceMatrix: Formally links critical scenarios to owning epics and Blueprint §17.1 source sections (Task T01)', () => {
  const matrix = getAcceptanceMatrix();
  assert.ok(Array.isArray(matrix));
  assert.ok(matrix.length >= 8);

  const scenarioIds = matrix.map((m) => m.scenarioId);
  assert.ok(scenarioIds.includes('SCEN-001'));
  assert.ok(scenarioIds.includes('SCEN-002'));
  assert.ok(scenarioIds.includes('SCEN-003'));
  assert.ok(scenarioIds.includes('SCEN-004'));
  assert.ok(scenarioIds.includes('SCEN-005'));
  assert.ok(scenarioIds.includes('SCEN-006'));
  assert.ok(scenarioIds.includes('SCEN-007'));
  assert.ok(scenarioIds.includes('SCEN-008'));
  assert.ok(scenarioIds.includes('SCEN-009'));

  for (const item of matrix) {
    assert.ok(item.owningEpic, `Scenario ${item.scenarioId} must have an owning epic`);
    assert.ok(item.sourceSection, `Scenario ${item.scenarioId} must link to source section`);
    assert.equal(item.status, 'VERIFIED');
  }
});

test('2. simulate100ConcurrentHolds: 100 concurrent overlapping holds yield exactly 1 winner and 99 conflicts (Task T02, AC 1)', () => {
  const result = simulate100ConcurrentHolds('T04', 100, '2026-11-10T19:00:00Z');

  assert.equal(result.tableId, 'T04');
  assert.equal(result.totalAttempts, 100);
  assert.equal(result.winnersCount, 1);
  assert.equal(result.conflictsCount, 99);
  assert.ok(result.winnerHoldId.startsWith('hold_'));
  assert.equal(result.status, 'PASSED');
  assert.equal(result.invariantMaintained, true);
});

test('3. verifyAdjacentIntervalsAndBuffers: Half-open interval [start, end) and turnaround buffer logic (AC 2)', () => {
  // Slot 1: 19:00 (1140 min), duration 90m + 15m buffer = 1245 min (20:45)
  // Overlapping Slot: 20:00 (1200 min) -> Overlaps with Slot 1 [1140, 1245)
  const overlapCheck = verifyAdjacentIntervalsAndBuffers('T04', 1140, 90, 15, 1200, 90, 15);
  assert.equal(overlapCheck.isOverlapping, true);
  assert.equal(overlapCheck.isAdjacentValid, false);

  // Contiguous Non-Overlapping Adjacent Slot: starts at 20:45 (1245 min)
  const adjacentCheck = verifyAdjacentIntervalsAndBuffers('T04', 1140, 90, 15, 1245, 90, 15);
  assert.equal(adjacentCheck.isOverlapping, false);
  assert.equal(adjacentCheck.isAdjacentValid, true);
});

test('4. simulatePaymentRecoveryReplay: Replay webhook duplicate, late capture, and network loss (Task T03, AC 3)', () => {
  // Scenario A: Webhook repeated 3 times
  const dupResult = simulatePaymentRecoveryReplay('WEBHOOK_DUPLICATE');
  assert.equal(dupResult.status, 'PASSED');
  assert.equal(dupResult.idempotent, true);

  // Scenario B: Late capture after table safely reallocated to Customer B
  const lateResult = simulatePaymentRecoveryReplay('LATE_CAPTURE');
  assert.equal(lateResult.status, 'PASSED');
  assert.equal(lateResult.inventoryPreserved, true);
  assert.equal(lateResult.refundDispatched, true);

  // Scenario C: Out-of-order delayed failure delivery
  const oooResult = simulatePaymentRecoveryReplay('OUT_OF_ORDER');
  assert.equal(oooResult.status, 'PASSED');

  // Scenario D: Network loss during UPI flow
  const netResult = simulatePaymentRecoveryReplay('NETWORK_LOSS');
  assert.equal(netResult.status, 'PASSED');
});

test('5. simulateTwoQueuePromotersAndWalkInConflict: Waitlist promoter race and host walk-in contention (Task T04, AC 4)', () => {
  const result = simulateTwoQueuePromotersAndWalkInConflict('T04');
  assert.equal(result.queuePromotersSimulated, 2);
  assert.equal(result.exclusiveOffersCreated, 1);
  assert.equal(result.conflictsAvoided, 1);
  assert.equal(result.walkInContentionHandled, true);
  assert.equal(result.status, 'PASSED');
});

test('6. verifyTenantIsolationAndPrivateTopicSecurity: Denies cross-restaurant access and unauthorized private topic joins (AC 5)', () => {
  const restaurantA = '11111111-1111-1111-1111-111111111111';
  const restaurantB = '22222222-2222-2222-2222-222222222222';
  const userA = 'user_001';
  const userB = 'user_002';

  // Customer B attempting to access Restaurant A staff data or Customer A private topic
  const sec = verifyTenantIsolationAndPrivateTopicSecurity(
    'STAFF',
    restaurantB,
    restaurantA,
    userA,
    userB
  );

  assert.equal(sec.tenantAccessAllowed, false);
  assert.equal(sec.topicJoinAllowed, false);
  assert.equal(sec.isSecure, true);
});

test('7. verifyRealtimeReconnectCanonicalSync: Canonical REST refetch restores authoritative DB state after missed broadcast (AC 6)', () => {
  const dbState = { status: 'SEATED', version: 4 };
  const missedEvents = [
    { status: 'CONFIRMED', version: 2 },
    { status: 'READY', version: 3 },
  ];

  const sync = verifyRealtimeReconnectCanonicalSync(dbState, missedEvents);
  assert.equal(sync.syncedState.status, 'SEATED');
  assert.equal(sync.syncedState.version, 4);
  assert.equal(sync.consistent, true);
});

test('8. evaluateSecuritySecretsAndRestoreGates: Verifies secrets redaction and database restore invariants (Task T05, AC 7)', () => {
  const check = evaluateSecuritySecretsAndRestoreGates();
  assert.equal(check.status, 'PASSED');
  assert.equal(check.crossTenantAccessDenied, true);
  assert.equal(check.privateRealtimeJoinsDenied, true);
  assert.ok(check.secretsRedactedCount > 0);
  assert.equal(check.restoreRehearsalVerified, true);
});

test('9. evaluateStagingGoNoGo: Records staging go/no-go, blocks live money until commercial gates approved (Task T06, AC 8)', () => {
  const evaluation = evaluateStagingGoNoGo();

  assert.equal(evaluation.environment, StagingEnvironment.STAGING_PRE_RELEASE);
  assert.equal(evaluation.overallDecision, ReleaseDecision.GO);
  // Live money is strictly prohibited until GATE-001..GATE-007 are signed off
  assert.equal(evaluation.liveMoneyAllowed, false);
  assert.ok(evaluation.commercialGatesUnresolved.includes('GATE-001'));
  assert.ok(evaluation.commercialGatesUnresolved.includes('GATE-002'));
  assert.ok(evaluation.commercialGatesUnresolved.includes('GATE-003'));
  assert.ok(evaluation.commercialGatesUnresolved.includes('GATE-004'));
  assert.ok(evaluation.commercialGatesUnresolved.includes('GATE-005'));
  assert.ok(evaluation.commercialGatesUnresolved.includes('GATE-006'));
  assert.ok(evaluation.commercialGatesUnresolved.includes('GATE-007'));

  assert.equal(evaluation.stagingGatesPassed, 6);
  assert.ok(evaluation.totalGates >= 13);
  assert.equal(evaluation.observationOwner, 'Lead Verification & Release Architect');
  assert.equal(evaluation.recoveryOwner, 'Lead Reliability & DevOps Engineer');
});

test('10. ReleaseVerificationService: Service methods execution and DTO contract compliance', async () => {
  const service = new ReleaseVerificationService(createMockDb());

  const matrixRes = service.getAcceptanceMatrix(mockStaffUser);
  assert.ok(matrixRes.total >= 8);
  assert.equal(matrixRes.verified_count, matrixRes.total);

  const concurrencyRes = service.runConcurrencyCheck(mockStaffUser, {
    table_id: 'T04',
    concurrency_level: 50,
  });
  assert.equal(concurrencyRes.status, 'PASSED');
  assert.equal(concurrencyRes.winners_count, 1);
  assert.equal(concurrencyRes.conflicts_count, 49);

  const replayRes = service.runPaymentRecoveryReplay(mockStaffUser, {
    scenario: 'LATE_CAPTURE',
  });
  assert.equal(replayRes.status, 'PASSED');
  assert.equal(replayRes.refund_dispatched, true);

  const promoterRes = service.runPromoterConflictReplay(mockStaffUser);
  assert.equal(promoterRes.status, 'PASSED');
  assert.equal(promoterRes.exclusive_offers_created, 1);

  const secRes = service.runSecurityLoadCheck(mockStaffUser);
  assert.equal(secRes.status, 'PASSED');

  const goNoGoRes = service.getStagingGoNoGo(mockStaffUser);
  assert.equal(goNoGoRes.overall_decision, ReleaseDecision.GO);
  assert.equal(goNoGoRes.live_money_allowed, false);

  const runRes = await service.createVerificationRun(mockStaffUser, {
    run_tag: 'test-staging-run-001',
    suite_name: 'e2e-backend-gates',
  });
  assert.equal(runRes.status, 'PASSED');
  assert.equal(runRes.passed_checks, 9);

  const listRes = await service.listVerificationRuns(mockStaffUser);
  assert.equal(listRes.total, 1);
  assert.ok(listRes.runs.length > 0);
});
