const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  signCheckInToken,
  verifyCheckInToken,
  OwnerOperationsService,
} = require('../../apps/api/dist/modules/owner-operations/owner-operations.service');

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  AppError,
} = require('../../apps/api/dist/common/errors/app-error');

const { ErrorCode } = require('../../packages/contracts/dist');

const TEST_SECRET = 'super-secret-jwt-key-min-16-chars-long';

// ============================================================================
// 1. QR Check-In Token Cryptographic Signing & Validation (T02)
// ============================================================================
test('EPIC-014: QR Check-in Token Cryptographic Signing & Validation (T02)', async (t) => {
  await t.test('Valid token generates valid HMAC-SHA256 signature and decodes payload', () => {
    const payload = {
      booking_id: '10000000-0000-0000-0000-000000000001',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      exp: Math.floor(Date.now() / 1000) + 3600,
      nonce: 'test_nonce_123',
    };

    const token = signCheckInToken(payload, TEST_SECRET);
    assert.equal(typeof token, 'string');
    assert.equal(token.split('.').length, 3);

    const decoded = verifyCheckInToken(token, TEST_SECRET);
    assert.equal(decoded.booking_id, payload.booking_id);
    assert.equal(decoded.restaurant_id, payload.restaurant_id);
    assert.equal(decoded.nonce, payload.nonce);
  });

  await t.test('Forged signature is rejected with QR_TOKEN_INVALID', () => {
    const payload = {
      booking_id: '10000000-0000-0000-0000-000000000001',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = signCheckInToken(payload, 'wrong-secret-key-123456');

    assert.throws(
      () => verifyCheckInToken(token, TEST_SECRET),
      (err) => err instanceof AppError && err.code === ErrorCode.QR_TOKEN_INVALID
    );
  });

  await t.test('Expired token is rejected with 410 QR_TOKEN_EXPIRED', () => {
    const expiredPayload = {
      booking_id: '10000000-0000-0000-0000-000000000001',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      exp: Math.floor(Date.now() / 1000) - 60, // expired 1 minute ago
    };

    const token = signCheckInToken(expiredPayload, TEST_SECRET);

    assert.throws(
      () => verifyCheckInToken(token, TEST_SECRET),
      (err) => err instanceof AppError && err.code === ErrorCode.QR_TOKEN_EXPIRED
    );
  });

  await t.test('Malformed token structure is rejected with QR_TOKEN_INVALID', () => {
    assert.throws(
      () => verifyCheckInToken('malformed.token', TEST_SECRET),
      (err) => err instanceof AppError && err.code === ErrorCode.QR_TOKEN_INVALID
    );
  });
});

// ============================================================================
// 2. Acceptance Criterion 1: Host A cannot operate Booking/Check-in for Restaurant B
// ============================================================================
test('EPIC-014: Acceptance Criterion 1 - Cross-Tenant Host Denial', async (t) => {
  const restA = 'b0000000-0000-0000-0000-000000000001';
  const restB = 'b0000000-0000-0000-0000-000000000002';

  const hostAUserId = 'a0000000-0000-0000-0000-000000000004';
  const bookingInRestB = {
    id: '10000000-0000-0000-0000-000000000099',
    restaurant_id: restB,
    status: 'CONFIRMED',
    party_size: 2,
    checked_in_at: null,
  };

  const qrTokenForRestB = signCheckInToken(
    {
      booking_id: bookingInRestB.id,
      restaurant_id: restB,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    TEST_SECRET
  );

  const mockClient = {
    query: async (sql, params = []) => {
      // Memberships query: hostA belongs ONLY to restA
      if (sql.includes('FROM restaurant_memberships')) {
        const [targetRestId, userId] = params;
        if (targetRestId === restA && userId === hostAUserId) {
          return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        }
        return { rows: [] }; // No membership in restB
      }
      if (sql.includes('FROM bookings')) {
        return { rows: [bookingInRestB] };
      }
      return { rows: [] };
    },
  };

  const mockDb = {
    withTransaction: async (cb) => cb(mockClient),
    getPool: () => mockClient,
  };

  const service = new OwnerOperationsService(
    mockDb,
    {},
    {},
    {},
    {}
  );

  await t.test('Host A scanning QR for Restaurant B is rejected with 403 Forbidden', async () => {
    // Host A attempts check-in for Rest B's QR token using Rest A's scanner context
    await assert.rejects(
      async () => {
        await service.verifyAndCheckIn(hostAUserId, restA, { qr_token: qrTokenForRestB });
      },
      (err) => {
        assert.equal(err instanceof ForbiddenError, true);
        assert.match(err.message, /FORBIDDEN_TENANT_ACCESS/);
        return true;
      }
    );
  });

  await t.test('Host A attempting to check in Restaurant B booking directly is rejected', async () => {
    await assert.rejects(
      async () => {
        await service.verifyAndCheckIn(hostAUserId, restA, { booking_id: bookingInRestB.id });
      },
      (err) => {
        assert.equal(err instanceof ForbiddenError, true);
        return true;
      }
    );
  });
});

// ============================================================================
// 3. Acceptance Criterion 2: Walk-In vs Customer Hold Race Overlap Safety
// ============================================================================
test('EPIC-014: Acceptance Criterion 2 - Walk-in vs Customer Hold Race & Exclusion', async (t) => {
  const restId = 'b0000000-0000-0000-0000-000000000001';
  const tableId = 'f0000000-0000-0000-0000-000000000004';
  const staffUserId = 'a0000000-0000-0000-0000-000000000004';

  const mockTable = {
    id: tableId,
    floor_id: 'd0000000-0000-0000-0000-000000000001',
    table_number: 'T04',
    capacity: 4,
    min_covers: 2,
    is_active: true,
    restaurant_id: restId,
    floor_name: 'Main Dining',
  };

  const mockRestaurant = {
    id: restId,
    name: 'The Royal Dine Bistro',
    timezone: 'Asia/Kolkata',
    policy_mode: 'FREE_RESERVATION',
    default_duration_min: 90,
    turnover_buffer_min: 15,
    policy_version: 1,
    min_party_size: 1,
    max_party_size: 10,
    is_published: true,
    status: 'PUBLISHED',
  };

  await t.test('Walk-in fails with 409 Conflict when competing with active customer hold', async () => {
    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM restaurant_memberships')) {
          return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        }
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
          // Active unexpired customer hold
          return {
            rows: [
              {
                id: 'alloc_cust_1',
                booking_id: 'book_cust_1',
                status: 'HELD',
                expires_at: new Date(Date.now() + 10 * 60 * 1000), // unexpired
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const mockDb = {
      withTransaction: async (cb) => cb(mockClient),
      getPool: () => mockClient,
    };

    const service = new OwnerOperationsService(
      mockDb,
      {},
      {},
      {},
      {}
    );

    await assert.rejects(
      async () => {
        await service.recordWalkIn(staffUserId, {
          restaurant_id: restId,
          table_id: tableId,
          party_size: 2,
          guest_name: 'Walk-in Guest Bob',
        });
      },
      (err) => {
        assert.equal(err instanceof ConflictError, true);
        assert.match(err.message, /already reserved/);
        return true;
      }
    );
  });

  await t.test('Walk-in on unallocated table succeeds with SEATED status and outbox event', async () => {
    const executedInserts = [];
    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM restaurant_memberships')) {
          return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        }
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
          return { rows: [] }; // No overlapping allocations
        }
        if (sql.includes('INSERT INTO bookings')) {
          executedInserts.push({ type: 'booking', params });
          return { rows: [{ id: 'walkin_book_101' }] };
        }
        if (sql.includes('INSERT INTO table_allocations')) {
          executedInserts.push({ type: 'allocation', params });
          return { rows: [{ id: 'walkin_alloc_101' }] };
        }
        if (sql.includes('INSERT INTO booking_status_events')) {
          executedInserts.push({ type: 'status_event', params });
          return { rows: [{ id: 'evt_101' }] };
        }
        if (sql.includes('INSERT INTO outbox_events')) {
          executedInserts.push({ type: 'outbox', params });
          return { rows: [{ id: 'outbox_101' }] };
        }
        if (sql.includes('INSERT INTO audit_logs')) {
          executedInserts.push({ type: 'audit', params });
          return { rows: [{ id: 'audit_101' }] };
        }
        return { rows: [] };
      },
    };

    const mockDb = {
      withTransaction: async (cb) => cb(mockClient),
      getPool: () => mockClient,
    };

    const service = new OwnerOperationsService(
      mockDb,
      {},
      {},
      {},
      {}
    );

    const result = await service.recordWalkIn(staffUserId, {
      restaurant_id: restId,
      table_id: tableId,
      party_size: 4,
      guest_name: 'Alice Walk-in',
    });

    assert.equal(result.booking_id, 'walkin_book_101');
    assert.equal(result.status, 'SEATED');
    assert.equal(result.allocation_status, 'SEATED');
    assert.equal(result.is_walk_in, true);
    assert.equal(result.party_size, 4);

    // Verify outbox event emitted
    const outboxInsert = executedInserts.find((i) => i.type === 'outbox');
    assert.ok(outboxInsert);
    assert.equal(outboxInsert.params[2], 'BOOKING_WALK_IN_SEATED');
  });
});

// ============================================================================
// 4. Acceptance Criterion 3: Repeat-Safe Replayed QR Check-In
// ============================================================================
test('EPIC-014: Acceptance Criterion 3 - Repeat-Safe Check-in & Event Deduplication', async (t) => {
  const restId = 'b0000000-0000-0000-0000-000000000001';
  const staffUserId = 'a0000000-0000-0000-0000-000000000004';
  const bookingId = '10000000-0000-0000-0000-000000000001';

  const validQrToken = signCheckInToken(
    {
      booking_id: bookingId,
      restaurant_id: restId,
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    TEST_SECRET
  );

  await t.test('First check-in transitions CONFIRMED -> READY and writes arrival events', async () => {
    let bookingState = {
      id: bookingId,
      restaurant_id: restId,
      status: 'CONFIRMED',
      version: 1,
      checked_in_at: null,
    };

    const eventsAppended = [];

    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM restaurant_memberships')) {
          return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        }
        if (sql.includes('FROM bookings') && sql.includes('FOR UPDATE')) {
          return { rows: [bookingState] };
        }
        if (sql.includes('UPDATE bookings')) {
          bookingState.status = 'READY';
          bookingState.checked_in_at = new Date();
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO booking_status_events')) {
          eventsAppended.push(params);
          return { rows: [] };
        }
        if (sql.includes('MAX(sequence_number)')) {
          return { rows: [{ next_seq: '2' }] };
        }
        return { rows: [] };
      },
    };

    const mockDb = {
      withTransaction: async (cb) => cb(mockClient),
      getPool: () => mockClient,
    };

    const service = new OwnerOperationsService(
      mockDb,
      {},
      {},
      {},
      {}
    );

    const res1 = await service.verifyAndCheckIn(staffUserId, restId, { qr_token: validQrToken });
    assert.equal(res1.success, true);
    assert.equal(res1.status, 'READY');
    assert.equal(res1.is_repeat, false);
    assert.equal(eventsAppended.length, 1);

    // Second check-in (replayed QR)
    const res2 = await service.verifyAndCheckIn(staffUserId, restId, { qr_token: validQrToken });
    assert.equal(res2.success, true);
    assert.equal(res2.is_repeat, true);
    assert.match(res2.message, /repeat-safe/);
    // Crucial: No second event was appended!
    assert.equal(eventsAppended.length, 1);
  });
});

// ============================================================================
// 5. Acceptance Criterion 4: Owner Layout Conflicts Preserve Current Reservations
// ============================================================================
test('EPIC-014: Acceptance Criterion 4 - Floor Plan Updates Preserve Current Reservations', async (t) => {
  const restId = 'b0000000-0000-0000-0000-000000000001';
  const floorId = 'd0000000-0000-0000-0000-000000000001';

  const mockClient = {
    query: async (sql, params = []) => {
      if (sql.includes('FROM floors')) {
        return { rows: [{ id: floorId, restaurant_id: restId, current_version: 1 }] };
      }
      if (sql.includes('FROM restaurant_tables WHERE floor_id')) {
        return {
          rows: [
            { id: 'tbl_01', table_number: 'T01', is_active: true },
            { id: 'tbl_04', table_number: 'T04', is_active: true }, // Has active booking!
          ],
        };
      }
      if (sql.includes('FROM table_allocations a')) {
        // Active confirmed reservation on tbl_04
        return {
          rows: [
            { id: 'alloc_active', status: 'CONFIRMED', booking_status: 'CONFIRMED', expires_at: null },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const mockDb = {
    withTransaction: async (cb) => cb(mockClient),
    getPool: () => mockClient,
  };

  const { FloorPlansService } = require('../../apps/api/dist/modules/floor-plans/floor-plans.service');
  const floorPlansService = new FloorPlansService(mockDb);

  // Attempt to submit layout that OMITS tbl_04 (trying to delete/retire it)
  await assert.rejects(
    async () => {
      await floorPlansService.updateFloorPlan(restId, {
        floor_id: floorId,
        base_version: 1,
        tables: [
          { id: 'tbl_01', table_number: 'T01', capacity: 4, min_covers: 2, x: 10, y: 10, w: 2, h: 2 },
          // tbl_04 is omitted!
        ],
      });
    },
    (err) => {
      assert.equal(err instanceof ConflictError, true);
      assert.match(err.message, /Cannot remove or retire table "T04"/);
      assert.equal(err.code, ErrorCode.INVENTORY_HOLD_CONFLICT);
      return true;
    }
  );
});

// ============================================================================
// 6. Task T05: Operational NO_SHOW Lateness Grace Period Enforcement (POL-008)
// ============================================================================
test('EPIC-014: Task T05 - Operational NO_SHOW Grace Period (POL-008)', async (t) => {
  const bookingId = '10000000-0000-0000-0000-000000000001';
  const staffUserId = 'a0000000-0000-0000-0000-000000000004';

  await t.test('NO_SHOW attempted within 15m of requested_start is rejected with 422', async () => {
    // Booking was requested 5 minutes ago (still in 15m grace period)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM bookings WHERE id = $1')) {
          return { rows: [{ requested_start: fiveMinutesAgo }] };
        }
        return { rows: [] };
      },
    };

    const mockDb = {
      getPool: () => mockClient,
      withTransaction: async (cb) => cb(mockClient),
    };

    const service = new OwnerOperationsService(
      mockDb,
      {},
      {},
      {},
      {}
    );

    await assert.rejects(
      async () => {
        await service.updateBookingStatus(bookingId, { status: 'NO_SHOW' }, staffUserId);
      },
      (err) => {
        assert.equal(err instanceof AppError, true);
        assert.equal(err.status, 422);
        assert.equal(err.code, ErrorCode.NO_SHOW_GRACE_PERIOD_ACTIVE);
        assert.match(err.message, /grace period/);
        return true;
      }
    );
  });

  await t.test('NO_SHOW attempted after 15m grace period has elapsed delegates to reservation service', async () => {
    // Booking was requested 20 minutes ago (grace period elapsed!)
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM bookings WHERE id = $1')) {
          return { rows: [{ requested_start: twentyMinutesAgo }] };
        }
        return { rows: [] };
      },
    };

    let transitioned = false;
    const mockReservationsService = {
      transitionStaffBookingStatus: async () => {
        transitioned = true;
        return { status: 'NO_SHOW', allocation_status: 'RELEASED' };
      },
    };

    const mockDb = {
      getPool: () => mockClient,
      withTransaction: async (cb) => cb(mockClient),
    };

    const service = new OwnerOperationsService(
      mockDb,
      {},
      {},
      {},
      mockReservationsService
    );

    const result = await service.updateBookingStatus(
      bookingId,
      { status: 'NO_SHOW' },
      staffUserId
    );
    assert.equal(transitioned, true);
    assert.equal(result.status, 'NO_SHOW');
  });
});

// ============================================================================
// 7. Table Blocks & Conflict Checking (Task T04)
// ============================================================================
test('EPIC-014: Task T04 - Table Maintenance Blocks & Conflict Locking', async (t) => {
  const restId = 'b0000000-0000-0000-0000-000000000001';
  const tableId = 'f0000000-0000-0000-0000-000000000004';
  const staffUserId = 'a0000000-0000-0000-0000-000000000004';

  const startTime = '2026-11-15T18:00:00.000Z';
  const endTime = '2026-11-15T21:00:00.000Z';

  await t.test('Table block overlapping active reservation is rejected with 409 Conflict', async () => {
    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM restaurant_tables')) {
          return { rows: [{ id: tableId, table_number: 'T04', restaurant_id: restId }] };
        }
        if (sql.includes('FROM table_allocations')) {
          return { rows: [{ id: 'alloc_active', status: 'CONFIRMED' }] };
        }
        return { rows: [] };
      },
    };

    const mockDb = {
      getPool: () => mockClient,
      withTransaction: async (cb) => cb(mockClient),
    };

    const service = new OwnerOperationsService(
      mockDb,
      {},
      {},
      {},
      {}
    );

    await assert.rejects(
      async () => {
        await service.addTableBlock(
          restId,
          {
            table_id: tableId,
            start_time: startTime,
            end_time: endTime,
            reason: 'Deep cleaning and re-varnishing',
          },
          staffUserId
        );
      },
      (err) => {
        assert.equal(err instanceof ConflictError, true);
        assert.equal(err.code, ErrorCode.TABLE_BLOCK_CONFLICT);
        return true;
      }
    );
  });

  await t.test('Table block on unreserved table succeeds and audits record', async () => {
    const executedInserts = [];
    const mockClient = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM restaurant_tables')) {
          return { rows: [{ id: tableId, table_number: 'T04', restaurant_id: restId }] };
        }
        if (sql.includes('FROM table_allocations')) {
          return { rows: [] }; // No conflict
        }
        if (sql.includes('INSERT INTO table_blocks')) {
          executedInserts.push({ type: 'block', params });
          return {
            rows: [
              {
                id: 'blk_101',
                table_id: tableId,
                block_period: `[${startTime},${endTime})`,
                reason: 'Routine inspection',
                created_at: new Date(),
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO audit_logs')) {
          executedInserts.push({ type: 'audit', params });
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    const mockDb = {
      getPool: () => mockClient,
      withTransaction: async (cb) => cb(mockClient),
    };

    const service = new OwnerOperationsService(
      mockDb,
      {},
      {},
      {},
      {}
    );

    const block = await service.addTableBlock(
      restId,
      {
        table_id: tableId,
        start_time: startTime,
        end_time: endTime,
        reason: 'Routine inspection',
      },
      staffUserId
    );

    assert.equal(block.id, 'blk_101');
    assert.equal(block.table_id, tableId);
    assert.equal(block.reason, 'Routine inspection');
    assert.equal(executedInserts.length, 2);
  });
});

// ============================================================================
// 8. Bounded Restaurant Booking Projection (Task T01)
// ============================================================================
test('EPIC-014: Task T01 - Bounded Staff Booking Projection', async (t) => {
  const restId = 'b0000000-0000-0000-0000-000000000001';

  const mockClient = {
    query: async (sql, params = []) => {
      if (sql.includes('COUNT(*)')) {
        return { rows: [{ total: 2 }] };
      }
      if (sql.includes('SELECT b.id, b.user_id, b.restaurant_id')) {
        return {
          rows: [
            {
              id: 'book_1',
              user_id: 'user_1',
              restaurant_id: restId,
              party_size: 2,
              requested_start: new Date('2026-11-15T19:00:00Z'),
              dining_period: '["2026-11-15 19:00:00+00","2026-11-15 20:45:00+00")',
              status: 'CONFIRMED',
              version: 1,
              is_walk_in: false,
              guest_name: 'Alice',
              guest_phone: '+919999999991',
              table_id: 'tbl_04',
              table_number: 'T04',
              floor_name: 'Ground Floor',
              allocation_status: 'CONFIRMED',
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: 'book_2',
              user_id: null,
              restaurant_id: restId,
              party_size: 4,
              requested_start: new Date('2026-11-15T19:30:00Z'),
              dining_period: '["2026-11-15 19:30:00+00","2026-11-15 21:15:00+00")',
              status: 'SEATED',
              version: 1,
              is_walk_in: true,
              guest_name: 'Walk-in Guest',
              guest_phone: null,
              table_id: 'tbl_05',
              table_number: 'T05',
              floor_name: 'Ground Floor',
              allocation_status: 'SEATED',
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const mockDb = {
    getPool: () => mockClient,
    withTransaction: async (cb) => cb(mockClient),
  };

  const service = new OwnerOperationsService(
    mockDb,
    {},
    {},
    {},
    {}
  );

  const res = await service.getRestaurantBookings(restId, { limit: 10, offset: 0 });
  assert.equal(res.total, 2);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].table_number, 'T04');
  assert.equal(res.items[0].is_walk_in, false);
  assert.equal(res.items[1].table_number, 'T05');
  assert.equal(res.items[1].is_walk_in, true);
});
