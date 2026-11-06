import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { bookingStatusEvents } from '../../common/db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class BookingStatusService {
  constructor(private readonly db: DatabaseService) {}

  async getHistory(bookingId: string) {
    return this.db.getDb().select().from(bookingStatusEvents).where(eq(bookingStatusEvents.bookingId, bookingId));
  }
}
