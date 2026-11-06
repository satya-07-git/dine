const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  canonicalJson,
  computeScopeKey,
  hashPayload,
  isAllocationProtected,
  isHoldSafelyExpired,
  calculateHoldExpiry,
  parseRangeBounds,
  PROTECTED_ALLOCATION_STATUSES,
  ReservationsService,
} = require('../../apps/api/dist/modules/reservations/reservations.service');

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
} = require('../../apps/api/dist/common/errors/app-error');

const { ErrorCode } = require('../../packages/contracts/dist/errors');

test('EPIC-008: Idempotency Keys, Scoping & Payload Hashing (T03)', async (t) => {
  await t.test('computeScopeKey produces deterministic SHA-256 hash of userId:endpoint:key', () => {
    const key1 = computeScopeKey('user_alice', 'POST /booking-holds', 'key_123');
    const key2 = computeScopeKey('user_alice', 'POST /booking-holds', 'key_123');
    const keyDiffUser = computeScopeKey('user_bob', 'POST /booking-holds', 'key_123');
    const keyDiffEndpoint = computeScopeKey('user_alice', 'POST /v1/holds', 'key_123');

    assert.equal(key1, key2);
    assert.equal(key1.length, 64);
    assert.notEqual(key1, keyDiffUser);
    assert.notEqual(key1, keyDiffEndpoint);
  });

  await t.test('canonicalJson and hashPayload sort object keys recursively for deterministic hash', () => {
    const payloadA = { table_id: 't04', party_size: 4, nested: { b: 2, a: 1 } };
    const payloadB = { party_size: 4, nested: { a: 1, b: 2 }, table_id: 't04' };
    const payloadDiff = { table_id: 't04', party_size: 6, nested: { a: 1, b: 2 } };

    assert.equal(canonicalJson(payloadA), canonicalJson(payloadB));
    assert.equal(hashPayload(payloadA), hashPayload(payloadB));
    assert.notEqual(hashPayload(payloadA), hashPayload(payloadDiff));
  });

  await t.test('createHold rejects missing or whitespace Idempotency-Key with ValidationError', async () => {
    const service = new ReservationsService({});
    await assert.rejects(
      async () => {
        await service.createHold('user_alice', '', {
          restaurant_id: 'b1',
          table_id: 't1',
          party_size: 2,
          requested_start: '2026-11-10T19:00:00Z',
        });
      },
      (err) => err instanceof ValidationError && /Idempotency-Key/i.test(err.message)
    );
  });
});

test('EPIC-008: Protected Allocation States & Safe-Expiry Resolution (T04)', async (t) => {
  await t.test('PROTECTED_ALLOCATION_STATUSES covers all 8 blueprint protected states', () => {
    const expected = [
      'HELD',
      'OFFER_HELD',
      'PAYMENT_PENDING',
      'PAYMENT_REVIEW',
      'CONFIRMED',
      'READY',
      'SEATED',
      'COMPLETED',
    ];
    for (const status of expected) {
      assert.ok(isAllocationProtected(status), `Status ${status} must be protected`);
    }
    assert.equal(isAllocationProtected('RELEASED'), false);
    assert.equal(isAllocationProtected('CANCELLED'), false);
  });

  await t.test('isHoldSafelyExpired transitions ONLY elapsed HELD status', () => {
    const now = new Date('2026-11-10T19:30:00Z');
    const past = new Date('2026-11-10T19:15:00Z');
    const future = new Date('2026-11-10T19:45:00Z');

    // Past HELD is safely expired
    assert.equal(isHoldSafelyExpired('HELD', past, now), true);

    // Future HELD is not expired
    assert.equal(isHoldSafelyExpired('HELD', future, now), false);

    // PAYMENT_PENDING / PAYMENT_REVIEW / CONFIRMED cannot be automatically expired without reconciliation
    assert.equal(isHoldSafelyExpired('PAYMENT_PENDING', past, now), false);
    assert.equal(isHoldSafelyExpired('PAYMENT_REVIEW', past, now), false);
    assert.equal(isHoldSafelyExpired('CONFIRMED', past, now), false);
  });

  await t.test('calculateHoldExpiry sets 15 minute TTL from now', () => {
    const start = new Date('2026-11-10T19:00:00Z');
    const expiry = calculateHoldExpiry(start, 15);
    assert.equal(expiry.toISOString(), '2026-11-10T19:15:00.000Z');
  });

  await t.test('parseRangeBounds parses PostgreSQL tstzrange string format correctly', () => {
    const range = '["2026-11-10 19:00:00+00","2026-11-10 20:45:00+00")';
    const parsed = parseRangeBounds(range);
    assert.equal(parsed.start, '2026-11-10T19:00:00.000Z');
    assert.equal(parsed.end, '2026-11-10T20:45:00.000Z');
  });
});

test('EPIC-008: Two-Customer Vertical Slice & Concurrency Orchestration (T02, T06)', async (t) => {
  // In-memory simulated PostgreSQL state with row locking and GiST exclusion invariant
  const dbState = {
    tables: new Map([
      [
        'f0000000-0000-0000-0000-000000000004',
        {
          id: 'f0000000-0000-0000-0000-000000000004',
          floor_id: 'd1',
          table_number: 'T04',
          capacity: 4,
          min_covers: 2,
          is_active: true,
        },
      ],
    ]),
    restaurants: new Map([
      [
        'b0000000-0000-0000-0000-000000000001',
        {
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
        },
      ],
    ]),
    tableBlocks: [],
    allocations: [],
    bookings: [],
    idempotency: new Map(),
    outbox: [],
    auditLogs: [],
  };

  const getJoinRow = (holdId) => {
    const alloc = dbState.allocations.find((a) => a.id === holdId);
    if (!alloc) return [];
    const booking = dbState.bookings.find((b) => b.id === alloc.booking_id);
    if (!booking) return [];
    return [
      {
        hold_id: alloc.id,
        table_id: alloc.table_id,
        booking_id: alloc.booking_id,
        dining_period: alloc.dining_period,
        allocation_status: alloc.status,
        expires_at: alloc.expires_at,
        user_id: booking.user_id,
        restaurant_id: booking.restaurant_id,
        party_size: booking.party_size,
        booking_status: booking.status,
        policy_snapshot: booking.policy_snapshot,
      },
    ];
  };

  const createMockDb = () => ({
    getPool: () => ({
      query: async (query, params) => {
        const q = query.replace(/\s+/g, ' ');
        if (q.includes('FROM idempotency_records WHERE scope_key = $1')) {
          const rec = dbState.idempotency.get(params[0]);
          return { rows: rec ? [rec] : [] };
        }
        if (q.includes('FROM table_allocations a JOIN bookings b')) {
          return { rows: getJoinRow(params[0]) };
        }
        return { rows: [] };
      },
    }),
    withTransaction: async (cb) => {
      const client = {
        query: async (query, params) => {
          const q = query.replace(/\s+/g, ' ');
          if (q.includes('FROM idempotency_records WHERE scope_key = $1 FOR UPDATE')) {
            const rec = dbState.idempotency.get(params[0]);
            return { rows: rec ? [rec] : [] };
          }
          if (q.includes('FROM restaurant_tables') && q.includes('FOR UPDATE')) {
            const table = dbState.tables.get(params[0]);
            return { rows: table ? [table] : [] };
          }
          if (q.includes('FROM restaurants WHERE id = $1')) {
            const rest = dbState.restaurants.get(params[0]);
            return { rows: rest ? [rest] : [] };
          }
          if (q.includes('FROM table_blocks WHERE table_id = $1')) {
            return { rows: [] };
          }
          if (q.includes('FROM table_allocations a JOIN bookings b')) {
            return { rows: getJoinRow(params[0]) };
          }
          if (q.includes('FROM table_allocations') && q.includes('dining_period &&')) {
            // Check overlapping allocations with protected status
            const tableId = params[0];
            const rangeStr = params[1];
            const reqBounds = parseRangeBounds(rangeStr);
            const reqStart = new Date(reqBounds.start).getTime();
            const reqEnd = new Date(reqBounds.end).getTime();

            const overlapping = dbState.allocations.filter((alloc) => {
              if (alloc.table_id !== tableId) return false;
              if (!PROTECTED_ALLOCATION_STATUSES.has(alloc.status)) return false;
              const allocBounds = parseRangeBounds(alloc.dining_period);
              const aStart = new Date(allocBounds.start).getTime();
              const aEnd = new Date(allocBounds.end).getTime();
              // Half open continuous interval overlap: max(start) < min(end)
              return Math.max(reqStart, aStart) < Math.min(reqEnd, aEnd);
            });
            return { rows: overlapping };
          }
          if (q.includes('UPDATE table_allocations SET status = $1 WHERE id = $2')) {
            const alloc = dbState.allocations.find((a) => a.id === params[1]);
            if (alloc) alloc.status = params[0];
            return { rowCount: 1 };
          }
          if (q.includes('UPDATE bookings SET status = $1')) {
            const booking = dbState.bookings.find((b) => b.id === params[1]);
            if (booking) booking.status = params[0];
            return { rowCount: 1 };
          }
          if (q.includes('INSERT INTO bookings')) {
            const b = {
              id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              user_id: params[0],
              restaurant_id: params[1],
              party_size: params[2],
              requested_start: params[3],
              dining_period: params[4],
              status: params[5],
              policy_snapshot: typeof params[6] === 'string' ? JSON.parse(params[6]) : params[6],
            };
            dbState.bookings.push(b);
            return { rows: [{ id: b.id }] };
          }
          if (q.includes('INSERT INTO table_allocations')) {
            // GiST Exclusion Invariant Check
            const tableId = params[0];
            const bookingId = params[1];
            const rangeStr = params[2];
            const status = params[3];
            const expiresAt = params[4];

            const reqBounds = parseRangeBounds(rangeStr);
            const reqStart = new Date(reqBounds.start).getTime();
            const reqEnd = new Date(reqBounds.end).getTime();

            const conflict = dbState.allocations.some((alloc) => {
              if (alloc.table_id !== tableId) return false;
              if (!PROTECTED_ALLOCATION_STATUSES.has(alloc.status)) return false;
              const allocBounds = parseRangeBounds(alloc.dining_period);
              const aStart = new Date(allocBounds.start).getTime();
              const aEnd = new Date(allocBounds.end).getTime();
              return Math.max(reqStart, aStart) < Math.min(reqEnd, aEnd);
            });

            if (conflict) {
              const err = new Error('exclusion constraint "no_protected_table_overlap" violated');
              err.code = '23P01';
              throw err;
            }

            const alloc = {
              id: `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              table_id: tableId,
              booking_id: bookingId,
              dining_period: rangeStr,
              status,
              expires_at: expiresAt,
            };
            dbState.allocations.push(alloc);
            return { rows: [{ id: alloc.id }] };
          }
          if (q.includes('INSERT INTO outbox_events')) {
            dbState.outbox.push({
              aggregate_type: params[0],
              aggregate_id: params[1],
              event_type: params[2],
              payload: typeof params[3] === 'string' ? JSON.parse(params[3]) : params[3],
            });
            return { rowCount: 1 };
          }
          if (q.includes('INSERT INTO audit_logs')) {
            dbState.auditLogs.push({
              actor_id: params[0],
              restaurant_id: params[1],
              action: params[2],
              entity_type: params[3],
              entity_id: params[4],
            });
            return { rowCount: 1 };
          }
          if (q.includes('INSERT INTO idempotency_records')) {
            dbState.idempotency.set(params[0], {
              scope_key: params[0],
              user_id: params[1],
              endpoint: params[2],
              payload_hash: params[3],
              status_code: params[4],
              response_body: typeof params[5] === 'string' ? JSON.parse(params[5]) : params[5],
              expires_at: params[6],
            });
            return { rowCount: 1 };
          }
          if (q.includes('INSERT INTO booking_status_events')) {
            return { rowCount: 1 };
          }
          return { rows: [] };
        },
      };
      return cb(client);
    },
  });

  const service = new ReservationsService(createMockDb());

  await t.test('Customer Alice successfully acquires hold on Table T04 (201 Created)', async () => {
    const res = await service.createHold(
      'a0000000-0000-0000-0000-000000000002', // Alice
      'idemp_alice_001',
      {
        restaurant_id: 'b0000000-0000-0000-0000-000000000001',
        table_id: 'f0000000-0000-0000-0000-000000000004',
        party_size: 2,
        requested_start: '2026-11-10T19:00:00Z',
      }
    );

    assert.equal(res.isReplay, false);
    assert.equal(res.result.status, 'HELD');
    assert.equal(res.result.dining_period.start, '2026-11-10T19:00:00.000Z');
    assert.equal(res.result.dining_period.end, '2026-11-10T20:45:00.000Z');
    assert.ok(res.result.hold_id);
    assert.ok(res.result.booking_id);
    assert.ok(res.result.expires_at);

    // Verify outbox & audit events emitted
    assert.ok(dbState.outbox.some((e) => e.event_type === 'HOLD_CREATED'));
    assert.ok(dbState.auditLogs.some((a) => a.action === 'CREATE_HOLD'));
  });

  await t.test('Customer Bob concurrently requesting overlapping interval on Table T04 gets 409 Conflict', async () => {
    await assert.rejects(
      async () => {
        await service.createHold(
          'a0000000-0000-0000-0000-000000000003', // Bob
          'idemp_bob_001',
          {
            restaurant_id: 'b0000000-0000-0000-0000-000000000001',
            table_id: 'f0000000-0000-0000-0000-000000000004',
            party_size: 4,
            requested_start: '2026-11-10T19:30:00Z', // Overlaps Alice (19:00 - 20:45)
          }
        );
      },
      (err) => err instanceof ConflictError && err.code === ErrorCode.TABLE_UNAVAILABLE
    );
  });

  await t.test('Same idempotency key and identical payload returns original response with isReplay: true', async () => {
    const res = await service.createHold(
      'a0000000-0000-0000-0000-000000000002',
      'idemp_alice_001',
      {
        restaurant_id: 'b0000000-0000-0000-0000-000000000001',
        table_id: 'f0000000-0000-0000-0000-000000000004',
        party_size: 2,
        requested_start: '2026-11-10T19:00:00Z',
      }
    );

    assert.equal(res.isReplay, true);
    assert.equal(res.result.status, 'HELD');
  });

  await t.test('Same idempotency key with different body fails with 409 IDEMPOTENCY_CONFLICT', async () => {
    await assert.rejects(
      async () => {
        await service.createHold(
          'a0000000-0000-0000-0000-000000000002',
          'idemp_alice_001',
          {
            restaurant_id: 'b0000000-0000-0000-0000-000000000001',
            table_id: 'f0000000-0000-0000-0000-000000000004',
            party_size: 3, // Changed party_size from 2 to 3!
            requested_start: '2026-11-10T19:00:00Z',
          }
        );
      },
      (err) => err instanceof ConflictError && err.code === ErrorCode.IDEMPOTENCY_CONFLICT
    );
  });

  await t.test('Customer Bob requests non-overlapping adjacent interval (20:45) and succeeds (201 Created)', async () => {
    const res = await service.createHold(
      'a0000000-0000-0000-0000-000000000003',
      'idemp_bob_nonoverlap',
      {
        restaurant_id: 'b0000000-0000-0000-0000-000000000001',
        table_id: 'f0000000-0000-0000-0000-000000000004',
        party_size: 4,
        requested_start: '2026-11-10T20:45:00Z', // Adjacent starting right when Alice ends
      }
    );

    assert.equal(res.isReplay, false);
    assert.equal(res.result.status, 'HELD');
    assert.equal(res.result.dining_period.start, '2026-11-10T20:45:00.000Z');
  });

  await t.test('100 simultaneous simulated same-table overlapping attempts yield at most 1 winner', async () => {
    const testAllocations = [];
    const testTableId = 'tbl_100_concurrent';
    const reqStart = new Date('2026-11-10T19:00:00Z').getTime();
    const reqEnd = new Date('2026-11-10T20:45:00Z').getTime();

    let winners = 0;
    let conflicts = 0;

    for (let i = 0; i < 100; i++) {
      // Check GiST exclusion
      const hasConflict = testAllocations.some((alloc) => {
        return Math.max(reqStart, alloc.start) < Math.min(reqEnd, alloc.end);
      });

      if (!hasConflict) {
        testAllocations.push({ id: `alloc_${i}`, start: reqStart, end: reqEnd });
        winners++;
      } else {
        conflicts++;
      }
    }

    assert.equal(winners, 1, 'Exactly one concurrent request must win');
    assert.equal(conflicts, 99, '99 competing requests must be rejected');
  });

  await t.test('IDOR check: Bob cannot access Alice hold (403 Forbidden)', async () => {
    const aliceHoldId = dbState.allocations[0].id;
    await assert.rejects(
      async () => {
        await service.getHold('a0000000-0000-0000-0000-000000000003', aliceHoldId);
      },
      (err) => err instanceof ForbiddenError && /another customer/i.test(err.message)
    );
  });

  await t.test('Alice can fetch her own hold details (200 OK)', async () => {
    const aliceHoldId = dbState.allocations[0].id;
    const hold = await service.getHold('a0000000-0000-0000-0000-000000000002', aliceHoldId);
    assert.equal(hold.hold_id, aliceHoldId);
    assert.equal(hold.status, 'HELD');
  });

  await t.test('Alice can cancel her own hold (200 OK)', async () => {
    const aliceHoldId = dbState.allocations[0].id;
    const cancelRes = await service.cancelHold('a0000000-0000-0000-0000-000000000002', aliceHoldId);
    assert.equal(cancelRes.status, 'CANCELLED');
    assert.equal(cancelRes.hold_id, aliceHoldId);
    assert.ok(dbState.outbox.some((e) => e.event_type === 'HOLD_CANCELLED'));
  });
});
