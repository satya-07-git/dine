import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { DatabaseModule } from '../../common/db/database.module';
import { AvailabilityModule } from '../availability/availability.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';

@Module({
  imports: [
    DatabaseModule,
    AvailabilityModule,
    ReservationsModule,
    RestaurantsModule,
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
