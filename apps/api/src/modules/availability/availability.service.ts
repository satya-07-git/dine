import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class AvailabilityService {
  constructor(private readonly db: DatabaseService) {}

  async checkAvailability(restaurantId: string, partySize: number, date: string) {
    // Availability calculation engine stub (EPIC-007)
    return {
      restaurantId,
      date,
      partySize,
      availableSlots: [],
    };
  }
}
