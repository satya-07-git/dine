const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PaymentsService,
  RazorpayGatewayAdapter,
  evaluateReconciliationDecision,
  MAX_RECONCILIATION_RETRIES,
  MAX_REVIEW_DURATION_MINUTES,
} = require('../../apps/api/dist/modules/payments/payments.service');

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  AppError,
} = require('../../apps/api/dist/common/errors/app-error');

// ============================================================================
// 1. Decision Table Pure Evaluation Tests (T01)
// ============================================================================
test('EPIC-011: Bounded Review and Safe-Release Decision Table (T01)', async (t) => {
  await t.test('Provider CAPTURED with allocation still held returns CONFIRMED', () => {
    const decision = evaluateReconciliationDecision({
      providerStatus: 'CAPTURED',
      isAllocationStillHeld: true,
      reviewAgeMinutes: 5,
      retryCount: 1,
    });
    assert.equal(decision, 'CONFIRMED');
  });

  await t.test('Provider CAPTURED after allocation released/reassigned triggers LATE_CAPTURE_REFUND_TRIGGERED', () => {
    const decision = evaluateReconciliationDecision({
      providerStatus: 'CAPTURED',
      isAllocationStillHeld: false, // Table expired / reallocated to Customer B!
      reviewAgeMinutes: 20,
      retryCount: 2,
    });
    assert.equal(decision, 'LATE_CAPTURE_REFUND_TRIGGERED');
  });

  await t.test('Provider FAILED safely releases allocation as SAFE_RELEASE_EXPIRED', () => {
    const decision = evaluateReconciliationDecision({
      providerStatus: 'FAILED',
      isAllocationStillHeld: true,
      reviewAgeMinutes: 2,
      retryCount: 1,
    });
    assert.equal(decision, 'SAFE_RELEASE_EXPIRED');
  });

  await t.test('Provider UNKNOWN within review window and retry budget maintains REVIEW_MAINTAINED', () => {
    const decision = evaluateReconciliationDecision({
      providerStatus: 'UNKNOWN',
      isAllocationStillHeld: true,
      reviewAgeMinutes: 10,
      retryCount: 2,
    });
    assert.equal(decision, 'REVIEW_MAINTAINED');
  });

  await t.test('Provider UNKNOWN exceeding review window (15m) escalates to MANUAL_ESCALATION', () => {
    const decision = evaluateReconciliationDecision({
      providerStatus: 'UNKNOWN',
      isAllocationStillHeld: true,
      reviewAgeMinutes: 15.5,
      retryCount: 1,
    });
    assert.equal(decision, 'MANUAL_ESCALATION');
  });

  await t.test('Provider UNKNOWN exceeding retry budget (3 retries) escalates to MANUAL_ESCALATION', () => {
    const decision = evaluateReconciliationDecision({
      providerStatus: 'UNKNOWN',
      isAllocationStillHeld: true,
      reviewAgeMinutes: 4,
      retryCount: 3,
    });
    assert.equal(decision, 'MANUAL_ESCALATION');
  });
});

// ============================================================================
// 2. Reconciler & Atomic Current-State Recheck (T02)
// ============================================================================
test('EPIC-011: Reconciler and Concurrency-Safe State Recheck (T02)', async (t) => {
  await t.test('Reconciliation confirms booking when payment is captured and allocation is held', async () => {
    const mockAttempt = {
      id: 'att_1',
      booking_id: 'book_1',
      restaurant_id: 'rest_1',
      gateway_order_id: 'order_test_1',
      amount_minor: 50000,
      currency: 'INR',
      status: 'INITIATED',
      reconciliation_status: 'NONE',
      review_started_at: new Date(),
      retry_count: 0,
      booking_status: 'PAYMENT_PENDING',
    };

    const mockAlloc = {
      id: 'alloc_1',
      booking_id: 'book_1',
      status: 'PAYMENT_PENDING',
    };

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM payment_attempts') && !sql.includes('FOR UPDATE')) {
          return { rows: [mockAttempt] };
        }
        if (sql.includes('FROM payment_attempts') && sql.includes('FOR UPDATE')) {
          return { rows: [mockAttempt] };
        }
        if (sql.includes('FROM table_allocations')) {
          return { rows: [mockAlloc] };
        }
        if (sql.includes('MAX(sequence_number)')) {
          return { rows: [{ next_seq: 2 }] };
        }
        return { rows: [] };
      },
    };

    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const mockAdapter = {
      fetchPaymentStatus: async () => ({
        status: 'CAPTURED',
        gatewayPaymentId: 'pay_rzp_12345',
        amountMinor: 50000,
        currency: 'INR',
      }),
      initiateRefund: async () => ({ status: 'SUCCEEDED', gatewayRefundId: 'rfnd_1' }),
    };

    const service = new PaymentsService(mockDb, mockAdapter);
    const result = await service.reconcilePayment('att_1');

    assert.equal(result.decision, 'CONFIRMED');
    assert.equal(result.new_status, 'CAPTURED');
    assert.equal(result.reconciliation_status, 'RECONCILED');

    // Invariant: booking updated to CONFIRMED
    const bookingUpdate = executedQueries.find((q) =>
      q.sql.includes('UPDATE bookings') && q.sql.includes("SET status = 'CONFIRMED'")
    );
    assert.ok(bookingUpdate, 'Booking status must be updated to CONFIRMED');

    // Invariant: table allocation updated to CONFIRMED
    const allocUpdate = executedQueries.find((q) =>
      q.sql.includes('UPDATE table_allocations SET status = \'CONFIRMED\'')
    );
    assert.ok(allocUpdate, 'Table allocation status must be updated to CONFIRMED');
  });

  await t.test('Reconciliation safely releases allocation when provider confirms failure', async () => {
    const mockAttempt = {
      id: 'att_failed',
      booking_id: 'book_failed',
      restaurant_id: 'rest_1',
      gateway_order_id: 'order_test_fail',
      amount_minor: 50000,
      currency: 'INR',
      status: 'INITIATED',
      reconciliation_status: 'NONE',
      review_started_at: new Date(),
      retry_count: 0,
      booking_status: 'PAYMENT_PENDING',
    };

    const mockAlloc = {
      id: 'alloc_failed',
      booking_id: 'book_failed',
      status: 'PAYMENT_PENDING',
    };

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM payment_attempts')) return { rows: [mockAttempt] };
        if (sql.includes('FROM table_allocations')) return { rows: [mockAlloc] };
        return { rows: [] };
      },
    };

    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const mockAdapter = {
      fetchPaymentStatus: async () => ({ status: 'FAILED', amountMinor: 50000, currency: 'INR' }),
      initiateRefund: async () => ({ status: 'SUCCEEDED' }),
    };

    const service = new PaymentsService(mockDb, mockAdapter);
    const result = await service.reconcilePayment('att_failed');

    assert.equal(result.decision, 'SAFE_RELEASE_EXPIRED');
    assert.equal(result.new_status, 'FAILED');
    assert.equal(result.reconciliation_status, 'RECONCILED');

    // Invariant: table allocation released
    const allocRelease = executedQueries.find((q) =>
      q.sql.includes('UPDATE table_allocations SET status = \'RELEASED\'')
    );
    assert.ok(allocRelease, 'Physical table allocation must be safely released');
  });
});

// ============================================================================
// 3. Late-Capture Recovery & Idempotent Refund Workflow (T03)
// ============================================================================
test('EPIC-011: Late-Capture Recovery & Idempotent Refunds (T03)', async (t) => {
  await t.test('Late capture after reallocation retains Customer B and automatically refunds Customer A', async () => {
    const mockAttempt = {
      id: 'att_late_a',
      booking_id: 'book_cust_a',
      restaurant_id: 'rest_1',
      gateway_order_id: 'order_late_a',
      amount_minor: 75000,
      currency: 'INR',
      status: 'INITIATED',
      reconciliation_status: 'PENDING_RECHECK',
      review_started_at: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
      retry_count: 1,
      booking_status: 'PAYMENT_REVIEW',
    };

    // Table allocation is already expired or reassigned to Customer B!
    const mockAlloc = {
      id: 'alloc_cust_a',
      booking_id: 'book_cust_a',
      status: 'RELEASED', // No longer active!
    };

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM payment_attempts')) return { rows: [mockAttempt] };
        if (sql.includes('FROM table_allocations')) return { rows: [mockAlloc] };
        if (sql.includes('INSERT INTO refunds')) return { rows: [{ id: 'refund_auto_1' }] };
        if (sql.includes('INSERT INTO payment_incidents')) return { rows: [{ id: 'inc_late_cap_1' }] };
        return { rows: [] };
      },
    };

    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const mockAdapter = {
      fetchPaymentStatus: async () => ({
        status: 'CAPTURED',
        gatewayPaymentId: 'pay_late_success',
        amountMinor: 75000,
        currency: 'INR',
      }),
      initiateRefund: async () => ({ status: 'SUCCEEDED' }),
    };

    const service = new PaymentsService(mockDb, mockAdapter);
    const result = await service.reconcilePayment('att_late_a');

    assert.equal(result.decision, 'LATE_CAPTURE_REFUND_TRIGGERED');
    assert.equal(result.refund_issued, true);
    assert.equal(result.refund_id, 'refund_auto_1');
    assert.equal(result.incident_created, true);

    // Invariant: Customer A booking marked EXPIRED, table is NOT reassigned back to A
    const bookingExpire = executedQueries.find((q) =>
      q.sql.includes('UPDATE bookings') && q.sql.includes("SET status = 'EXPIRED'")
    );
    assert.ok(bookingExpire, 'Customer A booking must be marked EXPIRED');

    // Invariant: High-severity incident logged for support visibility
    const incidentQuery = executedQueries.find((q) =>
      q.sql.includes('INSERT INTO payment_incidents') && q.sql.includes('LATE_CAPTURE_REFUND_REQUIRED')
    );
    assert.ok(incidentQuery, 'LATE_CAPTURE_REFUND_REQUIRED incident must be logged');
  });

  await t.test('Duplicate refund request with identical idempotency_key returns existing record without duplicate payment gateway calls', async () => {
    const existingRefund = {
      id: 'rfnd_existing_123',
      booking_id: 'book_1',
      payment_attempt_id: 'att_1',
      gateway_refund_id: 'rzp_rfnd_999',
      amount_minor: 50000,
      currency: 'INR',
      status: 'SUCCEEDED',
      reason: 'Guest cancellation',
      idempotency_key: 'idem_key_unique_test_1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    let gatewayCalls = 0;
    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('SELECT * FROM refunds WHERE idempotency_key = $1')) {
          return { rows: [existingRefund] };
        }
        return { rows: [] };
      },
    };

    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const mockAdapter = {
      fetchPaymentStatus: async () => ({ status: 'CAPTURED' }),
      initiateRefund: async () => {
        gatewayCalls++;
        return { status: 'SUCCEEDED', gatewayRefundId: 'new_rfnd' };
      },
    };

    const service = new PaymentsService(mockDb, mockAdapter);
    const refund = await service.issueRefund('user_alice', 'att_1', {
      amount_minor: 50000,
      reason: 'Duplicate call attempt',
      idempotency_key: 'idem_key_unique_test_1',
    }, true);

    assert.equal(refund.id, 'rfnd_existing_123');
    assert.equal(refund.idempotency_key, 'idem_key_unique_test_1');
    assert.equal(gatewayCalls, 0, 'No duplicate gateway refund call should be dispatched');
  });

  await t.test('Refund exceeding payment amount is rejected with 400 ValidationError', async () => {
    const mockAttempt = {
      id: 'att_captured_500',
      booking_id: 'book_1',
      booking_user_id: 'user_alice',
      amount_minor: 50000, // Captured amount is 50,000 paise (₹500)
    };

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('WHERE idempotency_key = $1')) return { rows: [] };
        if (sql.includes('FROM payment_attempts')) return { rows: [mockAttempt] };
        return { rows: [] };
      },
    };

    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const mockAdapter = {
      fetchPaymentStatus: async () => ({ status: 'CAPTURED' }),
      initiateRefund: async () => ({ status: 'SUCCEEDED' }),
    };

    const service = new PaymentsService(mockDb, mockAdapter);

    await assert.rejects(
      () =>
        service.issueRefund('user_alice', 'att_captured_500', {
          amount_minor: 60000, // Requested 60,000 paise (> 50,000)
          reason: 'Excess refund attempt',
          idempotency_key: 'idem_excess_1',
        }),
      (err) => err instanceof ValidationError && err.message.includes('cannot exceed captured amount')
    );
  });
});

// ============================================================================
// 4. Escalation Visibility & Support Incident Resolution (T04)
// ============================================================================
test('EPIC-011: Escalation Visibility & Incident Resolution (T04)', async (t) => {
  await t.test('Review timeout exceeding 15m creates CRITICAL incident and MANUAL_ESCALATION', async () => {
    const mockAttempt = {
      id: 'att_timed_out',
      booking_id: 'book_timeout',
      restaurant_id: 'rest_1',
      gateway_order_id: 'order_timeout',
      amount_minor: 50000,
      currency: 'INR',
      status: 'INITIATED',
      reconciliation_status: 'PENDING_RECHECK',
      review_started_at: new Date(Date.now() - 16 * 60 * 1000), // 16 minutes ago
      retry_count: 2,
      booking_status: 'PAYMENT_REVIEW',
    };

    const mockAlloc = {
      id: 'alloc_timeout',
      booking_id: 'book_timeout',
      status: 'PAYMENT_REVIEW',
    };

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM payment_attempts')) return { rows: [mockAttempt] };
        if (sql.includes('FROM table_allocations')) return { rows: [mockAlloc] };
        if (sql.includes('INSERT INTO payment_incidents')) return { rows: [{ id: 'inc_timeout_1' }] };
        return { rows: [] };
      },
    };

    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const mockAdapter = {
      fetchPaymentStatus: async () => ({ status: 'UNKNOWN', amountMinor: 50000, currency: 'INR' }),
      initiateRefund: async () => ({ status: 'SUCCEEDED' }),
    };

    const service = new PaymentsService(mockDb, mockAdapter);
    const result = await service.reconcilePayment('att_timed_out');

    assert.equal(result.decision, 'MANUAL_ESCALATION');
    assert.equal(result.reconciliation_status, 'MANUAL_ESCALATION');
    assert.equal(result.incident_created, true);

    const incidentInsert = executedQueries.find((q) =>
      q.sql.includes('INSERT INTO payment_incidents') && q.sql.includes('RECONCILIATION_TIMEOUT')
    );
    assert.ok(incidentInsert, 'Critical incident RECONCILIATION_TIMEOUT must be persisted');
  });

  await t.test('Authorized staff can inspect and resolve open payment incidents', async () => {
    const mockIncident = {
      id: 'inc_open_1',
      booking_id: 'book_1',
      payment_attempt_id: 'att_1',
      incident_type: 'RECONCILIATION_TIMEOUT',
      severity: 'CRITICAL',
      status: 'OPEN',
      reason: 'Gateway timeout',
      metadata: {},
      created_at: new Date(),
    };

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM payment_incidents') && sql.includes('FOR UPDATE')) {
          return { rows: [mockIncident] };
        }
        if (sql.includes('FROM payment_incidents WHERE id = $1')) {
          return { rows: [mockIncident] };
        }
        return { rows: [] };
      },
    };

    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new PaymentsService(mockDb, {});

    const detail = await service.getIncidentById('inc_open_1');
    assert.equal(detail.id, 'inc_open_1');
    assert.equal(detail.status, 'OPEN');

    const resolution = await service.resolveIncident('staff_lead', 'inc_open_1', {
      resolution_status: 'RESOLVED',
      reason: 'Confirmed capture in Razorpay dashboard manually',
    });

    assert.equal(resolution.success, true);
    assert.equal(resolution.status, 'RESOLVED');

    const updateQuery = executedQueries.find((q) =>
      q.sql.includes('UPDATE payment_incidents') && q.sql.includes('SET status = $1')
    );
    assert.ok(updateQuery);
    assert.equal(updateQuery.params[0], 'RESOLVED');
  });
});
