import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class OwnerOperationsService {
  constructor(private readonly db: DatabaseService) {}

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
}
