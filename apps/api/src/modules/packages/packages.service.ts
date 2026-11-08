import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../common/errors/app-error';
import {
  ErrorCode,
  RestaurantPackageDto,
  CreatePackageRequestDto,
  UpdatePackageRequestDto,
  PackageListResponseDto,
} from '@dine/contracts';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Public catalog of published packages for a given restaurant.
   * Strips all internal private booking or customer data.
   */
  async getPublishedPackages(restaurantId: string): Promise<PackageListResponseDto> {
    if (!restaurantId || typeof restaurantId !== 'string') {
      throw new ValidationError('Valid restaurant UUID is required');
    }

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Database pool unavailable');
    }

    // Verify restaurant exists and is published
    const restRes = await pool.query(
      `SELECT id, is_published, status FROM restaurants WHERE id = $1`,
      [restaurantId]
    );

    if (restRes.rows.length === 0 || !restRes.rows[0].is_published || restRes.rows[0].status !== 'PUBLISHED') {
      throw new NotFoundError(`Restaurant ${restaurantId} not found or unpublished`);
    }

    const res = await pool.query(
      `SELECT id, restaurant_id, name, slug, description, price_minor, currency,
              duration_min, min_party_size, max_party_size, is_published, version,
              terms_and_conditions, created_at, updated_at
       FROM packages
       WHERE restaurant_id = $1 AND is_published = TRUE
       ORDER BY price_minor ASC, name ASC`,
      [restaurantId]
    );

    const packages: RestaurantPackageDto[] = res.rows.map((r) => ({
      id: r.id,
      restaurant_id: r.restaurant_id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      price_minor: Number(r.price_minor),
      currency: r.currency,
      duration_min: Number(r.duration_min),
      min_party_size: Number(r.min_party_size),
      max_party_size: Number(r.max_party_size),
      is_published: Boolean(r.is_published),
      version: Number(r.version),
      terms_and_conditions: r.terms_and_conditions,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    }));

    return {
      restaurant_id: restaurantId,
      count: packages.length,
      packages,
    };
  }

  /**
   * Retrieves a single published package by restaurant and package ID.
   * Enforces that the package belongs to the requested restaurant.
   */
  async getPackageById(restaurantId: string, packageId: string): Promise<RestaurantPackageDto> {
    if (!restaurantId || !packageId) {
      throw new ValidationError('restaurantId and packageId are required');
    }

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Database pool unavailable');
    }

    const res = await pool.query(
      `SELECT id, restaurant_id, name, slug, description, price_minor, currency,
              duration_min, min_party_size, max_party_size, is_published, version,
              terms_and_conditions, created_at, updated_at
       FROM packages
       WHERE id = $1`,
      [packageId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Package ${packageId} not found`, ErrorCode.PACKAGE_NOT_FOUND);
    }

    const r = res.rows[0];

    // Acceptance Criterion 1: Every package belongs to the requested restaurant
    if (r.restaurant_id !== restaurantId) {
      throw new ForbiddenError(
        `Package ${packageId} does not belong to restaurant ${restaurantId}`,
        ErrorCode.PACKAGE_RESTAURANT_MISMATCH
      );
    }

    if (!r.is_published) {
      throw new NotFoundError(`Package ${packageId} is not published`, ErrorCode.PACKAGE_NOT_FOUND);
    }

    return {
      id: r.id,
      restaurant_id: r.restaurant_id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      price_minor: Number(r.price_minor),
      currency: r.currency,
      duration_min: Number(r.duration_min),
      min_party_size: Number(r.min_party_size),
      max_party_size: Number(r.max_party_size),
      is_published: Boolean(r.is_published),
      version: Number(r.version),
      terms_and_conditions: r.terms_and_conditions,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    };
  }

  /**
   * Staff view: Lists all packages (including draft and retired) for a restaurant.
   */
  async getOwnerPackages(staffUserId: string, restaurantId: string): Promise<PackageListResponseDto> {
    await this.assertStaffRole(staffUserId, restaurantId, ['OWNER', 'MANAGER', 'HOST']);

    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Database pool unavailable');
    }

    const res = await pool.query(
      `SELECT id, restaurant_id, name, slug, description, price_minor, currency,
              duration_min, min_party_size, max_party_size, is_published, version,
              terms_and_conditions, created_at, updated_at
       FROM packages
       WHERE restaurant_id = $1
       ORDER BY created_at DESC`,
      [restaurantId]
    );

    const packages: RestaurantPackageDto[] = res.rows.map((r) => ({
      id: r.id,
      restaurant_id: r.restaurant_id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      price_minor: Number(r.price_minor),
      currency: r.currency,
      duration_min: Number(r.duration_min),
      min_party_size: Number(r.min_party_size),
      max_party_size: Number(r.max_party_size),
      is_published: Boolean(r.is_published),
      version: Number(r.version),
      terms_and_conditions: r.terms_and_conditions,
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at).toISOString(),
    }));

    return {
      restaurant_id: restaurantId,
      count: packages.length,
      packages,
    };
  }

  /**
   * Owner operation: Create a new dining package.
   */
  async createPackage(
    staffUserId: string,
    restaurantId: string,
    dto: CreatePackageRequestDto,
    requestId?: string
  ): Promise<RestaurantPackageDto> {
    await this.assertStaffRole(staffUserId, restaurantId, ['OWNER', 'MANAGER']);

    if (!dto || !dto.name || typeof dto.name !== 'string' || !dto.name.trim()) {
      throw new ValidationError('Package name is required');
    }

    const durationMin = dto.duration_min !== undefined ? Number(dto.duration_min) : 90;
    if (isNaN(durationMin) || durationMin < 30 || durationMin > 360) {
      throw new ValidationError('duration_min must be an integer between 30 and 360 minutes');
    }

    const minParty = dto.min_party_size !== undefined ? Number(dto.min_party_size) : 1;
    const maxParty = dto.max_party_size !== undefined ? Number(dto.max_party_size) : 20;
    if (isNaN(minParty) || minParty <= 0 || isNaN(maxParty) || maxParty < minParty) {
      throw new ValidationError('Valid min_party_size (>0) and max_party_size (>= min_party_size) are required');
    }

    const priceMinor = dto.price_minor !== undefined ? Number(dto.price_minor) : 0;
    if (isNaN(priceMinor) || priceMinor < 0) {
      throw new ValidationError('price_minor must be a non-negative integer');
    }

    const slug = (dto.slug && dto.slug.trim()) ? slugify(dto.slug) : slugify(dto.name);
    const currency = (dto.currency && dto.currency.trim()) ? dto.currency.toUpperCase() : 'INR';
    const isPublished = dto.is_published !== undefined ? Boolean(dto.is_published) : true;

    return this.db.withTransaction(async (client) => {
      // Check slug uniqueness
      const existing = await client.query(
        `SELECT id FROM packages WHERE restaurant_id = $1 AND slug = $2`,
        [restaurantId, slug]
      );
      if (existing.rows.length > 0) {
        throw new ConflictError(
          `A package with slug '${slug}' already exists for this restaurant`,
          ErrorCode.VERSION_CONFLICT
        );
      }

      const res = await client.query(
        `INSERT INTO packages (
           restaurant_id, name, slug, description, price_minor, currency,
           duration_min, min_party_size, max_party_size, is_published, version,
           terms_and_conditions
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)
         RETURNING *`,
        [
          restaurantId,
          dto.name.trim(),
          slug,
          dto.description || null,
          priceMinor,
          currency,
          durationMin,
          minParty,
          maxParty,
          isPublished,
          dto.terms_and_conditions || null,
        ]
      );

      const pkg = res.rows[0];

      // Audit Log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          staffUserId,
          restaurantId,
          'CREATE_PACKAGE',
          'PACKAGE',
          pkg.id,
          JSON.stringify({ name: pkg.name, price_minor: priceMinor, duration_min: durationMin }),
          requestId || null,
        ]
      );

      return {
        id: pkg.id,
        restaurant_id: pkg.restaurant_id,
        name: pkg.name,
        slug: pkg.slug,
        description: pkg.description,
        price_minor: Number(pkg.price_minor),
        currency: pkg.currency,
        duration_min: Number(pkg.duration_min),
        min_party_size: Number(pkg.min_party_size),
        max_party_size: Number(pkg.max_party_size),
        is_published: Boolean(pkg.is_published),
        version: Number(pkg.version),
        terms_and_conditions: pkg.terms_and_conditions,
        created_at: new Date(pkg.created_at).toISOString(),
        updated_at: new Date(pkg.updated_at).toISOString(),
      };
    });
  }

  /**
   * Owner operation: Update package terms (duration, price, party limits, status).
   * Monotonically increments package version.
   */
  async updatePackage(
    staffUserId: string,
    packageId: string,
    dto: UpdatePackageRequestDto,
    requestId?: string
  ): Promise<RestaurantPackageDto> {
    if (!packageId || typeof packageId !== 'string') {
      throw new ValidationError('Valid packageId UUID is required');
    }

    return this.db.withTransaction(async (client) => {
      const res = await client.query(
        `SELECT * FROM packages WHERE id = $1 FOR UPDATE`,
        [packageId]
      );

      if (res.rows.length === 0) {
        throw new NotFoundError(`Package ${packageId} not found`, ErrorCode.PACKAGE_NOT_FOUND);
      }

      const pkg = res.rows[0];
      await this.assertStaffRole(staffUserId, pkg.restaurant_id, ['OWNER', 'MANAGER']);

      const name = dto.name !== undefined ? dto.name.trim() : pkg.name;
      const description = dto.description !== undefined ? dto.description : pkg.description;
      const durationMin = dto.duration_min !== undefined ? Number(dto.duration_min) : Number(pkg.duration_min);
      const minParty = dto.min_party_size !== undefined ? Number(dto.min_party_size) : Number(pkg.min_party_size);
      const maxParty = dto.max_party_size !== undefined ? Number(dto.max_party_size) : Number(pkg.max_party_size);
      const priceMinor = dto.price_minor !== undefined ? Number(dto.price_minor) : Number(pkg.price_minor);
      const currency = dto.currency !== undefined ? dto.currency.toUpperCase() : pkg.currency;
      const isPublished = dto.is_published !== undefined ? Boolean(dto.is_published) : pkg.is_published;
      const terms = dto.terms_and_conditions !== undefined ? dto.terms_and_conditions : pkg.terms_and_conditions;
      const newVersion = Number(pkg.version) + 1;

      if (durationMin < 30 || durationMin > 360) {
        throw new ValidationError('duration_min must be between 30 and 360 minutes');
      }
      if (minParty <= 0 || maxParty < minParty) {
        throw new ValidationError('Valid min_party_size (>0) and max_party_size (>= min_party_size) are required');
      }
      if (priceMinor < 0) {
        throw new ValidationError('price_minor cannot be negative');
      }

      const updateRes = await client.query(
        `UPDATE packages
         SET name = $1, description = $2, duration_min = $3, min_party_size = $4,
             max_party_size = $5, price_minor = $6, currency = $7, is_published = $8,
             terms_and_conditions = $9, version = $10, updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          name,
          description,
          durationMin,
          minParty,
          maxParty,
          priceMinor,
          currency,
          isPublished,
          terms,
          newVersion,
          packageId,
        ]
      );

      const updated = updateRes.rows[0];

      // Audit Log
      await client.query(
        `INSERT INTO audit_logs (actor_id, restaurant_id, action, entity_type, entity_id, diff, request_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          staffUserId,
          pkg.restaurant_id,
          'UPDATE_PACKAGE',
          'PACKAGE',
          packageId,
          JSON.stringify({
            old_version: pkg.version,
            new_version: newVersion,
            price_minor: priceMinor,
            duration_min: durationMin,
            is_published: isPublished,
          }),
          requestId || null,
        ]
      );

      return {
        id: updated.id,
        restaurant_id: updated.restaurant_id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        price_minor: Number(updated.price_minor),
        currency: updated.currency,
        duration_min: Number(updated.duration_min),
        min_party_size: Number(updated.min_party_size),
        max_party_size: Number(updated.max_party_size),
        is_published: Boolean(updated.is_published),
        version: Number(updated.version),
        terms_and_conditions: updated.terms_and_conditions,
        created_at: new Date(updated.created_at).toISOString(),
        updated_at: new Date(updated.updated_at).toISOString(),
      };
    });
  }

  /**
   * Helper to verify staff authorization within the restaurant.
   */
  private async assertStaffRole(
    staffUserId: string,
    restaurantId: string,
    allowedRoles: string[]
  ): Promise<void> {
    const pool = this.db.getPool();
    if (!pool || typeof pool.query !== 'function') {
      throw new Error('Database pool unavailable');
    }

    const res = await pool.query(
      `SELECT role, status FROM restaurant_memberships
       WHERE restaurant_id = $1 AND user_id = $2
       LIMIT 1`,
      [restaurantId, staffUserId]
    );

    if (res.rows.length === 0 || res.rows[0].status !== 'ACTIVE' || !allowedRoles.includes(res.rows[0].role)) {
      throw new ForbiddenError(
        `Forbidden: staff member lacks active authorized role (${allowedRoles.join('/')}) in restaurant ${restaurantId}`,
        ErrorCode.FORBIDDEN
      );
    }
  }
}
