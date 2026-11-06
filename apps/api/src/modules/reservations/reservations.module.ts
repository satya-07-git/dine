import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { ResourceOwnershipGuard } from '../../common/auth/ownership.guard';

@Module({
  controllers: [ReservationsController],
  providers: [ReservationsService, AuthGuard, ResourceOwnershipGuard],
  exports: [ReservationsService],
})
export class ReservationsModule {}
