const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WaitlistService,
  evaluateWaiterEligibility,
  isOfferExpired,
  calculateOfferRemainingSeconds,
  sortWaitlistFifo,
  calculateQueuePosition,
  DEFAULT_OFFER_TTL_SECONDS,
} = require('../../apps/api/dist/modules/waitlist/waitlist.service');

const {
  WaitlistStatus,
  WaitlistOfferStatus,
  WaitlistSkipReason,
  BookingStatus,
  AllocationStatus,
  PolicyMode,
} = require('../../packages/contracts/dist/enums');

const { ErrorCode } = require('../../packages/contracts/dist/errors');

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  AppError,
} = require('../../apps/api/dist/common/errors/app-error');

// ============================================================================
// 1. Pure Helper Functions & Queue Evaluation Unit Tests (T01 & T04)
// ============================================================================
test('EPIC-012: Waiter Eligibility Evaluation Pure Logic (T01 & T04)', async (t) => {
  const table = { min_capacity: 2, max_capacity: 4, is_active: true };

  await t.test('Party size within capacity bounds is eligible', () => {
    const res = evaluateWaiterEligibility({ party_size: 2 }, table);
    assert.equal(res.eligible, true);
    assert.equal(res.reason, undefined);
  });

  await t.test('Party size exceeding table capacity returns PARTY_SIZE_TOO_LARGE', () => {
    const res = evaluateWaiterEligibility({ party_size: 6 }, table);
    assert.equal(res.eligible, false);
    assert.equal(res.reason, WaitlistSkipReason.PARTY_SIZE_TOO_LARGE);
  });

  await t.test('Party size below minimum capacity returns PARTY_SIZE_TOO_SMALL', () => {
    const res = evaluateWaiterEligibility({ party_size: 1 }, table);
    assert.equal(res.eligible, false);
    assert.equal(res.reason, WaitlistSkipReason.PARTY_SIZE_TOO_SMALL);
  });

  await t.test('Inactive table returns CAPACITY_MISMATCH / ineligible', () => {
    const res = evaluateWaiterEligibility({ party_size: 2 }, { ...table, is_active: false });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, WaitlistSkipReason.CAPACITY_MISMATCH);
  });

  await t.test('Closed restaurant returns RESTAURANT_CLOSED', () => {
    const res = evaluateWaiterEligibility({ party_size: 2 }, table, { isRestaurantOpen: false });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, WaitlistSkipReason.RESTAURANT_CLOSED);
  });

  await t.test('Conflicting allocation returns INTERVAL_CONFLICT', () => {
    const res = evaluateWaiterEligibility({ party_size: 2 }, table, { hasConflictingAllocation: true });
    assert.equal(res.eligible, false);
    assert.equal(res.reason, WaitlistSkipReason.INTERVAL_CONFLICT);
  });
});

test('EPIC-012: FIFO Sorting & Queue Position Invariants (T01)', async (t) => {
  await t.test('Deterministic FIFO ordering sorts by created_at then id tie-break', () => {
    const t0 = new Date('2026-11-10T18:00:00Z');
    const t1 = new Date('2026-11-10T18:05:00Z');
    const entries = [
      { id: 'entry_b', created_at: t0 },
      { id: 'entry_c', created_at: t1 },
      { id: 'entry_a', created_at: t0 },
    ];
    const sorted = sortWaitlistFifo(entries);
    assert.deepEqual(
      sorted.map((e) => e.id),
      ['entry_a', 'entry_b', 'entry_c']
    );
  });

  await t.test('Queue position calculation reflects 1-indexed FIFO rank among WAITING entries only', () => {
    const entries = [
      { id: 'w1', status: 'WAITING', created_at: '2026-11-10T18:00:00Z' },
      { id: 'w2', status: 'CANCELLED', created_at: '2026-11-10T18:01:00Z' },
      { id: 'w3', status: 'WAITING', created_at: '2026-11-10T18:02:00Z' },
      { id: 'w4', status: 'SEATED', created_at: '2026-11-10T18:03:00Z' },
      { id: 'w5', status: 'WAITING', created_at: '2026-11-10T18:04:00Z' },
    ];
    assert.equal(calculateQueuePosition(entries, 'w1'), 1);
    assert.equal(calculateQueuePosition(entries, 'w3'), 2);
    assert.equal(calculateQueuePosition(entries, 'w5'), 3);
  });
});

test('EPIC-012: Offer Expiry & Countdown Logic (T02 & T04)', async (t) => {
  await t.test('Offer is expired when expires_at is past or equal to now', () => {
    const now = new Date('2026-11-10T19:00:00Z');
    const pastOffer = {
      status: 'OFFERED',
      expires_at: new Date('2026-11-10T18:59:59Z'),
    };
    const activeOffer = {
      status: 'OFFERED',
      expires_at: new Date('2026-11-10T19:01:00Z'),
    };
    const acceptedPastOffer = {
      status: 'ACCEPTED',
      expires_at: new Date('2026-11-10T18:59:59Z'),
    };

    assert.equal(isOfferExpired(pastOffer, now), true);
    assert.equal(isOfferExpired(activeOffer, now), false);
    assert.equal(isOfferExpired(acceptedPastOffer, now), false);
  });

  await t.test('Remaining seconds calculates difference or clamps to 0', () => {
    const now = new Date('2026-11-10T19:00:00Z');
    const in30s = new Date('2026-11-10T19:00:30Z');
    const past = new Date('2026-11-10T18:59:00Z');

    assert.equal(calculateOfferRemainingSeconds(in30s, now), 30);
    assert.equal(calculateOfferRemainingSeconds(past, now), 0);
  });
});

// ============================================================================
// 2. Service Layer: Duplicate Entry Prevention & Queue Joining (T01)
// ============================================================================
test('EPIC-012: Join Waitlist Queue & Duplicate Prevention (T01)', async (t) => {
  await t.test('Rejects invalid party size with ValidationError', async () => {
    const mockDb = { getPool: () => ({ query: async () => ({ rows: [] }) }) };
    const service = new WaitlistService(mockDb);

    await assert.rejects(
      async () => service.joinWaitlist('user_1', 'rest_1', 0, '2026-11-10T19:00:00Z'),
      ValidationError
    );
  });

  await t.test('Rejects duplicate active entry for same user, restaurant, and slot with 409 Conflict', async () => {
    const mockPool = {
      query: async (sql, params) => {
        if (sql.includes('FROM restaurants')) {
          return { rows: [{ id: 'rest_1', default_duration_min: 90, turnover_buffer_min: 15 }] };
        }
        if (sql.includes('FROM waitlist_entries') && sql.includes('LIMIT 1')) {
          // Found duplicate active entry
          return { rows: [{ id: 'existing_entry_1' }] };
        }
        return { rows: [] };
      },
    };
    const service = new WaitlistService({ getPool: () => mockPool });

    await assert.rejects(
      async () => service.joinWaitlist('user_1', 'rest_1', 2, '2026-11-10T19:00:00Z'),
      (err) => {
        assert.ok(err instanceof ConflictError);
        assert.equal(err.code, ErrorCode.WAITLIST_DUPLICATE_ENTRY);
        return true;
      }
    );
  });

  await t.test('Successfully creates waitlist entry and computes queue position', async () => {
    const createdRow = {
      id: 'entry_new',
      restaurant_id: 'rest_1',
      user_id: 'user_1',
      party_size: 2,
      requested_start: '2026-11-10T19:00:00.000Z',
      requested_end: '2026-11-10T20:45:00.000Z',
      table_id: null,
      status: 'WAITING',
      priority_score: 0,
      created_at: '2026-11-10T18:00:00.000Z',
    };

    const executedQueries = [];
    const mockPool = {
      query: async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM restaurants')) {
          return { rows: [{ id: 'rest_1', default_duration_min: 90, turnover_buffer_min: 15, timezone: 'UTC' }] };
        }
        if (sql.includes('FROM waitlist_entries') && sql.includes('LIMIT 1')) {
          return { rows: [] }; // No duplicate
        }
        if (sql.includes('INSERT INTO waitlist_entries')) {
          return { rows: [createdRow] };
        }
        if (sql.includes('COUNT(*)::int as count')) {
          return { rows: [{ count: 3 }] };
        }
        return { rows: [] };
      },
    };

    const service = new WaitlistService({ getPool: () => mockPool });
    const res = await service.joinWaitlist('user_1', 'rest_1', 2, '2026-11-10T19:00:00Z');

    assert.equal(res.id, 'entry_new');
    assert.equal(res.position, 3);
    assert.equal(res.status, 'WAITING');
    assert.equal(res.estimated_wait_minutes, 270);

    // Verify outbox event and audit log were emitted
    const outboxInsert = executedQueries.find((q) => q.sql.includes('INSERT INTO outbox_events'));
    assert.ok(outboxInsert, 'Must emit waitlist.joined outbox event');
    assert.equal(outboxInsert.params[2], 'waitlist.joined');
  });
});

// ============================================================================
// 3. Service Layer: Exclusive Promotion & Concurrency Protection (T02)
// ============================================================================
test('EPIC-012: Exclusive Offer Promotion & Concurrency Invariants (T02)', async (t) => {
  await t.test('Active exclusive offer on table prevents second promoter from creating competing offer', async () => {
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('FROM restaurant_tables')) {
          return { rows: [{ id: 'tab_1', min_capacity: 2, max_capacity: 4, is_active: true }] };
        }
        if ((sql.includes('FROM waitlist_offers') && sql.includes('status = \'OFFERED\''))) {
          // Concurrency collision: another worker already extended an active offer!
          return { rows: [{ id: 'existing_offer_1', expires_at: new Date(Date.now() + 30000) }] };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    const res = await service.promoteNextEligibleWaiter(
      'rest_1',
      'tab_1',
      '2026-11-10T19:00:00Z',
      '2026-11-10T20:45:00Z'
    );

    assert.equal(res.promoted, false);
    assert.equal(res.reason, 'ACTIVE_OFFER_EXISTS');
    assert.equal(res.allocation_status, 'OFFER_HELD');
  });

  await t.test('Promotes first eligible waiter in FIFO order with OFFER_HELD allocation', async () => {
    const waiters = [
      { id: 'w1', user_id: 'u1', party_size: 2, requested_start: '2026-11-10T19:00:00Z', created_at: '2026-11-10T18:00:00Z' },
      { id: 'w2', user_id: 'u2', party_size: 4, requested_start: '2026-11-10T19:00:00Z', created_at: '2026-11-10T18:05:00Z' },
    ];

    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql, params });
        if (sql.includes('FROM restaurant_tables')) {
          return { rows: [{ id: 'tab_1', min_capacity: 2, max_capacity: 4, is_active: true }] };
        }
        if ((sql.includes('FROM waitlist_offers') && sql.includes('status = \'OFFERED\''))) {
          return { rows: [] }; // No existing offer
        }
        if ((sql.includes('FROM waitlist_entries') && sql.includes('status = \'WAITING\''))) {
          return { rows: waiters };
        }
        if (sql.includes('INSERT INTO table_allocations')) {
          return { rows: [{ id: 'alloc_new_1' }] };
        }
        if (sql.includes('INSERT INTO waitlist_offers')) {
          return { rows: [{ id: 'offer_new_1' }] };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    const res = await service.promoteNextEligibleWaiter(
      'rest_1',
      'tab_1',
      '2026-11-10T19:00:00Z',
      '2026-11-10T20:45:00Z'
    );

    assert.equal(res.promoted, true);
    assert.equal(res.offer_id, 'offer_new_1');
    assert.equal(res.waitlist_entry_id, 'w1');
    assert.equal(res.allocation_status, 'OFFER_HELD');
    assert.equal(res.skipped_count, 0);

    // Verify allocation created with status OFFER_HELD
    const allocInsert = executed.find((q) => q.sql.includes('INSERT INTO table_allocations'));
    assert.ok(allocInsert);
    assert.ok(allocInsert.sql.includes('OFFER_HELD'));

    // Verify outbox event emitted
    const outboxInsert = executed.find((q) => q.sql.includes('INSERT INTO outbox_events'));
    assert.ok(outboxInsert);
    assert.equal(outboxInsert.params[2], 'waitlist.offer_extended');
  });
});

// ============================================================================
// 4. Service Layer: Bounded Skip Reasons & Public Release (T04 & T05)
// ============================================================================
test('EPIC-012: Ineligible Waiter Skipping & Public Availability (T04 & T05)', async (t) => {
  await t.test('Ineligible first waiter (party size 6 on 4-top) is skipped with recorded reason; 2nd waiter promoted', async () => {
    const waiters = [
      { id: 'w_ineligible', user_id: 'u_large', party_size: 6, requested_start: '2026-11-10T19:00:00Z', created_at: '2026-11-10T18:00:00Z' },
      { id: 'w_eligible', user_id: 'u_fit', party_size: 3, requested_start: '2026-11-10T19:00:00Z', created_at: '2026-11-10T18:05:00Z' },
    ];

    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql, params });
        if (sql.includes('FROM restaurant_tables')) {
          return { rows: [{ id: 'tab_1', min_capacity: 2, max_capacity: 4, is_active: true }] };
        }
        if ((sql.includes('FROM waitlist_offers') && sql.includes('status = \'OFFERED\''))) {
          return { rows: [] };
        }
        if ((sql.includes('FROM waitlist_entries') && sql.includes('status = \'WAITING\''))) {
          return { rows: waiters };
        }
        if (sql.includes('INSERT INTO table_allocations')) {
          return { rows: [{ id: 'alloc_1' }] };
        }
        if (sql.includes('INSERT INTO waitlist_offers')) {
          return { rows: [{ id: 'offer_1' }] };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    const res = await service.promoteNextEligibleWaiter(
      'rest_1',
      'tab_1',
      '2026-11-10T19:00:00Z',
      '2026-11-10T20:45:00Z'
    );

    assert.equal(res.promoted, true);
    assert.equal(res.waitlist_entry_id, 'w_eligible');
    assert.equal(res.skipped_count, 1);

    // Verify skip was recorded in waitlist_skip_logs
    const skipInsert = executed.find((q) => q.sql.includes('INSERT INTO waitlist_skip_logs'));
    assert.ok(skipInsert, 'Must record skip in waitlist_skip_logs');
    assert.equal(skipInsert.params[0], 'w_ineligible');
    assert.equal(skipInsert.params[3], WaitlistSkipReason.PARTY_SIZE_TOO_LARGE);
  });

  await t.test('No eligible waiters leaves table released to public availability', async () => {
    const waiters = [
      { id: 'w_too_large', user_id: 'u1', party_size: 8, requested_start: '2026-11-10T19:00:00Z', created_at: '2026-11-10T18:00:00Z' },
    ];

    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql, params });
        if (sql.includes('FROM restaurant_tables')) {
          return { rows: [{ id: 'tab_1', min_capacity: 2, max_capacity: 4, is_active: true }] };
        }
        if ((sql.includes('FROM waitlist_offers') && sql.includes('status = \'OFFERED\''))) {
          return { rows: [] };
        }
        if ((sql.includes('FROM waitlist_entries') && sql.includes('status = \'WAITING\''))) {
          return { rows: waiters };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    const res = await service.promoteNextEligibleWaiter(
      'rest_1',
      'tab_1',
      '2026-11-10T19:00:00Z',
      '2026-11-10T20:45:00Z',
      { existingAllocationId: 'existing_alloc_1' }
    );

    assert.equal(res.promoted, false);
    assert.equal(res.allocation_status, 'RELEASED');
    assert.equal(res.reason, 'NO_ELIGIBLE_WAITERS');
    assert.equal(res.skipped_count, 1);

    // Verify allocation was updated to RELEASED
    const allocUpdate = executed.find((q) => q.sql.includes('UPDATE table_allocations SET status = $1'));
    assert.ok(allocUpdate);
    assert.equal(allocUpdate.params[0], 'RELEASED');
  });
});

// ============================================================================
// 5. Service Layer: Explicit Accept/Decline & Zero Auto-Charge Invariant (T03)
// ============================================================================
test('EPIC-012: Explicit Accept/Decline & Zero Auto-Charge Invariant (T03)', async (t) => {
  const baseOffer = {
    id: 'off_1',
    waitlist_entry_id: 'we_1',
    restaurant_id: 'rest_1',
    table_id: 'tab_1',
    allocation_id: 'alloc_1',
    offered_start: '2026-11-10T19:00:00Z',
    offered_end: '2026-11-10T20:45:00Z',
    expires_at: new Date(Date.now() + 50000).toISOString(),
    status: 'OFFERED',
    user_id: 'cust_alice',
    party_size: 2,
    requested_start: '2026-11-10T19:00:00Z',
    requested_end: '2026-11-10T20:45:00Z',
    allocation_status: 'OFFER_HELD',
    dining_period: '["2026-11-10 19:00:00+00","2026-11-10 20:45:00+00")',
  };

  await t.test('Accepting FREE_RESERVATION offer directly confirms booking without payment order', async () => {
    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql, params });
        if (sql.includes('FROM waitlist_offers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                ...baseOffer,
                policy_mode: PolicyMode.FREE_RESERVATION,
                deposit_amount_minor: 0,
                currency: 'INR',
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO bookings')) {
          return { rows: [{ id: 'booking_free_1' }] };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    const res = await service.acceptOffer('off_1', 'cust_alice');

    assert.equal(res.booking_id, 'booking_free_1');
    assert.equal(res.status, BookingStatus.CONFIRMED);
    assert.equal(res.policy_mode, PolicyMode.FREE_RESERVATION);
    assert.equal(res.payment_order_required, false);

    // Verify booking created with CONFIRMED status
    const bookingInsert = executed.find((q) => q.sql.includes('INSERT INTO bookings'));
    assert.ok(bookingInsert);
    assert.equal(bookingInsert.params[6], BookingStatus.CONFIRMED);

    // Verify allocation updated to CONFIRMED
    const allocUpdate = executed.find((q) => q.sql.includes('UPDATE table_allocations'));
    assert.ok(allocUpdate);
    assert.equal(allocUpdate.params[0], AllocationStatus.CONFIRMED);
  });

  await t.test('Accepting DEPOSIT_REQUIRED offer NEVER auto-charges; advances to PAYMENT_PENDING with checkout requirement', async () => {
    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql, params });
        if (sql.includes('FROM waitlist_offers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                ...baseOffer,
                policy_mode: PolicyMode.DEPOSIT_REQUIRED,
                deposit_amount_minor: 25000,
                currency: 'INR',
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO bookings')) {
          return { rows: [{ id: 'booking_deposit_1' }] };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    const res = await service.acceptOffer('off_1', 'cust_alice');

    assert.equal(res.booking_id, 'booking_deposit_1');
    assert.equal(res.status, BookingStatus.PAYMENT_PENDING);
    assert.equal(res.policy_mode, PolicyMode.DEPOSIT_REQUIRED);
    assert.equal(res.payment_order_required, true);
    assert.equal(res.amount_minor, 25000);
    assert.equal(res.currency, 'INR');

    // Invariant: Customer is NOT charged automatically; booking status is PAYMENT_PENDING
    const bookingInsert = executed.find((q) => q.sql.includes('INSERT INTO bookings'));
    assert.ok(bookingInsert);
    assert.equal(bookingInsert.params[6], BookingStatus.PAYMENT_PENDING);

    const allocUpdate = executed.find((q) => q.sql.includes('UPDATE table_allocations'));
    assert.ok(allocUpdate);
    assert.equal(allocUpdate.params[0], AllocationStatus.PAYMENT_PENDING);
  });

  await t.test('Late accept past expiry is rejected with 410 ExpiredError and releases table', async () => {
    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql, params });
        if (sql.includes('FROM waitlist_offers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                ...baseOffer,
                expires_at: new Date(Date.now() - 5000).toISOString(), // 5 seconds in the past!
                policy_mode: PolicyMode.FREE_RESERVATION,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    await assert.rejects(
      async () => service.acceptOffer('off_1', 'cust_alice'),
      (err) => {
        assert.ok(err instanceof ExpiredError);
        assert.equal(err.code, ErrorCode.OFFER_EXPIRED);
        return true;
      }
    );

    // Verify allocation was released
    const allocUpdate = executed.find((q) => q.sql.includes('UPDATE table_allocations SET status = $1'));
    assert.ok(allocUpdate);
    assert.equal(allocUpdate.params[0], 'RELEASED');
  });

  await t.test('IDOR: Unauthorized user attempting to accept offer is rejected with 403 Forbidden', async () => {
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('FROM waitlist_offers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                ...baseOffer,
                user_id: 'cust_alice', // belongs to alice
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    await assert.rejects(
      async () => service.acceptOffer('off_1', 'mallory_attacker'),
      ForbiddenError
    );
  });

  await t.test('Declining offer safely releases allocation and triggers cascade', async () => {
    const executed = [];
    const mockClient = {
      query: async (sql, params) => {
        executed.push({ sql, params });
        if (sql.includes('FROM waitlist_offers') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                id: 'off_1',
                waitlist_entry_id: 'we_1',
                restaurant_id: 'rest_1',
                table_id: 'tab_1',
                allocation_id: 'alloc_1',
                status: 'OFFERED',
                user_id: 'cust_alice',
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new WaitlistService(mockDb);

    const res = await service.declineOffer('off_1', 'cust_alice');

    assert.equal(res.status, 'DECLINED');
    assert.equal(res.released, true);

    const allocUpdate = executed.find((q) => q.sql.includes('UPDATE table_allocations SET status = $1'));
    assert.ok(allocUpdate);
    assert.equal(allocUpdate.params[0], 'RELEASED');
  });
});
