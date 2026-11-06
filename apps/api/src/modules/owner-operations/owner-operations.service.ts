import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class OwnerOperationsService {
  constructor(private readonly db: DatabaseService) {}

  async recordWalkIn(restaurantId: string, tableId: string, partySize: number) {
    return {
      success: true,
      restaurantId,
      tableId,
      status: 'SEATED',
    };
  }
}
