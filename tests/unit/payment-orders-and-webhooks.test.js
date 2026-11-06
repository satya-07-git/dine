const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  RazorpayGatewayAdapter,
} = require('../../apps/api/dist/modules/payments/razorpay-gateway.adapter');
const {
  PaymentsService,
} = require('../../apps/api/dist/modules/payments/payments.service');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  UnauthorizedError,
  InvalidStateTransitionError,
} = require('../../apps/api/dist/common/errors/app-error');
const {
  PaymentAttemptStatus,
  BookingStatus,
  PolicyMode,
  ErrorCode,
} = require('../../packages/contracts/dist');

// Mock Config Service
function createMockConfig(overrides = {}) {
  const defaults = {
    RAZORPAY_KEY_ID: 'rzp_test_mock_1234567890',
    RAZORPAY_KEY_SECRET: 'mock_key_secret_1234567890',
    RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret_key_123456',
    NODE_ENV: 'test',
  };
  const config = { ...defaults, ...overrides };
  return {
    get: (key) => config[key],
    isProduction: config.NODE_ENV === 'production',
    isTest: config.NODE_ENV === 'test',
  };
}

// ============================================================================
// 1. Gateway Adapter & Test Mode Configuration Tests (T01)
// ============================================================================
test('EPIC-010: Gateway Adapter & Test Mode Configuration (T01)', async (t) => {
  const config = createMockConfig();
  const adapter = new RazorpayGatewayAdapter(config);

  await t.test('Test mode is explicit and live money is disabled (AC 6)', () => {
    assert.equal(adapter.isTestMode(), true);
    assert.equal(adapter.isLiveDisabled(), true);
    assert.equal(adapter.getKeyId().startsWith('rzp_test_'), true);
  });

  await t.test('createOrder generates test order outside row locks with minor units', async () => {
    const order = await adapter.createOrder({
      amountMinor: 50000,
      currency: 'INR',
      receipt: 'rcpt_test_001',
    });

    assert.ok(order.id.startsWith('order_test_'));
    assert.equal(order.amount, 50000);
    assert.equal(order.currency, 'INR');
    assert.equal(order.status, 'created');
    assert.equal(order.receipt, 'rcpt_test_001');
  });

  await t.test('createOrder rejects invalid or zero deposit amount', async () => {
    await assert.rejects(
      () => adapter.createOrder({ amountMinor: 0, currency: 'INR', receipt: 'r' }),
      /positive integer/
    );
    await assert.rejects(
      () => adapter.createOrder({ amountMinor: -500, currency: 'INR', receipt: 'r' }),
      /positive integer/
    );
  });

  await t.test('verifyWebhookSignature validates genuine signature and detects tampering (AC 2)', () => {
    const secret = 'test_webhook_secret_key_123456';
    const payload = JSON.stringify({
      id: 'evt_test_001',
      event: 'payment.captured',
      payload: { payment: { entity: { amount: 50000, currency: 'INR' } } },
    });

    const validSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    assert.equal(adapter.verifyWebhookSignature(payload, validSig, secret), true);

    // Tampered payload fails
    const tamperedPayload = payload.replace('50000', '10000');
    assert.equal(adapter.verifyWebhookSignature(tamperedPayload, validSig, secret), false);

    // Forged signature fails
    const forgedSig = crypto.createHmac('sha256', 'wrong_secret').update(payload).digest('hex');
    assert.equal(adapter.verifyWebhookSignature(payload, forgedSig, secret), false);

    // Empty signature or body fails
    assert.equal(adapter.verifyWebhookSignature('', validSig, secret), false);
    assert.equal(adapter.verifyWebhookSignature(payload, '', secret), false);
  });
});

// ============================================================================
// 2. Order Attempt Persistence & Reuse Contract (T02)
// ============================================================================
test('EPIC-010: Order Attempt Persistence & Idempotency (T02)', async (t) => {
  const config = createMockConfig();
  const adapter = new RazorpayGatewayAdapter(config);

  // In-memory mock database
  function createMockDb() {
    const store = {
      bookings: [
        {
          id: 'b_deposit_1',
          user_id: 'cust_alice',
          restaurant_id: 'r_deposit',
          status: 'HOLD_ACTIVE',
          policy_snapshot: {
            policy_mode: 'DEPOSIT_REQUIRED',
            deposit_amount_minor: 50000,
            deposit_currency: 'INR',
          },
          allocation_id: 'alloc_1',
          allocation_status: 'HELD',
          alloc_expires_at: new Date(Date.now() + 600000), // future
          restaurant_name: 'Amber Palace',
          rest_policy_mode: 'DEPOSIT_REQUIRED',
          rest_deposit_amount: 50000,
          rest_deposit_currency: 'INR',
          customer_name: 'Alice',
          customer_email: 'alice@test.local',
          customer_phone: '+919876543210',
        },
        {
          id: 'b_free_1',
          user_id: 'cust_alice',
          restaurant_id: 'r_free',
          status: 'HOLD_ACTIVE',
          policy_snapshot: {
            policy_mode: 'FREE_RESERVATION',
            deposit_amount_minor: 0,
            deposit_currency: 'INR',
          },
          allocation_id: 'alloc_2',
          allocation_status: 'HELD',
          alloc_expires_at: new Date(Date.now() + 600000),
          restaurant_name: 'Royal Bistro',
          rest_policy_mode: 'FREE_RESERVATION',
          rest_deposit_amount: 0,
          rest_deposit_currency: 'INR',
          customer_name: 'Alice',
          customer_email: 'alice@test.local',
        },
        {
          id: 'b_expired_1',
          user_id: 'cust_alice',
          restaurant_id: 'r_deposit',
          status: 'EXPIRED',
          policy_snapshot: {
            policy_mode: 'DEPOSIT_REQUIRED',
            deposit_amount_minor: 50000,
            deposit_currency: 'INR',
          },
          allocation_id: 'alloc_3',
          allocation_status: 'RELEASED',
          alloc_expires_at: new Date(Date.now() - 60000), // expired
          restaurant_name: 'Amber Palace',
          rest_policy_mode: 'DEPOSIT_REQUIRED',
          rest_deposit_amount: 50000,
          rest_deposit_currency: 'INR',
          customer_name: 'Alice',
          customer_email: 'alice@test.local',
        },
      ],
      paymentAttempts: [],
      idempotencyRecords: {},
      statusEvents: [],
      outboxEvents: [],
    };

    const mockPool = {
      query: async (sql, params = []) => {
        // Query idempotency
        if (sql.includes('FROM idempotency_records WHERE scope_key = $1')) {
          const rec = store.idempotencyRecords[params[0]];
          return { rows: rec ? [rec] : [] };
        }
        // Query booking hold details
        if (sql.includes('FROM bookings b') && sql.includes('WHERE b.id = $1 OR a.id = $1')) {
          const b = store.bookings.find((item) => item.id === params[0] || item.allocation_id === params[0]);
          return { rows: b ? [b] : [] };
        }
        // Query existing initiated payment attempt
        if (sql.includes('FROM payment_attempts') && (sql.includes("status = 'INITIATED'") || sql.includes("status IN ('INITIATED'"))) {
          const att = store.paymentAttempts.find((a) => a.booking_id === params[0] && (a.status === 'INITIATED' || a.status === 'PENDING_REVIEW'));
          return { rows: att ? [att] : [] };
        }
        // Query payment attempt by id or order_id
        if (sql.includes('FROM payment_attempts pa')) {
          const att = store.paymentAttempts.find(
            (a) => a.id === params[0] || a.gateway_order_id === params[0] || a.booking_id === params[0]
          );
          if (att) {
            const b = store.bookings.find((item) => item.id === att.booking_id);
            return {
              rows: [
                {
                  ...att,
                  booking_user_id: b ? b.user_id : 'unknown',
                  booking_status: b ? b.status : 'unknown',
                  restaurant_id: b ? b.restaurant_id : 'unknown',
                },
              ],
            };
          }
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('INSERT INTO payment_attempts')) {
          const newAtt = {
            id: `att_${store.paymentAttempts.length + 1}`,
            booking_id: params[0],
            gateway: params[1],
            gateway_order_id: params[2],
            amount_minor: params[3],
            currency: params[4],
            status: params[5],
            created_at: new Date(),
            updated_at: new Date(),
          };
          store.paymentAttempts.push(newAtt);
          return { rows: [{ id: newAtt.id, created_at: newAtt.created_at }] };
        }
        if (sql.includes("UPDATE bookings \n           SET status = 'PAYMENT_PENDING'")) {
          const b = store.bookings.find((item) => item.id === params[0]);
          if (b) b.status = 'PAYMENT_PENDING';
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO booking_status_events')) {
          store.statusEvents.push(params);
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO outbox_events')) {
          store.outboxEvents.push(params);
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO idempotency_records')) {
          store.idempotencyRecords[params[0]] = {
            scope_key: params[0],
            payload_hash: params[3],
            status_code: params[4],
            response_body: JSON.parse(params[5]),
          };
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    return {
      getPool: () => mockPool,
      withTransaction: async (fn) => fn(mockClient),
      store,
    };
  }

  await t.test('Order creation succeeds for DEPOSIT_REQUIRED hold', async () => {
    const mockDb = createMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    const { result, isReplay } = await service.createPaymentOrder('cust_alice', 'b_deposit_1', 'key_1');
    assert.equal(isReplay, false);
    assert.ok(result.order_id.startsWith('order_test_'));
    assert.equal(result.amount_minor, 50000);
    assert.equal(result.currency, 'INR');
    assert.equal(result.status, PaymentAttemptStatus.INITIATED);
    assert.equal(result.is_test_mode, true);
    assert.equal(mockDb.store.paymentAttempts.length, 1);
  });

  await t.test('Retrying an order request reuses existing initiated order without second checkout (AC 1)', async () => {
    const mockDb = createMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    // Initial creation
    const res1 = await service.createPaymentOrder('cust_alice', 'b_deposit_1', 'key_1');
    const firstOrderId = res1.result.order_id;

    // Retry request (different idempotency key or no key)
    const res2 = await service.createPaymentOrder('cust_alice', 'b_deposit_1', 'key_2');
    assert.equal(res2.result.order_id, firstOrderId);
    assert.equal(mockDb.store.paymentAttempts.length, 1, 'Cannot create a second logical checkout');
  });

  await t.test('Identical idempotency replay returns cached response with isReplay=true', async () => {
    const mockDb = createMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    const res1 = await service.createPaymentOrder('cust_alice', 'b_deposit_1', 'key_idemp_abc');
    assert.equal(res1.isReplay, false);

    const res2 = await service.createPaymentOrder('cust_alice', 'b_deposit_1', 'key_idemp_abc');
    assert.equal(res2.isReplay, true);
    assert.equal(res2.result.order_id, res1.result.order_id);
    assert.equal(mockDb.store.paymentAttempts.length, 1);
  });

  await t.test('FREE_RESERVATION creates no gateway order and is rejected', async () => {
    const mockDb = createMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    await assert.rejects(
      () => service.createPaymentOrder('cust_alice', 'b_free_1'),
      (err) => err instanceof ValidationError && err.message.includes('FREE_RESERVATION')
    );
  });

  await t.test('Customer cannot create order for another user booking (IDOR protection)', async () => {
    const mockDb = createMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    await assert.rejects(
      () => service.createPaymentOrder('cust_attacker_bob', 'b_deposit_1'),
      (err) => err instanceof ForbiddenError
    );
  });

  await t.test('Expired hold cannot create payment order', async () => {
    const mockDb = createMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    await assert.rejects(
      () => service.createPaymentOrder('cust_alice', 'b_expired_1'),
      (err) => err instanceof ExpiredError
    );
  });
});

// ============================================================================
// 3. Webhook Inbox Verification, Deduplication & Monotonic Transitions (T03, T04, T05)
// ============================================================================
test('EPIC-010: Webhook Verification, Deduplication & Transitions (T03-T05)', async (t) => {
  const config = createMockConfig();
  const adapter = new RazorpayGatewayAdapter(config);
  const secret = 'test_webhook_secret_key_123456';

  function createWebhookMockDb() {
    const store = {
      paymentEvents: [],
      paymentAttempts: [
        {
          id: 'att_101',
          booking_id: 'book_202',
          gateway_order_id: 'order_test_999',
          amount_minor: 50000,
          currency: 'INR',
          status: 'INITIATED',
        },
      ],
      bookings: [
        {
          id: 'book_202',
          status: 'PAYMENT_PENDING',
          version: 1,
        },
      ],
      allocations: [
        {
          id: 'alloc_303',
          booking_id: 'book_202',
          status: 'PAYMENT_PENDING',
        },
      ],
      statusEvents: [],
      outboxEvents: [],
    };

    const mockPool = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM payment_events WHERE gateway_event_id = $1')) {
          const ev = store.paymentEvents.find((e) => e.gateway_event_id === params[0]);
          return { rows: ev ? [ev] : [] };
        }
        return { rows: [] };
      },
    };

    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('INSERT INTO payment_events')) {
          store.paymentEvents.push({
            gateway_event_id: params[0],
            event_type: params[1],
            payload: JSON.parse(params[2]),
          });
          return { rows: [] };
        }
        if (sql.includes('SELECT * FROM payment_attempts WHERE gateway_order_id = $1')) {
          const att = store.paymentAttempts.find((a) => a.gateway_order_id === params[0]);
          return { rows: att ? [att] : [] };
        }
        if (sql.includes('SELECT id, status, version FROM bookings WHERE id = $1')) {
          const b = store.bookings.find((item) => item.id === params[0]);
          return { rows: b ? [b] : [] };
        }
        if (sql.includes("UPDATE payment_attempts \n           SET status = 'CAPTURED'")) {
          const att = store.paymentAttempts.find((a) => a.id === params[0]);
          if (att) att.status = 'CAPTURED';
          return { rows: [] };
        }
        if (sql.includes("UPDATE bookings \n           SET status = 'CONFIRMED'")) {
          const b = store.bookings.find((item) => item.id === params[0]);
          if (b) {
            b.status = 'CONFIRMED';
            b.version += 1;
          }
          return { rows: [] };
        }
        if (sql.includes("UPDATE table_allocations \n           SET status = 'CONFIRMED'")) {
          const a = store.allocations.find((item) => item.booking_id === params[0]);
          if (a) a.status = 'CONFIRMED';
          return { rows: [] };
        }
        if (sql.includes("UPDATE payment_attempts \n             SET status = 'PENDING_REVIEW'")) {
          const att = store.paymentAttempts.find((a) => a.id === params[0]);
          if (att) att.status = 'PENDING_REVIEW';
          return { rows: [] };
        }
        if (sql.includes("UPDATE bookings \n             SET status = 'PAYMENT_REVIEW'")) {
          const b = store.bookings.find((item) => item.id === params[0]);
          if (b) b.status = 'PAYMENT_REVIEW';
          return { rows: [] };
        }
        if (sql.includes("UPDATE payment_attempts \n             SET status = 'FAILED'")) {
          const att = store.paymentAttempts.find((a) => a.id === params[0]);
          if (att) att.status = 'FAILED';
          return { rows: [] };
        }
        if (sql.includes("UPDATE bookings \n             SET status = 'PAYMENT_FAILED'")) {
          const b = store.bookings.find((item) => item.id === params[0]);
          if (b) b.status = 'PAYMENT_FAILED';
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO booking_status_events')) {
          store.statusEvents.push(params);
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO outbox_events')) {
          store.outboxEvents.push(params);
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    return {
      getPool: () => mockPool,
      withTransaction: async (fn) => fn(mockClient),
      store,
    };
  }

  await t.test('Webhook with missing or tampered signature is rejected with 401 Unauthorized (AC 2)', async () => {
    const mockDb = createWebhookMockDb();
    const service = new PaymentsService(mockDb, config, adapter);
    const body = { id: 'evt_1', event: 'payment.captured' };
    const rawBody = JSON.stringify(body);

    // Missing signature
    await assert.rejects(
      () => service.processWebhook(rawBody, '', body),
      (err) => err instanceof UnauthorizedError
    );

    // Tampered signature
    await assert.rejects(
      () => service.processWebhook(rawBody, 'invalid_sig_hex_123', body),
      (err) => err instanceof UnauthorizedError
    );
  });

  await t.test('Verified payment.captured webhook confirms booking and advances allocation (AC 3, T04, T05)', async () => {
    const mockDb = createWebhookMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    const eventPayload = {
      id: 'evt_capture_100',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_999_xyz',
            order_id: 'order_test_999',
            amount: 50000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const rawBody = JSON.stringify(eventPayload);
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const response = await service.processWebhook(rawBody, sig, eventPayload);
    assert.equal(response.received, true);
    assert.equal(response.action_taken, 'CAPTURED_AND_CONFIRMED');

    // Verify DB state changes
    assert.equal(mockDb.store.paymentAttempts[0].status, 'CAPTURED');
    assert.equal(mockDb.store.bookings[0].status, 'CONFIRMED');
    assert.equal(mockDb.store.allocations[0].status, 'CONFIRMED');
    assert.equal(mockDb.store.statusEvents.length, 1);
    assert.equal(mockDb.store.outboxEvents.length, 1);
  });

  await t.test('Three duplicate webhook deliveries cause exactly one business confirmation (AC 3)', async () => {
    const mockDb = createWebhookMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    const eventPayload = {
      id: 'evt_dup_999',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_dup_01',
            order_id: 'order_test_999',
            amount: 50000,
            currency: 'INR',
          },
        },
      },
    };
    const rawBody = JSON.stringify(eventPayload);
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    // Delivery 1: Processed
    const r1 = await service.processWebhook(rawBody, sig, eventPayload);
    assert.equal(r1.action_taken, 'CAPTURED_AND_CONFIRMED');
    assert.equal(mockDb.store.paymentEvents.length, 1);

    // Delivery 2: Duplicate Ignored
    const r2 = await service.processWebhook(rawBody, sig, eventPayload);
    assert.equal(r2.duplicate, true);
    assert.equal(r2.action_taken, 'DUPLICATE_IGNORED');

    // Delivery 3: Duplicate Ignored
    const r3 = await service.processWebhook(rawBody, sig, eventPayload);
    assert.equal(r3.duplicate, true);
    assert.equal(r3.action_taken, 'DUPLICATE_IGNORED');

    // Exactly 1 business confirmation occurred
    assert.equal(mockDb.store.bookings[0].version, 2);
    assert.equal(mockDb.store.paymentEvents.length, 1);
  });

  await t.test('Out-of-order payment.failed event does NOT downgrade captured payment (AC 4)', async () => {
    const mockDb = createWebhookMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    // Pre-condition: payment is already CAPTURED and booking is CONFIRMED
    mockDb.store.paymentAttempts[0].status = 'CAPTURED';
    mockDb.store.bookings[0].status = 'CONFIRMED';
    mockDb.store.allocations[0].status = 'CONFIRMED';

    const failPayload = {
      id: 'evt_late_failed_01',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_failed_late',
            order_id: 'order_test_999',
            error_code: 'BAD_REQUEST_ERROR',
          },
        },
      },
    };
    const rawBody = JSON.stringify(failPayload);
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const res = await service.processWebhook(rawBody, sig, failPayload);
    assert.ok(res.action_taken.includes('OUT_OF_ORDER_IGNORED'));

    // State MUST remain CAPTURED and CONFIRMED
    assert.equal(mockDb.store.paymentAttempts[0].status, 'CAPTURED');
    assert.equal(mockDb.store.bookings[0].status, 'CONFIRMED');
    assert.equal(mockDb.store.allocations[0].status, 'CONFIRMED');
  });

  await t.test('Mismatched amount or currency sent to PAYMENT_REVIEW without false confirmation (AC 5)', async () => {
    const mockDb = createWebhookMockDb();
    const service = new PaymentsService(mockDb, config, adapter);

    const mismatchPayload = {
      id: 'evt_mismatch_amount',
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_mismatch_01',
            order_id: 'order_test_999',
            amount: 25000, // Expected 50000!
            currency: 'INR',
          },
        },
      },
    };
    const rawBody = JSON.stringify(mismatchPayload);
    const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const res = await service.processWebhook(rawBody, sig, mismatchPayload);
    assert.equal(res.action_taken, 'SENT_TO_PAYMENT_REVIEW');

    // Attempt and booking transitioned to PAYMENT_REVIEW, NEVER CONFIRMED
    assert.equal(mockDb.store.paymentAttempts[0].status, 'PENDING_REVIEW');
    assert.equal(mockDb.store.bookings[0].status, 'PAYMENT_REVIEW');
    assert.notEqual(mockDb.store.bookings[0].status, 'CONFIRMED');
  });
});
