import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import {
  restaurants,
  openingHours,
  specialClosures,
  cuisines,
  restaurantCuisines,
  restaurantPolicyHistory,
} from '../../common/db/schema';
import { eq, asc } from 'drizzle-orm';
import { NotFoundError } from '../../common/errors/app-error';

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
    if (!rest) {
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
      const res = await pool.query(
        `SELECT c.id, c.name, c.slug
         FROM cuisines c
         JOIN restaurant_cuisines rc ON rc.cuisine_id = c.id
         WHERE rc.restaurant_id = $1`,
        [id]
      );
      restaurantCuisineList = res.rows;
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
}
