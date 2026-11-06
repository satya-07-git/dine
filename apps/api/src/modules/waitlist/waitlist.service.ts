import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class WaitlistService {
  constructor(private readonly db: DatabaseService) {}

  async joinWaitlist(userId: string, restaurantId: string, partySize: number, requestedStart: string) {
    return {
      status: 'WAITING',
      position: 1,
    };
  }
}
