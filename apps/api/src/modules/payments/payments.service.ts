import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly db: DatabaseService) {}

  async processWebhook(event: { id: string; event: string; payload: any }) {
    // Verified webhook inbox processor stub (EPIC-010)
    return {
      received: true,
      eventId: event.id,
    };
  }
}
