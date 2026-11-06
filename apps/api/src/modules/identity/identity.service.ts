import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class IdentityService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(userId: string) {
    return {
      id: userId,
      status: 'active',
    };
  }
}
