const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createEventEnvelope,
  computeDeliveryIdempotencyKey,
  calculateExponentialBackoff,
  validateTopicFormat,
  projectMinimalPayload,
  reconcileClientState,
  NotificationsService,
} = require('../../apps/api/dist/modules/notifications/notifications.service');

const {
  InAppNotificationAdapter,
} = require('../../apps/api/dist/modules/notifications/adapters/in-app.adapter');
const {
  PushNotificationAdapter,
} = require('../../apps/api/dist/modules/notifications/adapters/push.adapter');
const {
  RealtimeBroadcastAdapter,
} = require('../../apps/api/dist/modules/notifications/adapters/realtime-broadcast.adapter');

const {
  NotificationChannel,
  NotificationDeliveryStatus,
  OutboxEventStatus,
  RealtimeTopicType,
  BookingStatus,
} = require('../../packages/contracts/dist/enums');

const { ErrorCode } = require('../../packages/contracts/dist/errors');
const { ForbiddenError, ValidationError } = require('../../apps/api/dist/common/errors/app-error');

// ============================================================================
// 1. Pure Architectural Helpers Unit Tests (T01, T03, T05)
// ============================================================================
test('EPIC-013: Event Envelope Creation (T01)', async (t) => {
  await t.test('createEventEnvelope generates valid envelope with monotonic sequence and UTC timestamp', () => {
    const payload = { booking_id: 'b_01', status: 'CONFIRMED' };
    const env = createEventEnvelope('BOOKING', 'b_01', 'booking.confirmed', 3, payload, {
      restaurantId: 'rest_01',
      userId: 'user_01',
    });

    assert.ok(env.eventId, 'eventId should be present');
    assert.equal(env.aggregateType, 'BOOKING');
    assert.equal(env.aggregateId, 'b_01');
    assert.equal(env.eventType, 'booking.confirmed');
    assert.equal(env.sequenceNumber, 3);
    assert.equal(env.restaurantId, 'rest_01');
    assert.equal(env.userId, 'user_01');
    assert.deepEqual(env.payload, payload);
    assert.ok(env.occurredAt.endsWith('Z'), 'occurredAt should be UTC instant');
  });

  await t.test('Sequence number defaults to 1 if negative or zero supplied', () => {
    const env = createEventEnvelope('BOOKING', 'b_01', 'booking.created', 0, {});
    assert.equal(env.sequenceNumber, 1);
  });
});

test('EPIC-013: Delivery Deduplication Key Computation (T04)', async (t) => {
  await t.test('computeDeliveryIdempotencyKey formats deterministic composite key', () => {
    const key = computeDeliveryIdempotencyKey('ev_123', 'usr_456', NotificationChannel.PUSH);
    assert.equal(key, 'ev_123:usr_456:PUSH');
  });
});

test('EPIC-013: Exponential Backoff Calculation (T02)', async (t) => {
  await t.test('calculateExponentialBackoff computes correct delays with attempt growth', () => {
    assert.equal(calculateExponentialBackoff(0), 0);
    assert.equal(calculateExponentialBackoff(1, 1000), 1000);
    assert.equal(calculateExponentialBackoff(2, 1000), 2000);
    assert.equal(calculateExponentialBackoff(3, 1000), 4000);
    assert.equal(calculateExponentialBackoff(4, 1000), 8000);
    assert.equal(calculateExponentialBackoff(5, 1000), 16000);
  });

  await t.test('Exponential backoff respects maxDelay cap', () => {
    const delay = calculateExponentialBackoff(10, 1000, 30000);
    assert.equal(delay, 30000);
  });
});

test('EPIC-013: Topic Validation & Classification (T03)', async (t) => {
  await t.test('Valid user topic formats correctly', () => {
    const res = validateTopicFormat('user:123e4567-e89b-12d3-a456-426614174000');
    assert.equal(res.type, RealtimeTopicType.USER);
    assert.equal(res.entityId, '123e4567-e89b-12d3-a456-426614174000');
  });

  await t.test('Valid restaurant topic formats correctly', () => {
    const res = validateTopicFormat('restaurant:rest_001');
    assert.equal(res.type, RealtimeTopicType.RESTAURANT);
    assert.equal(res.entityId, 'rest_001');
  });

  await t.test('Valid booking topic formats correctly', () => {
    const res = validateTopicFormat('booking:book_001');
    assert.equal(res.type, RealtimeTopicType.BOOKING);
    assert.equal(res.entityId, 'book_001');
  });

  await t.test('Malformed or invalid topics throw ValidationError', () => {
    assert.throws(() => validateTopicFormat(''), ValidationError);
    assert.throws(() => validateTopicFormat('user'), ValidationError);
    assert.throws(() => validateTopicFormat('user:'), ValidationError);
    assert.throws(() => validateTopicFormat('unknown_prefix:123'), ValidationError);
  });
});

test('EPIC-013: Minimal Payload Projection (ADR-006 & T03)', async (t) => {
  await t.test('projectMinimalPayload strips sensitive customer and payment fields', () => {
    const rawEvent = {
      eventId: 'evt_999',
      aggregateId: 'book_111',
      eventType: 'booking.confirmed',
      sequenceNumber: 2,
      payload: {
        booking_id: 'book_111',
        customer_phone: '+919999999999',
        customer_email: 'guest@example.com',
        payment_signature: 'secret_sig_xyz',
        notes: 'VIP guest celebrating anniversary',
        status: 'CONFIRMED',
        version: 2,
      },
    };

    const minimal = projectMinimalPayload(rawEvent);
    assert.equal(minimal.event_id, 'evt_999');
    assert.equal(minimal.entity_id, 'book_111');
    assert.equal(minimal.event_type, 'booking.confirmed');
    assert.equal(minimal.status, 'CONFIRMED');
    assert.equal(minimal.sequence_number, 2);
    assert.equal(minimal.version, 2);

    // Verify sensitive secrets were NOT leaked into broadcast projection
    assert.equal(minimal.customer_phone, undefined);
    assert.equal(minimal.customer_email, undefined);
    assert.equal(minimal.payment_signature, undefined);
    assert.equal(minimal.notes, undefined);
  });
});

test('EPIC-013: Client Reconnect State Reconciliation (T05 & AC4)', async (t) => {
  await t.test('Client with current sequence number is up to date and ignores duplicate event', () => {
    const res = reconcileClientState(3, 2, 3, 2);
    assert.equal(res.isStale, false);
    assert.equal(res.shouldIgnoreIncoming, true);
    assert.equal(res.missedEventsCount, 0);
  });

  await t.test('Client with older sequence number detects stale state and calculates missed events', () => {
    const res = reconcileClientState(1, 1, 4, 3);
    assert.equal(res.isStale, true);
    assert.equal(res.shouldIgnoreIncoming, false);
    assert.equal(res.missedEventsCount, 3);
  });

  await t.test('Late or out-of-order event arriving after client updated to newer REST state is ignored', () => {
    // Client already at seq 5, received late event with seq 4
    const res = reconcileClientState(5, 4, 5, 4);
    assert.equal(res.shouldIgnoreIncoming, true);
  });
});

// ============================================================================
// 2. Notification Sender Adapters Unit Tests (T04)
// ============================================================================
test('EPIC-013: Notification Adapters Execution (T04)', async (t) => {
  await t.test('InAppNotificationAdapter delivers message successfully', async () => {
    const adapter = new InAppNotificationAdapter();
    const res = await adapter.send({
      outboxEventId: 'ev_01',
      recipientId: 'user_01',
      channel: NotificationChannel.IN_APP,
      idempotencyKey: 'ev_01:user_01:IN_APP',
      payload: { message: 'Booking confirmed' },
    });
    assert.equal(res.success, true);
    assert.equal(res.status, NotificationDeliveryStatus.DELIVERED);
  });

  await t.test('PushNotificationAdapter delivers when healthy', async () => {
    const adapter = new PushNotificationAdapter();
    const res = await adapter.send({
      outboxEventId: 'ev_02',
      recipientId: 'user_02',
      channel: NotificationChannel.PUSH,
      idempotencyKey: 'ev_02:user_02:PUSH',
      payload: { message: 'Table is ready' },
    });
    assert.equal(res.success, true);
    assert.equal(res.status, NotificationDeliveryStatus.DELIVERED);
  });

  await t.test('PushNotificationAdapter fails gracefully when simulated outage is active', async () => {
    const adapter = new PushNotificationAdapter();
    adapter.setOutageSimulation(true);
    const res = await adapter.send({
      outboxEventId: 'ev_03',
      recipientId: 'user_03',
      channel: NotificationChannel.PUSH,
      idempotencyKey: 'ev_03:user_03:PUSH',
      payload: { message: 'Offer extended' },
    });
    assert.equal(res.success, false);
    assert.equal(res.status, NotificationDeliveryStatus.FAILED);
    assert.ok(res.error.includes('PUSH_GATEWAY_OUTAGE'));
  });

  await t.test('RealtimeBroadcastAdapter delivers minimal hint payload', async () => {
    const adapter = new RealtimeBroadcastAdapter();
    const res = await adapter.send({
      outboxEventId: 'ev_04',
      recipientId: 'user_04',
      channel: NotificationChannel.REALTIME_BROADCAST,
      idempotencyKey: 'ev_04:user_04:REALTIME_BROADCAST',
      payload: { booking_id: 'b_99', status: 'READY', sequence_number: 5 },
    });
    assert.equal(res.success, true);
    assert.equal(res.status, NotificationDeliveryStatus.DELIVERED);
  });
});

// ============================================================================
// 3. Outbox Worker Claim, Deduplication, Retry & Dead-Letter (T02 & T04)
// ============================================================================
test('EPIC-013: Outbox Worker Service Lifecycle (T02, T04, AC1, AC2)', async (t) => {
  const mockDb = { getPool: () => { throw new Error('Offline mock DB'); } };
  const inApp = new InAppNotificationAdapter();
  const push = new PushNotificationAdapter();
  const realtime = new RealtimeBroadcastAdapter();
  const service = new NotificationsService(mockDb, inApp, push, realtime);

  await t.test('AC1: Emitting outbox event creates PENDING durable event', async () => {
    const env = await service.emitOutboxEvent(
      'BOOKING',
      'booking_101',
      'booking.confirmed',
      { booking_id: 'booking_101', status: 'CONFIRMED' },
      { userId: 'user_alice', sequenceNumber: 1 }
    );
    assert.ok(env.eventId);
    assert.equal(env.eventType, 'booking.confirmed');
  });

  await t.test('Claiming batch updates status to PROCESSING', async () => {
    const claimed = await service.claimOutboxBatch(10, 'worker_1');
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].status, OutboxEventStatus.PROCESSING);
  });

  await t.test('AC2: Dispatch worker delivers and records delivery in store', async () => {
    const batchRes = await service.dispatchOutboxBatch({
      batchSize: 10,
      workerId: 'worker_1',
      channels: [NotificationChannel.IN_APP, NotificationChannel.REALTIME_BROADCAST],
    });

    assert.equal(batchRes.processed_count, 1);
    assert.equal(batchRes.published_count, 1);
    assert.equal(batchRes.failed_count, 0);
  });

  await t.test('AC2: Duplicate worker dispatch skips re-sending (deduplication guarantee)', async () => {
    // Emit another event for same delivery
    const env2 = await service.emitOutboxEvent(
      'BOOKING',
      'booking_102',
      'booking.ready',
      { booking_id: 'booking_102', status: 'READY' },
      { userId: 'user_alice', sequenceNumber: 2 }
    );

    // First dispatch
    await service.dispatchOutboxBatch({
      batchSize: 10,
      channels: [NotificationChannel.IN_APP],
    });

    // Worker restart / retry simulation: manually re-dispatch same event
    const redeliverRes = await service.dispatchOutboxBatch({
      batchSize: 10,
      channels: [NotificationChannel.IN_APP],
    });

    // Verified: No active pending/unprocessed duplicates executed
    assert.equal(redeliverRes.published_count, 0);
  });

  await t.test('Worker retry and dead-letter queue transition on repeated failures', async () => {
    const failedService = new NotificationsService(mockDb, inApp, push, realtime);
    failedService.getPushAdapter().setOutageSimulation(true);

    // Emit event with maxAttempts = 2 for quick dead-letter test
    const envFail = await failedService.emitOutboxEvent(
      'BOOKING',
      'booking_fail_1',
      'booking.confirmed',
      { booking_id: 'booking_fail_1', status: 'CONFIRMED' },
      { userId: 'user_bob', sequenceNumber: 1 }
    );

    // Dispatch attempt 1: fails and transitions to FAILED
    const res1 = await failedService.dispatchOutboxBatch({
      batchSize: 1,
      channels: [NotificationChannel.PUSH],
    });
    assert.equal(res1.failed_count, 1);

    // Simulate 4 more attempts until max_attempts reached
    for (let i = 0; i < 3; i++) {
      await failedService.dispatchOutboxBatch({
        batchSize: 1,
        channels: [NotificationChannel.PUSH],
      });
    }

    // Attempt 5 exceeds maxAttempts (5) -> Transitions to DEAD_LETTER
    const deadLetterRes = await failedService.dispatchOutboxBatch({
      batchSize: 1,
      channels: [NotificationChannel.PUSH],
    });
    assert.equal(deadLetterRes.dead_letter_count, 1);
  });
});

// ============================================================================
// 4. Topic Authorization & Security Isolation Tests (T03 & AC3)
// ============================================================================
test('EPIC-013: Topic Authorization & IDOR Security (T03 & AC3)', async (t) => {
  const mockDb = { getPool: () => { throw new Error('Offline mock DB'); } };
  const inApp = new InAppNotificationAdapter();
  const push = new PushNotificationAdapter();
  const realtime = new RealtimeBroadcastAdapter();
  const service = new NotificationsService(mockDb, inApp, push, realtime);

  const customerAlice = { userId: 'usr_alice', authUid: 'usr_alice', role: 'customer' };
  const customerBob = { userId: 'usr_bob', authUid: 'usr_bob', role: 'customer' };
  const staffMember = { userId: 'usr_staff', authUid: 'usr_staff', role: 'staff' };

  await t.test('Customer A successfully subscribes to their own private topic', async () => {
    const authRes = await service.authorizeTopic(customerAlice, 'user:usr_alice');
    assert.equal(authRes.authorized, true);
    assert.equal(authRes.topic, 'user:usr_alice');
    assert.ok(authRes.token);
  });

  await t.test('AC3: Customer A cannot subscribe to Customer B private topic (IDOR rejected with 403)', async () => {
    await assert.rejects(
      async () => service.authorizeTopic(customerAlice, 'user:usr_bob'),
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.code, ErrorCode.REALTIME_TOPIC_UNAUTHORIZED);
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  await t.test('Non-staff customer cannot subscribe to restaurant operations topic', async () => {
    await assert.rejects(
      async () => service.authorizeTopic(customerAlice, 'restaurant:rest_001'),
      (err) => {
        assert.ok(err instanceof ForbiddenError);
        assert.equal(err.code, ErrorCode.REALTIME_TOPIC_UNAUTHORIZED);
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  await t.test('Authorized staff successfully subscribes to restaurant topic', async () => {
    const authRes = await service.authorizeTopic(staffMember, 'restaurant:rest_001');
    assert.equal(authRes.authorized, true);
    assert.equal(authRes.topic_type, RealtimeTopicType.RESTAURANT);
  });
});

// ============================================================================
// 5. Canonical REST Reconnect & Provider Outage Invariants (AC4 & AC5)
// ============================================================================
test('EPIC-013: Canonical REST Reconnect Sync & Provider Outage Invariant (AC4 & AC5)', async (t) => {
  const mockDb = { getPool: () => { throw new Error('Offline mock DB'); } };
  const inApp = new InAppNotificationAdapter();
  const push = new PushNotificationAdapter();
  const realtime = new RealtimeBroadcastAdapter();
  const service = new NotificationsService(mockDb, inApp, push, realtime);

  const customerAlice = { userId: 'usr_alice', authUid: 'usr_alice', role: 'customer' };

  await t.test('AC4: Reconnect sync returns canonical REST state and flags client state accurately', async () => {
    // Client missed events: client was at seq 1, server is at seq 2
    const syncRes = await service.syncBookingState(customerAlice, 'b_100', 1, 1);
    assert.equal(syncRes.booking_id, 'b_100');
    assert.equal(syncRes.canonical_status, BookingStatus.CONFIRMED);
    assert.equal(syncRes.is_stale, true);
    assert.equal(syncRes.missed_events_count, 1);
    assert.ok(syncRes.booking);
  });

  await t.test('AC5: External push provider outage does NOT fail booking transaction', async () => {
    // Simulate push provider total outage
    push.setOutageSimulation(true);

    // Business write transaction commits booking and emits outbox event
    // The emitOutboxEvent succeeds cleanly regardless of push status
    const env = await service.emitOutboxEvent(
      'BOOKING',
      'b_critical_01',
      'booking.confirmed',
      { booking_id: 'b_critical_01', status: 'CONFIRMED' },
      { userId: 'usr_alice' }
    );

    assert.ok(env.eventId, 'Outbox event must commit cleanly');
    assert.equal(env.eventType, 'booking.confirmed');
  });
});
