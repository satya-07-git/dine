import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/db/database.service';
import { restaurants } from '../../common/db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class RestaurantsService {
  constructor(private readonly db: DatabaseService) {}

  async findBySlug(slug: string) {
    const results = await this.db.getDb().select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
    return results[0] || null;
  }

  async findById(id: string) {
    const results = await this.db.getDb().select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
    return results[0] || null;
  }
}
