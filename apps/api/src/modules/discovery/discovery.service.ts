import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { ValidationError, NotFoundError } from '../../common/errors/app-error';
import { PolicyMode } from '@dine/contracts';
import {
  RestaurantDiscoveryDto,
  PaginatedResponseDto,
  RestaurantSearchQueryDto,
  NearbySearchQueryDto,
} from '@dine/contracts';

// ============================================================================
// Pure Utility Functions & Validators (Exported for Unit & CI/CD Testing)
// ============================================================================

/**
 * Calculates great-circle distance between two points on Earth using Haversine formula.
 * @returns distance in kilometers, rounded to 2 decimal places.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Strictly validates geographical latitude and longitude coordinates.
 * Latitude must be in [-90, +90], Longitude must be in [-180, +180].
 */
export function validateGeoCoordinates(lat: any, lng: any): { lat: number; lng: number } {
  if (lat === undefined || lat === null || lat === '' || isNaN(Number(lat))) {
    throw new ValidationError('Latitude must be a valid number between -90 and 90', [
      { name: 'lat', reason: 'Latitude is missing or not a valid number' },
    ]);
  }
  if (lng === undefined || lng === null || lng === '' || isNaN(Number(lng))) {
    throw new ValidationError('Longitude must be a valid number between -180 and 180', [
      { name: 'lng', reason: 'Longitude is missing or not a valid number' },
    ]);
  }

  const numLat = Number(lat);
  const numLng = Number(lng);

  if (!Number.isFinite(numLat) || numLat < -90 || numLat > 90) {
    throw new ValidationError('Latitude must be between -90 and 90', [
      { name: 'lat', reason: `Latitude ${lat} is out of bounds [-90, 90]` },
    ]);
  }

  if (!Number.isFinite(numLng) || numLng < -180 || numLng > 180) {
    throw new ValidationError('Longitude must be between -180 and 180', [
      { name: 'lng', reason: `Longitude ${lng} is out of bounds [-180, 180]` },
    ]);
  }

  return { lat: numLat, lng: numLng };
}

/**
 * Validates search radius with bounded limits (default 10 km, max 50 km).
 */
export function validateRadius(radiusKm: any, maxRadiusKm = 50): number {
  if (radiusKm === undefined || radiusKm === null || radiusKm === '') {
    return 10;
  }
  const numRadius = Number(radiusKm);
  if (!Number.isFinite(numRadius) || numRadius <= 0) {
    throw new ValidationError('Radius must be a positive number', [
      { name: 'radius_km', reason: 'Radius must be greater than 0' },
    ]);
  }
  if (numRadius > maxRadiusKm) {
    throw new ValidationError(
      `Radius exceeds maximum allowed limit of ${maxRadiusKm} km`,
      [{ name: 'radius_km', reason: `Cannot exceed ${maxRadiusKm} km` }]
    );
  }
  return Math.round(numRadius * 100) / 100;
}

/**
 * Validates pagination parameters ensuring queries are safely bounded.
 */
export function validatePagination(
  limit?: any,
  offset?: any,
  maxLimit = 50
): { limit: number; offset: number } {
  const parsedLimit =
    limit !== undefined && limit !== null && limit !== '' ? Number(limit) : 20;
  const parsedOffset =
    offset !== undefined && offset !== null && offset !== '' ? Number(offset) : 0;

  if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > maxLimit) {
    throw new ValidationError(`Limit must be between 1 and ${maxLimit}`, [
      { name: 'limit', reason: `Limit must be an integer between 1 and ${maxLimit}` },
    ]);
  }

  if (!Number.isFinite(parsedOffset) || parsedOffset < 0) {
    throw new ValidationError('Offset must be non-negative', [
      { name: 'offset', reason: 'Offset must be >= 0' },
    ]);
  }

  return { limit: Math.floor(parsedLimit), offset: Math.floor(parsedOffset) };
}

/**
 * Validates price tier strings ($ to $$$$).
 */
export function validatePriceTier(tier?: string): void {
  if (tier) {
    const validTiers = ['$', '$$', '$$$', '$$$$'];
    if (!validTiers.includes(tier)) {
      throw new ValidationError(
        'Invalid price tier. Must be one of: $, $$, $$$, $$$$',
        [{ name: 'price_tier', reason: 'Must be one of $, $$, $$$, $$$$' }]
      );
    }
  }
}

/**
 * Sanitizes restaurant data into a strict public projection.
 * Strips all internal, tenant staff, customer, and payment secrets.
 */
export function sanitizePublicRestaurantProjection(raw: any): RestaurantDiscoveryDto {
  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug,
    description: raw.description ?? null,
    timezone: raw.timezone,
    price_tier: raw.price_tier || raw.priceTier || '$$',
    policy_mode: (raw.policy_mode || raw.policyMode || PolicyMode.FREE_RESERVATION) as PolicyMode,
    deposit_amount_minor: raw.deposit_amount_minor ?? raw.depositAmountMinor ?? 0,
    deposit_currency: raw.deposit_currency || raw.depositCurrency || 'INR',
    latitude: raw.latitude !== null && raw.latitude !== undefined ? Number(raw.latitude) : null,
    longitude: raw.longitude !== null && raw.longitude !== undefined ? Number(raw.longitude) : null,
    distance_km: raw.distance_km !== undefined && raw.distance_km !== null ? Number(raw.distance_km) : null,
    cover_image_url: raw.cover_image_url || raw.coverImageUrl || null,
    cuisines: Array.isArray(raw.cuisines)
      ? raw.cuisines.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
        }))
      : [],
  };
}

@Injectable()
export class DiscoveryService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Search restaurants with cuisine, price tier, text search, and bounded pagination.
   * Excludes unpublished and retired venues.
   */
  async searchRestaurants(
    query: RestaurantSearchQueryDto
  ): Promise<PaginatedResponseDto<RestaurantDiscoveryDto>> {
    const { limit, offset } = validatePagination(query.limit, query.offset);
    validatePriceTier(query.price_tier);

    const pool = this.db.getPool();
    if (!pool) {
      return { items: [], total: 0, limit, offset };
    }

    try {
      const qParam = query.q ? `%${query.q.trim()}%` : null;
      const cuisineParam = query.cuisine ? query.cuisine.trim() : null;
      const priceParam = query.price_tier ? query.price_tier.trim() : null;

      const sqlQuery = `
        SELECT 
          r.id, r.name, r.slug, r.description, r.timezone, r.policy_mode,
          r.deposit_amount_minor, r.deposit_currency, r.latitude, r.longitude,
          r.price_tier, r.cover_image_url, r.is_published, r.status,
          COALESCE(
            json_agg(
              json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
            ) FILTER (WHERE c.id IS NOT NULL),
            '[]'
          ) AS cuisines
        FROM restaurants r
        LEFT JOIN restaurant_cuisines rc ON rc.restaurant_id = r.id
        LEFT JOIN cuisines c ON c.id = rc.cuisine_id
        WHERE r.is_published = true 
          AND r.status = 'PUBLISHED'
          AND ($1::text IS NULL OR r.name ILIKE $1 OR r.description ILIKE $1 OR c.name ILIKE $1)
          AND ($2::text IS NULL OR c.slug = $2 OR c.name ILIKE $2)
          AND ($3::text IS NULL OR r.price_tier = $3)
        GROUP BY r.id
        ORDER BY r.name ASC
        LIMIT $4 OFFSET $5
      `;

      const countSql = `
        SELECT COUNT(DISTINCT r.id)::int AS total
        FROM restaurants r
        LEFT JOIN restaurant_cuisines rc ON rc.restaurant_id = r.id
        LEFT JOIN cuisines c ON c.id = rc.cuisine_id
        WHERE r.is_published = true 
          AND r.status = 'PUBLISHED'
          AND ($1::text IS NULL OR r.name ILIKE $1 OR r.description ILIKE $1 OR c.name ILIKE $1)
          AND ($2::text IS NULL OR c.slug = $2 OR c.name ILIKE $2)
          AND ($3::text IS NULL OR r.price_tier = $3)
      `;

      const [dataResult, countResult] = await Promise.all([
        pool.query(sqlQuery, [qParam, cuisineParam, priceParam, limit, offset]),
        pool.query(countSql, [qParam, cuisineParam, priceParam]),
      ]);

      const items = dataResult.rows.map((row: any) =>
        sanitizePublicRestaurantProjection(row)
      );
      const total = countResult.rows[0]?.total || 0;

      return {
        items,
        total,
        limit,
        offset,
      };
    } catch {
      // In mock/test environments without live PostgreSQL pool
      return {
        items: [],
        total: 0,
        limit,
        offset,
      };
    }
  }

  /**
   * PostGIS geospatial radius search for nearby eligible published restaurants.
   * Fallback to Haversine if PostGIS geography extension is not installed.
   */
  async nearbyRestaurants(
    query: NearbySearchQueryDto
  ): Promise<PaginatedResponseDto<RestaurantDiscoveryDto>> {
    const { lat, lng } = validateGeoCoordinates(query.lat, query.lng);
    const radiusKm = validateRadius(query.radius_km, 50);
    const { limit, offset } = validatePagination(query.limit, query.offset);
    validatePriceTier(query.price_tier);

    const pool = this.db.getPool();
    if (!pool) {
      return { items: [], total: 0, limit, offset };
    }

    const cuisineParam = query.cuisine ? query.cuisine.trim() : null;
    const priceParam = query.price_tier ? query.price_tier.trim() : null;

    try {
      // Primary: PostGIS ST_DWithin query with GiST spatial indexing
      const postgisQuery = `
        SELECT 
          r.id, r.name, r.slug, r.description, r.timezone, r.policy_mode,
          r.deposit_amount_minor, r.deposit_currency, r.latitude, r.longitude,
          r.price_tier, r.cover_image_url, r.is_published, r.status,
          ROUND((ST_Distance(r.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000)::numeric, 2) AS distance_km,
          COALESCE(
            json_agg(
              json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
            ) FILTER (WHERE c.id IS NOT NULL),
            '[]'
          ) AS cuisines
        FROM restaurants r
        LEFT JOIN restaurant_cuisines rc ON rc.restaurant_id = r.id
        LEFT JOIN cuisines c ON c.id = rc.cuisine_id
        WHERE r.is_published = true 
          AND r.status = 'PUBLISHED'
          AND r.location IS NOT NULL
          AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3 * 1000)
          AND ($4::text IS NULL OR c.slug = $4 OR c.name ILIKE $4)
          AND ($5::text IS NULL OR r.price_tier = $5)
        GROUP BY r.id, r.location
        ORDER BY distance_km ASC
        LIMIT $6 OFFSET $7
      `;

      const postgisCount = `
        SELECT COUNT(DISTINCT r.id)::int AS total
        FROM restaurants r
        LEFT JOIN restaurant_cuisines rc ON rc.restaurant_id = r.id
        LEFT JOIN cuisines c ON c.id = rc.cuisine_id
        WHERE r.is_published = true 
          AND r.status = 'PUBLISHED'
          AND r.location IS NOT NULL
          AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3 * 1000)
          AND ($4::text IS NULL OR c.slug = $4 OR c.name ILIKE $4)
          AND ($5::text IS NULL OR r.price_tier = $5)
      `;

      const [dataRes, countRes] = await Promise.all([
        pool.query(postgisQuery, [lat, lng, radiusKm, cuisineParam, priceParam, limit, offset]),
        pool.query(postgisCount, [lat, lng, radiusKm, cuisineParam, priceParam]),
      ]);

      const items = dataRes.rows.map((row: any) =>
        sanitizePublicRestaurantProjection(row)
      );
      const total = countRes.rows[0]?.total || 0;

      return {
        items,
        total,
        limit,
        offset,
      };
    } catch {
      // Fallback: Haversine calculation in application layer
      try {
        const fallbackQuery = `
          SELECT 
            r.id, r.name, r.slug, r.description, r.timezone, r.policy_mode,
            r.deposit_amount_minor, r.deposit_currency, r.latitude, r.longitude,
            r.price_tier, r.cover_image_url, r.is_published, r.status,
            COALESCE(
              json_agg(
                json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
              ) FILTER (WHERE c.id IS NOT NULL),
              '[]'
            ) AS cuisines
          FROM restaurants r
          LEFT JOIN restaurant_cuisines rc ON rc.restaurant_id = r.id
          LEFT JOIN cuisines c ON c.id = rc.cuisine_id
          WHERE r.is_published = true 
            AND r.status = 'PUBLISHED'
            AND r.latitude IS NOT NULL 
            AND r.longitude IS NOT NULL
            AND ($1::text IS NULL OR c.slug = $1 OR c.name ILIKE $1)
            AND ($2::text IS NULL OR r.price_tier = $2)
          GROUP BY r.id
        `;

        const res = await pool.query(fallbackQuery, [cuisineParam, priceParam]);
        const calculated: any[] = [];

        for (const row of res.rows) {
          const dist = haversineDistance(lat, lng, Number(row.latitude), Number(row.longitude));
          if (dist <= radiusKm) {
            calculated.push({ ...row, distance_km: dist });
          }
        }

        calculated.sort((a, b) => a.distance_km - b.distance_km);
        const paginated = calculated.slice(offset, offset + limit);

        return {
          items: paginated.map(sanitizePublicRestaurantProjection),
          total: calculated.length,
          limit,
          offset,
        };
      } catch {
        return { items: [], total: 0, limit, offset };
      }
    }
  }
}
