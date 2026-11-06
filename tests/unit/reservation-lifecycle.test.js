const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VALID_BOOKING_TRANSITIONS,
  BOOKING_TO_ALLOCATION_STATUS_MAP,
  isValidBookingTransition,
  mapBookingToAllocationStatus,
  isTerminalBookingStatus,
  isCancellableBookingStatus,
  isHoldSafelyExpired,
  ReservationsService,
} = require('../../apps/api/dist/modules/reservations/reservations.service');

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  InvalidStateTransitionError,
  AppError,
} = require('../../apps/api/dist/common/errors/app-error');

// ============================================================================
// 1. State Transition Matrix & Allocation Mapping Tests (T01)
// ============================================================================
test('EPIC-009: State Transition Matrix & Allocation Mapping (T01)', async (t) => {
  await t.test('All canonical allowed transitions evaluate to true', () => {
    // HOLD_ACTIVE transitions
    assert.equal(isValidBookingTransition('HOLD_ACTIVE', 'CONFIRMED'), true);
    assert.equal(isValidBookingTransition('HOLD_ACTIVE', 'PAYMENT_PENDING'), true);
    assert.equal(isValidBookingTransition('HOLD_ACTIVE', 'EXPIRED'), true);
    assert.equal(isValidBookingTransition('HOLD_ACTIVE', 'CANCELLED'), true);

    // PAYMENT_PENDING transitions
    assert.equal(isValidBookingTransition('PAYMENT_PENDING', 'CONFIRMED'), true);
    assert.equal(isValidBookingTransition('PAYMENT_PENDING', 'PAYMENT_REVIEW'), true);
    assert.equal(isValidBookingTransition('PAYMENT_PENDING', 'PAYMENT_FAILED'), true);
    assert.equal(isValidBookingTransition('PAYMENT_PENDING', 'CANCELLED'), true);

    // PAYMENT_REVIEW transitions
    assert.equal(isValidBookingTransition('PAYMENT_REVIEW', 'CONFIRMED'), true);
    assert.equal(isValidBookingTransition('PAYMENT_REVIEW', 'EXPIRED'), true);

    // CONFIRMED transitions
    assert.equal(isValidBookingTransition('CONFIRMED', 'READY'), true);
    assert.equal(isValidBookingTransition('CONFIRMED', 'SEATED'), true);
    assert.equal(isValidBookingTransition('CONFIRMED', 'CANCELLED'), true);
    assert.equal(isValidBookingTransition('CONFIRMED', 'NO_SHOW'), true);

    // READY transitions
    assert.equal(isValidBookingTransition('READY', 'SEATED'), true);
    assert.equal(isValidBookingTransition('READY', 'CANCELLED'), true);
    assert.equal(isValidBookingTransition('READY', 'NO_SHOW'), true);

    // SEATED transitions
    assert.equal(isValidBookingTransition('SEATED', 'COMPLETED'), true);
  });

  await t.test('Disallowed and terminal transitions evaluate to false', () => {
    // Skipping service steps
    assert.equal(isValidBookingTransition('HOLD_ACTIVE', 'READY'), false);
    assert.equal(isValidBookingTransition('HOLD_ACTIVE', 'SEATED'), false);
    assert.equal(isValidBookingTransition('HOLD_ACTIVE', 'COMPLETED'), false);
    assert.equal(isValidBookingTransition('CONFIRMED', 'COMPLETED'), false);
    assert.equal(isValidBookingTransition('READY', 'COMPLETED'), false);

    // Backward transitions
    assert.equal(isValidBookingTransition('SEATED', 'READY'), false);
    assert.equal(isValidBookingTransition('SEATED', 'CONFIRMED'), false);
    assert.equal(isValidBookingTransition('COMPLETED', 'SEATED'), false);
    assert.equal(isValidBookingTransition('CANCELLED', 'CONFIRMED'), false);

    // Terminal states allow zero transitions
    assert.equal(isValidBookingTransition('COMPLETED', 'CANCELLED'), false);
    assert.equal(isValidBookingTransition('CANCELLED', 'READY'), false);
    assert.equal(isValidBookingTransition('NO_SHOW', 'SEATED'), false);
    assert.equal(isValidBookingTransition('EXPIRED', 'CONFIRMED'), false);
    assert.equal(isValidBookingTransition('PAYMENT_FAILED', 'CONFIRMED'), false);
  });

  await t.test('Terminal and cancellable status helpers classify states correctly', () => {
    assert.equal(isTerminalBookingStatus('COMPLETED'), true);
    assert.equal(isTerminalBookingStatus('CANCELLED'), true);
    assert.equal(isTerminalBookingStatus('NO_SHOW'), true);
    assert.equal(isTerminalBookingStatus('EXPIRED'), true);
    assert.equal(isTerminalBookingStatus('PAYMENT_FAILED'), true);
    assert.equal(isTerminalBookingStatus('CONFIRMED'), false);
    assert.equal(isTerminalBookingStatus('READY'), false);
    assert.equal(isTerminalBookingStatus('SEATED'), false);

    assert.equal(isCancellableBookingStatus('HOLD_ACTIVE'), true);
    assert.equal(isCancellableBookingStatus('PAYMENT_PENDING'), true);
    assert.equal(isCancellableBookingStatus('CONFIRMED'), true);
    assert.equal(isCancellableBookingStatus('READY'), true);
    assert.equal(isCancellableBookingStatus('SEATED'), false);
    assert.equal(isCancellableBookingStatus('COMPLETED'), false);
    assert.equal(isCancellableBookingStatus('CANCELLED'), false);
  });

  await t.test('Allocation mapping correctly synchronizes inventory states', () => {
    assert.equal(mapBookingToAllocationStatus('HOLD_ACTIVE'), 'HELD');
    assert.equal(mapBookingToAllocationStatus('PAYMENT_PENDING'), 'PAYMENT_PENDING');
    assert.equal(mapBookingToAllocationStatus('PAYMENT_REVIEW'), 'PAYMENT_REVIEW');
    assert.equal(mapBookingToAllocationStatus('CONFIRMED'), 'CONFIRMED');
    assert.equal(mapBookingToAllocationStatus('READY'), 'READY');
    assert.equal(mapBookingToAllocationStatus('SEATED'), 'SEATED');
    assert.equal(mapBookingToAllocationStatus('COMPLETED'), 'COMPLETED');
    assert.equal(mapBookingToAllocationStatus('CANCELLED'), 'CANCELLED');
    assert.equal(mapBookingToAllocationStatus('NO_SHOW'), 'RELEASED');
    assert.equal(mapBookingToAllocationStatus('EXPIRED'), 'RELEASED');
    assert.equal(mapBookingToAllocationStatus('PAYMENT_FAILED'), 'RELEASED');
  });
});

// ============================================================================
// 2. Free Reservation Confirmation & Customer Reads Tests (T02)
// ============================================================================
test('EPIC-009: Free Booking & Customer Reads (T02)', async (t) => {
  const mockRestaurant = {
    id: 'b0000000-0000-0000-0000-000000000001',
    name: 'The Royal Dine Bistro',
    timezone: 'Asia/Kolkata',
    policy_mode: 'FREE_RESERVATION',
    deposit_amount_minor: 0,
    deposit_currency: 'INR',
    default_duration_min: 90,
    turnover_buffer_min: 15,
    policy_version: 1,
    min_party_size: 1,
    max_party_size: 12,
    is_published: true,
    status: 'PUBLISHED',
  };

  const mockDepositRestaurant = {
    ...mockRestaurant,
    id: 'b0000000-0000-0000-0000-000000000002',
    name: 'The Grand Palace',
    policy_mode: 'DEPOSIT_REQUIRED',
    deposit_amount_minor: 50000,
  };

  const mockTable = {
    id: 'f0000000-0000-0000-0000-000000000004',
    floor_id: 'd0000000-0000-0000-0000-000000000001',
    floor_name: 'Main Room',
    restaurant_id: 'b0000000-0000-0000-0000-000000000001',
    table_number: 'T04',
    capacity: 4,
    min_covers: 2,
    is_active: true,
  };

  const mockDepositTable = {
    ...mockTable,
    restaurant_id: mockDepositRestaurant.id,
  };

  await t.test('createFreeBooking creates CONFIRMED booking and allocation', async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM restaurant_tables')) {
          return { rows: [mockTable] };
        }
        if (sql.includes('FROM restaurants')) {
          return { rows: [mockRestaurant] };
        }
        if (sql.includes('FROM table_blocks')) {
          return { rows: [] };
        }
        if (sql.includes('FROM table_allocations') && sql.includes('FOR UPDATE')) {
          return { rows: [] }; // No overlap
        }
        if (sql.includes('INSERT INTO bookings')) {
          return { rows: [{ id: 'book_new_1', created_at: new Date(), updated_at: new Date() }] };
        }
        if (sql.includes('INSERT INTO table_allocations')) {
          return { rows: [{ id: 'alloc_new_1' }] };
        }
        if (sql.includes('INSERT INTO booking_status_events')) {
          return { rows: [{ id: 'evt_new_1', created_at: new Date() }] };
        }
        return { rows: [] };
      },
    };

    const mockDb = {
      withTransaction: async (cb) => cb(mockClient),
      getPool: () => mockClient,
    };

    const service = new ReservationsService(mockDb);
    const result = await service.createFreeBooking('cust_alice', {
      restaurant_id: mockRestaurant.id,
      table_id: mockTable.id,
      party_size: 4,
      requested_start: '2026-11-10T19:00:00Z',
    });

    assert.equal(result.id, 'book_new_1');
    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.version, 1);
    assert.equal(result.party_size, 4);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].sequence_number, 1);
    assert.equal(result.events[0].to_status, 'CONFIRMED');

    // Verify outbox event emitted
    const outboxQuery = executedQueries.find((q) => q.sql.includes('INSERT INTO outbox_events'));
    assert.ok(outboxQuery, 'Must insert outbox event');
    assert.equal(outboxQuery.params[2], 'BOOKING_CONFIRMED');
  });

  await t.test('createFreeBooking rejects restaurant requiring deposit with 422', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM restaurant_tables')) return { rows: [mockDepositTable] };
        if (sql.includes('FROM restaurants')) return { rows: [mockDepositRestaurant] };
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    await assert.rejects(
      () =>
        service.createFreeBooking('cust_alice', {
          restaurant_id: mockDepositRestaurant.id,
          table_id: mockDepositTable.id,
          party_size: 2,
          requested_start: '2026-11-10T19:00:00Z',
        }),
      (err) => err instanceof AppError && err.status === 422 && err.code === 'PAYMENT_REQUIRED'
    );
  });

  await t.test('createFreeBooking cannot allocate occupied inventory (409 Conflict)', async () => {
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM restaurant_tables')) return { rows: [mockTable] };
        if (sql.includes('FROM restaurants')) return { rows: [mockRestaurant] };
        if (sql.includes('FROM table_blocks')) return { rows: [] };
        if (sql.includes('FROM table_allocations') && sql.includes('FOR UPDATE')) {
          // Active conflicting allocation
          return {
            rows: [
              {
                id: 'existing_alloc',
                status: 'CONFIRMED',
                expires_at: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    await assert.rejects(
      () =>
        service.createFreeBooking('cust_alice', {
          restaurant_id: mockRestaurant.id,
          table_id: mockTable.id,
          party_size: 4,
          requested_start: '2026-11-10T19:00:00Z',
        }),
      (err) => err instanceof ConflictError && err.code === 'INVENTORY_HOLD_CONFLICT'
    );
  });

  await t.test('Customer reads enforce IDOR ownership (403 Forbidden)', async () => {
    const mockPool = {
      query: async (sql, params) => {
        if (sql.includes('FROM bookings b')) {
          return {
            rows: [
              {
                id: 'book_alice',
                user_id: 'cust_alice',
                restaurant_id: mockRestaurant.id,
                status: 'CONFIRMED',
                requested_start: new Date(),
                version: 1,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const mockDb = { getPool: () => mockPool };
    const service = new ReservationsService(mockDb);

    // Alice accessing Alice's booking -> succeeds
    const aliceBooking = await service.getCustomerBooking('cust_alice', 'book_alice');
    assert.equal(aliceBooking.id, 'book_alice');

    // Bob attempting to access Alice's booking -> rejected with 403
    await assert.rejects(
      () => service.getCustomerBooking('cust_bob', 'book_alice'),
      (err) => err instanceof ForbiddenError && err.status === 403
    );
  });
});

// ============================================================================
// 3. Policy-Checked Cancellation Orchestration (T03)
// ============================================================================
test('EPIC-009: Policy-Checked Cancellation Orchestration (T03)', async (t) => {
  const futureDate = new Date(Date.now() + 86400000); // 1 day in future

  await t.test('Customer cancels confirmed booking successfully, freeing inventory', async () => {
    const executedQueries = [];
    const mockBooking = {
      id: 'book_cancellable',
      user_id: 'cust_alice',
      restaurant_id: 'rest_1',
      status: 'CONFIRMED',
      requested_start: futureDate,
      version: 1,
      policy_snapshot: { policy_mode: 'FREE_RESERVATION', deposit_amount_minor: 0 },
    };

    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM bookings b') && sql.includes('FOR UPDATE')) {
          return { rows: [mockBooking] };
        }
        if (sql.includes('MAX(sequence_number)')) {
          return { rows: [{ next_seq: 2 }] };
        }
        if (sql.includes('FROM booking_status_events')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    const cancelled = await service.cancelBooking('cust_alice', 'book_cancellable', 'Schedule change');
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.version, 2);
    assert.equal(cancelled.allocation_status, 'CANCELLED');

    // Invariant: table_allocations updated to CANCELLED to exit GiST exclusion
    const allocUpdate = executedQueries.find((q) =>
      q.sql.includes('UPDATE table_allocations') && q.sql.includes('CANCELLED')
    );
    assert.ok(allocUpdate, 'table_allocations must be updated to CANCELLED');

    // Invariant: outbox event emitted
    const outboxInsert = executedQueries.find((q) => q.sql.includes('INSERT INTO outbox_events'));
    assert.ok(outboxInsert);
    assert.ok(outboxInsert.sql.includes('BOOKING_CANCELLED'));
    assert.equal(outboxInsert.params[0], 'book_cancellable');
  });

  await t.test('Customer cannot cancel booking of another customer (403 Forbidden)', async () => {
    const mockBooking = {
      id: 'book_alice',
      user_id: 'cust_alice',
      status: 'CONFIRMED',
      requested_start: futureDate,
      version: 1,
    };
    const mockClient = {
      query: async () => ({ rows: [mockBooking] }),
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    await assert.rejects(
      () => service.cancelBooking('cust_bob', 'book_alice'),
      (err) => err instanceof ForbiddenError && err.status === 403
    );
  });

  await t.test('Cancellation of already COMPLETED booking is rejected with 422', async () => {
    const mockCompletedBooking = {
      id: 'book_done',
      user_id: 'cust_alice',
      status: 'COMPLETED',
      requested_start: futureDate,
      version: 3,
    };
    const mockClient = {
      query: async () => ({ rows: [mockCompletedBooking] }),
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    await assert.rejects(
      () => service.cancelBooking('cust_alice', 'book_done'),
      (err) => err instanceof InvalidStateTransitionError && err.status === 422
    );
  });

  await t.test('Duplicate cancellation is idempotent without duplicate events', async () => {
    let eventsCount = 0;
    const mockCancelledBooking = {
      id: 'book_already_cancelled',
      user_id: 'cust_alice',
      status: 'CANCELLED',
      requested_start: futureDate,
      version: 2,
    };
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('INSERT INTO booking_status_events')) eventsCount++;
        return { rows: [mockCancelledBooking] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    const res = await service.cancelBooking('cust_alice', 'book_already_cancelled');
    assert.equal(res.status, 'CANCELLED');
    assert.equal(eventsCount, 0, 'No duplicate status events should be inserted');
  });
});

// ============================================================================
// 4. Guarded Staff Status Transitions & Tenant Isolation (T04, T05)
// ============================================================================
test('EPIC-009: Guarded Staff Status Transitions & Tenant Isolation (T04, T05)', async (t) => {
  await t.test('Authorized staff advances CONFIRMED -> READY -> SEATED -> COMPLETED', async () => {
    const mockBooking = {
      id: 'book_svc_1',
      restaurant_id: 'rest_1',
      status: 'CONFIRMED',
      version: 1,
      requested_start: new Date(),
    };

    const mockStaffMembership = {
      role: 'HOST',
      status: 'ACTIVE',
    };

    const queries = [];
    const mockClient = {
      query: async (sql, params = []) => {
        queries.push({ sql, params });
        if (sql.includes('FROM bookings b') && sql.includes('FOR UPDATE')) {
          return { rows: [mockBooking] };
        }
        if (sql.includes('FROM restaurant_memberships')) {
          return { rows: [mockStaffMembership] };
        }
        if (sql.includes('MAX(sequence_number)')) {
          return { rows: [{ next_seq: 2 }] };
        }
        if (sql.includes('FROM booking_status_events')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    // 1. CONFIRMED -> READY
    const readyRes = await service.transitionStaffBookingStatus(
      'staff_charlie',
      'book_svc_1',
      'READY',
      1
    );
    assert.equal(readyRes.status, 'READY');
    assert.equal(readyRes.version, 2);
    assert.equal(readyRes.allocation_status, 'READY');

    // 2. READY -> SEATED
    mockBooking.status = 'READY';
    mockBooking.version = 2;
    const seatedRes = await service.transitionStaffBookingStatus(
      'staff_charlie',
      'book_svc_1',
      'SEATED',
      2
    );
    assert.equal(seatedRes.status, 'SEATED');
    assert.equal(seatedRes.version, 3);
    assert.equal(seatedRes.allocation_status, 'SEATED');

    // 3. SEATED -> COMPLETED
    mockBooking.status = 'SEATED';
    mockBooking.version = 3;
    const completedRes = await service.transitionStaffBookingStatus(
      'staff_charlie',
      'book_svc_1',
      'COMPLETED',
      3
    );
    assert.equal(completedRes.status, 'COMPLETED');
    assert.equal(completedRes.version, 4);
    assert.equal(completedRes.allocation_status, 'COMPLETED');
  });

  await t.test('Staff in Restaurant A cannot advance a booking in Restaurant B (403 Forbidden)', async () => {
    const mockBookingRestB = {
      id: 'book_in_rest_B',
      restaurant_id: 'rest_B',
      status: 'CONFIRMED',
      version: 1,
    };

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM bookings b')) return { rows: [mockBookingRestB] };
        if (sql.includes('FROM restaurant_memberships')) return { rows: [] }; // No membership in rest_B
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    await assert.rejects(
      () =>
        service.transitionStaffBookingStatus(
          'staff_rest_A',
          'book_in_rest_B',
          'READY',
          1
        ),
      (err) => err instanceof ForbiddenError && err.message.includes('FORBIDDEN_TENANT_ACCESS')
    );
  });

  await t.test('Optimistic concurrency version mismatch rejects with 409 Conflict', async () => {
    const mockBooking = {
      id: 'book_versioned',
      restaurant_id: 'rest_1',
      status: 'CONFIRMED',
      version: 3, // Current version is 3
    };

    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM bookings b')) return { rows: [mockBooking] };
        if (sql.includes('FROM restaurant_memberships')) return { rows: [{ role: 'MANAGER', status: 'ACTIVE' }] };
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    // Stale caller supplies expected_version = 2
    await assert.rejects(
      () =>
        service.transitionStaffBookingStatus(
          'staff_manager',
          'book_versioned',
          'READY',
          2
        ),
      (err) => err instanceof ConflictError && err.code === 'VERSION_CONFLICT'
    );
  });

  await t.test('Invalid transition (e.g. CONFIRMED -> COMPLETED) rejects with 422', async () => {
    const mockBooking = {
      id: 'book_skip_step',
      restaurant_id: 'rest_1',
      status: 'CONFIRMED',
      version: 1,
    };
    const mockClient = {
      query: async (sql) => {
        if (sql.includes('FROM bookings b')) return { rows: [mockBooking] };
        if (sql.includes('FROM restaurant_memberships')) return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    await assert.rejects(
      () =>
        service.transitionStaffBookingStatus(
          'staff_host',
          'book_skip_step',
          'COMPLETED',
          1
        ),
      (err) => err instanceof InvalidStateTransitionError && err.status === 422
    );
  });

  await t.test('Staff NO_SHOW releases physical table allocation', async () => {
    const executedQueries = [];
    const mockBooking = {
      id: 'book_noshow',
      restaurant_id: 'rest_1',
      status: 'CONFIRMED',
      version: 1,
    };
    const mockClient = {
      query: async (sql, params = []) => {
        executedQueries.push({ sql, params });
        if (sql.includes('FROM bookings b')) return { rows: [mockBooking] };
        if (sql.includes('FROM restaurant_memberships')) return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        if (sql.includes('MAX(sequence_number)')) return { rows: [{ next_seq: 2 }] };
        if (sql.includes('FROM booking_status_events')) return { rows: [] };
        return { rows: [] };
      },
    };
    const mockDb = { withTransaction: async (cb) => cb(mockClient) };
    const service = new ReservationsService(mockDb);

    const res = await service.transitionStaffBookingStatus('staff_host', 'book_noshow', 'NO_SHOW', 1);
    assert.equal(res.status, 'NO_SHOW');
    assert.equal(res.allocation_status, 'RELEASED');

    // Invariant: table_allocations updated to RELEASED
    const allocUpdate = executedQueries.find((q) =>
      q.sql.includes('UPDATE table_allocations SET status = $1')
    );
    assert.ok(allocUpdate);
    assert.equal(allocUpdate.params[0], 'RELEASED');
  });
});
