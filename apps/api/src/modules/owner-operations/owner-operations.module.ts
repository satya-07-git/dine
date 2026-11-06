import { Module } from '@nestjs/common';
import { OwnerOperationsController } from './owner-operations.controller';
import { OwnerOperationsService } from './owner-operations.service';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { FloorPlansModule } from '../floor-plans/floor-plans.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard } from '../../common/auth/tenant.guard';

@Module({
  imports: [RestaurantsModule, FloorPlansModule, ReservationsModule],
  controllers: [OwnerOperationsController],
  providers: [OwnerOperationsService, AuthGuard, TenantGuard],
  exports: [OwnerOperationsService],
})
export class OwnerOperationsModule {}
