import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class DiscoveryService {
  constructor(private readonly db: DatabaseService) {}

  async searchRestaurants(query: { lat?: number; lng?: number; radiusKm?: number; query?: string }) {
    // Spatial search interface stub (EPIC-005)
    return {
      items: [],
      total: 0,
    };
  }
}
