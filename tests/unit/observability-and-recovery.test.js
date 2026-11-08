const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  ObservabilityService,
  calculateBackoff,
  evaluateJobLease,
  evaluatePoisonJob,
  reconcileSafeExpirySweepLogic,
  reconcilePaymentReviewSweepLogic,
  reconcileWaitlistOfferSweepLogic,
  verifyRecoveryInvariants,
  getBenchmarkMeasurements,
} = require('../../apps/api/dist/modules/observability/observability.service');

const {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
} = require('../../apps/api/dist/common/errors/app-error');

const {
  ErrorCode,
  BackgroundJobType,
  BackgroundJobStatus,
  WorkerStatus,
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

const mockSupportUser = {
  id: 'u_support_01',
  role: 'SUPPORT',
  memberships: [],
};

const mockCustomerUser = {
  id: 'u_cust_01',
  role: 'CUSTOMER',
  memberships: [],
};

test('1. calculateBackoff: Exponential growth with attempt cap', () => {
  assert.equal(calculateBackoff(0), 0);
  assert.equal(calculateBackoff(1, 1000, 300000), 1000);
  assert.equal(calculateBackoff(2, 1000, 300000), 2000);
  assert.equal(calculateBackoff(3, 1000, 300000), 4000);
  assert.equal(calculateBackoff(4, 1000, 300000), 8000);
  assert.equal(calculateBackoff(5, 1000, 300000), 16000);
  // Bounded by maxMs
  assert.equal(calculateBackoff(20, 1000, 60000), 60000);
});

test('2. evaluateJobLease: Correctly identifies claimable vs locked jobs', () => {
  const now = new Date();
  const past = new Date(now.getTime() - 10000);
  const future = new Date(now.getTime() + 10000);

  // Pending job is claimable
  assert.equal(evaluateJobLease({ status: BackgroundJobStatus.PENDING }), true);
  assert.equal(
    evaluateJobLease({ status: BackgroundJobStatus.PENDING, next_retry_at: past.toISOString() }, now),
    true
  );
  assert.equal(
    evaluateJobLease({ status: BackgroundJobStatus.PENDING, next_retry_at: future.toISOString() }, now),
    false
  );

  // Failed job with attempts < max is claimable once retry time elapsed
  assert.equal(
    evaluateJobLease(
      { status: BackgroundJobStatus.FAILED, attempts: 2, max_attempts: 5, next_retry_at: past.toISOString() },
      now
    ),
    true
  );
  assert.equal(
    evaluateJobLease(
      { status: BackgroundJobStatus.FAILED, attempts: 5, max_attempts: 5, next_retry_at: past.toISOString() },
      now
    ),
    false
  );

  // Running job with active lease is NOT claimable; expired lease IS claimable
  assert.equal(
    evaluateJobLease({ status: BackgroundJobStatus.RUNNING, claim_expires_at: future.toISOString() }, now),
    false
  );
  assert.equal(
    evaluateJobLease({ status: BackgroundJobStatus.RUNNING, claim_expires_at: past.toISOString() }, now),
    true
  );
});

test('3. evaluatePoisonJob: Transitions to DEAD_LETTER with visible reason at max attempts', () => {
  const job = {
    id: 'job_poison_01',
    attempts: 4,
    max_attempts: 5,
  };

  const res = evaluatePoisonJob(job, 'Fatal syntax error in payment payload');
  assert.equal(res.status, BackgroundJobStatus.DEAD_LETTER);
  assert.equal(res.attempts, 5);
  assert.match(res.deadLetterReason, /Max attempt limit of 5 reached/);
  assert.match(res.deadLetterReason, /Fatal syntax error in payment payload/);
  assert.equal(res.nextRetryAt, null);

  // Below max attempts -> FAILED with retry timestamp
  const jobRetry = { id: 'job_retry_01', attempts: 2, max_attempts: 5 };
  const resRetry = evaluatePoisonJob(jobRetry, 'Transient network timeout');
  assert.equal(resRetry.status, BackgroundJobStatus.FAILED);
  assert.equal(resRetry.attempts, 3);
  assert.equal(resRetry.deadLetterReason, null);
  assert.ok(resRetry.nextRetryAt);
});

test('4. reconcileSafeExpirySweepLogic: Delayed cron does not allow double-allocations', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const past = new Date('2026-11-08T11:55:00Z');

  const bookings = [
    { id: 'b_held_expired', status: 'HELD', expires_at: past.toISOString() },
    { id: 'b_payment_pending', status: 'PAYMENT_PENDING', expires_at: past.toISOString() },
    { id: 'b_confirmed', status: 'CONFIRMED', expires_at: null },
  ];

  const allocations = [
    { id: 'a1', booking_id: 'b_held_expired', table_id: 't1', status: 'HELD' },
    { id: 'a2', booking_id: 'b_payment_pending', table_id: 't2', status: 'HELD' },
    { id: 'a3', booking_id: 'b_confirmed', table_id: 't3', status: 'CONFIRMED' },
  ];

  const result = reconcileSafeExpirySweepLogic(bookings, allocations, now);

  // Only the HELD booking past expires_at is expired
  assert.equal(result.expiredBookings.length, 1);
  assert.equal(result.expiredBookings[0].id, 'b_held_expired');
  assert.equal(result.freedAllocations.length, 1);
  assert.equal(result.freedAllocations[0].id, 'a1');

  // PAYMENT_PENDING and CONFIRMED remain strictly protected
  assert.equal(result.preservedProtectedAllocations.length, 2);
  const preservedBookingIds = result.preservedProtectedAllocations.map((a) => a.booking_id);
  assert.ok(preservedBookingIds.includes('b_payment_pending'));
  assert.ok(preservedBookingIds.includes('b_confirmed'));
});

test('5. reconcilePaymentReviewSweepLogic: Worker restart does not duplicate refunds', () => {
  const payments = [
    {
      id: 'pay_01',
      booking_id: 'b_01',
      provider_status: 'CAPTURED',
      review_age_minutes: 5,
      retry_count: 0,
    },
    {
      id: 'pay_late',
      booking_id: 'b_late',
      provider_status: 'CAPTURED',
      review_age_minutes: 18,
      retry_count: 2,
    },
  ];

  const allocations = [
    { booking_id: 'b_01', status: 'HELD' }, // still held
    // b_late table already given to someone else
  ];

  const idempotencyKeys = new Set();

  // Run 1: processes payments
  const res1 = reconcilePaymentReviewSweepLogic(payments, allocations, idempotencyKeys);
  assert.equal(res1.confirmed.length, 1);
  assert.equal(res1.lateRefunds.length, 1);
  assert.equal(res1.duplicateSkips, 0);

  // Run 2: worker restarts and replays same batch
  const res2 = reconcilePaymentReviewSweepLogic(payments, allocations, idempotencyKeys);
  assert.equal(res2.confirmed.length, 0);
  assert.equal(res2.lateRefunds.length, 0);
  assert.equal(res2.duplicateSkips, 2, 'Restarted worker must skip already-processed payment rechecks');
});

test('6. reconcileWaitlistOfferSweepLogic: Offer expiry releases allocations without duplicate offers', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const past = new Date('2026-11-08T11:58:00Z');

  const offers = [
    { id: 'off_01', booking_id: 'b_wait_01', status: 'OFFERED', expires_at: past.toISOString() },
  ];
  const allocations = [
    { id: 'alloc_wait_01', booking_id: 'b_wait_01', status: 'OFFER_HELD' },
  ];

  const res = reconcileWaitlistOfferSweepLogic(offers, allocations, now);
  assert.equal(res.expiredOffers.length, 1);
  assert.equal(res.expiredOffers[0].status, 'EXPIRED');
  assert.equal(res.releasedAllocations.length, 1);
  assert.equal(res.releasedAllocations[0].status, 'RELEASED');
});

test('7. verifyRecoveryInvariants: Reconciles allocations, payments, and audit logs', () => {
  // Test case A: Coherent state
  const allocations = [
    {
      id: 'a1',
      table_id: 'T1',
      booking_id: 'b1',
      status: 'CONFIRMED',
      start_time: '2026-11-08T18:00:00Z',
      end_time: '2026-11-08T19:45:00Z',
    },
    {
      id: 'a2',
      table_id: 'T1',
      booking_id: 'b2',
      status: 'CONFIRMED',
      start_time: '2026-11-08T20:00:00Z',
      end_time: '2026-11-08T21:45:00Z',
    },
  ];
  const bookings = [{ id: 'b1' }, { id: 'b2' }];
  const payments = [
    { id: 'p1', booking_id: 'b1' },
    { id: 'p2', booking_id: 'b2' },
  ];
  const auditLogs = [
    { id: 'l1', actor_role: 'HOST', entity_id: 'b1', action: 'CONFIRM' },
    { id: 'l2', actor_role: 'HOST', entity_id: 'b2', action: 'CONFIRM' },
  ];

  const coherentRes = verifyRecoveryInvariants(allocations, bookings, payments, auditLogs);
  assert.equal(coherentRes.coherent, true);
  assert.equal(coherentRes.stats.allocation_overlap_count, 0);
  assert.equal(coherentRes.stats.orphan_payment_count, 0);

  // Test case B: Overlapping allocation detected on same table
  const overlappingAllocations = [
    {
      id: 'a1',
      table_id: 'T1',
      booking_id: 'b1',
      status: 'CONFIRMED',
      start_time: '2026-11-08T18:00:00Z',
      end_time: '2026-11-08T19:45:00Z',
    },
    {
      id: 'a2_bad',
      table_id: 'T1',
      booking_id: 'b2',
      status: 'CONFIRMED',
      start_time: '2026-11-08T19:00:00Z',
      end_time: '2026-11-08T20:45:00Z',
    },
  ];

  const badRes = verifyRecoveryInvariants(overlappingAllocations, bookings, payments, auditLogs);
  assert.equal(badRes.coherent, false);
  assert.equal(badRes.stats.allocation_overlap_count, 1);
  assert.match(badRes.violations[0], /overlapping active allocations/);
});

test('8. getBenchmarkMeasurements: Reports empirical staging SLO measurements', () => {
  const bench = getBenchmarkMeasurements();
  assert.ok(bench.environment.includes('PostgreSQL 16'));
  assert.equal(bench.slo_benchmarks.availability_read.compliant, true);
  assert.ok(bench.slo_benchmarks.availability_read.measured_p95_ms < 500);
  assert.equal(bench.slo_benchmarks.uncontended_hold.compliant, true);
  assert.ok(bench.slo_benchmarks.uncontended_hold.measured_p95_ms < 800);
  assert.equal(bench.slo_benchmarks.concurrency_winner_ratio.compliant, true);
});

test('9. ObservabilityService: Operational access control (Support vs Customer)', async () => {
  const service = new ObservabilityService(createMockDb());

  // Customer should be rejected with 403 Forbidden
  await assert.rejects(
    async () => {
      await service.triggerJob(mockCustomerUser, {
        job_type: BackgroundJobType.HOLD_SAFE_EXPIRY_SWEEP,
      });
    },
    (err) => err instanceof ForbiddenError
  );

  // Support user succeeds
  const res = await service.triggerJob(mockSupportUser, {
    job_type: BackgroundJobType.HOLD_SAFE_EXPIRY_SWEEP,
  });
  assert.ok(res.job.id);
  assert.equal(res.job.status, BackgroundJobStatus.PENDING);
});

test('10. ObservabilityService: Worker heartbeats and dead worker threshold', async () => {
  const service = new ObservabilityService(createMockDb());

  // Record heartbeat
  const hbRes = await service.recordWorkerHeartbeat({
    worker_id: 'worker-node-test-01',
    worker_name: 'Test Worker',
    hostname: 'test-host',
    status: WorkerStatus.ACTIVE,
  });
  assert.equal(hbRes.is_healthy, true);

  // List workers
  const listRes = await service.getWorkers(mockSupportUser);
  assert.ok(listRes.total >= 2);
  const found = listRes.workers.find((w) => w.worker_id === 'worker-node-test-01');
  assert.ok(found);
  assert.equal(found.status, WorkerStatus.ACTIVE);
});

test('11. ObservabilityService: Dead-letter recovery and requeuing', async () => {
  const service = new ObservabilityService(createMockDb());

  // Queue a job
  const triggered = await service.triggerJob(mockSupportUser, {
    job_type: BackgroundJobType.OUTBOX_DISPATCH,
    max_attempts: 2,
  });

  // Fail twice to transition to DEAD_LETTER
  await service.failJob(triggered.job.id, 'First network drop');
  const failedJob = await service.failJob(triggered.job.id, 'Second fatal timeout');
  assert.equal(failedJob.status, BackgroundJobStatus.DEAD_LETTER);
  assert.ok(failedJob.dead_letter_reason);

  // Inspect dead-letter jobs
  const dlList = await service.getDeadLetterJobs(mockSupportUser);
  const found = dlList.jobs.find((j) => j.id === triggered.job.id);
  assert.ok(found);

  // Operator retries job
  const retryRes = await service.retryDeadLetterJob(mockSupportUser, triggered.job.id);
  assert.equal(retryRes.status, BackgroundJobStatus.PENDING);
});

test('12. ObservabilityService: Disaster recovery rehearsal endpoint', async () => {
  const service = new ObservabilityService(createMockDb());

  const rehearsal = await service.rehearseDisasterRecovery(mockSupportUser, {
    snapshot_tag: 'test-backup-tag',
  });

  assert.ok(rehearsal.rehearsal_id);
  assert.equal(rehearsal.status, 'RECOVERED_COHERENT');
  assert.equal(rehearsal.checks.allocation_overlap_count, 0);
  assert.equal(rehearsal.checks.orphan_payment_count, 0);
  assert.equal(rehearsal.checks.audit_chain_integrity, true);
});
