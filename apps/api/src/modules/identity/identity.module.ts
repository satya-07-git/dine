import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { MeController } from './me.controller';
import { AuthOtpController } from './auth-otp.controller';
import { RestaurantStaffController } from './restaurant-staff.controller';
import { PlatformAdminController } from './platform-admin.controller';
import { IdentityService } from './identity.service';
import { AuthOtpService } from './auth-otp.service';
import { RestaurantStaffService } from './restaurant-staff.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard } from '../../common/auth/tenant.guard';
import { ResourceOwnershipGuard } from '../../common/auth/ownership.guard';
import { RateLimiterGuard } from '../../common/auth/rate-limiter.guard';
import { RolesGuard } from '../../common/auth/roles.guard';

@Module({
  controllers: [
    IdentityController,
    MeController,
    AuthOtpController,
    RestaurantStaffController,
    PlatformAdminController,
  ],
  providers: [
    IdentityService,
    AuthOtpService,
    RestaurantStaffService,
    AuthGuard,
    TenantGuard,
    ResourceOwnershipGuard,
    RateLimiterGuard,
    RolesGuard,
  ],
  exports: [
    IdentityService,
    AuthOtpService,
    RestaurantStaffService,
    AuthGuard,
    TenantGuard,
    ResourceOwnershipGuard,
    RateLimiterGuard,
    RolesGuard,
  ],
})
export class IdentityModule {}
