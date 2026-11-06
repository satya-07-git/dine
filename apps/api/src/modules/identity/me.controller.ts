import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import { RateLimit, RateLimiterGuard } from '../../common/auth/rate-limiter.guard';

@ApiTags('Identity & Access')
@Controller('me')
export class MeController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  @UseGuards(AuthGuard, RateLimiterGuard)
  @RateLimit({ maxRequests: 30, windowMs: 60000 })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current authenticated user profile and restaurant memberships context',
    description: 'Returns profile details and active restaurant tenant memberships for caller',
  })
  @ApiResponse({ status: 200, description: 'Authenticated profile and role context' })
  @ApiResponse({ status: 401, description: 'Missing, invalid, or expired Bearer JWT' })
  async getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.identityService.getCurrentUserContext(user);
  }
}
