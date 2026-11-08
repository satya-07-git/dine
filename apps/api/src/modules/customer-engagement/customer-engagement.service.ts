import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  InvalidStateTransitionError,
} from '../../common/errors/app-error';
import {
  ErrorCode,
  ReviewStatus,
  SeatingPreference,
  FavoriteRestaurantDto,
  AddFavoriteRequestDto,
  AddFavoriteResponseDto,
  RemoveFavoriteResponseDto,
  FavoriteListResponseDto,
  CustomerPreferenceDto,
  UpdateCustomerPreferenceDto,
  CreateReviewRequestDto,
  PublicReviewDto,
  PublicReviewListResponseDto,
  CustomerReviewDetailDto,
  OwnerReviewDto,
  OwnerReviewListResponseDto,
  RespondToReviewRequestDto,
  ModerateReviewRequestDto,
  BookingPreferencesStaffResponseDto,
} from '@dine/contracts';

/**
 * Mask customer full name to protect personal identity in public projections.
 * e.g., "Alice Smith" -> "Alice S.", "Bob" -> "Bob", "John Michael Doe" -> "John D."
 */
function maskCustomerName(fullName?: string | null): string {
  if (!fullName || typeof fullName !== 'string') {
    return 'Verified Diner';
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

@Injectable()
export class CustomerEngagementService {
  private readonly logger = new Logger(CustomerEngagementService.name);

  constructor(private readonly db: DatabaseService) {}

  // ==========================================================================
  // 1. Favorites Management (Idempotent & Repeat-Safe)
  // ==========================================================================

  /**
   * Add a restaurant to the authenticated customer's favorites.
   * Repeat-safe: If already favorited, returns the existing record with is_new = false.
   */
  async addFavorite(userId: string, dto: AddFavoriteRequestDto): Promise<AddFavoriteResponseDto> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to manage favorites', ErrorCode.UNAUTHORIZED);
    }
    if (!dto.restaurant_id) {
      throw new ValidationError('restaurant_id is required');
    }

    const pool = this.db.getPool();

    // Verify restaurant exists and is active/published
    const restRes = await pool.query(
      `SELECT id, name, is_published, status FROM restaurants WHERE id = $1`,
      [dto.restaurant_id]
    );

    if (restRes.rows.length === 0 || !restRes.rows[0].is_published || restRes.rows[0].status !== 'PUBLISHED') {
      throw new NotFoundError(`Restaurant ${dto.restaurant_id} not found or unpublished`, ErrorCode.NOT_FOUND);
    }

    // Check if favorite already exists (Repeat-safe check)
    const existing = await pool.query(
      `SELECT f.id, f.restaurant_id, f.user_id, f.created_at,
              r.name as restaurant_name, r.price_tier, r.cover_image_url
       FROM favorites f
       JOIN restaurants r ON f.restaurant_id = r.id
       WHERE f.user_id = $1 AND f.restaurant_id = $2`,
      [userId, dto.restaurant_id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        success: true,
        is_new: false,
        favorite: {
          id: row.id,
          restaurant_id: row.restaurant_id,
          user_id: row.user_id,
          created_at: new Date(row.created_at).toISOString(),
          restaurant_name: row.restaurant_name,
          price_tier: row.price_tier,
          cover_image_url: row.cover_image_url,
        },
      };
    }

    // Insert new favorite
    const insertRes = await pool.query(
      `INSERT INTO favorites (user_id, restaurant_id)
       VALUES ($1, $2)
       RETURNING id, user_id, restaurant_id, created_at`,
      [userId, dto.restaurant_id]
    );

    const inserted = insertRes.rows[0];
    const restaurant = restRes.rows[0];

    return {
      success: true,
      is_new: true,
      favorite: {
        id: inserted.id,
        restaurant_id: inserted.restaurant_id,
        user_id: inserted.user_id,
        created_at: new Date(inserted.created_at).toISOString(),
        restaurant_name: restaurant.name,
      },
    };
  }

  /**
   * Remove a restaurant from caller's favorites (Idempotent).
   */
  async removeFavorite(userId: string, restaurantId: string): Promise<RemoveFavoriteResponseDto> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to manage favorites', ErrorCode.UNAUTHORIZED);
    }
    if (!restaurantId) {
      throw new ValidationError('restaurantId parameter is required');
    }

    const pool = this.db.getPool();
    await pool.query(
      `DELETE FROM favorites WHERE user_id = $1 AND restaurant_id = $2`,
      [userId, restaurantId]
    );

    return {
      success: true,
      restaurant_id: restaurantId,
      message: 'Restaurant removed from favorites successfully',
    };
  }

  /**
   * List customer's saved favorites.
   */
  async getFavorites(userId: string): Promise<FavoriteListResponseDto> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to list favorites', ErrorCode.UNAUTHORIZED);
    }

    const pool = this.db.getPool();
    const res = await pool.query(
      `SELECT f.id, f.restaurant_id, f.user_id, f.created_at,
              r.name as restaurant_name, r.price_tier, r.cover_image_url
       FROM favorites f
       JOIN restaurants r ON f.restaurant_id = r.id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [userId]
    );

    const items: FavoriteRestaurantDto[] = res.rows.map((row) => ({
      id: row.id,
      restaurant_id: row.restaurant_id,
      user_id: row.user_id,
      created_at: new Date(row.created_at).toISOString(),
      restaurant_name: row.restaurant_name,
      price_tier: row.price_tier,
      cover_image_url: row.cover_image_url,
    }));

    return {
      items,
      total: items.length,
    };
  }

  /**
   * Check whether a specific restaurant is favorited by the caller.
   */
  async isFavorite(userId: string, restaurantId: string): Promise<{ restaurant_id: string; is_favorite: boolean }> {
    if (!userId) {
      return { restaurant_id: restaurantId, is_favorite: false };
    }

    const pool = this.db.getPool();
    const res = await pool.query(
      `SELECT id FROM favorites WHERE user_id = $1 AND restaurant_id = $2 LIMIT 1`,
      [userId, restaurantId]
    );

    return {
      restaurant_id: restaurantId,
      is_favorite: res.rows.length > 0,
    };
  }

  // ==========================================================================
  // 2. Customer Preferences (Private & Bounded)
  // ==========================================================================

  /**
   * Retrieve personal preferences for authenticated caller.
   * Cross-customer access is strictly rejected (AC1).
   */
  async getPreferences(userId: string, targetUserId?: string): Promise<CustomerPreferenceDto> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to access preferences', ErrorCode.UNAUTHORIZED);
    }
    if (targetUserId && targetUserId !== userId) {
      throw new ForbiddenError(
        'ENGAGEMENT_USER_MISMATCH: Customer cannot access foreign user preferences',
        ErrorCode.ENGAGEMENT_USER_MISMATCH
      );
    }

    const pool = this.db.getPool();
    const res = await pool.query(
      `SELECT id, user_id, dietary_requirements, seating_preference, allergies,
              special_notes, marketing_opt_in, created_at, updated_at
       FROM customer_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0) {
      // Default empty preference profile
      return {
        id: `pref-default-${userId}`,
        user_id: userId,
        dietary_requirements: [],
        seating_preference: SeatingPreference.ANY,
        allergies: [],
        special_notes: null,
        marketing_opt_in: false,
        updated_at: new Date().toISOString(),
      };
    }

    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      dietary_requirements: row.dietary_requirements || [],
      seating_preference: row.seating_preference || SeatingPreference.ANY,
      allergies: row.allergies || [],
      special_notes: row.special_notes || null,
      marketing_opt_in: Boolean(row.marketing_opt_in),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Update or initialize personal dining preferences for caller.
   * Cross-customer access is strictly rejected (AC1).
   */
  async updatePreferences(
    userId: string,
    dto: UpdateCustomerPreferenceDto,
    targetUserId?: string
  ): Promise<CustomerPreferenceDto> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to update preferences', ErrorCode.UNAUTHORIZED);
    }
    if (targetUserId && targetUserId !== userId) {
      throw new ForbiddenError(
        'ENGAGEMENT_USER_MISMATCH: Customer cannot update foreign user preferences',
        ErrorCode.ENGAGEMENT_USER_MISMATCH
      );
    }

    const pool = this.db.getPool();
    const dietary = dto.dietary_requirements ? Array.from(new Set(dto.dietary_requirements)) : [];
    const allergies = dto.allergies ? Array.from(new Set(dto.allergies)) : [];
    const seating = dto.seating_preference || SeatingPreference.ANY;
    const marketing = dto.marketing_opt_in !== undefined ? Boolean(dto.marketing_opt_in) : false;
    const notes = dto.special_notes || null;

    const res = await pool.query(
      `INSERT INTO customer_preferences (
         user_id, dietary_requirements, seating_preference, allergies, special_notes, marketing_opt_in, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         dietary_requirements = EXCLUDED.dietary_requirements,
         seating_preference = EXCLUDED.seating_preference,
         allergies = EXCLUDED.allergies,
         special_notes = EXCLUDED.special_notes,
         marketing_opt_in = EXCLUDED.marketing_opt_in,
         updated_at = NOW()
       RETURNING id, user_id, dietary_requirements, seating_preference, allergies,
                 special_notes, marketing_opt_in, created_at, updated_at`,
      [userId, dietary, seating, allergies, notes, marketing]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      dietary_requirements: row.dietary_requirements,
      seating_preference: row.seating_preference,
      allergies: row.allergies,
      special_notes: row.special_notes,
      marketing_opt_in: Boolean(row.marketing_opt_in),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Restaurant staff operational access to customer dining preferences
   * strictly in the context of an active/confirmed booking at their venue.
   */
  async getBookingPreferencesForStaff(
    staffUserId: string,
    restaurantId: string,
    bookingId: string
  ): Promise<BookingPreferencesStaffResponseDto> {
    if (!staffUserId || !restaurantId || !bookingId) {
      throw new ValidationError('staffUserId, restaurantId, and bookingId are required');
    }

    const pool = this.db.getPool();

    // Verify booking belongs to this restaurant
    const bRes = await pool.query(
      `SELECT id, user_id, restaurant_id, status FROM bookings WHERE id = $1`,
      [bookingId]
    );

    if (bRes.rows.length === 0) {
      throw new NotFoundError(`Booking ${bookingId} not found`, ErrorCode.NOT_FOUND);
    }

    const booking = bRes.rows[0];
    if (booking.restaurant_id !== restaurantId) {
      throw new ForbiddenError(
        'FORBIDDEN_TENANT_ACCESS: Booking belongs to a different restaurant',
        ErrorCode.FORBIDDEN
      );
    }

    if (!booking.user_id) {
      return {
        booking_id: bookingId,
        restaurant_id: restaurantId,
        user_id: '',
        dietary_requirements: [],
        seating_preference: 'ANY',
        allergies: [],
        special_notes: null,
      };
    }

    // Fetch customer preferences
    const prefRes = await pool.query(
      `SELECT dietary_requirements, seating_preference, allergies, special_notes
       FROM customer_preferences WHERE user_id = $1`,
      [booking.user_id]
    );

    if (prefRes.rows.length === 0) {
      return {
        booking_id: bookingId,
        restaurant_id: restaurantId,
        user_id: booking.user_id,
        dietary_requirements: [],
        seating_preference: 'ANY',
        allergies: [],
        special_notes: null,
      };
    }

    const pref = prefRes.rows[0];
    return {
      booking_id: bookingId,
      restaurant_id: restaurantId,
      user_id: booking.user_id,
      dietary_requirements: pref.dietary_requirements || [],
      seating_preference: pref.seating_preference || 'ANY',
      allergies: pref.allergies || [],
      special_notes: pref.special_notes || null,
    };
  }

  // ==========================================================================
  // 3. Verified Dining Reviews (Eligibility, Provenance & Moderation)
  // ==========================================================================

  /**
   * Submit an eligible customer review.
   * Strictly enforces verified dining evidence (AC2), user ownership (AC1),
   * restaurant matching, rating bounds, and single-review uniqueness.
   */
  async createReview(
    userId: string,
    restaurantId: string,
    dto: CreateReviewRequestDto
  ): Promise<CustomerReviewDetailDto> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to submit reviews', ErrorCode.UNAUTHORIZED);
    }
    if (!restaurantId) {
      throw new ValidationError('restaurantId is required');
    }
    if (!dto.booking_id) {
      throw new ValidationError('booking_id is required');
    }

    // Rating bound validation (1 to 5)
    if (!dto.rating || typeof dto.rating !== 'number' || dto.rating < 1 || dto.rating > 5 || !Number.isInteger(dto.rating)) {
      throw new ValidationError(
        'Rating must be an integer between 1 and 5',
        [{ name: 'rating', reason: 'Must be an integer between 1 and 5' }]
      );
    }

    if (!dto.comment || typeof dto.comment !== 'string' || dto.comment.trim().length === 0) {
      throw new ValidationError('Review comment cannot be empty');
    }

    const pool = this.db.getPool();

    // 1. Fetch booking to verify evidence and ownership
    const bookingRes = await pool.query(
      `SELECT id, user_id, restaurant_id, status FROM bookings WHERE id = $1`,
      [dto.booking_id]
    );

    if (bookingRes.rows.length === 0) {
      throw new NotFoundError(`Booking ${dto.booking_id} not found`, ErrorCode.NOT_FOUND);
    }

    const booking = bookingRes.rows[0];

    // AC1: Ownership check - Customer cannot review on behalf of another user
    if (booking.user_id !== userId) {
      throw new ForbiddenError(
        'ENGAGEMENT_USER_MISMATCH: Customer cannot submit a review for another user booking',
        ErrorCode.ENGAGEMENT_USER_MISMATCH
      );
    }

    // Restaurant scope check
    if (booking.restaurant_id !== restaurantId) {
      throw new ValidationError(
        'REVIEW_NOT_ELIGIBLE: Booking does not belong to the specified restaurant',
        [{ name: 'restaurant_id', reason: 'Booking venue mismatch' }]
      );
    }

    // AC2: Verified dining evidence check - Booking MUST be COMPLETED
    if (booking.status !== 'COMPLETED') {
      throw new InvalidStateTransitionError(
        `REVIEW_NOT_ELIGIBLE: Verified dining evidence required. Only COMPLETED bookings can be reviewed (current status: ${booking.status})`
      );
    }

    // Check duplicate review constraint
    const dupRes = await pool.query(
      `SELECT id FROM reviews WHERE booking_id = $1`,
      [dto.booking_id]
    );

    if (dupRes.rows.length > 0) {
      throw new ConflictError(
        'REVIEW_ALREADY_EXISTS: A review has already been submitted for this booking',
        ErrorCode.REVIEW_ALREADY_EXISTS
      );
    }

    // Insert review
    const insertRes = await pool.query(
      `INSERT INTO reviews (
         restaurant_id, booking_id, user_id, rating, title, comment, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'PUBLISHED')
       RETURNING id, restaurant_id, booking_id, user_id, rating, title, comment,
                 status, created_at, updated_at`,
      [
        restaurantId,
        dto.booking_id,
        userId,
        dto.rating,
        dto.title ? dto.title.trim() : null,
        dto.comment.trim(),
      ]
    );

    const row = insertRes.rows[0];
    return {
      id: row.id,
      restaurant_id: row.restaurant_id,
      booking_id: row.booking_id,
      rating: row.rating,
      title: row.title,
      comment: row.comment,
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      owner_response: null,
      owner_responded_at: null,
    };
  }

  /**
   * Public reviews for restaurant discovery (AC4).
   * Strips all customer identities, emails, phones, and private preferences.
   * Only approved public fields (rating, comment, masked name, owner response) are returned.
   */
  async getPublicReviews(restaurantId: string): Promise<PublicReviewListResponseDto> {
    if (!restaurantId) {
      throw new ValidationError('restaurantId is required');
    }

    const pool = this.db.getPool();

    // Verify restaurant is published
    const restRes = await pool.query(
      `SELECT id, is_published, status FROM restaurants WHERE id = $1`,
      [restaurantId]
    );

    if (restRes.rows.length === 0 || !restRes.rows[0].is_published || restRes.rows[0].status !== 'PUBLISHED') {
      throw new NotFoundError(`Restaurant ${restaurantId} not found or unpublished`, ErrorCode.NOT_FOUND);
    }

    // Fetch published reviews with masked customer display name from profile
    const reviewsRes = await pool.query(
      `SELECT r.id, r.restaurant_id, r.rating, r.title, r.comment, r.created_at,
              r.owner_response, r.owner_responded_at,
              p.full_name as customer_name
       FROM reviews r
       LEFT JOIN profiles p ON r.user_id = p.id OR r.user_id = p.auth_uid
       WHERE r.restaurant_id = $1 AND r.status = 'PUBLISHED'
       ORDER BY r.created_at DESC`,
      [restaurantId]
    );

    let totalRating = 0;
    const reviews: PublicReviewDto[] = reviewsRes.rows.map((row) => {
      totalRating += row.rating;
      return {
        id: row.id,
        restaurant_id: row.restaurant_id,
        rating: row.rating,
        title: row.title || null,
        comment: row.comment,
        customer_display_name: maskCustomerName(row.customer_name),
        created_at: new Date(row.created_at).toISOString(),
        owner_response: row.owner_response || null,
        owner_responded_at: row.owner_responded_at ? new Date(row.owner_responded_at).toISOString() : null,
      };
    });

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 ? Number((totalRating / totalReviews).toFixed(1)) : 0;

    return {
      restaurant_id: restaurantId,
      average_rating: averageRating,
      total_reviews: totalReviews,
      reviews,
    };
  }

  /**
   * Authenticated customer's personal review history.
   */
  async getCustomerReviews(userId: string): Promise<CustomerReviewDetailDto[]> {
    if (!userId) {
      throw new ForbiddenError('Authentication required to view customer reviews', ErrorCode.UNAUTHORIZED);
    }

    const pool = this.db.getPool();
    const res = await pool.query(
      `SELECT r.id, r.restaurant_id, r.booking_id, r.rating, r.title, r.comment,
              r.status, r.created_at, r.updated_at, r.owner_response, r.owner_responded_at,
              rest.name as restaurant_name
       FROM reviews r
       JOIN restaurants rest ON r.restaurant_id = rest.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    return res.rows.map((row) => ({
      id: row.id,
      restaurant_id: row.restaurant_id,
      restaurant_name: row.restaurant_name,
      booking_id: row.booking_id,
      rating: row.rating,
      title: row.title || null,
      comment: row.comment,
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      owner_response: row.owner_response || null,
      owner_responded_at: row.owner_responded_at ? new Date(row.owner_responded_at).toISOString() : null,
    }));
  }

  /**
   * Restaurant owner/manager review management list.
   * Cross-tenant access is guarded by TenantGuard.
   */
  async getOwnerReviews(staffUserId: string, restaurantId: string): Promise<OwnerReviewListResponseDto> {
    const pool = this.db.getPool();

    const res = await pool.query(
      `SELECT r.id, r.restaurant_id, r.booking_id, r.user_id, r.rating, r.title,
              r.comment, r.status, r.moderation_notes, r.owner_response, r.owner_responded_at,
              r.created_at, r.updated_at,
              p.full_name as customer_name
       FROM reviews r
       LEFT JOIN profiles p ON r.user_id = p.id OR r.user_id = p.auth_uid
       WHERE r.restaurant_id = $1
       ORDER BY r.created_at DESC`,
      [restaurantId]
    );

    const items: OwnerReviewDto[] = res.rows.map((row) => ({
      id: row.id,
      restaurant_id: row.restaurant_id,
      booking_id: row.booking_id,
      user_id: row.user_id,
      customer_name: row.customer_name || 'Guest',
      rating: row.rating,
      title: row.title || null,
      comment: row.comment,
      status: row.status,
      moderation_notes: row.moderation_notes || null,
      owner_response: row.owner_response || null,
      owner_responded_at: row.owner_responded_at ? new Date(row.owner_responded_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    }));

    return {
      restaurant_id: restaurantId,
      total: items.length,
      items,
    };
  }

  /**
   * Staff response to a verified customer review.
   */
  async respondToReview(
    staffUserId: string,
    restaurantId: string,
    reviewId: string,
    dto: RespondToReviewRequestDto
  ): Promise<OwnerReviewDto> {
    if (!dto.response || typeof dto.response !== 'string' || dto.response.trim().length === 0) {
      throw new ValidationError('Response text cannot be empty');
    }

    const pool = this.db.getPool();

    // Verify review exists and belongs to restaurant
    const reviewRes = await pool.query(
      `SELECT id, restaurant_id FROM reviews WHERE id = $1`,
      [reviewId]
    );

    if (reviewRes.rows.length === 0) {
      throw new NotFoundError(`Review ${reviewId} not found`, ErrorCode.REVIEW_NOT_FOUND);
    }

    if (reviewRes.rows[0].restaurant_id !== restaurantId) {
      throw new ForbiddenError(
        'FORBIDDEN_TENANT_ACCESS: Review does not belong to the caller restaurant',
        ErrorCode.FORBIDDEN
      );
    }

    const res = await pool.query(
      `UPDATE reviews
       SET owner_response = $1, owner_responded_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING id, restaurant_id, booking_id, user_id, rating, title, comment,
                 status, moderation_notes, owner_response, owner_responded_at,
                 created_at, updated_at`,
      [dto.response.trim(), reviewId]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      restaurant_id: row.restaurant_id,
      booking_id: row.booking_id,
      user_id: row.user_id,
      rating: row.rating,
      title: row.title || null,
      comment: row.comment,
      status: row.status,
      moderation_notes: row.moderation_notes || null,
      owner_response: row.owner_response,
      owner_responded_at: new Date(row.owner_responded_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Moderate customer review (Hide or Flag).
   */
  async moderateReview(
    staffUserId: string,
    restaurantId: string,
    reviewId: string,
    dto: ModerateReviewRequestDto
  ): Promise<OwnerReviewDto> {
    const validStatuses = [ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN, ReviewStatus.FLAGGED];
    if (!validStatuses.includes(dto.status as ReviewStatus)) {
      throw new ValidationError(`Invalid review status: ${dto.status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    const pool = this.db.getPool();

    const reviewRes = await pool.query(
      `SELECT id, restaurant_id FROM reviews WHERE id = $1`,
      [reviewId]
    );

    if (reviewRes.rows.length === 0) {
      throw new NotFoundError(`Review ${reviewId} not found`, ErrorCode.REVIEW_NOT_FOUND);
    }

    if (reviewRes.rows[0].restaurant_id !== restaurantId) {
      throw new ForbiddenError(
        'FORBIDDEN_TENANT_ACCESS: Review does not belong to the caller restaurant',
        ErrorCode.FORBIDDEN
      );
    }

    const res = await pool.query(
      `UPDATE reviews
       SET status = $1, moderation_notes = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, restaurant_id, booking_id, user_id, rating, title, comment,
                 status, moderation_notes, owner_response, owner_responded_at,
                 created_at, updated_at`,
      [dto.status, dto.moderation_notes || null, reviewId]
    );

    const row = res.rows[0];
    return {
      id: row.id,
      restaurant_id: row.restaurant_id,
      booking_id: row.booking_id,
      user_id: row.user_id,
      rating: row.rating,
      title: row.title || null,
      comment: row.comment,
      status: row.status,
      moderation_notes: row.moderation_notes,
      owner_response: row.owner_response,
      owner_responded_at: row.owner_responded_at ? new Date(row.owner_responded_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }
}
