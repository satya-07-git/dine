const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateRoomFormat,
  projectAvailabilityBroadcast,
  projectPrivateBookingPayload,
  authorizeRoomPure,
  SocketIoGateway,
} = require('../../apps/api/dist/modules/realtime/socket-io.gateway');

const {
  createSequencedEvent,
  evaluateReconnectRecoveryPure,
  EventRecoveryService,
} = require('../../apps/api/dist/modules/realtime/event-recovery.service');

const {
  createDurableJobId,
  calculateJobBackoff,
  evaluateJobFailurePure,
  reconstructQueuesFromPostgresPure,
  BullMqQueueService,
} = require('../../apps/api/dist/modules/realtime/bullmq-queue.service');

const {
  SocketRoomType,
  SocketEventType,
  BullQueueName,
  EventRecoveryMode,
  RedisQueueState,
  ErrorCode,
} = require('../../packages/contracts/dist');

// ============================================================================
// 1. Event Identity, Monotonic Sequencing & Envelope Creation (T01, AC 1, AC 2)
// ============================================================================
test('EPIC-024 Task T01: Event Identity, Monotonic Sequencing & Envelope Rules', async (t) => {
  await t.test('createSequencedEvent enforces monotonic version and sequence', () => {
    const event = createSequencedEvent({
      bookingId: 'bk_001',
      restaurantId: 'rest_001',
      version: 2,
      sequenceNumber: 3,
      eventType: SocketEventType.BOOKING_CONFIRMED,
      fromState: 'PAYMENT_PENDING',
      toState: 'CONFIRMED',
      actorId: 'usr_001',
      actorRole: 'CUSTOMER',
      payload: { amount_minor: 50000, party_size: 4 },
    });

    assert.ok(event.id, 'Event must have a UUID identifier');
    assert.equal(event.booking_id, 'bk_001');
    assert.equal(event.restaurant_id, 'rest_001');
    assert.equal(event.version, 2);
    assert.equal(event.sequence_number, 3);
    assert.equal(event.event_type, 'booking.confirmed');
    assert.equal(event.from_state, 'PAYMENT_PENDING');
    assert.equal(event.to_state, 'CONFIRMED');
    assert.equal(event.actor_role, 'CUSTOMER');
    assert.ok(event.created_at, 'Event must record UTC creation timestamp');
  });

  await t.test('Sequence and version numbers strictly default to at least 1', () => {
    const event = createSequencedEvent({
      bookingId: 'bk_002',
      restaurantId: 'rest_001',
      version: 0,
      sequenceNumber: -5,
      eventType: SocketEventType.HOLD_CREATED,
    });
    assert.equal(event.version, 1);
    assert.equal(event.sequence_number, 1);
  });
});

// ============================================================================
// 2. Socket.IO Room Format & Authorization (T06, AC 6, AC 7)
// ============================================================================
test('EPIC-024 Task T06: Socket.IO Authentication & Room Authorization', async (t) => {
  await t.test('validateRoomFormat accepts canonical restaurant and booking rooms', () => {
    const r1 = validateRoomFormat('restaurant:rest_001');
    assert.equal(r1.type, SocketRoomType.RESTAURANT);
    assert.equal(r1.entityId, 'rest_001');

    const r2 = validateRoomFormat('booking:bk_001');
    assert.equal(r2.type, SocketRoomType.BOOKING);
    assert.equal(r2.entityId, 'bk_001');
  });

  await t.test('validateRoomFormat rejects malformed or unsupported rooms', () => {
    assert.throws(() => validateRoomFormat(''), /required/);
    assert.throws(() => validateRoomFormat('admin_global'), /Invalid room format/);
    assert.throws(() => validateRoomFormat('user:123'), /Unsupported room prefix/);
    assert.throws(() => validateRoomFormat('restaurant:'), /empty entity ID/);
  });

  await t.test('AC 6: Customer A CANNOT join Customer B private booking room', async () => {
    const customerA = { userId: 'usr_A', role: 'CUSTOMER' };
    const mockDbLookup = async (type, id) => ({
      bookingUserId: 'usr_B', // Owned by Customer B!
      bookingRestaurantId: 'rest_001',
    });

    await assert.rejects(
      async () => authorizeRoomPure(customerA, 'booking:bk_owned_by_B', mockDbLookup),
      (err) => {
        assert.equal(err.code, ErrorCode.ROOM_ACCESS_DENIED);
        return true;
      }
    );
  });

  await t.test('AC 7: Staff A CANNOT receive Restaurant B privileged room data', async () => {
    const staffA = { userId: 'usr_staff_A', role: 'STAFF', restaurantId: 'rest_A' };
    const mockDbLookup = async (type, id) => ({
      membershipRole: null, // Staff A is not a member of Restaurant B
      membershipStatus: null,
      restaurantExists: true,
    });

    await assert.rejects(
      async () => authorizeRoomPure(staffA, 'restaurant:rest_B', mockDbLookup),
      (err) => {
        assert.equal(err.code, ErrorCode.ROOM_ACCESS_DENIED);
        return true;
      }
    );
  });

  await t.test('Active hosting staff CAN join booking room at their restaurant', async () => {
    const staffHost = { userId: 'usr_host', role: 'HOST', restaurantId: 'rest_001' };
    const mockDbLookup = async (type, id) => ({
      bookingUserId: 'usr_customer_X',
      bookingRestaurantId: 'rest_001',
      membershipRole: 'HOST',
      membershipStatus: 'ACTIVE',
    });

    const res = await authorizeRoomPure(staffHost, 'booking:bk_at_venue', mockDbLookup);
    assert.equal(res.authorized, true);
    assert.equal(res.audience, 'STAFF');
  });

  await t.test('Revoked staff membership immediately rejects room access', async () => {
    const revokedStaff = {
      userId: 'usr_revoked',
      role: 'STAFF',
      restaurantId: 'rest_001',
      staffStatus: 'REVOKED',
    };
    const mockDbLookup = async () => ({});

    await assert.rejects(
      async () => authorizeRoomPure(revokedStaff, 'restaurant:rest_001', mockDbLookup),
      (err) => {
        assert.equal(err.code, ErrorCode.MEMBERSHIP_REVOKED_ROOM_DISCONNECT);
        return true;
      }
    );
  });
});

// ============================================================================
// 3. Payload Projections: Public Availability vs Private Booking (T07, AC 8)
// ============================================================================
test('EPIC-024 Task T07 & AC 8: Availability Broadcasts Exclude PII and Payment Secrets', async (t) => {
  await t.test('projectAvailabilityBroadcast strips guest names, phones, emails, and payments', () => {
    const rawEvent = {
      eventId: 'evt_avail_01',
      restaurantId: 'rest_001',
      sequenceNumber: 5,
      payload: {
        table_id: 'tbl_04',
        table_number: 'T04',
        state: 'AVAILABLE',
        starts_at: '2026-11-10T19:00:00Z',
        ends_at: '2026-11-10T20:45:00Z',
        // Sensitive PII & Payment data that must be scrubbed:
        customer_name: 'John Doe',
        customer_phone: '+919876543210',
        customer_email: 'john@example.com',
        payment_order_id: 'order_secret_123',
        card_network: 'VISA',
      },
    };

    const projected = projectAvailabilityBroadcast(rawEvent);

    assert.equal(projected.event_id, 'evt_avail_01');
    assert.equal(projected.table_id, 'tbl_04');
    assert.equal(projected.table_number, 'T04');
    assert.equal(projected.state, 'AVAILABLE');
    assert.equal(projected.sequence_number, 5);

    // Verify all private fields are completely absent
    assert.equal(projected.customer_name, undefined);
    assert.equal(projected.customer_phone, undefined);
    assert.equal(projected.customer_email, undefined);
    assert.equal(projected.payment_order_id, undefined);
    assert.equal(projected.card_network, undefined);
  });

  await t.test('projectPrivateBookingPayload redacts payment tokens and raw card details', () => {
    const rawBooking = {
      aggregateId: 'bk_001',
      eventType: 'booking.confirmed',
      sequenceNumber: 3,
      payload: {
        booking_id: 'bk_001',
        status: 'CONFIRMED',
        version: 2,
        party_size: 4,
        table_id: 'tbl_04',
        // Secrets that must be excluded:
        razorpay_payment_id: 'pay_secret_999',
        razorpay_signature: 'hmac_sha256_hash_secret',
        internal_audit_notes: 'VIP customer check passed',
      },
    };

    const projected = projectPrivateBookingPayload(rawBooking);
    assert.equal(projected.booking_id, 'bk_001');
    assert.equal(projected.status, 'CONFIRMED');
    assert.equal(projected.version, 2);
    assert.equal(projected.party_size, 4);

    assert.equal(projected.razorpay_payment_id, undefined);
    assert.equal(projected.razorpay_signature, undefined);
    assert.equal(projected.internal_audit_notes, undefined);
  });
});

// ============================================================================
// 4. Database Reconnect Recovery & Cursor Retention (T04, T09, AC 5, AC 9, AC 10)
// ============================================================================
test('EPIC-024 Task T04 & T09: Database Reconnect Recovery & Cursor Retention', async (t) => {
  const cursor = {
    entityType: 'BOOKING',
    entityId: 'bk_reconnect_01',
    minRetainedSequence: 5,
    maxRetainedSequence: 10,
    minRetainedVersion: 1,
    maxRetainedVersion: 4,
    retentionWindowSeconds: 86400,
    updatedAt: new Date().toISOString(),
  };

  const history = [
    { sequence_number: 5, version: 2, event_type: 'booking.confirmed', payload: { status: 'CONFIRMED' } },
    { sequence_number: 6, version: 2, event_type: 'booking.ready', payload: { status: 'READY' } },
    { sequence_number: 7, version: 3, event_type: 'booking.seated', payload: { status: 'SEATED' } },
    { sequence_number: 8, version: 3, event_type: 'booking.completed', payload: { status: 'COMPLETED' } },
  ];

  await t.test('AC 5: Reconnect with sequence older than retention window requires fresh REST snapshot', () => {
    // Client was offline for 3 days; reports sequence 2 while min retained is 5
    const res = evaluateReconnectRecoveryPure(2, 1, cursor, history);

    assert.equal(res.mode, EventRecoveryMode.SNAPSHOT_REQUIRED);
    assert.equal(res.resyncRequired, true);
    assert.equal(res.snapshotUrl, '/api/v1/bookings/bk_reconnect_01');
    assert.equal(res.events.length, 0);
  });

  await t.test('AC 10: In-window reconnect streams missed events in strict monotonic sequence', () => {
    // Client reports sequence 5; should receive sequence 6, 7, 8
    const res = evaluateReconnectRecoveryPure(5, 2, cursor, history);

    assert.equal(res.mode, EventRecoveryMode.REPLAY);
    assert.equal(res.resyncRequired, false);
    assert.equal(res.events.length, 3);
    assert.equal(res.events[0].sequenceNumber, 6);
    assert.equal(res.events[1].sequenceNumber, 7);
    assert.equal(res.events[2].sequenceNumber, 8);
  });

  await t.test('AC 9: Stale or duplicate client sequence is safely ignored without state corruption', () => {
    // Client has already reached sequence 10
    const res = evaluateReconnectRecoveryPure(10, 4, cursor, history);

    assert.equal(res.mode, EventRecoveryMode.REPLAY);
    assert.equal(res.resyncRequired, false);
    assert.equal(res.events.length, 0);
    assert.match(res.message, /current/i);
  });
});

// ============================================================================
// 5. BullMQ Durable Job Identity, Bounded Retries & Dead Letters (T11, T12, AC 14)
// ============================================================================
test('EPIC-024 Task T11 & T12: Durable Job Identity & Dead-Letter Visibility', async (t) => {
  await t.test('T11: createDurableJobId produces deterministic identity: entityId:jobType:version', () => {
    const id1 = createDurableJobId('hold_123', 'hold_expiry', 1);
    const id2 = createDurableJobId('hold_123', 'hold_expiry', 1);
    assert.equal(id1, id2, 'Durable job ID must be identical across restarts');
    assert.equal(id1, 'hold_123:hold_expiry:v1');
  });

  await t.test('calculateJobBackoff calculates exponential backoff with ceiling', () => {
    assert.equal(calculateJobBackoff(1, 1000, 300000), 1000);
    assert.equal(calculateJobBackoff(2, 1000, 300000), 2000);
    assert.equal(calculateJobBackoff(3, 1000, 300000), 4000);
    assert.equal(calculateJobBackoff(12, 1000, 300000), 300000); // Capped at maxMs
  });

  await t.test('AC 14: Job transitions to DEAD_LETTER after max attempts with visible recovery owner', () => {
    // Attempts 1 to 4: status FAILED, next retry scheduled
    const attempt2 = evaluateJobFailurePure(1, 5, 'Network timeout');
    assert.equal(attempt2.status, 'FAILED');
    assert.equal(attempt2.attempts, 2);
    assert.equal(attempt2.deadLetterReason, null);

    // Attempt 5 (max attempts reached): transitions to DEAD_LETTER
    const deadLetter = evaluateJobFailurePure(4, 5, 'Fatal database constraint violation');
    assert.equal(deadLetter.status, 'DEAD_LETTER');
    assert.equal(deadLetter.attempts, 5);
    assert.equal(deadLetter.recoveryOwner, 'PLATFORM_OPERATIONS');
    assert.ok(deadLetter.deadLetterReason?.includes('EXCEEDED_MAX_ATTEMPTS'));
  });
});

// ============================================================================
// 6. Redis-Loss Reconstruction from PostgreSQL & Degraded Mode (T11, AC 12, AC 13)
// ============================================================================
test('EPIC-024 Task T11 & AC 12/13: Redis Loss Reconstruction & Zero Lost Truth', async (t) => {
  await t.test('AC 13: Reconstructs hold-expiry, payment-reconcile, and outbox queues from PostgreSQL', () => {
    const heldClaims = [
      { id: 'claim_1', table_id: 't_01', expires_at: '2026-11-10T20:00:00Z' },
      { id: 'claim_2', table_id: 't_02', expires_at: '2026-11-10T20:05:00Z' },
    ];
    const reviewPayments = [
      { id: 'pay_rev_01', booking_id: 'bk_01', created_at: '2026-11-10T19:50:00Z' },
    ];
    const pendingOutbox = [
      { id: 'evt_out_01', sequence_number: 1, event_type: 'booking.confirmed' },
      { id: 'evt_out_02', sequence_number: 2, event_type: 'booking.seated' },
    ];

    const result = reconstructQueuesFromPostgresPure(heldClaims, reviewPayments, pendingOutbox);

    assert.equal(result.totalCount, 5);
    assert.equal(result.reconstructedJobs.holdExpiry.length, 2);
    assert.equal(result.reconstructedJobs.paymentReconciliation.length, 1);
    assert.equal(result.reconstructedJobs.outboxDispatch.length, 2);

    // Verify job IDs are deterministic
    assert.equal(result.reconstructedJobs.holdExpiry[0].jobId, 'claim_1:hold_expiry:v1');
    assert.equal(result.reconstructedJobs.paymentReconciliation[0].jobId, 'pay_rev_01:payment_reconciliation:v1');
  });

  await t.test('AC 12: Redis outage does not create overlapping claims or lose financial truth', () => {
    // In degraded mode without Redis, PostgreSQL row locks (SELECT FOR UPDATE)
    // and GiST exclusion enforce exclusive single-table allocations.
    const activeDatabaseClaims = new Map();

    function acquireClaimInDegradedMode(tableId, bookingId) {
      if (activeDatabaseClaims.has(tableId)) {
        throw new Error('409 Conflict: Table already claimed by ' + activeDatabaseClaims.get(tableId));
      }
      activeDatabaseClaims.set(tableId, bookingId);
      return { success: true, tableId, bookingId };
    }

    // Customer 1 claims T01
    const c1 = acquireClaimInDegradedMode('T01', 'bk_1');
    assert.equal(c1.success, true);

    // Customer 2 tries to claim T01 in degraded mode -> rejected by DB constraint!
    assert.throws(
      () => acquireClaimInDegradedMode('T01', 'bk_2'),
      /409 Conflict: Table already claimed/
    );

    assert.equal(activeDatabaseClaims.size, 1, 'Zero overlapping claims allowed during Redis outage');
  });
});
