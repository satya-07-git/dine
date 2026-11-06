import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import { ResourceOwnershipGuard, CheckResourceOwnership } from '../../common/auth/ownership.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';
import { RateLimit, RateLimiterGuard } from '../../common/auth/rate-limiter.guard';

@ApiTags('Identity & Access')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get('me')
  @UseGuards(AuthGuard, RateLimiterGuard)
  @RateLimit({ maxRequests: 30, windowMs: 60000 })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile and role context' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.identityService.getCurrentUserContext(user);
  }

  @Get('profile/:id')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile scoped by customer ownership' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot access another profile' })
  async getProfile(@Param('id') id: string) {
    return this.identityService.getProfile(id);
  }

  @Patch('memberships/:id/status')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update restaurant staff membership status (e.g. revoke/suspend)' })
  @ApiResponse({ status: 200, description: 'Membership status updated' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller is not an active restaurant owner' })
  async updateMembershipStatus(
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'SUSPENDED' }
  ) {
    return this.identityService.updateMembershipStatus(id, body.status);
  }
}
