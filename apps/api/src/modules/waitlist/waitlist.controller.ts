import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';

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
}
