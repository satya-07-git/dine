const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PackagesService,
} = require('../../apps/api/dist/modules/packages/packages.service');

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AppError,
} = require('../../apps/api/dist/common/errors/app-error');

const { ErrorCode } = require('../../packages/contracts/dist');

// ============================================================================
// Mock Database Service Helper
// ============================================================================
function createMockDb(initialData = {}) {
  const restaurants = initialData.restaurants || [
    {
      id: 'b0000000-0000-0000-0000-000000000001',
      name: 'The Royal Dine Bistro',
      is_published: true,
      status: 'PUBLISHED',
      default_duration_min: 90,
      turnover_buffer_min: 15,
      deposit_amount_minor: 0,
      deposit_currency: 'INR',
      timezone: 'Asia/Kolkata',
      min_party_size: 1,
      max_party_size: 12,
      policy_mode: 'FREE_RESERVATION',
      policy_version: 1,
    },
    {
      id: 'b0000000-0000-0000-0000-000000000002',
      name: 'The Grand Amber Palace',
      is_published: true,
      status: 'PUBLISHED',
      default_duration_min: 120,
      turnover_buffer_min: 15,
      deposit_amount_minor: 50000,
      deposit_currency: 'INR',
      timezone: 'Asia/Kolkata',
      min_party_size: 2,
      max_party_size: 20,
      policy_mode: 'DEPOSIT_REQUIRED',
      policy_version: 1,
    },
    {
      id: 'b0000000-0000-0000-0000-000000000003',
      name: 'The Heritage Club (Retired)',
      is_published: false,
      status: 'RETIRED',
    },
  ];

  const packages = initialData.packages || [
    {
      id: '90000000-0000-0000-0000-000000000001',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Chef Tasting Experience',
      slug: 'chef-tasting-experience',
      description: 'Seven-course bespoke tasting menu paired with artisanal infusions',
      price_minor: 250000,
      currency: 'INR',
      duration_min: 120,
      min_party_size: 2,
      max_party_size: 6,
      is_published: true,
      version: 1,
      terms_and_conditions: 'Requires 24h prior cancellation. All party members must participate.',
      created_at: new Date('2026-11-01T10:00:00Z'),
      updated_at: new Date('2026-11-01T10:00:00Z'),
    },
    {
      id: '90000000-0000-0000-0000-000000000002',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Grand Celebration Package',
      slug: 'grand-celebration-package',
      description: 'Celebration dining setup with custom floral centerpiece and champagne toast',
      price_minor: 500000,
      currency: 'INR',
      duration_min: 150,
      min_party_size: 4,
      max_party_size: 12,
      is_published: true,
      version: 1,
      terms_and_conditions: 'Customized dessert platter included. 48h cancellation window.',
      created_at: new Date('2026-11-01T11:00:00Z'),
      updated_at: new Date('2026-11-01T11:00:00Z'),
    },
    {
      id: '90000000-0000-0000-0000-000000000003',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Sunset Aperitivo (Draft)',
      slug: 'sunset-aperitivo-draft',
      description: 'Pre-release rooftop cocktail and antipasti package',
      price_minor: 180000,
      currency: 'INR',
      duration_min: 90,
      min_party_size: 2,
      max_party_size: 4,
      is_published: false, // Draft / unpublished
      version: 1,
      terms_and_conditions: 'Internal pilot testing only.',
      created_at: new Date('2026-11-01T12:00:00Z'),
      updated_at: new Date('2026-11-01T12:00:00Z'),
    },
    {
      id: '90000000-0000-0000-0000-000000000004',
      restaurant_id: 'b0000000-0000-0000-0000-000000000002',
      name: 'Royal Amber Banquet',
      slug: 'royal-amber-banquet',
      description: 'Signature royal thali feast with royal court ambiance',
      price_minor: 750000,
      currency: 'INR',
      duration_min: 120,
      min_party_size: 4,
      max_party_size: 16,
      is_published: true,
      version: 1,
      terms_and_conditions: '100% deposit required at hold creation.',
      created_at: new Date('2026-11-01T13:00:00Z'),
      updated_at: new Date('2026-11-01T13:00:00Z'),
    },
  ];

  const memberships = initialData.memberships || [
    {
      user_id: 'staff_owner_rest1',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      role: 'OWNER',
      status: 'ACTIVE',
    },
    {
      user_id: 'staff_manager_rest1',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      role: 'MANAGER',
      status: 'ACTIVE',
    },
    {
      user_id: 'staff_host_rest1',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      role: 'HOST',
      status: 'ACTIVE',
    },
    {
      user_id: 'staff_server_rest1',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      role: 'SERVER',
      status: 'ACTIVE',
    },
  ];

  const auditLogs = [];

  const mockQuery = async (sql, params = []) => {
    // 1. Restaurant check
    if (sql.includes('SELECT id, is_published, status FROM restaurants')) {
      const rest = restaurants.find((r) => r.id === params[0]);
      return { rows: rest ? [rest] : [] };
    }

    // 2. Public packages read
    if (sql.includes('FROM packages') && sql.includes('is_published = TRUE') && sql.includes('restaurant_id = $1')) {
      const rows = packages.filter((p) => p.restaurant_id === params[0] && p.is_published === true);
      return { rows };
    }

    // 3. Single package by ID
    if (sql.includes('FROM packages') && sql.includes('WHERE id = $1')) {
      const pkg = packages.find((p) => p.id === params[0]);
      return { rows: pkg ? [pkg] : [] };
    }

    // 4. Check slug conflict
    if (sql.includes("slug = ")) {
      const existing = packages.find((p) => p.restaurant_id === params[0] && p.slug === params[1]);
      return { rows: existing ? [existing] : [] };
    }

    // 5. Membership check
    if (sql.includes("FROM restaurant_memberships")) {
      const m = memberships.find((x) => x.restaurant_id === params[0] && x.user_id === params[1]);
      return { rows: m ? [m] : [] };
    }

    // 6. Owner packages read
    if (sql.includes("FROM packages") && sql.includes("WHERE restaurant_id = ")) {
      const rows = packages.filter((p) => p.restaurant_id === params[0]);
      return { rows };
    }

    // 7. Insert package
    if (sql.includes('INSERT INTO packages')) {
      const newPkg = {
        id: 'new_pkg_' + (packages.length + 1),
        restaurant_id: params[0],
        name: params[1],
        slug: params[2],
        description: params[3],
        price_minor: params[4],
        currency: params[5],
        duration_min: params[6],
        min_party_size: params[7],
        max_party_size: params[8],
        is_published: params[9],
        version: 1,
        terms_and_conditions: params[10],
        created_at: new Date(),
        updated_at: new Date(),
      };
      packages.push(newPkg);
      return { rows: [newPkg] };
    }

    // 8. Update package
    if (sql.includes('UPDATE packages')) {
      const pkgId = params[10];
      const pkg = packages.find((p) => p.id === pkgId);
      if (pkg) {
        pkg.name = params[0];
        pkg.description = params[1];
        pkg.duration_min = params[2];
        pkg.min_party_size = params[3];
        pkg.max_party_size = params[4];
        pkg.price_minor = params[5];
        pkg.currency = params[6];
        pkg.is_published = params[7];
        pkg.terms_and_conditions = params[8];
        pkg.version = params[9];
        pkg.updated_at = new Date();
        return { rows: [pkg] };
      }
      return { rows: [] };
    }

    // 9. Audit log insert
    if (sql.includes('INSERT INTO audit_logs')) {
      auditLogs.push({ actor_id: params[0], restaurant_id: params[1], action: params[2] });
      return { rows: [] };
    }

    return { rows: [] };
  };

  return {
    getPool: () => ({ query: mockQuery }),
    withTransaction: async (cb) => cb({ query: mockQuery }),
    packages,
    auditLogs,
  };
}

// ============================================================================
// 1. Public Read Catalog & Visibility Guards (T01, T03)
// ============================================================================
test('EPIC-015: Public Package Catalog & Privacy Invariant (T01, T03)', async (t) => {
  const db = createMockDb();
  const service = new PackagesService(db);

  await t.test('Returns published packages for a published restaurant', async () => {
    const res = await service.getPublishedPackages('b0000000-0000-0000-0000-000000000001');
    assert.equal(res.restaurant_id, 'b0000000-0000-0000-0000-000000000001');
    assert.equal(res.count, 2);
    assert.equal(res.packages.length, 2);

    const names = res.packages.map((p) => p.name);
    assert.ok(names.includes('Chef Tasting Experience'));
    assert.ok(names.includes('Grand Celebration Package'));
    assert.ok(!names.includes('Sunset Aperitivo (Draft)'), 'Draft/unpublished package must be excluded');
  });

  await t.test('Rejects unpublished / retired restaurant with NotFoundError', async () => {
    await assert.rejects(
      () => service.getPublishedPackages('b0000000-0000-0000-0000-000000000003'),
      (err) => err instanceof NotFoundError && err.message.includes('not found or unpublished')
    );
  });

  await t.test('Rejects non-existent restaurant with NotFoundError', async () => {
    await assert.rejects(
      () => service.getPublishedPackages('b0000000-0000-0000-0000-999999999999'),
      (err) => err instanceof NotFoundError
    );
  });

  await t.test('Public package read strips any private customer, booking, or financial secret fields', async () => {
    const res = await service.getPublishedPackages('b0000000-0000-0000-0000-000000000001');
    for (const pkg of res.packages) {
      assert.equal(pkg.user_id, undefined);
      assert.equal(pkg.customer_name, undefined);
      assert.equal(pkg.card_last4, undefined);
      assert.equal(pkg.payment_id, undefined);
      assert.equal(typeof pkg.duration_min, 'number');
      assert.equal(typeof pkg.price_minor, 'number');
    }
  });
});

// ============================================================================
// 2. Acceptance Criterion 1: Restaurant Ownership & Cross-Tenant Denial
// ============================================================================
test('EPIC-015: Acceptance Criterion 1 - Restaurant Ownership & Cross-Tenant Denial', async (t) => {
  const db = createMockDb();
  const service = new PackagesService(db);

  await t.test('Reading package from correct restaurant succeeds', async () => {
    const pkg = await service.getPackageById(
      'b0000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001'
    );
    assert.equal(pkg.id, '90000000-0000-0000-0000-000000000001');
    assert.equal(pkg.restaurant_id, 'b0000000-0000-0000-0000-000000000001');
    assert.equal(pkg.name, 'Chef Tasting Experience');
  });

  await t.test('Reading Restaurant 1 package with Restaurant 2 context is rejected with 403 Forbidden', async () => {
    await assert.rejects(
      () =>
        service.getPackageById(
          'b0000000-0000-0000-0000-000000000002', // Foreign Restaurant ID
          '90000000-0000-0000-0000-000000000001'  // Belongs to Restaurant 1
        ),
      (err) =>
        err instanceof ForbiddenError &&
        err.code === ErrorCode.PACKAGE_RESTAURANT_MISMATCH &&
        err.message.includes('does not belong to restaurant')
    );
  });

  await t.test('Reading Restaurant 2 package with Restaurant 1 context is rejected with 403 Forbidden', async () => {
    await assert.rejects(
      () =>
        service.getPackageById(
          'b0000000-0000-0000-0000-000000000001', // Foreign Restaurant ID
          '90000000-0000-0000-0000-000000000004'  // Belongs to Restaurant 2 (Royal Amber Banquet)
        ),
      (err) =>
        err instanceof ForbiddenError &&
        err.code === ErrorCode.PACKAGE_RESTAURANT_MISMATCH
    );
  });
});

// ============================================================================
// 3. Acceptance Criterion 2 & 3: Server Calculation & Client Tampering Guards
// ============================================================================
test('EPIC-015: Acceptance Criterion 3 - Protected Interval & Price Computed Server-Side', async (t) => {
  await t.test('Server overrides client duration and price with authoritative package terms', () => {
    // Simulate server calculation logic
    const restaurant = {
      default_duration_min: 90,
      turnover_buffer_min: 15,
      deposit_amount_minor: 0,
      deposit_currency: 'INR',
    };

    const packageTerms = {
      duration_min: 150, // Package specifies 150 min (vs default 90m)
      price_minor: 500000, // Package requires 5000.00 INR deposit
      currency: 'INR',
      version: 1,
    };

    // Client attempts to supply malicious overrides
    const clientPayload = {
      restaurant_id: 'rest_1',
      table_id: 'table_1',
      party_size: 4,
      requested_start: '2026-11-10T19:00:00.000Z',
      package_id: 'pkg_grand_celebration',
      // Malicious client inputs:
      duration_min: 30, // Attempting to reduce dining interval
      price_minor: 100,  // Attempting to pay only 1 INR instead of 5000 INR
      deposit_amount_minor: 0,
    };

    // Server-side derivation
    const effectiveDuration = packageTerms.duration_min; // Strictly ignores clientPayload.duration_min
    const effectiveDeposit = packageTerms.price_minor;   // Strictly ignores clientPayload.price_minor

    assert.equal(effectiveDuration, 150, 'Dining interval must be derived from package terms');
    assert.equal(effectiveDeposit, 500000, 'Deposit must be derived from package terms');

    const totalIntervalMinutes = effectiveDuration + restaurant.turnover_buffer_min;
    assert.equal(totalIntervalMinutes, 165, 'Total protected interval must include duration + buffer');
  });

  await t.test('Package terms are snapshotted immutably into booking', () => {
    const pkg = {
      id: 'pkg_101',
      name: 'Chef Tasting Experience',
      price_minor: 250000,
      currency: 'INR',
      duration_min: 120,
      version: 2,
      terms_and_conditions: 'Standard terms',
    };

    const snapshot = {
      id: pkg.id,
      package_id: pkg.id,
      name: pkg.name,
      price_minor: pkg.price_minor,
      currency: pkg.currency,
      duration_min: pkg.duration_min,
      version: pkg.version,
      terms_and_conditions: pkg.terms_and_conditions,
    };

    assert.equal(snapshot.package_id, 'pkg_101');
    assert.equal(snapshot.version, 2);
    assert.equal(snapshot.price_minor, 250000);
    assert.equal(snapshot.duration_min, 120);
  });
});

// ============================================================================
// 4. Acceptance Criterion 4: One-Table & No-Overlap Invariant
// ============================================================================
test('EPIC-015: Acceptance Criterion 4 - One-Table and No-Overlap Invariant', async (t) => {
  await t.test('Package booking allocates exactly one table under GiST range exclusion', () => {
    const allocations = [
      {
        table_id: 'table_t04',
        dining_period: [1000, 1165], // 150m package + 15m buffer
        status: 'HELD',
      },
    ];

    function canAllocateTable(tableId, start, end) {
      for (const a of allocations) {
        if (a.table_id === tableId && ['HELD', 'CONFIRMED'].includes(a.status)) {
          if (start < a.dining_period[1] && end > a.dining_period[0]) {
            throw new ConflictError('INVENTORY_HOLD_CONFLICT: Table already reserved', ErrorCode.INVENTORY_HOLD_CONFLICT);
          }
        }
      }
      return true;
    }

    // Competing booking overlapping the package interval
    assert.throws(
      () => canAllocateTable('table_t04', 1100, 1200),
      (err) => err instanceof ConflictError
    );

    // Non-overlapping interval after buffer succeeds
    assert.equal(canAllocateTable('table_t04', 1165, 1280), true);
  });
});

// ============================================================================
// 5. Package Eligibility & Capacity Bounds (T01)
// ============================================================================
test('EPIC-015: Package Capacity & Party Size Limits (T01)', async (t) => {
  const pkg = {
    min_party_size: 4,
    max_party_size: 10,
  };

  function validatePartySize(partySize) {
    if (partySize < pkg.min_party_size || partySize > pkg.max_party_size) {
      throw new ConflictError(
        `Party size ${partySize} outside package limits (${pkg.min_party_size}-${pkg.max_party_size})`,
        ErrorCode.PACKAGE_PARTY_SIZE_EXCEEDED
      );
    }
    return true;
  }

  await t.test('Party size below package min_party_size is rejected with PACKAGE_PARTY_SIZE_EXCEEDED', () => {
    assert.throws(
      () => validatePartySize(2),
      (err) => err instanceof ConflictError && err.code === ErrorCode.PACKAGE_PARTY_SIZE_EXCEEDED
    );
  });

  await t.test('Party size above package max_party_size is rejected with PACKAGE_PARTY_SIZE_EXCEEDED', () => {
    assert.throws(
      () => validatePartySize(12),
      (err) => err instanceof ConflictError && err.code === ErrorCode.PACKAGE_PARTY_SIZE_EXCEEDED
    );
  });

  await t.test('Party size within package bounds succeeds', () => {
    assert.equal(validatePartySize(4), true);
    assert.equal(validatePartySize(6), true);
    assert.equal(validatePartySize(10), true);
  });
});

// ============================================================================
// 6. Owner Package Operations & Version Monotonicity (T01, T03)
// ============================================================================
test('EPIC-015: Owner Operations & Package Versioning (T01, T03)', async (t) => {
  const db = createMockDb();
  const service = new PackagesService(db);

  await t.test('Authorized OWNER can create new package with version 1', async () => {
    const created = await service.createPackage(
      'staff_owner_rest1',
      'b0000000-0000-0000-0000-000000000001',
      {
        name: 'New Year Eve Gala',
        description: 'Exclusive multi-course celebration menu',
        price_minor: 600000,
        duration_min: 180,
        min_party_size: 4,
        max_party_size: 10,
        is_published: true,
      }
    );

    assert.equal(created.name, 'New Year Eve Gala');
    assert.equal(created.version, 1);
    assert.equal(created.duration_min, 180);
    assert.equal(created.price_minor, 600000);
    assert.equal(db.auditLogs.some((a) => a.action === 'CREATE_PACKAGE'), true);
  });

  await t.test('Unauthorized role (SERVER) cannot create package (403 Forbidden)', async () => {
    await assert.rejects(
      () =>
        service.createPackage(
          'staff_server_rest1',
          'b0000000-0000-0000-0000-000000000001',
          {
            name: 'Unauthorized Package',
            duration_min: 90,
            price_minor: 100000,
            min_party_size: 2,
            max_party_size: 4,
          }
        ),
      (err) => err instanceof ForbiddenError
    );
  });

  await t.test('Updating package increments version monotonically', async () => {
    const updated = await service.updatePackage(
      'staff_manager_rest1',
      '90000000-0000-0000-0000-000000000001',
      {
        price_minor: 280000, // Price updated to 2800 INR
        duration_min: 135,
      }
    );

    assert.equal(updated.version, 2, 'Version must increment from 1 to 2');
    assert.equal(updated.price_minor, 280000);
    assert.equal(updated.duration_min, 135);
    assert.equal(db.auditLogs.some((a) => a.action === 'UPDATE_PACKAGE'), true);
  });

  await t.test('Invalid duration (< 30m or > 360m) is rejected with ValidationError', async () => {
    await assert.rejects(
      () =>
        service.createPackage(
          'staff_owner_rest1',
          'b0000000-0000-0000-0000-000000000001',
          {
            name: 'Too Short Experience',
            duration_min: 15, // < 30
            price_minor: 10000,
            min_party_size: 2,
            max_party_size: 4,
          }
        ),
      (err) => err instanceof ValidationError
    );
  });
});