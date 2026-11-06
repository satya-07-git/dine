import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantPolicyService } from './restaurant-policy.service';

@Module({
  controllers: [RestaurantsController],
  providers: [RestaurantsService, RestaurantPolicyService],
  exports: [RestaurantsService, RestaurantPolicyService],
})
export class RestaurantsModule {}
