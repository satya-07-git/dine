import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { ResourceOwnershipGuard, CheckResourceOwnership } from '../../common/auth/ownership.guard';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post('join')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join restaurant waitlist queue' })
  async joinWaitlist(@CurrentUser() user: any, @Body() body: any) {
    return this.waitlistService.joinWaitlist(
      user.userId,
      body.restaurant_id,
      body.party_size || 2,
      body.requested_start || new Date().toISOString()
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get waitlist entry status',
    description: 'Enforces that a customer cannot access another customer waitlist entry or offer',
  })
  @ApiResponse({ status: 200, description: 'Waitlist entry status' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot access another waitlist entry' })
  async getWaitlistEntry(@Param('id') id: string) {
    return this.waitlistService.getWaitlistEntry(id);
  }
}
