import { Module } from '@nestjs/common';
import { WaitlistController, WaitlistOffersController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { ResourceOwnershipGuard } from '../../common/auth/ownership.guard';

@Module({
  controllers: [WaitlistController, WaitlistOffersController],
  providers: [WaitlistService, AuthGuard, ResourceOwnershipGuard],
  exports: [WaitlistService],
})
export class WaitlistModule {}
