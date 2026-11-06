import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { RestaurantPolicyService } from '../restaurants/restaurant-policy.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { specialClosures } from '../../common/db/schema';
import { eq, asc } from 'drizzle-orm';

@Injectable()
export class OwnerOperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly policyService: RestaurantPolicyService,
    private readonly restaurantsService: RestaurantsService
  ) {}

  async getRestaurantBookings(restaurantId: string) {
    try {
      const pool = this.db.getPool();
      const res = await pool.query(
        `SELECT id, user_id, restaurant_id, party_size, requested_start, status, created_at 
         FROM bookings 
         WHERE restaurant_id = $1 
         ORDER BY requested_start ASC`,
        [restaurantId]
      );
      return res.rows;
    } catch {
      return [];
    }
  }

  async recordWalkIn(restaurantId: string, tableId: string, partySize: number) {
    return {
      success: true,
      restaurantId,
      tableId,
      partySize,
      status: 'SEATED',
    };
  }

  async updatePolicies(
    restaurantId: string,
    updateDto: any,
    actorId?: string,
    requestId?: string
  ) {
    return this.policyService.updatePolicies(restaurantId, updateDto, actorId, requestId);
  }

  async addClosure(
    restaurantId: string,
    closureDto: { start_time: string; end_time: string; reason?: string; force?: boolean },
    actorId?: string,
    requestId?: string
  ) {
    return this.policyService.addSpecialClosure(
      restaurantId,
      closureDto.start_time,
      closureDto.end_time,
      closureDto.reason,
      Boolean(closureDto.force),
      actorId,
      requestId
    );
  }

  async getClosures(restaurantId: string) {
    return this.db
      .getDb()
      .select()
      .from(specialClosures)
      .where(eq(specialClosures.restaurantId, restaurantId))
      .orderBy(asc(specialClosures.startTime));
  }

  async getPolicyHistory(restaurantId: string) {
    return this.restaurantsService.getPolicyHistory(restaurantId);
  }
}
