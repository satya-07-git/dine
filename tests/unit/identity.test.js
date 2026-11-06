const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  signSupabaseToken,
  verifySupabaseJwt,
} = require('../../apps/api/dist/common/auth/jwt.util');
const { AuthGuard } = require('../../apps/api/dist/common/auth/auth.guard');
const { TenantGuard } = require('../../apps/api/dist/common/auth/tenant.guard');
const { ResourceOwnershipGuard } = require('../../apps/api/dist/common/auth/ownership.guard');
const { RateLimiterGuard } = require('../../apps/api/dist/common/auth/rate-limiter.guard');

const TEST_SECRET = 'super-secret-jwt-key-min-16-chars-long';
const SUPABASE_URL = 'https://mock.supabase.co';

test('EPIC-003: Supabase JWT Verification & Security', async (t) => {
  await t.test('accepts valid Supabase HS256 token and extracts caller context', () => {
    const token = signSupabaseToken(
      {
        sub: 'a0000000-0000-0000-0000-000000000002',
        email: 'alice@customer.local',
        role: 'authenticated',
        user_metadata: { role: 'CUSTOMER' },
      },
      TEST_SECRET,
      { expiresInSeconds: 3600, issuer: `${SUPABASE_URL}/auth/v1` }
    );

    const payload = verifySupabaseJwt(token, TEST_SECRET, {
      expectedAudience: 'authenticated',
      expectedIssuer: `${SUPABASE_URL}/auth/v1`,
    });

    assert.equal(payload.sub, 'a0000000-0000-0000-0000-000000000002');
    assert.equal(payload.email, 'alice@customer.local');
    assert.equal(payload.aud, 'authenticated');
  });

  await t.test('rejects expired JWT with 401', () => {
    const expiredToken = signSupabaseToken(
      { sub: 'usr_expired', email: 'expired@customer.local' },
      TEST_SECRET,
      { expiresInSeconds: -60 }
    );

    assert.throws(
      () => {
        verifySupabaseJwt(expiredToken, TEST_SECRET);
      },
      (err) => err.status === 401 && /expired/i.test(err.message)
    );
  });

  await t.test('rejects forged / invalid signature with 401', () => {
    const validToken = signSupabaseToken(
      { sub: 'usr_target', email: 'target@customer.local' },
      TEST_SECRET
    );

    const tamperedToken = validToken.slice(0, -6) + 'abc123';

    assert.throws(
      () => {
        verifySupabaseJwt(tamperedToken, TEST_SECRET);
      },
      (err) => err.status === 401 && /signature/i.test(err.message)
    );
  });

  await t.test('rejects wrong audience with 401', () => {
    const token = signSupabaseToken(
      { sub: 'usr_aud', aud: 'foreign-audience' },
      TEST_SECRET
    );

    assert.throws(
      () => {
        verifySupabaseJwt(token, TEST_SECRET, { expectedAudience: 'authenticated' });
      },
      (err) => err.status === 401 && /audience/i.test(err.message)
    );
  });

  await t.test('rejects wrong issuer with 401', () => {
    const token = signSupabaseToken(
      { sub: 'usr_iss', iss: 'https://attacker.com/auth' },
      TEST_SECRET
    );

    assert.throws(
      () => {
        verifySupabaseJwt(token, TEST_SECRET, { expectedIssuer: `${SUPABASE_URL}/auth/v1` });
      },
      (err) => err.status === 401 && /issuer/i.test(err.message)
    );
  });

  await t.test('AuthGuard rejects missing or empty authorization header', () => {
    const mockConfig = {
      get: (k) => (k === 'SUPABASE_JWT_SECRET' ? TEST_SECRET : SUPABASE_URL),
      isProduction: true,
      isTest: false,
    };
    const guard = new AuthGuard(mockConfig);

    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    };

    assert.throws(() => {
      guard.canActivate(mockCtx);
    }, /Missing or invalid Authorization Bearer header/);
  });
});

test('EPIC-003: Tenant Isolation & Scoped Role Authorization', async (t) => {
  const reflector = {
    getAllAndOverride: () => ['OWNER', 'MANAGER', 'HOST'],
  };
  const mockDb = {
    getPool: () => ({
      query: async (query, params) => {
        const [restaurantId, userId] = params;
        // Seeded state simulation:
        // Host Charlie (a0004) -> Rest 1 (b0001): HOST ACTIVE
        // Host Dave (a0005) -> Rest 2 (b0002): HOST ACTIVE
        // Staff Eve (a0006) -> Rest 1 (b0001): HOST SUSPENDED
        if (userId === 'a0004' && restaurantId === 'b0001') {
          return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        }
        if (userId === 'a0005' && restaurantId === 'b0002') {
          return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
        }
        if (userId === 'a0006' && restaurantId === 'b0001') {
          return { rows: [{ role: 'HOST', status: 'SUSPENDED' }] };
        }
        return { rows: [] };
      },
    }),
  };

  const tenantGuard = new TenantGuard(reflector, mockDb);

  await t.test('Active Host in Restaurant 1 can access Restaurant 1', async () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'a0004', email: 'charlie@restaurant1.local' },
          params: { id: 'b0001' },
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    const allowed = await tenantGuard.canActivate(mockCtx);
    assert.equal(allowed, true);
  });

  await t.test('Active Host in Restaurant 1 CANNOT access Restaurant 2 (Cross-Tenant Rejection)', async () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'a0004', email: 'charlie@restaurant1.local' },
          params: { id: 'b0002' }, // Attempting to access Restaurant 2!
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    await assert.rejects(
      async () => {
        await tenantGuard.canActivate(mockCtx);
      },
      (err) => err.status === 403 && /FORBIDDEN_TENANT_ACCESS/i.test(err.message)
    );
  });

  await t.test('Suspended staff member is denied access with 403', async () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'a0006', email: 'eve@suspended.local' },
          params: { id: 'b0001' },
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    await assert.rejects(
      async () => {
        await tenantGuard.canActivate(mockCtx);
      },
      (err) => err.status === 403 && /SUSPENDED/i.test(err.message)
    );
  });
});

test('EPIC-003: Customer Resource Ownership & IDOR Protection', async (t) => {
  const reflector = {
    getAllAndOverride: (key) => 'booking',
  };
  const mockDb = {
    getPool: () => ({
      query: async (query, params) => {
        const [bookingId] = params;
        if (bookingId === 'book_alice_101') {
          return { rows: [{ user_id: 'cust_alice_uuid' }] };
        }
        if (bookingId === 'book_bob_102') {
          return { rows: [{ user_id: 'cust_bob_uuid' }] };
        }
        return { rows: [] };
      },
    }),
  };

  const ownershipGuard = new ResourceOwnershipGuard(reflector, mockDb);

  await t.test('Customer Alice can access her own booking', async () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'cust_alice_uuid' },
          params: { id: 'book_alice_101' },
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    const allowed = await ownershipGuard.canActivate(mockCtx);
    assert.equal(allowed, true);
  });

  await t.test('Customer Bob CANNOT access Customer Alice booking (IDOR Rejection)', async () => {
    const mockCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'cust_bob_uuid' },
          params: { id: 'book_alice_101' }, // Bob guessing Alice's booking ID
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    await assert.rejects(
      async () => {
        await ownershipGuard.canActivate(mockCtx);
      },
      (err) => err.status === 403 && /belonging to another customer/i.test(err.message)
    );
  });
});

test('EPIC-003: Rate Limiting & Abuse Protection', async (t) => {
  const reflector = {
    getAllAndOverride: () => ({ maxRequests: 3, windowMs: 1000 }),
  };
  const rateLimiter = new RateLimiterGuard(reflector);

  const makeCtx = () => ({
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '192.168.1.100',
        user: { userId: 'user_rate_test' },
        method: 'POST',
        baseUrl: '/v1',
        path: '/booking-holds',
      }),
    }),
    getHandler: () => {},
    getClass: () => {},
  });

  // First 3 requests succeed
  assert.equal(rateLimiter.canActivate(makeCtx()), true);
  assert.equal(rateLimiter.canActivate(makeCtx()), true);
  assert.equal(rateLimiter.canActivate(makeCtx()), true);

  // 4th request must be rejected with 429
  assert.throws(
    () => {
      rateLimiter.canActivate(makeCtx());
    },
    (err) => err.getStatus() === 429 && err.getResponse().code === 'RATE_LIMIT_EXCEEDED'
  );
});
