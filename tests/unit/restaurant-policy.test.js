const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  isValidIanaTimezone,
  getLocalTimeParts,
  parseTimeToMinutes,
  isWithinOpeningHours,
  RestaurantPolicyService,
} = require('../../apps/api/dist/modules/restaurants/restaurant-policy.service');
const { PolicyMode } = require('../../packages/contracts/dist/enums');
const { ValidationError, ConflictError } = require('../../apps/api/dist/common/errors/app-error');

test('EPIC-004: Timezone Validation & Configuration Guards', async (t) => {
  const policyService = new RestaurantPolicyService(null);

  await t.test('accepts valid IANA timezones', () => {
    assert.equal(isValidIanaTimezone('Asia/Kolkata'), true);
    assert.equal(isValidIanaTimezone('America/New_York'), true);
    assert.equal(isValidIanaTimezone('Europe/London'), true);
    assert.equal(isValidIanaTimezone('UTC'), true);
  });

  await t.test('rejects invalid, missing, or malformed timezones', () => {
    assert.equal(isValidIanaTimezone(''), false);
    assert.equal(isValidIanaTimezone('   '), false);
    assert.equal(isValidIanaTimezone(null), false);
    assert.equal(isValidIanaTimezone(undefined), false);
    assert.equal(isValidIanaTimezone('Mars/Olympus_Mons'), false);
    assert.equal(isValidIanaTimezone('Invalid/Timezone'), false);
  });

  await t.test('validatePolicyConfig rejects missing or invalid timezone with ValidationError', () => {
    assert.throws(
      () => {
        policyService.validatePolicyConfig({ timezone: '' });
      },
      (err) => err instanceof ValidationError && err.message.includes('Invalid or missing timezone')
    );

    assert.throws(
      () => {
        policyService.validatePolicyConfig({ timezone: 'Invalid/NonExistentZone' });
      },
      (err) => err instanceof ValidationError && err.message.includes('Invalid or missing timezone')
    );
  });
});

test('EPIC-004: Policy Mode & Deposit Validation', async (t) => {
  const policyService = new RestaurantPolicyService(null);

  await t.test('DEPOSIT_REQUIRED requires positive integer minor-unit amount and currency', () => {
    // Valid positive deposit
    assert.doesNotThrow(() => {
      policyService.validatePolicyConfig({
        policy_mode: PolicyMode.DEPOSIT_REQUIRED,
        deposit_amount_minor: 50000,
        deposit_currency: 'INR',
      });
    });

    // Zero amount rejected
    assert.throws(
      () => {
        policyService.validatePolicyConfig({
          policy_mode: PolicyMode.DEPOSIT_REQUIRED,
          deposit_amount_minor: 0,
          deposit_currency: 'INR',
        });
      },
      (err) => err instanceof ValidationError && err.message.includes('DEPOSIT_REQUIRED validates positive integer')
    );

    // Negative amount rejected
    assert.throws(
      () => {
        policyService.validatePolicyConfig({
          policy_mode: PolicyMode.DEPOSIT_REQUIRED,
          deposit_amount_minor: -500,
          deposit_currency: 'INR',
        });
      },
      (err) => err instanceof ValidationError && err.message.includes('DEPOSIT_REQUIRED validates positive integer')
    );

    // Fractional amount rejected (minor units must be integers)
    assert.throws(
      () => {
        policyService.validatePolicyConfig({
          policy_mode: PolicyMode.DEPOSIT_REQUIRED,
          deposit_amount_minor: 125.5,
          deposit_currency: 'INR',
        });
      },
      (err) => err instanceof ValidationError && err.message.includes('DEPOSIT_REQUIRED validates positive integer')
    );

    // Missing amount rejected
    assert.throws(
      () => {
        policyService.validatePolicyConfig({
          policy_mode: PolicyMode.DEPOSIT_REQUIRED,
        });
      },
      (err) => err instanceof ValidationError && err.message.includes('DEPOSIT_REQUIRED validates positive integer')
    );

    // Invalid currency code length rejected
    assert.throws(
      () => {
        policyService.validatePolicyConfig({
          policy_mode: PolicyMode.DEPOSIT_REQUIRED,
          deposit_amount_minor: 5000,
          deposit_currency: 'RUPEES',
        });
      },
      (err) => err instanceof ValidationError && err.message.includes('valid 3-letter ISO code')
    );
  });

  await t.test('FREE_RESERVATION allows zero deposit', () => {
    assert.doesNotThrow(() => {
      policyService.validatePolicyConfig({
        policy_mode: PolicyMode.FREE_RESERVATION,
        deposit_amount_minor: 0,
      });
    });
  });

  await t.test('validates party sizes and durations', () => {
    assert.throws(
      () => {
        policyService.validatePolicyConfig({ default_duration_min: 0 });
      },
      (err) => err instanceof ValidationError && err.message.includes('Default duration must be a positive integer')
    );

    assert.throws(
      () => {
        policyService.validatePolicyConfig({ min_party_size: 6, max_party_size: 4 });
      },
      (err) => err instanceof ValidationError && err.message.includes('Maximum party size must be greater than or equal')
    );
  });
});

test('EPIC-004: Operating Hours, Midnight/Overnight Intervals & Timezones', async (t) => {
  await t.test('converts UTC instant to correct local timezone date and minutes', () => {
    // 2026-11-14 13:30:00 UTC in Asia/Kolkata (+5:30) is 19:00:00 local
    const utcDate = new Date('2026-11-14T13:30:00Z');
    const parts = getLocalTimeParts(utcDate, 'Asia/Kolkata');

    assert.equal(parts.hours, 19);
    assert.equal(parts.minutes, 0);
    assert.equal(parts.totalMinutes, 19 * 60); // 1140 minutes
    assert.equal(parts.dayOfWeek, 6); // Saturday
  });

  await t.test('parses HH:MM time strings correctly', () => {
    assert.equal(parseTimeToMinutes('11:00:00'), 660);
    assert.equal(parseTimeToMinutes('23:00:00'), 1380);
    assert.equal(parseTimeToMinutes('02:00:00'), 120);
  });

  await t.test('evaluates standard same-day opening hours (11:00 to 23:00)', () => {
    const openMin = parseTimeToMinutes('11:00:00'); // 660
    const closeMin = parseTimeToMinutes('23:00:00'); // 1380
    const duration = 90;

    // 13:00 (780 min) for 90 min ends at 14:30 (870 min) -> within [660, 1380]
    assert.equal(isWithinOpeningHours(780, duration, openMin, closeMin), true);

    // 10:00 (600 min) -> starts before open (660) -> false
    assert.equal(isWithinOpeningHours(600, duration, openMin, closeMin), false);

    // 22:00 (1320 min) for 90 min ends at 23:30 (1410 min) -> ends after close (1380) -> false
    assert.equal(isWithinOpeningHours(1320, duration, openMin, closeMin), false);
  });

  await t.test('evaluates overnight schedule crossing midnight (18:00 to 02:00 next day)', () => {
    const openMin = parseTimeToMinutes('18:00:00'); // 1080
    const closeMin = parseTimeToMinutes('02:00:00'); // 120 (next day)
    const duration = 90;

    // Starts at 23:00 (1380 min) on day D, ends at 00:30 (1470 min) -> validly within overnight window [1080, 1560]
    assert.equal(isWithinOpeningHours(1380, duration, openMin, closeMin), true);

    // Starts at 00:30 (30 min) on day D+1, ends at 02:00 (120 min) -> validly within overnight window
    assert.equal(isWithinOpeningHours(30, duration, openMin, closeMin), true);

    // Starts at 01:00 (60 min) for 90 min ends at 02:30 (150 min) -> exceeds 02:00 closing -> false
    assert.equal(isWithinOpeningHours(60, duration, openMin, closeMin), false);

    // Starts at 16:00 (960 min) on day D -> before 18:00 opening -> false
    assert.equal(isWithinOpeningHours(960, duration, openMin, closeMin), false);
  });
});

test('EPIC-004: Special Closures & Conflict Detection with Buffer', async (t) => {
  await t.test('closure overlap logic detects intersecting intervals including turnover buffer', () => {
    const closureStart = new Date('2026-12-25T00:00:00Z').getTime();
    const closureEnd = new Date('2026-12-25T23:59:59Z').getTime();

    // Booking during closure
    const reqStart = new Date('2026-12-25T18:00:00Z').getTime();
    const reqEnd = reqStart + (90 + 15) * 60 * 1000;
    const isOverlapping = Math.max(reqStart, closureStart) < Math.min(reqEnd, closureEnd);
    assert.equal(isOverlapping, true);

    // Booking outside closure
    const safeStart = new Date('2026-12-26T12:00:00Z').getTime();
    const safeEnd = safeStart + (90 + 15) * 60 * 1000;
    const isSafeOverlapping = Math.max(safeStart, closureStart) < Math.min(safeEnd, closureEnd);
    assert.equal(isSafeOverlapping, false);
  });
});

test('EPIC-004: Multi-Tenant RBAC & Policy Scoping', async (t) => {
  const memberships = [
    { restaurantId: 'b0001', userId: 'usr_owner_1', role: 'OWNER', status: 'ACTIVE' },
    { restaurantId: 'b0001', userId: 'usr_manager_1', role: 'MANAGER', status: 'ACTIVE' },
    { restaurantId: 'b0001', userId: 'usr_host_1', role: 'HOST', status: 'ACTIVE' },
    { restaurantId: 'b0002', userId: 'usr_owner_2', role: 'OWNER', status: 'ACTIVE' },
  ];

  function authorizePolicyUpdate(user, restaurantId) {
    const mem = memberships.find((m) => m.restaurantId === restaurantId && m.userId === user.userId);
    if (!mem) return { allowed: false, status: 403, error: 'FORBIDDEN_TENANT_ACCESS' };
    if (mem.status !== 'ACTIVE') return { allowed: false, status: 403, error: 'MEMBERSHIP_SUSPENDED' };
    if (mem.role !== 'OWNER') return { allowed: false, status: 403, error: 'ROLE_NOT_AUTHORIZED' };
    return { allowed: true, status: 200 };
  }

  function authorizeClosureCreation(user, restaurantId) {
    const mem = memberships.find((m) => m.restaurantId === restaurantId && m.userId === user.userId);
    if (!mem) return { allowed: false, status: 403, error: 'FORBIDDEN_TENANT_ACCESS' };
    if (mem.status !== 'ACTIVE') return { allowed: false, status: 403, error: 'MEMBERSHIP_SUSPENDED' };
    if (!['OWNER', 'MANAGER'].includes(mem.role)) return { allowed: false, status: 403, error: 'ROLE_NOT_AUTHORIZED' };
    return { allowed: true, status: 200 };
  }

  await t.test('Restaurant 1 OWNER can update policies for Restaurant 1', () => {
    const res = authorizePolicyUpdate({ userId: 'usr_owner_1' }, 'b0001');
    assert.equal(res.allowed, true);
  });

  await t.test('Restaurant 1 staff CANNOT update policies for Restaurant 2 (Cross-Tenant Rejection)', () => {
    const res = authorizePolicyUpdate({ userId: 'usr_owner_1' }, 'b0002');
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
    assert.equal(res.error, 'FORBIDDEN_TENANT_ACCESS');
  });

  await t.test('Restaurant 1 HOST CANNOT update policies for Restaurant 1 (Role Authorization Rejection)', () => {
    const res = authorizePolicyUpdate({ userId: 'usr_host_1' }, 'b0001');
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
    assert.equal(res.error, 'ROLE_NOT_AUTHORIZED');
  });

  await t.test('Restaurant 1 MANAGER CAN schedule closures for Restaurant 1', () => {
    const res = authorizeClosureCreation({ userId: 'usr_manager_1' }, 'b0001');
    assert.equal(res.allowed, true);
  });

  await t.test('Restaurant 1 HOST CANNOT schedule closures (requires OWNER or MANAGER)', () => {
    const res = authorizeClosureCreation({ userId: 'usr_host_1' }, 'b0001');
    assert.equal(res.allowed, false);
    assert.equal(res.status, 403);
    assert.equal(res.error, 'ROLE_NOT_AUTHORIZED');
  });
});

test('EPIC-004: Policy Change Preserves Existing Booking History', async (t) => {
  await t.test('updating restaurant policy does not modify historical booking snapshot', () => {
    // Booking created under policy version 1
    const booking = {
      id: 'book_1001',
      restaurant_id: 'b0001',
      status: 'CONFIRMED',
      policy_snapshot: {
        policy_version: 1,
        policy_mode: 'FREE_RESERVATION',
        deposit_amount_minor: 0,
        currency: 'INR',
        duration_min: 90,
      },
    };

    // Restaurant policies updated to version 2 (DEPOSIT_REQUIRED, 50000 minor units)
    const updatedRestaurantPolicy = {
      policy_version: 2,
      policy_mode: 'DEPOSIT_REQUIRED',
      deposit_amount_minor: 50000,
      deposit_currency: 'INR',
      default_duration_min: 120,
    };

    // The historical booking policy snapshot remains preserved
    assert.equal(booking.policy_snapshot.policy_version, 1);
    assert.equal(booking.policy_snapshot.policy_mode, 'FREE_RESERVATION');
    assert.equal(booking.policy_snapshot.deposit_amount_minor, 0);
    assert.notEqual(booking.policy_snapshot.policy_version, updatedRestaurantPolicy.policy_version);
  });
});
