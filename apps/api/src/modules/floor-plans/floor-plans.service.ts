import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class FloorPlansService {
  constructor(private readonly db: DatabaseService) {}

  async getFloorPlan(restaurantId: string) {
    return {
      restaurantId,
      floors: [],
    };
  }
}
