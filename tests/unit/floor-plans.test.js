const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateTableCapacity,
  validateTableGeometry,
  validateFloorPlanTables,
  FloorPlansService,
} = require('../../apps/api/dist/modules/floor-plans/floor-plans.service');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} = require('../../apps/api/dist/common/errors/app-error');
const { ErrorCode } = require('../../packages/contracts/dist/errors');

test('EPIC-006: Normalized Table Geometry & Capacity Validation', async (t) => {
  await t.test('validateTableCapacity accepts valid positive integer capacities and min_covers', () => {
    assert.deepEqual(validateTableCapacity(4, 2), { capacity: 4, minCovers: 2 });
    assert.deepEqual(validateTableCapacity(2, 1), { capacity: 2, minCovers: 1 });
    assert.deepEqual(validateTableCapacity(6, 6), { capacity: 6, minCovers: 6 });
    assert.deepEqual(validateTableCapacity(2), { capacity: 2, minCovers: 1 }); // default minCovers = 1
  });

  await t.test('validateTableCapacity rejects non-positive or non-integer capacity', () => {
    assert.throws(
      () => validateTableCapacity(0, 1),
      (err) => err instanceof ValidationError && err.message.includes('capacity must be a positive integer')
    );
    assert.throws(
      () => validateTableCapacity(-4, 1),
      (err) => err instanceof ValidationError && err.message.includes('capacity must be a positive integer')
    );
    assert.throws(
      () => validateTableCapacity(2.5, 1),
      (err) => err instanceof ValidationError && err.message.includes('capacity must be a positive integer')
    );
    assert.throws(
      () => validateTableCapacity('four', 1),
      (err) => err instanceof ValidationError
    );
  });

  await t.test('validateTableCapacity rejects min_covers <= 0 or min_covers > capacity', () => {
    assert.throws(
      () => validateTableCapacity(4, 0),
      (err) => err instanceof ValidationError && err.message.includes('min_covers must be a positive integer')
    );
    assert.throws(
      () => validateTableCapacity(4, -1),
      (err) => err instanceof ValidationError
    );
    assert.throws(
      () => validateTableCapacity(4, 5),
      (err) => err instanceof ValidationError && err.message.includes('cannot exceed capacity')
    );
  });

  await t.test('validateTableGeometry accepts valid coordinates and dimensions', () => {
    assert.deepEqual(validateTableGeometry(10, 20, 2, 3), { x: 10, y: 20, w: 2, h: 3 });
    assert.deepEqual(validateTableGeometry(0, 0, 1.5, 1.5), { x: 0, y: 0, w: 1.5, h: 1.5 });
    assert.deepEqual(validateTableGeometry('15.5', '25.5', '3.0', '3.0'), { x: 15.5, y: 25.5, w: 3, h: 3 });
  });

  await t.test('validateTableGeometry rejects negative coordinates or zero/negative dimensions', () => {
    assert.throws(
      () => validateTableGeometry(-1, 10, 2, 2),
      (err) => err instanceof ValidationError && err.message.includes('coordinates (x, y) must be non-negative')
    );
    assert.throws(
      () => validateTableGeometry(10, -5, 2, 2),
      (err) => err instanceof ValidationError && err.message.includes('coordinates (x, y) must be non-negative')
    );
    assert.throws(
      () => validateTableGeometry(10, 10, 0, 2),
      (err) => err instanceof ValidationError && err.message.includes('dimensions (w, h) must be strictly positive')
    );
    assert.throws(
      () => validateTableGeometry(10, 10, 2, -2),
      (err) => err instanceof ValidationError && err.message.includes('dimensions (w, h) must be strictly positive')
    );
  });

  await t.test('validateTableGeometry rejects out-of-bounds canvas coordinates', () => {
    assert.throws(
      () => validateTableGeometry(999, 10, 5, 2),
      (err) => err instanceof ValidationError && err.message.includes('exceeds floor canvas boundary')
    );
    assert.throws(
      () => validateTableGeometry(10, 995, 2, 10),
      (err) => err instanceof ValidationError && err.message.includes('exceeds floor canvas boundary')
    );
  });

  await t.test('validateTableGeometry rejects non-numeric or NaN coordinates', () => {
    assert.throws(
      () => validateTableGeometry(NaN, 10, 2, 2),
      (err) => err instanceof ValidationError && err.message.includes('finite numbers')
    );
    assert.throws(
      () => validateTableGeometry('invalid', 10, 2, 2),
      (err) => err instanceof ValidationError && err.message.includes('finite numbers')
    );
  });

  await t.test('validateFloorPlanTables validates full table inventory and rejects duplicate table numbers', () => {
    const validTables = [
      { table_number: 'T01', capacity: 2, min_covers: 1, zone: 'WINDOW', x: 10, y: 10, w: 2, h: 2 },
      { table_number: 'T02', capacity: 4, min_covers: 2, zone: 'MAIN', x: 20, y: 10, w: 3, h: 3 },
    ];
    const validated = validateFloorPlanTables(validTables);
    assert.equal(validated.length, 2);
    assert.equal(validated[0].table_number, 'T01');
    assert.equal(validated[1].table_number, 'T02');

    // Rejects empty array
    assert.throws(
      () => validateFloorPlanTables([]),
      (err) => err instanceof ValidationError && err.message.includes('at least one table')
    );

    // Rejects duplicate table number on same floor
    const duplicateTables = [
      { table_number: 'T01', capacity: 2, x: 10, y: 10, w: 2, h: 2 },
      { table_number: 't01', capacity: 4, x: 20, y: 10, w: 3, h: 3 }, // Case-insensitive duplicate
    ];
    assert.throws(
      () => validateFloorPlanTables(duplicateTables),
      (err) => err instanceof ValidationError && err.message.includes('Duplicate table_number "t01"')
    );
  });
});

test('EPIC-006: Floor Plan Service & Optimistic Concurrency Invariants', async (t) => {
  // Mock Database Setup
  const mockDbState = {
    restaurants: new Map([
      ['b0001', { id: 'b0001', name: 'The Royal Bistro', is_published: true }],
      ['b0002', { id: 'b0002', name: 'Amber Palace', is_published: true }],
    ]),
    floors: new Map([
      ['fl_01', { id: 'fl_01', restaurant_id: 'b0001', name: 'Main Floor', floor_number: 1, current_version: 1 }],
      ['fl_02', { id: 'fl_02', restaurant_id: 'b0002', name: 'Palace Floor', floor_number: 1, current_version: 1 }],
    ]),
    floorPlanVersions: [
      { id: 'v_01', floor_id: 'fl_01', version_number: 1, is_active: true, svg_layout_url: '/layouts/fl1_v1.svg' },
      { id: 'v_02', floor_id: 'fl_02', version_number: 1, is_active: true, svg_layout_url: '/layouts/fl2_v1.svg' },
    ],
    tables: new Map([
      ['tbl_01', { id: 'tbl_01', floor_id: 'fl_01', table_number: 'T01', capacity: 2, min_covers: 1, zone: 'WINDOW', x: 10, y: 10, w: 2, h: 2, is_active: true }],
      ['tbl_04', { id: 'tbl_04', floor_id: 'fl_01', table_number: 'T04', capacity: 4, min_covers: 2, zone: 'CENTER', x: 20, y: 30, w: 3, h: 3, is_active: true }],
      ['tbl_05', { id: 'tbl_05', floor_id: 'fl_01', table_number: 'T05', capacity: 6, min_covers: 4, zone: 'PRIVATE', x: 30, y: 30, w: 4, h: 4, is_active: true }],
    ]),
    allocations: [
      { id: 'alloc_01', table_id: 'tbl_04', status: 'CONFIRMED', expires_at: null }, // Active allocation on tbl_04
    ],
    auditLogs: [],
  };

  const createMockDatabaseService = (state) => ({
    getPool: () => ({
      query: async (sql, params = []) => {
        const normSql = sql.replace(/\s+/g, ' ');
        if (normSql.includes('FROM restaurants WHERE id = $1')) {
          const r = state.restaurants.get(params[0]);
          return { rows: r ? [r] : [] };
        }
        if (normSql.includes('FROM floors WHERE restaurant_id = $1')) {
          const matched = Array.from(state.floors.values()).filter((f) => f.restaurant_id === params[0]);
          return { rows: matched };
        }
        if (normSql.includes('FROM floors WHERE id = $1')) {
          const f = state.floors.get(params[0]);
          return { rows: f ? [f] : [] };
        }
        if (normSql.includes('FROM floor_plan_versions WHERE floor_id = $1')) {
          const versions = state.floorPlanVersions.filter((v) => v.floor_id === params[0] && v.is_active);
          return { rows: versions.slice(-1) };
        }
        if (normSql.includes('FROM restaurant_tables WHERE floor_id = $1 AND is_active = true')) {
          const tbls = Array.from(state.tables.values()).filter((t) => t.floor_id === params[0] && t.is_active);
          return { rows: tbls };
        }
        if (normSql.includes('FROM restaurant_tables WHERE floor_id = $1')) {
          const tbls = Array.from(state.tables.values()).filter((t) => t.floor_id === params[0]);
          return { rows: tbls };
        }
        if (normSql.includes('FROM table_allocations a')) {
          const tableId = params[0];
          const active = state.allocations.filter((a) => a.table_id === tableId && ['HELD', 'CONFIRMED', 'SEATED'].includes(a.status));
          return { rows: active };
        }
        return { rows: [] };
      },
    }),
    withTransaction: async (callback) => {
      const mockClient = {
        query: async (sql, params = []) => {
          const normSql = sql.replace(/\s+/g, ' ');
          if (normSql.includes('UPDATE floors SET current_version = $1')) {
            const floor = state.floors.get(params[2]);
            if (floor && floor.current_version === params[3]) {
              floor.current_version = params[0];
              return { rowCount: 1, rows: [floor] };
            }
            return { rowCount: 0, rows: [] };
          }
          if (normSql.includes('UPDATE floor_plan_versions SET is_active = false')) {
            state.floorPlanVersions.forEach((v) => {
              if (v.floor_id === params[0]) v.is_active = false;
            });
            return { rowCount: 1 };
          }
          if (normSql.includes('INSERT INTO floor_plan_versions')) {
            state.floorPlanVersions.push({
              id: 'v_new_' + params[1],
              floor_id: params[0],
              version_number: params[1],
              layout_snapshot: params[2],
              svg_layout_url: params[3],
              is_active: true,
            });
            return { rowCount: 1 };
          }
          if (normSql.includes('UPDATE restaurant_tables SET table_number = $1')) {
            const table = state.tables.get(params[9]);
            if (table) {
              table.table_number = params[0];
              table.capacity = params[1];
              table.min_covers = params[2];
              table.zone = params[3];
              table.x = params[4];
              table.y = params[5];
              table.w = params[6];
              table.h = params[7];
              table.is_active = params[8];
            }
            return { rowCount: 1 };
          }
          if (normSql.includes('INSERT INTO restaurant_tables')) {
            const newId = 'tbl_new_' + Math.random().toString(36).substring(7);
            state.tables.set(newId, {
              id: newId,
              floor_id: params[0],
              table_number: params[1],
              capacity: params[2],
              min_covers: params[3],
              zone: params[4],
              x: params[5],
              y: params[6],
              w: params[7],
              h: params[8],
              is_active: params[9],
            });
            return { rowCount: 1 };
          }
          if (normSql.includes('UPDATE restaurant_tables SET is_active = false')) {
            const table = state.tables.get(params[0]);
            if (table) table.is_active = false;
            return { rowCount: 1 };
          }
          if (normSql.includes('INSERT INTO audit_logs')) {
            state.auditLogs.push(params);
            return { rowCount: 1 };
          }
          return { rowCount: 1, rows: [] };
        },
      };
      return await callback(mockClient);
    },
  });

  await t.test('getActiveFloorPlan returns static geometry, stable IDs, and version without mutable availability', async () => {
    const service = new FloorPlansService(createMockDatabaseService(mockDbState));
    const result = await service.getActiveFloorPlan('b0001');

    assert.equal(result.restaurant_id, 'b0001');
    assert.equal(result.floors.length, 1);

    const floor = result.floors[0];
    assert.equal(floor.id, 'fl_01');
    assert.equal(floor.version_number, 1);
    assert.equal(floor.tables.length, 3);

    // Verify stable table identity
    const t04 = floor.tables.find((tbl) => tbl.table_number === 'T04');
    assert.ok(t04);
    assert.equal(t04.id, 'tbl_04');
    assert.equal(t04.capacity, 4);
    assert.equal(t04.zone, 'CENTER');

    // Verify static geometry separation: no mutable availability flags (like is_held, is_booked, etc.)
    assert.equal(t04.is_held, undefined);
    assert.equal(t04.available, undefined);

    // Consecutive read verifies identical stable IDs
    const result2 = await service.getActiveFloorPlan('b0001');
    assert.deepEqual(result, result2);
  });

  await t.test('getActiveFloorPlan throws NotFoundError for unknown restaurant', async () => {
    const service = new FloorPlansService(createMockDatabaseService(mockDbState));
    await assert.rejects(
      () => service.getActiveFloorPlan('unknown_restaurant'),
      (err) => err instanceof NotFoundError && err.message.includes('not found')
    );
  });

  await t.test('updateFloorPlan rejects cross-restaurant floor edits (Tenant Isolation)', async () => {
    const service = new FloorPlansService(createMockDatabaseService(mockDbState));
    // Caller attempts to update Restaurant 2's floor using Restaurant 1 path
    await assert.rejects(
      () =>
        service.updateFloorPlan('b0001', {
          floor_id: 'fl_02', // belongs to b0002!
          base_version: 1,
          tables: [{ table_number: 'T01', capacity: 2, x: 10, y: 10, w: 2, h: 2 }],
        }),
      (err) => err instanceof ForbiddenError && err.message.includes('does not belong to restaurant')
    );
  });

  await t.test('updateFloorPlan rejects stale base version with 409 VERSION_CONFLICT', async () => {
    const service = new FloorPlansService(createMockDatabaseService(mockDbState));
    // Current version in DB is 1; client sends stale base_version: 0
    await assert.rejects(
      () =>
        service.updateFloorPlan('b0001', {
          floor_id: 'fl_01',
          base_version: 0, // stale!
          tables: [{ id: 'tbl_01', table_number: 'T01', capacity: 2, x: 10, y: 10, w: 2, h: 2 }],
        }),
      (err) =>
        err instanceof ConflictError &&
        err.code === ErrorCode.VERSION_CONFLICT &&
        err.message.includes('Floor plan version conflict')
    );
  });

  await t.test('updateFloorPlan prevents overwrites between concurrent edits on same base version', async () => {
    const service = new FloorPlansService(createMockDatabaseService(mockDbState));

    // Client A and Client B both observe base_version: 1
    const clientAPayload = {
      floor_id: 'fl_01',
      base_version: 1,
      tables: [
        { id: 'tbl_01', table_number: 'T01', capacity: 2, x: 12, y: 12, w: 2, h: 2 },
        { id: 'tbl_04', table_number: 'T04', capacity: 4, x: 20, y: 30, w: 3, h: 3 },
      ],
    };

    const clientBPayload = {
      floor_id: 'fl_01',
      base_version: 1,
      tables: [
        { id: 'tbl_01', table_number: 'T01', capacity: 4, x: 15, y: 15, w: 2.5, h: 2.5 },
        { id: 'tbl_04', table_number: 'T04', capacity: 4, x: 20, y: 30, w: 3, h: 3 },
      ],
    };

    // Client A commits first -> succeeds and advances version to 2
    const resA = await service.updateFloorPlan('b0001', clientAPayload);
    assert.equal(resA.success, true);
    assert.equal(resA.version_number, 2);

    // Client B attempts commit with now-stale base_version 1 -> rejected with 409 Conflict
    await assert.rejects(
      () => service.updateFloorPlan('b0001', clientBPayload),
      (err) =>
        err instanceof ConflictError &&
        err.code === ErrorCode.VERSION_CONFLICT &&
        err.message.includes('Floor plan version conflict')
    );
  });

  await t.test('updateFloorPlan protects held and confirmed tables against removal or retirement', async () => {
    const service = new FloorPlansService(createMockDatabaseService(mockDbState));

    // tbl_04 has active allocation alloc_01 (status: CONFIRMED).
    // Owner tries to omit tbl_04 (or retire it)
    const dangerousPayload = {
      floor_id: 'fl_01',
      base_version: 2, // current is 2 now
      tables: [
        { id: 'tbl_01', table_number: 'T01', capacity: 2, x: 10, y: 10, w: 2, h: 2 },
        // tbl_04 omitted!
      ],
    };

    await assert.rejects(
      () => service.updateFloorPlan('b0001', dangerousPayload),
      (err) =>
        err instanceof ConflictError &&
        err.code === ErrorCode.INVENTORY_HOLD_CONFLICT &&
        err.message.includes('Cannot remove or retire table "T04"')
    );

    // Also rejects if explicitly marking is_active: false
    const dangerousRetirePayload = {
      floor_id: 'fl_01',
      base_version: 2,
      tables: [
        { id: 'tbl_01', table_number: 'T01', capacity: 2, x: 10, y: 10, w: 2, h: 2 },
        { id: 'tbl_04', table_number: 'T04', capacity: 4, is_active: false, x: 20, y: 30, w: 3, h: 3 },
      ],
    };

    await assert.rejects(
      () => service.updateFloorPlan('b0001', dangerousRetirePayload),
      (err) =>
        err instanceof ConflictError &&
        err.code === ErrorCode.INVENTORY_HOLD_CONFLICT &&
        err.message.includes('Cannot remove or retire table "T04"')
    );
  });

  await t.test('updateFloorPlan safely soft-retires unallocated table and preserves stable IDs', async () => {
    const service = new FloorPlansService(createMockDatabaseService(mockDbState));

    // tbl_05 has NO active allocation -> safe to retire
    const safePayload = {
      floor_id: 'fl_01',
      base_version: 2,
      tables: [
        { id: 'tbl_01', table_number: 'T01', capacity: 2, x: 10, y: 10, w: 2, h: 2 },
        { id: 'tbl_04', table_number: 'T04', capacity: 4, x: 20, y: 30, w: 3, h: 3 },
        // tbl_05 omitted -> soft-retired
      ],
    };

    const res = await service.updateFloorPlan('b0001', safePayload);
    assert.equal(res.success, true);
    assert.equal(res.version_number, 3);

    // Verify tbl_05 was soft-retired, NOT deleted
    assert.equal(mockDbState.tables.get('tbl_05').is_active, false);
  });
});
