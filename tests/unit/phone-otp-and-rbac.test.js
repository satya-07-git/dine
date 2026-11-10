const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AuthOtpService,
  normalizePhone,
  generateNumericOtp,
  hashOtp,
  hashToken,
  checkOtpRateLimit,
  resetRateLimits,
  isSessionRevokedInCache,
  markSessionRevokedInCache,
} = require('../../apps/api/dist/modules/identity/auth-otp.service');

const {
  RestaurantStaffService,
  canRolePerformAction,
  getRoleActionMatrixPure,
} = require('../../apps/api/dist/modules/identity/restaurant-staff.service');

const {
  signSupabaseToken,
  verifySupabaseJwt,
} = require('../../apps/api/dist/common/auth/jwt.util');

const { AuthGuard } = require('../../apps/api/dist/common/auth/auth.guard');
const { TenantGuard } = require('../../apps/api/dist/common/auth/tenant.guard');
const { ResourceOwnershipGuard } = require('../../apps/api/dist/common/auth/ownership.guard');
const {
  OtpChallengeStatus,
  SessionStatus,
  StaffRole,
  StaffStatus,
  ErrorCode,
} = require('../../packages/contracts/dist');

const TEST_SECRET = 'super-secret-jwt-key-min-16-chars-long';
const SUPABASE_URL = 'https://mock.supabase.co';

test('EPIC-022 Capability 1: Phone OTP Authentication and Revocable Sessions', async (t) => {
  const mockDb = {
    getPool: () => ({
      query: async () => ({ rows: [] }),
    }),
  };
  const mockConfig = {
    get: (k) => (k === 'SUPABASE_JWT_SECRET' ? TEST_SECRET : SUPABASE_URL),
    isProduction: true,
    isTest: false,
  };

  const authOtpService = new AuthOtpService(mockDb, mockConfig);

  await t.test('T01 & T03: Valid OTP request yields redacted challenge and verification yields scoped session', async () => {
    resetRateLimits();
    const phone = '+919876543210';
    const reqRes = await authOtpService.requestOtp({ phone });

    // AC4: Secret Redaction - OTP value never appears in response
    assert.ok(reqRes.challengeId, 'Must return challengeId');
    assert.equal(reqRes.phone, phone);
    assert.equal(reqRes.expiresInSeconds, 300);
    assert.equal(reqRes.otp, undefined, 'Raw OTP must NEVER be exposed in response payload');

    // Retrieve synthetic test code
    const testOtp = authOtpService.getSyntheticOtpForTest(reqRes.challengeId);
    assert.ok(testOtp, 'Test OTP code must exist for testing');
    assert.equal(testOtp.length, 6, 'OTP must be 6 digits');

    // AC1: Valid OTP yields a scoped session
    const sessionRes = await authOtpService.verifyOtp({
      challengeId: reqRes.challengeId,
      phone,
      otp: testOtp,
    });

    assert.ok(sessionRes.sessionId, 'Session must have sessionId');
    assert.ok(sessionRes.accessToken, 'Session must include accessToken');
    assert.ok(sessionRes.refreshToken, 'Session must include refreshToken');
    assert.equal(sessionRes.tokenType, 'Bearer');
    assert.equal(sessionRes.user.phone, phone);

    // Verify JWT payload
    const decoded = verifySupabaseJwt(sessionRes.accessToken, TEST_SECRET);
    assert.equal(decoded.sub, sessionRes.user.id);
    assert.equal(decoded.sid, sessionRes.sessionId);
  });

  await t.test('T02 & T04: Wrong OTP increments attempt count; exceeding max attempts locks challenge', async () => {
    resetRateLimits();
    const phone = '+919876543222';
    const reqRes = await authOtpService.requestOtp({ phone });

    // Attempt 1 with wrong OTP -> 401 with remaining attempts
    await assert.rejects(
      async () => {
        await authOtpService.verifyOtp({
          challengeId: reqRes.challengeId,
          phone,
          otp: '000000',
        });
      },
      (err) => err.status === 401 && /2 attempt/i.test(err.message)
    );

    // Attempt 2 with wrong OTP -> 401 with remaining attempts
    await assert.rejects(
      async () => {
        await authOtpService.verifyOtp({
          challengeId: reqRes.challengeId,
          phone,
          otp: '000001',
        });
      },
      (err) => err.status === 401 && /1 attempt/i.test(err.message)
    );

    // Attempt 3 with wrong OTP -> 401 and challenge locked (MAX_ATTEMPTS_EXCEEDED)
    await assert.rejects(
      async () => {
        await authOtpService.verifyOtp({
          challengeId: reqRes.challengeId,
          phone,
          otp: '000002',
        });
      },
      (err) => err.status === 401 && /locked|exceeded/i.test(err.message)
    );

    // Attempt 4 even with CORRECT OTP must fail because challenge is locked
    const realOtp = authOtpService.getSyntheticOtpForTest(reqRes.challengeId);
    await assert.rejects(
      async () => {
        await authOtpService.verifyOtp({
          challengeId: reqRes.challengeId,
          phone,
          otp: realOtp,
        });
      },
      (err) => err.status === 401 && /exceeded|locked/i.test(err.message)
    );
  });

  await t.test('T02: Replayed OTP fails after challenge has been consumed', async () => {
    resetRateLimits();
    const phone = '+919876543233';
    const reqRes = await authOtpService.requestOtp({ phone });
    const realOtp = authOtpService.getSyntheticOtpForTest(reqRes.challengeId);

    // First verification succeeds
    const session = await authOtpService.verifyOtp({
      challengeId: reqRes.challengeId,
      phone,
      otp: realOtp,
    });
    assert.ok(session.sessionId);

    // Second verification with identical OTP must fail (Replay Protection)
    await assert.rejects(
      async () => {
        await authOtpService.verifyOtp({
          challengeId: reqRes.challengeId,
          phone,
          otp: realOtp,
        });
      },
      (err) => err.status === 401
    );
  });

  await t.test('T04: Abuse Controls - Phone format validation and rate limiting', async () => {
    // Non-numeric or invalid phone rejected with 400
    assert.throws(
      () => normalizePhone('invalid-phone-string'),
      (err) => err.status === 400
    );

    // Rate limit: max 3 requests per 10m window
    resetRateLimits();
    const phone = '+919876543244';
    assert.equal(checkOtpRateLimit(phone), true);
    assert.equal(checkOtpRateLimit(phone), true);
    assert.equal(checkOtpRateLimit(phone), true);
    assert.equal(checkOtpRateLimit(phone), false); // 4th request rate-limited
  });

  await t.test('T05: Refresh Token Rotation and Token Reuse Detection (Session Revocation)', async () => {
    resetRateLimits();
    const phone = '+919876543255';
    const reqRes = await authOtpService.requestOtp({ phone });
    const realOtp = authOtpService.getSyntheticOtpForTest(reqRes.challengeId);
    const session1 = await authOtpService.verifyOtp({
      challengeId: reqRes.challengeId,
      phone,
      otp: realOtp,
    });

    const oldRefreshToken = session1.refreshToken;

    // 1st Refresh: succeeds and rotates refresh token
    const session2 = await authOtpService.refreshToken({ refreshToken: oldRefreshToken });
    assert.ok(session2.accessToken);
    assert.notEqual(session2.refreshToken, oldRefreshToken, 'Refresh token must be rotated');

    // 2nd Refresh with OLD refresh token -> Replay Attack detected!
    await assert.rejects(
      async () => {
        await authOtpService.refreshToken({ refreshToken: oldRefreshToken });
      },
      (err) => err.status === 401 && /stolen|invalid|used/i.test(err.message)
    );
  });

  await t.test('T03 & AC3: Logout and Session Revocation blocks subsequent authenticated calls', async () => {
    resetRateLimits();
    const phone = '+919876543266';
    const reqRes = await authOtpService.requestOtp({ phone });
    const realOtp = authOtpService.getSyntheticOtpForTest(reqRes.challengeId);
    const session = await authOtpService.verifyOtp({
      challengeId: reqRes.challengeId,
      phone,
      otp: realOtp,
    });

    const guard = new AuthGuard(mockConfig);
    const makeCtx = (token) => ({
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
      }),
    });

    // Before logout: access token is accepted
    assert.equal(guard.canActivate(makeCtx(session.accessToken)), true);

    // Logout / Revoke session
    await authOtpService.logout(session.sessionId);

    // After logout: access token is rejected with 401
    assert.throws(
      () => {
        guard.canActivate(makeCtx(session.accessToken));
      },
      (err) => err.status === 401 && /revoked/i.test(err.message)
    );
  });
});

test('EPIC-022 Capability 2: Restaurant Onboarding, Staff and Tenant RBAC', async (t) => {
  const mockDb = {
    getPool: () => ({
      query: async (query, params) => {
        // Mock query responses for multi-tenant and role testing
        if (query.includes('FROM restaurant_staff') || query.includes('FROM restaurant_memberships')) {
          const [restId, userId] = params;
          // Manager Alice at Restaurant A
          if (userId === 'usr_manager_alice' && restId === 'rest_venue_A') {
            return { rows: [{ role: 'MANAGER', status: 'ACTIVE' }] };
          }
          // Host Bob at Restaurant A
          if (userId === 'usr_host_bob' && restId === 'rest_venue_A') {
            return { rows: [{ role: 'HOST', status: 'ACTIVE' }] };
          }
          // Revoked Staff Charlie at Restaurant A
          if (userId === 'usr_revoked_charlie' && restId === 'rest_venue_A') {
            return { rows: [{ role: 'HOST', status: 'REVOKED' }] };
          }
        }
        return { rows: [] };
      },
    }),
  };

  const reflector = {
    getAllAndOverride: (key) => ['OWNER', 'MANAGER'],
  };

  const tenantGuard = new TenantGuard(reflector, mockDb);

  await t.test('T06: Role & Action Matrix explicitly defines manager, host, customer permissions', () => {
    const matrix = getRoleActionMatrixPure();
    assert.equal(matrix.length, 5, 'Must define CUSTOMER, HOST, MANAGER, OWNER, PLATFORM_ADMIN');

    // Manager can configure policies and manage staff
    assert.equal(canRolePerformAction('MANAGER', 'edit_deposit_policies'), true);
    assert.equal(canRolePerformAction('MANAGER', 'manage_staff_memberships'), true);
    assert.equal(canRolePerformAction('MANAGER', 'edit_floor_plan'), true);

    // Restricted Staff (HOST) CANNOT edit deposits or manage staff
    assert.equal(canRolePerformAction('HOST', 'edit_deposit_policies'), false);
    assert.equal(canRolePerformAction('HOST', 'manage_staff_memberships'), false);

    // Customer CANNOT perform staff actions
    assert.equal(canRolePerformAction('CUSTOMER', 'record_walk_in'), false);
    assert.equal(canRolePerformAction('CUSTOMER', 'edit_deposit_policies'), false);
  });

  await t.test('T07 & AC8: Manager at Restaurant A can perform manager actions; Host is restricted', async () => {
    // Manager Alice accessing Restaurant A policy endpoint (allowed)
    const managerCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'usr_manager_alice', email: 'alice@restA.local' },
          params: { restaurantId: 'rest_venue_A' },
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    const allowed = await tenantGuard.canActivate(managerCtx);
    assert.equal(allowed, true);

    // Host Bob attempting to access Manager-only endpoint in Restaurant A (rejected with 403)
    const hostCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'usr_host_bob', email: 'bob@restA.local' },
          params: { restaurantId: 'rest_venue_A' },
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    await assert.rejects(
      async () => {
        await tenantGuard.canActivate(hostCtx);
      },
      (err) => err.status === 403 && /ROLE_NOT_AUTHORIZED/i.test(err.message)
    );
  });

  await t.test('T08 & AC6: Cross-Tenant Isolation - Staff at Restaurant A cannot access Restaurant B', async () => {
    const crossTenantCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'usr_manager_alice', email: 'alice@restA.local' },
          params: { restaurantId: 'rest_venue_B' }, // Target Restaurant B!
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    await assert.rejects(
      async () => {
        await tenantGuard.canActivate(crossTenantCtx);
      },
      (err) => err.status === 403 && /FORBIDDEN_TENANT_ACCESS/i.test(err.message)
    );
  });

  await t.test('T07 & AC9: Revoked staff membership is immediately denied access with 403', async () => {
    const revokedCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'usr_revoked_charlie', email: 'charlie@revoked.local' },
          params: { restaurantId: 'rest_venue_A' },
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    await assert.rejects(
      async () => {
        await tenantGuard.canActivate(revokedCtx);
      },
      (err) => err.status === 403 && /REVOKED/i.test(err.message)
    );
  });

  await t.test('T08 & AC7: Customer Ownership - Customer cannot access another customer booking (IDOR)', async () => {
    const ownershipReflector = {
      getAllAndOverride: () => 'booking',
    };
    const ownershipDb = {
      getPool: () => ({
        query: async () => ({ rows: [{ user_id: 'cust_alice_uuid' }] }),
      }),
    };
    const ownershipGuard = new ResourceOwnershipGuard(ownershipReflector, ownershipDb);

    // Bob attempting to view Alice's booking
    const idorCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'cust_bob_uuid' },
          params: { id: 'booking_alice_123' },
        }),
      }),
      getHandler: () => {},
      getClass: () => {},
    };

    await assert.rejects(
      async () => {
        await ownershipGuard.canActivate(idorCtx);
      },
      (err) => err.status === 403 && /belonging to another customer/i.test(err.message)
    );
  });
});
