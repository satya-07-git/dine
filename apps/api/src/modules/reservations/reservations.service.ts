import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { bookings, tableAllocations } from '../../common/db/schema';
import { eq } from 'drizzle-orm';
import { ConflictError, NotFoundError } from '../../common/errors/app-error';

@Injectable()
export class ReservationsService {
  constructor(private readonly db: DatabaseService) {}

  async getReservation(id: string) {
    const result = await this.db.getDb().select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!result[0]) {
      throw new NotFoundError(`Booking ${id} not found`);
    }
    return result[0];
  }
}
