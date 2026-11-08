const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDeferredScopeRegister,
  getUnresolvedContracts,
  evaluateExtensionFeasibilityPure,
  evaluateMicroservicesScaleTriggersPure,
  simulateDeferredRouteRejectionPure,
  verifyFirstReleaseIndependencePure,
  FutureExtensionsService,
} = require('../../apps/api/dist/modules/future-extensions/future-extensions.service');

const {
  DeferredExtensionId,
  ExtensionStatus,
  ScaleTriggerMetric,
  ErrorCode,
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
  userId: 'u_staff_governance_01',
  email: 'architect@dine.test',
  role: 'STAFF',
  memberships: [
    {
      restaurantId: '11111111-1111-1111-1111-111111111111',
      role: 'HOST',
      status: 'ACTIVE',
    },
  ],
};

test('1. getDeferredScopeRegister: Maintains deferred-scope register with owner and rationale (Task T01)', () => {
  const register = getDeferredScopeRegister();
  assert.ok(Array.isArray(register));
  assert.equal(register.length, 6, 'Should maintain exactly 6 candidate extensions');

  const extensionIds = register.map((e) => e.id);
  assert.ok(extensionIds.includes(DeferredExtensionId.JOINED_TABLES));
  assert.ok(extensionIds.includes(DeferredExtensionId.VARIABLE_SEATING));
  assert.ok(extensionIds.includes(DeferredExtensionId.POS_INTEGRATION));
  assert.ok(extensionIds.includes(DeferredExtensionId.DYNAMIC_DEMAND_PRICING));
  assert.ok(extensionIds.includes(DeferredExtensionId.MULTI_LOCATION_ANALYTICS));
  assert.ok(extensionIds.includes(DeferredExtensionId.MICROSERVICES_DECOMPOSITION));

  for (const ext of register) {
    assert.ok(ext.accountable_owner, `Extension ${ext.id} must have accountable owner`);
    assert.ok(ext.rationale, `Extension ${ext.id} must have rationale`);
    assert.ok(ext.name, `Extension ${ext.id} must have name`);
  }
});

test('2. getDeferredScopeRegister: Defines prerequisites, missing requirements, and risk criteria (Task T02 & AC 1)', () => {
  const register = getDeferredScopeRegister();

  for (const ext of register) {
    assert.ok(Array.isArray(ext.prerequisites), `Extension ${ext.id} prerequisites must be an array`);
    assert.ok(ext.prerequisites.length > 0, `Extension ${ext.id} must have at least one prerequisite`);
    assert.ok(Array.isArray(ext.missing_requirements), `Extension ${ext.id} missing requirements must be an array`);
    assert.ok(ext.missing_requirements.length > 0, `Extension ${ext.id} must have missing requirements defined`);
    assert.ok(['High', 'Medium', 'Low'].includes(ext.risk_level), `Extension ${ext.id} has invalid risk level`);
    assert.ok(Array.isArray(ext.threat_concerns), `Extension ${ext.id} threat concerns must be an array`);
    assert.ok(ext.threat_concerns.length > 0, `Extension ${ext.id} must specify threat concerns`);
  }
});

test('3. getDeferredScopeRegister: No unresolved extension is shown as ready or completed (AC 2)', () => {
  const register = getDeferredScopeRegister();

  for (const ext of register) {
    assert.notEqual(ext.status, 'READY', `Extension ${ext.id} must not be marked READY`);
    assert.notEqual(ext.status, 'COMPLETED', `Extension ${ext.id} must not be marked COMPLETED`);
    assert.equal(ext.status, ExtensionStatus.DEFERRED, `Extension ${ext.id} must be in DEFERRED status`);
  }
});

test('4. evaluateExtensionFeasibility: Enforces deterministic ascending table UUID lock ordering for joined tables (Task T03 & Invariant)', () => {
  // Case A: Unsorted tables attempt to lock in reverse order -> Flagged
  const unsortedAttempt = evaluateExtensionFeasibilityPure({
    extension_id: DeferredExtensionId.JOINED_TABLES,
    proposed_tables_to_lock: ['bbbbbbbb-2222-2222-2222-222222222222', 'aaaaaaaa-1111-1111-1111-111111111111'],
  });

  assert.equal(unsortedAttempt.feasible, false);
  assert.equal(unsortedAttempt.status, 'BLOCKED_ON_INVARIANTS');
  assert.equal(unsortedAttempt.rejection_code, ErrorCode.JOINED_TABLES_LOCK_ORDER_VIOLATION);
  assert.equal(unsortedAttempt.lock_order_verified, false);
  assert.deepEqual(unsortedAttempt.sorted_table_locks, [
    'aaaaaaaa-1111-1111-1111-111111111111',
    'bbbbbbbb-2222-2222-2222-222222222222',
  ]);

  // Case B: Correctly sorted ascending tables
  const sortedAttempt = evaluateExtensionFeasibilityPure({
    extension_id: DeferredExtensionId.JOINED_TABLES,
    proposed_tables_to_lock: ['aaaaaaaa-1111-1111-1111-111111111111', 'bbbbbbbb-2222-2222-2222-222222222222'],
  });

  assert.equal(sortedAttempt.lock_order_verified, true);
  assert.equal(sortedAttempt.status, 'CONDITIONAL_APPROVAL');
  assert.ok(sortedAttempt.required_actions.some((a) => a.includes('ADR-008')));
});

test('5. evaluateExtensionFeasibility: Rejects POS integration attempts to bypass trusted inventory (Task T03 & Invariant)', () => {
  // POS attempts bypass of server reservation state machine
  const bypassAttempt = evaluateExtensionFeasibilityPure({
    extension_id: DeferredExtensionId.POS_INTEGRATION,
    bypass_trusted_inventory: true,
  });

  assert.equal(bypassAttempt.feasible, false);
  assert.equal(bypassAttempt.status, 'REJECTED');
  assert.equal(bypassAttempt.rejection_code, ErrorCode.POS_AUTHORIZATION_BYPASS_ATTEMPT);
  assert.ok(bypassAttempt.invariant_violations.some((v) => v.includes('bypass trusted server inventory')));

  // POS adhering to trusted state machine
  const compliantAttempt = evaluateExtensionFeasibilityPure({
    extension_id: DeferredExtensionId.POS_INTEGRATION,
    bypass_trusted_inventory: false,
  });

  assert.equal(compliantAttempt.status, 'CONDITIONAL_APPROVAL');
  assert.ok(compliantAttempt.required_actions.some((a) => a.includes('HMAC-SHA256')));
});

test('6. evaluateExtensionFeasibility: Prohibits speculative production schema additions (Task T03 & Invariant)', () => {
  const speculativeAttempt = evaluateExtensionFeasibilityPure({
    extension_id: DeferredExtensionId.VARIABLE_SEATING,
    proposes_speculative_schema: true,
  });

  assert.equal(speculativeAttempt.feasible, false);
  assert.equal(speculativeAttempt.status, 'REJECTED');
  assert.equal(speculativeAttempt.rejection_code, ErrorCode.SPECULATIVE_SCHEMA_PROHIBITED);
  assert.ok(speculativeAttempt.invariant_violations.some((v) => v.includes('Speculative schema modifications')));
});

test('7. evaluateMicroservicesScaleTriggers: Retains modular monolith under ADR-001 when scale metrics are below thresholds (AC 4)', () => {
  // Moderate MVP workload: 5,000 reservations/day, 120 active holds, 35% pool saturation, 6 devs, 45ms read latency
  const evaluation = evaluateMicroservicesScaleTriggersPure({
    daily_reservations: 5000,
    concurrent_active_holds: 120,
    db_connection_pool_saturation_pct: 35,
    backend_engineers_count: 6,
    availability_read_p95_ms: 45,
  });

  assert.equal(evaluation.decomposition_justified, false);
  assert.equal(evaluation.monolith_architecture_retained, true);
  assert.equal(evaluation.status, 'RETAIN_MODULAR_MONOLITH');
  assert.ok(evaluation.recommendation.includes('Retain modular monolith'));
  assert.equal(evaluation.adr_reference, 'ADR-001 Modular Monolith Architecture');
});

test('8. evaluateMicroservicesScaleTriggers: Requires measured evidence and ADR before microservices decomposition (AC 4)', () => {
  // Extreme enterprise scale: 150,000 reservations/day (breaches SCALE-001 threshold)
  const extremeEvaluation = evaluateMicroservicesScaleTriggersPure({
    daily_reservations: 150000,
    concurrent_active_holds: 2000,
    db_connection_pool_saturation_pct: 70,
    backend_engineers_count: 12,
    availability_read_p95_ms: 80,
  });

  assert.equal(extremeEvaluation.decomposition_justified, true);
  assert.equal(extremeEvaluation.monolith_architecture_retained, false);
  assert.equal(extremeEvaluation.status, 'SCALE_TRIGGER_BREACHED');
  assert.ok(extremeEvaluation.recommendation.includes('Commission distributed saga architecture'));
});

test('9. simulateDeferredRouteRejection: Rejects candidate future routes with RFC 7807 FEATURE_DEFERRED_TO_FUTURE_RELEASE', () => {
  const routeCheck = simulateDeferredRouteRejectionPure('/v1/joined-tables', 'POST');
  assert.equal(routeCheck.status_code, 501);
  assert.equal(routeCheck.error_code, ErrorCode.FEATURE_DEFERRED_TO_FUTURE_RELEASE);
  assert.ok(routeCheck.message.includes('belongs to candidate future extensions defined in EPIC-020'));
  assert.equal(routeCheck.rfc7807_problem.code, 'FEATURE_DEFERRED_TO_FUTURE_RELEASE');
  assert.equal(routeCheck.rfc7807_problem.status, 501);
});

test('10. getUnresolvedContracts & verifyFirstReleaseIndependence: Unresolved contracts tracked and first release independent (AC 3)', () => {
  // Check unresolved contracts
  const contracts = getUnresolvedContracts();
  assert.ok(Array.isArray(contracts));
  assert.equal(contracts.length, 5);

  const contractIds = contracts.map((c) => c.contract_id);
  assert.ok(contractIds.includes('CONTRACT-001'));
  assert.ok(contractIds.includes('CONTRACT-002'));
  assert.ok(contractIds.includes('CONTRACT-003'));
  assert.ok(contractIds.includes('CONTRACT-004'));
  assert.ok(contractIds.includes('CONTRACT-005'));

  // Check first-release independence
  const independence = verifyFirstReleaseIndependencePure();
  assert.equal(independence.independent, true);
  assert.equal(independence.core_epics_count, 19);
  assert.equal(independence.deferred_epics_count, 1);
  assert.ok(independence.message.includes('without dependency on EPIC-020'));
});

test('11. FutureExtensionsService integration: NestJS service executes cleanly with mock DB', async () => {
  const service = new FutureExtensionsService(createMockDb());

  const register = service.getDeferredScopeRegister(mockStaffUser);
  assert.equal(register.total, 6);
  assert.equal(register.deferred_count, 6);

  const contracts = service.getUnresolvedContractsRegister(mockStaffUser);
  assert.equal(contracts.total, 5);

  const feasibility = service.evaluateExtensionFeasibility(
    {
      extension_id: DeferredExtensionId.POS_INTEGRATION,
      bypass_trusted_inventory: false,
    },
    mockStaffUser,
  );
  assert.equal(feasibility.status, 'CONDITIONAL_APPROVAL');

  const scaleCheck = service.evaluateMicroservicesScaleTriggers(
    {
      daily_reservations: 4000,
      concurrent_active_holds: 50,
      db_connection_pool_saturation_pct: 20,
      backend_engineers_count: 4,
      availability_read_p95_ms: 30,
    },
    mockStaffUser,
  );
  assert.equal(scaleCheck.status, 'RETAIN_MODULAR_MONOLITH');

  const independence = service.checkFirstReleaseIndependence();
  assert.equal(independence.independent, true);
});
