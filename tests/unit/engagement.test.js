const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CustomerEngagementService,
} = require('../../apps/api/dist/modules/customer-engagement/customer-engagement.service');

const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  InvalidStateTransitionError,
} = require('../../apps/api/dist/common/errors/app-error');

const { ErrorCode, ReviewStatus, SeatingPreference } = require('../../packages/contracts/dist');

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
      price_tier: '$$$',
      cover_image_url: 'https://cdn.example.com/bistro.jpg',
    },
    {
      id: 'b0000000-0000-0000-0000-000000000002',
      name: 'The Grand Amber Palace',
      is_published: true,
      status: 'PUBLISHED',
      price_tier: '$$$$',
      cover_image_url: 'https://cdn.example.com/amber.jpg',
    },
    {
      id: 'b0000000-0000-0000-0000-000000000003',
      name: 'The Heritage Club (Retired)',
      is_published: false,
      status: 'RETIRED',
    },
  ];

  const profiles = initialData.profiles || [
    {
      id: 'user_alice',
      auth_uid: 'user_alice',
      full_name: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+919876543211',
    },
    {
      id: 'user_bob',
      auth_uid: 'user_bob',
      full_name: 'Bob Jones',
      email: 'bob@example.com',
      phone: '+919876543212',
    },
  ];

  const bookings = initialData.bookings || [
    {
      id: 'book_alice_completed_1',
      user_id: 'user_alice',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      status: 'COMPLETED',
      party_size: 2,
    },
    {
      id: 'book_alice_confirmed_2',
      user_id: 'user_alice',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      status: 'CONFIRMED',
      party_size: 4,
    },
    {
      id: 'book_alice_cancelled_3',
      user_id: 'user_alice',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      status: 'CANCELLED',
      party_size: 2,
    },
    {
      id: 'book_bob_completed_4',
      user_id: 'user_bob',
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
      status: 'COMPLETED',
      party_size: 2,
    },
    {
      id: 'book_alice_rest2_completed',
      user_id: 'user_alice',
      restaurant_id: 'b0000000-0000-0000-0000-000000000002',
      status: 'COMPLETED',
      party_size: 3,
    },
  ];

  let favorites = [...(initialData.favorites || [])];
  let preferences = [...(initialData.preferences || [])];
  let reviews = [...(initialData.reviews || [])];

  const pool = {
    async query(sql, params = []) {
      const normalizedSql = sql.trim().toLowerCase();

      // 1. SELECT from restaurants
      if (normalizedSql.startsWith('select id, name, is_published, status from restaurants where id = $1')) {
        const rest = restaurants.find((r) => r.id === params[0]);
        return { rows: rest ? [rest] : [] };
      }

      if (normalizedSql.startsWith('select id, is_published, status from restaurants where id = $1')) {
        const rest = restaurants.find((r) => r.id === params[0]);
        return { rows: rest ? [rest] : [] };
      }

      // 2. FAVORITES queries
      if (normalizedSql.includes('from favorites f') && normalizedSql.includes('where f.user_id = $1 and f.restaurant_id = $2')) {
        const fav = favorites.find((f) => f.user_id === params[0] && f.restaurant_id === params[1]);
        if (!fav) return { rows: [] };
        const rest = restaurants.find((r) => r.id === fav.restaurant_id);
        return {
          rows: [
            {
              id: fav.id,
              restaurant_id: fav.restaurant_id,
              user_id: fav.user_id,
              created_at: fav.created_at,
              restaurant_name: rest ? rest.name : 'Unknown',
              price_tier: rest ? rest.price_tier : null,
              cover_image_url: rest ? rest.cover_image_url : null,
            },
          ],
        };
      }

      if (normalizedSql.startsWith('insert into favorites')) {
        const newFav = {
          id: `fav_${favorites.length + 1}`,
          user_id: params[0],
          restaurant_id: params[1],
          created_at: new Date(),
        };
        favorites.push(newFav);
        return { rows: [newFav] };
      }

      if (normalizedSql.startsWith('delete from favorites where user_id = $1 and restaurant_id = $2')) {
        favorites = favorites.filter((f) => !(f.user_id === params[0] && f.restaurant_id === params[1]));
        return { rows: [] };
      }

      if (normalizedSql.includes('from favorites f') && normalizedSql.includes('where f.user_id = $1')) {
        const userFavs = favorites
          .filter((f) => f.user_id === params[0])
          .map((fav) => {
            const rest = restaurants.find((r) => r.id === fav.restaurant_id);
            return {
              id: fav.id,
              restaurant_id: fav.restaurant_id,
              user_id: fav.user_id,
              created_at: fav.created_at,
              restaurant_name: rest ? rest.name : 'Unknown',
              price_tier: rest ? rest.price_tier : null,
              cover_image_url: rest ? rest.cover_image_url : null,
            };
          });
        return { rows: userFavs };
      }

      if (normalizedSql.startsWith('select id from favorites where user_id = $1 and restaurant_id = $2')) {
        const fav = favorites.find((f) => f.user_id === params[0] && f.restaurant_id === params[1]);
        return { rows: fav ? [{ id: fav.id }] : [] };
      }

      // 3. PREFERENCES queries
      if (normalizedSql.includes('from customer_preferences where user_id = $1') || normalizedSql.includes('from customer_preferences\n       where user_id = $1')) {
        const pref = preferences.find((p) => p.user_id === params[0]);
        return { rows: pref ? [pref] : [] };
      }

      if (normalizedSql.startsWith('insert into customer_preferences')) {
        const existingIdx = preferences.findIndex((p) => p.user_id === params[0]);
        const record = {
          id: existingIdx >= 0 ? preferences[existingIdx].id : `pref_${preferences.length + 1}`,
          user_id: params[0],
          dietary_requirements: params[1],
          seating_preference: params[2],
          allergies: params[3],
          special_notes: params[4],
          marketing_opt_in: params[5],
          created_at: existingIdx >= 0 ? preferences[existingIdx].created_at : new Date(),
          updated_at: new Date(),
        };
        if (existingIdx >= 0) {
          preferences[existingIdx] = record;
        } else {
          preferences.push(record);
        }
        return { rows: [record] };
      }

      // 4. BOOKINGS queries
      if (normalizedSql.startsWith('select id, user_id, restaurant_id, status from bookings where id = $1')) {
        const b = bookings.find((x) => x.id === params[0]);
        return { rows: b ? [b] : [] };
      }

      // 5. REVIEWS queries
      if (normalizedSql.startsWith('select id from reviews where booking_id = $1')) {
        const rev = reviews.find((r) => r.booking_id === params[0]);
        return { rows: rev ? [{ id: rev.id }] : [] };
      }

      if (normalizedSql.startsWith('insert into reviews')) {
        const newReview = {
          id: `rev_${reviews.length + 1}`,
          restaurant_id: params[0],
          booking_id: params[1],
          user_id: params[2],
          rating: params[3],
          title: params[4],
          comment: params[5],
          status: 'PUBLISHED',
          moderation_notes: null,
          owner_response: null,
          owner_responded_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        reviews.push(newReview);
        return { rows: [newReview] };
      }

      if (normalizedSql.includes('from reviews r') && normalizedSql.includes('r.restaurant_id = $1 and r.status = \'published\'')) {
        const publishedReviews = reviews
          .filter((r) => r.restaurant_id === params[0] && r.status === 'PUBLISHED')
          .map((r) => {
            const profile = profiles.find((p) => p.id === r.user_id || p.auth_uid === r.user_id);
            return {
              id: r.id,
              restaurant_id: r.restaurant_id,
              rating: r.rating,
              title: r.title,
              comment: r.comment,
              created_at: r.created_at,
              owner_response: r.owner_response,
              owner_responded_at: r.owner_responded_at,
              customer_name: profile ? profile.full_name : 'Guest',
            };
          });
        return { rows: publishedReviews };
      }

      if (normalizedSql.includes('from reviews r') && normalizedSql.includes('where r.user_id = $1')) {
        const userReviews = reviews
          .filter((r) => r.user_id === params[0])
          .map((r) => {
            const rest = restaurants.find((res) => res.id === r.restaurant_id);
            return {
              id: r.id,
              restaurant_id: r.restaurant_id,
              booking_id: r.booking_id,
              rating: r.rating,
              title: r.title,
              comment: r.comment,
              status: r.status,
              created_at: r.created_at,
              updated_at: r.updated_at,
              owner_response: r.owner_response,
              owner_responded_at: r.owner_responded_at,
              restaurant_name: rest ? rest.name : 'Unknown',
            };
          });
        return { rows: userReviews };
      }

      if (normalizedSql.includes('from reviews r') && normalizedSql.includes('where r.restaurant_id = $1')) {
        const ownerReviews = reviews
          .filter((r) => r.restaurant_id === params[0])
          .map((r) => {
            const profile = profiles.find((p) => p.id === r.user_id || p.auth_uid === r.user_id);
            return {
              id: r.id,
              restaurant_id: r.restaurant_id,
              booking_id: r.booking_id,
              user_id: r.user_id,
              rating: r.rating,
              title: r.title,
              comment: r.comment,
              status: r.status,
              moderation_notes: r.moderation_notes,
              owner_response: r.owner_response,
              owner_responded_at: r.owner_responded_at,
              created_at: r.created_at,
              updated_at: r.updated_at,
              customer_name: profile ? profile.full_name : 'Guest',
            };
          });
        return { rows: ownerReviews };
      }

      if (normalizedSql.startsWith('select id, restaurant_id from reviews where id = $1')) {
        const rev = reviews.find((r) => r.id === params[0]);
        return { rows: rev ? [rev] : [] };
      }

      if (normalizedSql.startsWith('update reviews\n       set owner_response = $1')) {
        const rev = reviews.find((r) => r.id === params[1]);
        if (rev) {
          rev.owner_response = params[0];
          rev.owner_responded_at = new Date();
          rev.updated_at = new Date();
          return { rows: [rev] };
        }
        return { rows: [] };
      }

      if (normalizedSql.startsWith('update reviews\n       set status = $1')) {
        const rev = reviews.find((r) => r.id === params[2]);
        if (rev) {
          rev.status = params[0];
          rev.moderation_notes = params[1];
          rev.updated_at = new Date();
          return { rows: [rev] };
        }
        return { rows: [] };
      }

      throw new Error(`Unhandled mock query: ${sql}`);
    },
  };

  return {
    getPool: () => pool,
  };
}

// ============================================================================
// Test Suites
// ============================================================================

test('EPIC-016 Customer Engagement: Favorites Management', async (t) => {
  await t.test('Add favorite for published restaurant succeeds (is_new = true)', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    const res = await service.addFavorite('user_alice', {
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
    });

    assert.equal(res.success, true);
    assert.equal(res.is_new, true);
    assert.equal(res.favorite.restaurant_id, 'b0000000-0000-0000-0000-000000000001');
    assert.equal(res.favorite.user_id, 'user_alice');
  });

  await t.test('AC3: Duplicate favorite write is repeat-safe (is_new = false, no error)', async () => {
    const db = createMockDb({
      favorites: [
        {
          id: 'fav_1',
          user_id: 'user_alice',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          created_at: new Date('2026-11-01T10:00:00Z'),
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    // Replay write attempt
    const res = await service.addFavorite('user_alice', {
      restaurant_id: 'b0000000-0000-0000-0000-000000000001',
    });

    assert.equal(res.success, true);
    assert.equal(res.is_new, false, 'Duplicate write must be repeat-safe returning is_new: false');
    assert.equal(res.favorite.id, 'fav_1');
  });

  await t.test('Add favorite for unpublished/retired restaurant fails with NotFoundError', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        await service.addFavorite('user_alice', {
          restaurant_id: 'b0000000-0000-0000-0000-000000000003', // RETIRED
        });
      },
      (err) => err instanceof NotFoundError
    );
  });

  await t.test('Remove favorite is idempotent', async () => {
    const db = createMockDb({
      favorites: [
        {
          id: 'fav_1',
          user_id: 'user_alice',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          created_at: new Date(),
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    const first = await service.removeFavorite('user_alice', 'b0000000-0000-0000-0000-000000000001');
    assert.equal(first.success, true);

    // Replay remove on already removed
    const second = await service.removeFavorite('user_alice', 'b0000000-0000-0000-0000-000000000001');
    assert.equal(second.success, true);
  });

  await t.test('List favorites returns customer items with metadata', async () => {
    const db = createMockDb({
      favorites: [
        {
          id: 'fav_1',
          user_id: 'user_alice',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          created_at: new Date('2026-11-01T10:00:00Z'),
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    const res = await service.getFavorites('user_alice');
    assert.equal(res.total, 1);
    assert.equal(res.items[0].restaurant_name, 'The Royal Dine Bistro');
    assert.equal(res.items[0].price_tier, '$$$');
  });

  await t.test('isFavorite checks correctly', async () => {
    const db = createMockDb({
      favorites: [
        {
          id: 'fav_1',
          user_id: 'user_alice',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          created_at: new Date(),
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    const check1 = await service.isFavorite('user_alice', 'b0000000-0000-0000-0000-000000000001');
    assert.equal(check1.is_favorite, true);

    const check2 = await service.isFavorite('user_alice', 'b0000000-0000-0000-0000-000000000002');
    assert.equal(check2.is_favorite, false);
  });
});

test('EPIC-016 Customer Preferences: Privacy & Boundaries', async (t) => {
  await t.test('AC1: Customer A cannot read Customer B preferences (ENGAGEMENT_USER_MISMATCH)', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        // Alice attempts to read Bob's preferences
        await service.getPreferences('user_alice', 'user_bob');
      },
      (err) => err instanceof ForbiddenError && err.code === ErrorCode.ENGAGEMENT_USER_MISMATCH
    );
  });

  await t.test('AC1: Customer A cannot update Customer B preferences (ENGAGEMENT_USER_MISMATCH)', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        // Alice attempts to update Bob's preferences
        await service.updatePreferences('user_alice', { dietary_requirements: ['VEGAN'] }, 'user_bob');
      },
      (err) => err instanceof ForbiddenError && err.code === ErrorCode.ENGAGEMENT_USER_MISMATCH
    );
  });

  await t.test('Customer reads and updates own preferences cleanly', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    const updated = await service.updatePreferences('user_alice', {
      dietary_requirements: ['VEGETARIAN', 'HALAL'],
      seating_preference: SeatingPreference.WINDOW,
      allergies: ['SHELLFISH'],
      special_notes: 'Celebrating 10th anniversary',
      marketing_opt_in: true,
    });

    assert.equal(updated.user_id, 'user_alice');
    assert.deepEqual(updated.dietary_requirements, ['VEGETARIAN', 'HALAL']);
    assert.equal(updated.seating_preference, 'WINDOW');
    assert.deepEqual(updated.allergies, ['SHELLFISH']);
    assert.equal(updated.special_notes, 'Celebrating 10th anniversary');
    assert.equal(updated.marketing_opt_in, true);

    // Fetch back
    const fetched = await service.getPreferences('user_alice');
    assert.equal(fetched.user_id, 'user_alice');
    assert.deepEqual(fetched.dietary_requirements, ['VEGETARIAN', 'HALAL']);
  });

  await t.test('Staff can view customer preferences for active booking at their restaurant', async () => {
    const db = createMockDb({
      preferences: [
        {
          id: 'pref_1',
          user_id: 'user_alice',
          dietary_requirements: ['GLUTEN_FREE'],
          seating_preference: 'BOOTH',
          allergies: ['PEANUTS'],
          special_notes: 'Allergy severe',
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    const res = await service.getBookingPreferencesForStaff(
      'staff_host_1',
      'b0000000-0000-0000-0000-000000000001',
      'book_alice_completed_1'
    );

    assert.equal(res.booking_id, 'book_alice_completed_1');
    assert.deepEqual(res.dietary_requirements, ['GLUTEN_FREE']);
    assert.deepEqual(res.allergies, ['PEANUTS']);
  });

  await t.test('Staff cannot view preferences if booking belongs to different restaurant', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        // Staff at rest 2 attempts to query booking at rest 1
        await service.getBookingPreferencesForStaff(
          'staff_host_rest2',
          'b0000000-0000-0000-0000-000000000002',
          'book_alice_completed_1' // At rest 1
        );
      },
      (err) => err instanceof ForbiddenError
    );
  });
});

test('EPIC-016 Verified Dining Reviews & Provenance', async (t) => {
  await t.test('Submit review for COMPLETED booking succeeds', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    const review = await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
      booking_id: 'book_alice_completed_1',
      rating: 5,
      title: 'Flawless Experience',
      comment: 'The chef tasting menu was world class!',
    });

    assert.equal(review.rating, 5);
    assert.equal(review.booking_id, 'book_alice_completed_1');
    assert.equal(review.restaurant_id, 'b0000000-0000-0000-0000-000000000001');
    assert.equal(review.status, 'PUBLISHED');
  });

  await t.test('AC2: Review without verified dining evidence (CONFIRMED) is rejected', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
          booking_id: 'book_alice_confirmed_2', // Not COMPLETED yet!
          rating: 4,
          comment: 'Looking forward to it',
        });
      },
      (err) => err instanceof InvalidStateTransitionError && err.message.includes('REVIEW_NOT_ELIGIBLE')
    );
  });

  await t.test('AC2: Review for CANCELLED booking is rejected', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
          booking_id: 'book_alice_cancelled_3',
          rating: 1,
          comment: 'Cancelled visit',
        });
      },
      (err) => err instanceof InvalidStateTransitionError && err.message.includes('REVIEW_NOT_ELIGIBLE')
    );
  });

  await t.test('AC1: Review for booking owned by another customer is rejected (ENGAGEMENT_USER_MISMATCH)', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        // Alice attempts to review Bob's completed booking
        await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
          booking_id: 'book_bob_completed_4',
          rating: 5,
          comment: 'Reviewing for Bob',
        });
      },
      (err) => err instanceof ForbiddenError && err.code === ErrorCode.ENGAGEMENT_USER_MISMATCH
    );
  });

  await t.test('Review for booking at another restaurant is rejected (REVIEW_NOT_ELIGIBLE)', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        // Booking is at Rest 2, but request specifies Rest 1
        await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
          booking_id: 'book_alice_rest2_completed',
          rating: 5,
          comment: 'Great meal',
        });
      },
      (err) => err instanceof ValidationError && err.message.includes('REVIEW_NOT_ELIGIBLE')
    );
  });

  await t.test('Duplicate review for same booking is rejected with ConflictError', async () => {
    const db = createMockDb({
      reviews: [
        {
          id: 'rev_existing',
          booking_id: 'book_alice_completed_1',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          user_id: 'user_alice',
          rating: 5,
          comment: 'First review',
          status: 'PUBLISHED',
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
          booking_id: 'book_alice_completed_1',
          rating: 4,
          comment: 'Second review attempt',
        });
      },
      (err) => err instanceof ConflictError && err.code === ErrorCode.REVIEW_ALREADY_EXISTS
    );
  });

  await t.test('Rating bounds validation: 0 and 6 are rejected, 1 and 5 are accepted', async () => {
    const db = createMockDb();
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
          booking_id: 'book_alice_completed_1',
          rating: 0,
          comment: 'Bad',
        });
      },
      (err) => err instanceof ValidationError
    );

    await assert.rejects(
      async () => {
        await service.createReview('user_alice', 'b0000000-0000-0000-0000-000000000001', {
          booking_id: 'book_alice_completed_1',
          rating: 6,
          comment: 'Super',
        });
      },
      (err) => err instanceof ValidationError
    );
  });

  await t.test('AC4: Public review projection masks identity and excludes private data', async () => {
    const db = createMockDb({
      reviews: [
        {
          id: 'rev_1',
          booking_id: 'book_alice_completed_1',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          user_id: 'user_alice',
          rating: 5,
          title: 'Signature Dining',
          comment: 'Exquisite culinary presentation.',
          status: 'PUBLISHED',
          owner_response: 'Thank you for your visit!',
          owner_responded_at: new Date('2026-11-02T10:00:00Z'),
          created_at: new Date('2026-11-01T15:00:00Z'),
        },
        {
          id: 'rev_2_hidden',
          booking_id: 'book_bob_completed_4',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          user_id: 'user_bob',
          rating: 1,
          comment: 'Hidden inappropriate review',
          status: 'HIDDEN', // Must NOT be in public projection!
          created_at: new Date(),
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    const publicRes = await service.getPublicReviews('b0000000-0000-0000-0000-000000000001');

    assert.equal(publicRes.total_reviews, 1, 'Only published reviews should appear');
    assert.equal(publicRes.average_rating, 5.0);

    const rev = publicRes.reviews[0];
    assert.equal(rev.customer_display_name, 'Alice S.', 'Customer name must be masked (e.g. Alice S.)');
    assert.equal(rev.user_id, undefined, 'Internal user_id must NOT leak into public projection');
    assert.equal(rev.email, undefined, 'Customer email must NOT leak');
    assert.equal(rev.phone, undefined, 'Customer phone must NOT leak');
    assert.equal(rev.booking_id, undefined, 'Booking ID must NOT leak');
    assert.equal(rev.owner_response, 'Thank you for your visit!');
  });

  await t.test('Owner can view, reply, and moderate reviews for venue', async () => {
    const db = createMockDb({
      reviews: [
        {
          id: 'rev_1',
          booking_id: 'book_alice_completed_1',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          user_id: 'user_alice',
          rating: 4,
          comment: 'Great dinner',
          status: 'PUBLISHED',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    // List reviews for venue
    const ownerList = await service.getOwnerReviews('staff_1', 'b0000000-0000-0000-0000-000000000001');
    assert.equal(ownerList.total, 1);
    assert.equal(ownerList.items[0].rating, 4);

    // Reply to review
    const replied = await service.respondToReview(
      'staff_1',
      'b0000000-0000-0000-0000-000000000001',
      'rev_1',
      { response: 'We are delighted you enjoyed your evening!' }
    );
    assert.equal(replied.owner_response, 'We are delighted you enjoyed your evening!');

    // Moderate review
    const moderated = await service.moderateReview(
      'staff_1',
      'b0000000-0000-0000-0000-000000000001',
      'rev_1',
      { status: ReviewStatus.FLAGGED, moderation_notes: 'Under internal management review' }
    );
    assert.equal(moderated.status, 'FLAGGED');
    assert.equal(moderated.moderation_notes, 'Under internal management review');
  });

  await t.test('Staff reply to foreign restaurant review is rejected with ForbiddenError', async () => {
    const db = createMockDb({
      reviews: [
        {
          id: 'rev_1',
          restaurant_id: 'b0000000-0000-0000-0000-000000000001',
          booking_id: 'b_1',
          user_id: 'u_1',
          rating: 5,
          comment: 'Good',
        },
      ],
    });
    const service = new CustomerEngagementService(db);

    await assert.rejects(
      async () => {
        // Staff at rest 2 attempts to reply to review at rest 1
        await service.respondToReview('staff_rest2', 'b0000000-0000-0000-0000-000000000002', 'rev_1', {
          response: 'Invalid reply',
        });
      },
      (err) => err instanceof ForbiddenError
    );
  });
});
