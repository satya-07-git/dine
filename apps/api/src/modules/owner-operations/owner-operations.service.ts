import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { RestaurantPolicyService } from '../restaurants/restaurant-policy.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { FloorPlansService } from '../floor-plans/floor-plans.service';
import { ReservationsService } from '../reservations/reservations.service';
import { specialClosures } from '../../common/db/schema';
import { eq, asc } from 'drizzle-orm';
import { UpdateBookingStatusRequestDto } from '@dine/contracts';

@Injectable()
export class OwnerOperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly policyService: RestaurantPolicyService,
    private readonly restaurantsService: RestaurantsService,
    private readonly floorPlansService: FloorPlansService,
    private readonly reservationsService: ReservationsService
  ) {}

  async getRestaurantBookings(restaurantId: string) {
    try {
      const pool = this.db.getPool();
      const res = await pool.query(
        `SELECT b.id, b.user_id, b.restaurant_id, b.party_size, b.requested_start, b.status, b.version,
                b.checked_in_at, b.seated_at, b.completed_at, b.cancelled_at, b.created_at,
                t.table_number, f.name AS floor_name
         FROM bookings b
         LEFT JOIN table_allocations a ON a.booking_id = b.id
         LEFT JOIN restaurant_tables t ON t.id = a.table_id
         LEFT JOIN floors f ON f.id = t.floor_id
         WHERE b.restaurant_id = $1 
         ORDER BY b.requested_start ASC`,
        [restaurantId]
      );
      return res.rows;
    } catch {
      return [];
    }
  }

  async updateBookingStatus(
    bookingId: string,
    updateDto: UpdateBookingStatusRequestDto,
    staffUserId: string,
    requestId?: string
  ) {
    return this.reservationsService.transitionStaffBookingStatus(
      staffUserId,
      bookingId,
      updateDto.status,
      updateDto.expected_version,
      updateDto.reason,
      { requestId }
    );
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

  async updateFloorPlan(
    restaurantId: string,
    floorPlanDto: any,
    actorId?: string,
    requestId?: string
  ) {
    return this.floorPlansService.updateFloorPlan(restaurantId, floorPlanDto, actorId, requestId);
  }
}
