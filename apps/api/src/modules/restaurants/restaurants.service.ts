import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import {
  restaurants,
  openingHours,
  specialClosures,
  cuisines,
  restaurantCuisines,
  restaurantPolicyHistory,
  menuCategories,
  menuItems,
  restaurantMedia,
} from '../../common/db/schema';
import { eq, asc } from 'drizzle-orm';
import { NotFoundError } from '../../common/errors/app-error';
import {
  RestaurantMenuDto,
  MenuCategoryDto,
  MenuItemDto,
  RestaurantMediaDto,
} from '@dine/contracts';

@Injectable()
export class RestaurantsService {
  constructor(private readonly db: DatabaseService) {}

  async findBySlug(slug: string) {
    const results = await this.db.getDb().select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
    return results[0] || null;
  }

  async findById(id: string) {
    const results = await this.db.getDb().select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
    return results[0] || null;
  }

  async getPublishedDetails(id: string) {
    const rest = await this.findById(id);
    if (!rest || !rest.isPublished || rest.status !== 'PUBLISHED') {
      throw new NotFoundError(`Restaurant with ID ${id} not found`);
    }

    // Fetch opening hours ordered by day_of_week
    const hours = await this.db
      .getDb()
      .select({
        day_of_week: openingHours.dayOfWeek,
        open_time: openingHours.openTime,
        close_time: openingHours.closeTime,
      })
      .from(openingHours)
      .where(eq(openingHours.restaurantId, id))
      .orderBy(asc(openingHours.dayOfWeek));

    // Fetch special closures
    const closures = await this.db
      .getDb()
      .select({
        id: specialClosures.id,
        start_time: specialClosures.startTime,
        end_time: specialClosures.endTime,
        reason: specialClosures.reason,
      })
      .from(specialClosures)
      .where(eq(specialClosures.restaurantId, id))
      .orderBy(asc(specialClosures.startTime));

    // Fetch cuisines
    let restaurantCuisineList: any[] = [];
    try {
      const pool = this.db.getPool();
      if (pool) {
        const res = await pool.query(
          `SELECT c.id, c.name, c.slug
           FROM cuisines c
           JOIN restaurant_cuisines rc ON rc.cuisine_id = c.id
           WHERE rc.restaurant_id = $1`,
          [id]
        );
        restaurantCuisineList = res.rows;
      }
    } catch {
      restaurantCuisineList = [];
    }

    return {
      id: rest.id,
      name: rest.name,
      slug: rest.slug,
      description: rest.description,
      timezone: rest.timezone,
      policy_mode: rest.policyMode,
      deposit_amount_minor: rest.depositAmountMinor,
      deposit_currency: rest.depositCurrency,
      policy_version: rest.policyVersion,
      default_duration_min: rest.defaultDurationMin,
      turnover_buffer_min: rest.turnoverBufferMin,
      min_party_size: rest.minPartySize,
      max_party_size: rest.maxPartySize,
      lead_time_min_minutes: rest.leadTimeMinMinutes,
      lead_time_max_days: rest.leadTimeMaxDays,
      latitude: rest.latitude,
      longitude: rest.longitude,
      price_tier: rest.priceTier,
      cover_image_url: rest.coverImageUrl,
      opening_hours: hours,
      special_closures: closures,
      cuisines: restaurantCuisineList,
    };
  }

  async getPolicyHistory(restaurantId: string) {
    return this.db
      .getDb()
      .select()
      .from(restaurantPolicyHistory)
      .where(eq(restaurantPolicyHistory.restaurantId, restaurantId))
      .orderBy(asc(restaurantPolicyHistory.version));
  }

  /**
   * Retrieves public menu catalog and media for a published restaurant.
   * Excludes unpublished venues and private cost/staff data.
   */
  async getPublishedMenu(restaurantId: string): Promise<RestaurantMenuDto> {
    const rest = await this.findById(restaurantId);
    if (!rest || !rest.isPublished || rest.status !== 'PUBLISHED') {
      throw new NotFoundError(`Restaurant with ID ${restaurantId} not found or not published`);
    }

    const pool = this.db.getPool();
    if (!pool) {
      return {
        restaurant_id: restaurantId,
        categories: [],
        media: [],
      };
    }

    try {
      const categoriesQuery = `
        SELECT id, restaurant_id, name, description, display_order
        FROM menu_categories
        WHERE restaurant_id = $1 AND is_active = true
        ORDER BY display_order ASC
      `;

      const itemsQuery = `
        SELECT id, restaurant_id, category_id, name, description, price_minor, currency, is_available, dietary_tags, image_url, display_order
        FROM menu_items
        WHERE restaurant_id = $1 AND is_available = true
        ORDER BY display_order ASC
      `;

      const mediaQuery = `
        SELECT id, restaurant_id, url, caption, media_type, is_featured, display_order
        FROM restaurant_media
        WHERE restaurant_id = $1
        ORDER BY display_order ASC
      `;

      const [catRes, itemsRes, mediaRes] = await Promise.all([
        pool.query(categoriesQuery, [restaurantId]),
        pool.query(itemsQuery, [restaurantId]),
        pool.query(mediaQuery, [restaurantId]),
      ]);

      const allItems: MenuItemDto[] = itemsRes.rows.map((row: any) => ({
        id: row.id,
        restaurant_id: row.restaurant_id,
        category_id: row.category_id,
        name: row.name,
        description: row.description,
        price_minor: row.price_minor,
        currency: row.currency,
        is_available: row.is_available,
        dietary_tags: Array.isArray(row.dietary_tags) ? row.dietary_tags : [],
        image_url: row.image_url,
        display_order: row.display_order,
      }));

      const categories: MenuCategoryDto[] = catRes.rows.map((cat: any) => ({
        id: cat.id,
        restaurant_id: cat.restaurant_id,
        name: cat.name,
        description: cat.description,
        display_order: cat.display_order,
        items: allItems.filter((i) => i.category_id === cat.id),
      }));

      const media: RestaurantMediaDto[] = mediaRes.rows.map((m: any) => ({
        id: m.id,
        restaurant_id: m.restaurant_id,
        url: m.url,
        caption: m.caption,
        media_type: m.media_type,
        is_featured: m.is_featured,
        display_order: m.display_order,
      }));

      return {
        restaurant_id: restaurantId,
        categories,
        media,
      };
    } catch {
      return {
        restaurant_id: restaurantId,
        categories: [],
        media: [],
      };
    }
  }
}
