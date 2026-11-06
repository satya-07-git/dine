import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { MeController } from './me.controller';
import { IdentityService } from './identity.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard } from '../../common/auth/tenant.guard';
import { ResourceOwnershipGuard } from '../../common/auth/ownership.guard';
import { RateLimiterGuard } from '../../common/auth/rate-limiter.guard';

@Module({
  controllers: [IdentityController, MeController],
  providers: [
    IdentityService,
    AuthGuard,
    TenantGuard,
    ResourceOwnershipGuard,
    RateLimiterGuard,
  ],
  exports: [
    IdentityService,
    AuthGuard,
    TenantGuard,
    ResourceOwnershipGuard,
    RateLimiterGuard,
  ],
})
export class IdentityModule {}
