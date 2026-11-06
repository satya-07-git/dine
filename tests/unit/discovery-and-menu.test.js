const test = require('node:test');
const assert = require('node:assert/strict');

const {
  haversineDistance,
  validateGeoCoordinates,
  validateRadius,
  validatePagination,
  validatePriceTier,
  sanitizePublicRestaurantProjection,
  DiscoveryService,
} = require('../../apps/api/dist/modules/discovery/discovery.service');
const { RestaurantsService } = require('../../apps/api/dist/modules/restaurants/restaurants.service');
const { ValidationError, NotFoundError } = require('../../apps/api/dist/common/errors/app-error');
const { PolicyMode } = require('../../packages/contracts/dist/enums');

test('EPIC-005: Geospatial Coordinate & Filter Validation Guards', async (t) => {
  await t.test('accepts valid geographic coordinates within bounds', () => {
    assert.deepEqual(validateGeoCoordinates(12.9716, 77.5946), { lat: 12.9716, lng: 77.5946 });
    assert.deepEqual(validateGeoCoordinates('12.9716', '77.5946'), { lat: 12.9716, lng: 77.5946 });
    assert.deepEqual(validateGeoCoordinates(0, 0), { lat: 0, lng: 0 });
    assert.deepEqual(validateGeoCoordinates(90, 180), { lat: 90, lng: 180 });
    assert.deepEqual(validateGeoCoordinates(-90, -180), { lat: -90, lng: -180 });
  });

  await t.test('rejects out-of-range latitude with ValidationError', () => {
    assert.throws(
      () => validateGeoCoordinates(90.001, 77.5946),
      (err) => err instanceof ValidationError && err.message.includes('Latitude must be between -90 and 90')
    );
    assert.throws(
      () => validateGeoCoordinates(-90.1, 77.5946),
      (err) => err instanceof ValidationError && err.message.includes('Latitude must be between -90 and 90')
    );
    assert.throws(
      () => validateGeoCoordinates(120, 0),
      (err) => err instanceof ValidationError
    );
  });

  await t.test('rejects out-of-range longitude with ValidationError', () => {
    assert.throws(
      () => validateGeoCoordinates(12.9716, 180.001),
      (err) => err instanceof ValidationError && err.message.includes('Longitude must be between -180 and 180')
    );
    assert.throws(
      () => validateGeoCoordinates(12.9716, -180.001),
      (err) => err instanceof ValidationError && err.message.includes('Longitude must be between -180 and 180')
    );
    assert.throws(
      () => validateGeoCoordinates(0, -200),
      (err) => err instanceof ValidationError
    );
  });

  await t.test('rejects missing or non-numeric coordinates with ValidationError', () => {
    assert.throws(
      () => validateGeoCoordinates(null, 77.5946),
      (err) => err instanceof ValidationError
    );
    assert.throws(
      () => validateGeoCoordinates(12.9716, undefined),
      (err) => err instanceof ValidationError
    );
    assert.throws(
      () => validateGeoCoordinates('invalid_coord', 77.5946),
      (err) => err instanceof ValidationError
    );
  });

  await t.test('validateRadius enforces positive bounds and max 50km limit', () => {
    // Defaults to 10km when omitted
    assert.equal(validateRadius(undefined), 10);
    assert.equal(validateRadius(null), 10);
    assert.equal(validateRadius(''), 10);
    assert.equal(validateRadius(5), 5);
    assert.equal(validateRadius(50), 50);

    // Rejects 0 or negative
    assert.throws(
      () => validateRadius(0),
      (err) => err instanceof ValidationError && err.message.includes('Radius must be a positive number')
    );
    assert.throws(
      () => validateRadius(-5),
      (err) => err instanceof ValidationError && err.message.includes('Radius must be a positive number')
    );

    // Rejects exceeding max 50km
    assert.throws(
      () => validateRadius(50.01),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed limit of 50 km')
    );
    assert.throws(
      () => validateRadius(100),
      (err) => err instanceof ValidationError && err.message.includes('exceeds maximum allowed limit of 50 km')
    );
  });

  await t.test('validatePagination bounds query limit (1-50) and offset (>=0)', () => {
    assert.deepEqual(validatePagination(undefined, undefined), { limit: 20, offset: 0 });
    assert.deepEqual(validatePagination(10, 5), { limit: 10, offset: 5 });

    // Invalid limit
    assert.throws(
      () => validatePagination(0, 0),
      (err) => err instanceof ValidationError && err.message.includes('Limit must be between 1 and 50')
    );
    assert.throws(
      () => validatePagination(51, 0),
      (err) => err instanceof ValidationError && err.message.includes('Limit must be between 1 and 50')
    );

    // Invalid offset
    assert.throws(
      () => validatePagination(20, -1),
      (err) => err instanceof ValidationError && err.message.includes('Offset must be non-negative')
    );
  });

  await t.test('validatePriceTier validates standardized price tiers', () => {
    assert.doesNotThrow(() => validatePriceTier('$'));
    assert.doesNotThrow(() => validatePriceTier('$$'));
    assert.doesNotThrow(() => validatePriceTier('$$$'));
    assert.doesNotThrow(() => validatePriceTier('$$$$'));
    assert.doesNotThrow(() => validatePriceTier(undefined));

    assert.throws(
      () => validatePriceTier('$$$$$'),
      (err) => err instanceof ValidationError && err.message.includes('Invalid price tier')
    );
    assert.throws(
      () => validatePriceTier('EXPENSIVE'),
      (err) => err instanceof ValidationError && err.message.includes('Invalid price tier')
    );
  });
});

test('EPIC-005: Haversine Distance Calculation & Radius Boundaries', async (t) => {
  await t.test('calculates accurate distance between known geographic points', () => {
    // Bangalore Bistro (12.9716, 77.5946) to nearby spot (12.9750, 77.5900)
    const distLocal = haversineDistance(12.9716, 77.5946, 12.9750, 77.5900);
    assert.ok(distLocal < 1.0, `Expected local distance < 1 km, got ${distLocal}`);

    // Bangalore to Delhi (28.6139, 77.2090)
    const distDelhi = haversineDistance(12.9716, 77.5946, 28.6139, 77.2090);
    assert.ok(distDelhi > 1700 && distDelhi < 1800, `Expected ~1740 km, got ${distDelhi}`);

    // Point to itself is 0
    assert.equal(haversineDistance(12.9716, 77.5946, 12.9716, 77.5946), 0);
  });

  await t.test('nearby search filters correctly within 10km radius', () => {
    const origin = { lat: 12.9716, lng: 77.5946 };
    const insidePoint = { lat: 12.9750, lng: 77.5900 }; // ~0.63 km
    const outsidePoint = { lat: 28.6139, lng: 77.2090 }; // ~1740 km

    const d1 = haversineDistance(origin.lat, origin.lng, insidePoint.lat, insidePoint.lng);
    const d2 = haversineDistance(origin.lat, origin.lng, outsidePoint.lat, outsidePoint.lng);

    assert.ok(d1 <= 10, 'Inside point must be within 10km');
    assert.ok(d2 > 10, 'Outside point must be outside 10km');
  });
});

test('EPIC-005: Public Read Projection Privacy & Sanitization Audit', async (t) => {
  await t.test('sanitizePublicRestaurantProjection strips all sensitive internal, customer, and staff fields', () => {
    const dirtyRestaurantRecord = {
      id: 'b0000000-0000-0000-0000-000000000001',
      name: 'The Royal Dine Bistro',
      slug: 'the-royal-dine-bistro',
      description: 'Fine dining venue',
      timezone: 'Asia/Kolkata',
      policy_mode: 'FREE_RESERVATION',
      deposit_amount_minor: 0,
      deposit_currency: 'INR',
      latitude: 12.9716,
      longitude: 77.5946,
      distance_km: 1.25,
      price_tier: '$$$',
      cover_image_url: 'https://supabase.local/storage/v1/object/public/restaurant-media/b1/hero.jpg',
      cuisines: [{ id: 'c1', name: 'Indian', slug: 'indian' }],
      // Leaked / Private internal attributes that MUST be stripped:
      auth_uid: 'secret-auth-uid-123',
      email: 'owner@restaurant.local',
      phone: '+919999999999',
      user_id: 'internal-user-id',
      role: 'OWNER',
      gateway_secret: 'rzp_live_secret_key_never_leak',
      gateway_key: 'rzp_key_id',
      internal_notes: 'VIP customer complaints in review',
      staff_notes: 'Staff roster schedule',
      customer_notes: 'Customer allergies note',
    };

    const sanitized = sanitizePublicRestaurantProjection(dirtyRestaurantRecord);

    // Public fields present
    assert.equal(sanitized.id, dirtyRestaurantRecord.id);
    assert.equal(sanitized.name, dirtyRestaurantRecord.name);
    assert.equal(sanitized.slug, dirtyRestaurantRecord.slug);
    assert.equal(sanitized.timezone, dirtyRestaurantRecord.timezone);
    assert.equal(sanitized.price_tier, '$$$');
    assert.equal(sanitized.distance_km, 1.25);
    assert.equal(sanitized.cuisines.length, 1);

    // Private fields strictly excluded (undefined)
    assert.equal(sanitized.auth_uid, undefined);
    assert.equal(sanitized.email, undefined);
    assert.equal(sanitized.phone, undefined);
    assert.equal(sanitized.user_id, undefined);
    assert.equal(sanitized.role, undefined);
    assert.equal(sanitized.gateway_secret, undefined);
    assert.equal(sanitized.gateway_key, undefined);
    assert.equal(sanitized.internal_notes, undefined);
    assert.equal(sanitized.staff_notes, undefined);
    assert.equal(sanitized.customer_notes, undefined);
  });
});

test('EPIC-005: Publication Status & Retired Restaurant Visibility Rules', async (t) => {
  await t.test('unpublished and retired restaurants are rejected by getPublishedDetails', async () => {
    const mockDbService = {
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: 'b3',
                  name: 'The Heritage Club (Retired)',
                  slug: 'the-heritage-club-retired',
                  isPublished: false,
                  status: 'RETIRED',
                },
              ],
            }),
          }),
        }),
      }),
      getPool: () => null,
    };

    const restaurantsService = new RestaurantsService(mockDbService);

    await assert.rejects(
      async () => {
        await restaurantsService.getPublishedDetails('b3');
      },
      (err) => err instanceof NotFoundError && err.message.includes('not found')
    );
  });

  await t.test('unpublished and retired restaurants are rejected by getPublishedMenu', async () => {
    const mockDbService = {
      getDb: () => ({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: 'b3',
                  name: 'The Heritage Club (Retired)',
                  slug: 'the-heritage-club-retired',
                  isPublished: false,
                  status: 'RETIRED',
                },
              ],
            }),
          }),
        }),
      }),
      getPool: () => null,
    };

    const restaurantsService = new RestaurantsService(mockDbService);

    await assert.rejects(
      async () => {
        await restaurantsService.getPublishedMenu('b3');
      },
      (err) => err instanceof NotFoundError && err.message.includes('not found or not published')
    );
  });
});
