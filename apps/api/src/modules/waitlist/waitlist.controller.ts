import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiHeader,
  ApiBody,
} from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import { ResourceOwnershipGuard, CheckResourceOwnership } from '../../common/auth/ownership.guard';
import { CreateWaitlistEntryRequestDto } from '@dine/contracts';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Join restaurant waitlist queue',
    description: 'Enters an authenticated customer into a deterministic FIFO waitlist for requested party size and interval.',
  })
  @ApiResponse({ status: 201, description: 'Successfully joined waitlist queue' })
  @ApiResponse({ status: 400, description: 'Validation failure: party size or timestamp invalid' })
  @ApiResponse({ status: 409, description: 'Conflict: user already has an active waitlist entry for this slot' })
  async joinWaitlist(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateWaitlistEntryRequestDto
  ) {
    return this.waitlistService.joinWaitlist(
      user.userId,
      body.restaurant_id,
      body.party_size || 2,
      body.requested_start || new Date().toISOString(),
      body.table_id,
      body.notes
    );
  }

  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Join restaurant waitlist queue (alias)' })
  async joinWaitlistAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateWaitlistEntryRequestDto
  ) {
    return this.waitlistService.joinWaitlist(
      user.userId,
      body.restaurant_id,
      body.party_size || 2,
      body.requested_start || new Date().toISOString(),
      body.table_id,
      body.notes
    );
  }

  @Get(':id')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get waitlist entry status',
    description: 'Enforces that a customer cannot access another customer waitlist entry or offer.',
  })
  @ApiResponse({ status: 200, description: 'Waitlist entry status and queue position' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot access another waitlist entry' })
  @ApiResponse({ status: 404, description: 'Waitlist entry not found' })
  async getWaitlistEntry(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.waitlistService.getWaitlistEntry(id, user.userId);
  }

  @Post(':id/leave')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Leave waitlist queue',
    description: 'Cancels active waiting entry and releases any pending offer.',
  })
  @ApiResponse({ status: 200, description: 'Successfully left waitlist queue' })
  async leaveWaitlist(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.waitlistService.leaveWaitlist(id, user.userId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Leave waitlist queue (DELETE alias)' })
  async deleteWaitlistEntry(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.waitlistService.leaveWaitlist(id, user.userId);
  }

  @Get('offers/:id')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist_offer')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get waitlist offer status (alias)' })
  async getWaitlistOfferAlias(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.waitlistService.getWaitlistOffer(id, user.userId);
  }

  @Post('offers/:id/accept')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist_offer')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept waitlist offer (alias)' })
  async acceptOfferAlias(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.waitlistService.acceptOffer(id, user.userId, idempotencyKey);
  }

  @Post('offers/:id/decline')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist_offer')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Decline waitlist offer (alias)' })
  async declineOfferAlias(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.waitlistService.declineOffer(id, user.userId);
  }
}

@ApiTags('Waitlist')
@Controller('waitlist-offers')
export class WaitlistOffersController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Get(':id')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist_offer')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get waitlist offer snapshot',
    description: 'Returns offer deadline, countdown remaining, and deposit requirement.',
  })
  @ApiResponse({ status: 200, description: 'Waitlist offer snapshot' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot access another customer offer' })
  @ApiResponse({ status: 404, description: 'Waitlist offer not found' })
  async getOffer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.waitlistService.getWaitlistOffer(id, user.userId);
  }

  @Post(':id/accept')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist_offer')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Accept priority waitlist offer',
    description: 'Explicit customer consent to claim exclusive offered table. Never automatically charges customer.',
  })
  @ApiResponse({ status: 200, description: 'Offer accepted. Booking confirmed or payment pending.' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot accept another customer offer' })
  @ApiResponse({ status: 409, description: 'Conflict: offer already resolved or allocation conflict' })
  @ApiResponse({ status: 410, description: 'Expired: offer has expired and cannot be accepted' })
  async acceptOffer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string
  ) {
    return this.waitlistService.acceptOffer(id, user.userId, idempotencyKey);
  }

  @Post(':id/decline')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('waitlist_offer')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Decline priority waitlist offer',
    description: 'Declines exclusive offer and safely cascades promotion to next eligible waiter.',
  })
  @ApiResponse({ status: 200, description: 'Offer declined and table released.' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot decline another customer offer' })
  async declineOffer(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.waitlistService.declineOffer(id, user.userId);
  }
}
