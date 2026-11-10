import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ReservationsService } from './reservations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import {
  ConfirmFreeReservationDto,
  CancelBookingDto,
} from '../../common/dto/canonical-validation.dto';
import {
  CreateFreeBookingRequestDto,
  BookingStatus,
} from '@dine/contracts';

@ApiTags('Reservations')
@Controller(['api/v1/bookings', 'v1/bookings', 'bookings', 'reservations'])
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List authenticated customer bookings (GET /api/v1/bookings)',
    description: 'Retrieves a paginated list of bookings belonging to the authenticated customer.',
  })
  @ApiQuery({ name: 'status', required: false, enum: BookingStatus, description: 'Filter by booking status' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page limit (default 20, max 100)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Page offset (default 0)' })
  @ApiResponse({ status: 200, description: 'Customer bookings retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listCustomerBookings(
    @CurrentUser('userId') userId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.reservationsService.listCustomerBookings(userId, { status, limit, offset });
  }

  @Post(['free', '/api/v1/reservations/free', '/v1/bookings/free', '/v1/reservations/free'])
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create or confirm free reservation (POST /api/v1/reservations/free)',
    description:
      'Creates or confirms a reservation and physical table allocation for restaurants operating in FREE_RESERVATION mode. Protected by atomic row locks and GiST exclusion.',
  })
  @ApiResponse({ status: 201, description: 'Free reservation created or confirmed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error: invalid party size or missing parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Conflict: Table unavailable or capacity mismatch' })
  @ApiResponse({ status: 422, description: 'Unprocessable: Restaurant requires a deposit' })
  async createFreeBooking(
    @CurrentUser('userId') userId: string,
    @Body() dto: any,
    @Req() req: Request
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    const holdId = dto?.holdId || dto?.hold_id;
    if (holdId) {
      return this.reservationsService.confirmFreeHold(userId, holdId, { requestId });
    }
    return this.reservationsService.createFreeBooking(userId, dto, { requestId });
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get reservation details scoped by customer ownership (GET /api/v1/bookings/:id)',
    description: 'Enforces that a customer cannot access another customer booking (IDOR protection)',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking details retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot access another booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getBooking(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string
  ) {
    return this.reservationsService.getCustomerBooking(userId, id);
  }

  @Post(':id/confirm')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm existing active hold for a free reservation',
    description:
      'Advances booking from HOLD_ACTIVE to CONFIRMED for free reservation venues. Verifies hold validity and safe expiry.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking confirmed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot confirm another customer booking' })
  @ApiResponse({ status: 410, description: 'Hold expired on server clock' })
  @ApiResponse({ status: 422, description: 'Invalid state transition or deposit required' })
  async confirmFreeHold(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Req() req: Request
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    return this.reservationsService.confirmFreeHold(userId, id, { requestId });
  }

  @Post(':id/cancel')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel reservation with policy check (POST /api/v1/bookings/:id/cancel)',
    description:
      'Cancels an active hold or confirmed booking, releases physical table allocation from GiST exclusion, and appends sequenced status event.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  @ApiResponse({ status: 400, description: 'Validation error: cannot cancel past booking' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot cancel another customer booking' })
  @ApiResponse({ status: 422, description: 'Invalid state transition: booking in terminal status' })
  async cancelBooking(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @Req() req: Request
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    return this.reservationsService.cancelBooking(userId, id, dto?.reason, { requestId });
  }

  @Get(':id/events')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get append-only sequenced status history events for booking',
    description: 'Retrieves chronological state transitions, actors, reasons, and sequence numbers.',
  })
  @ApiParam({ name: 'id', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Sequenced booking status events retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: cannot view events of another customer booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getBookingEvents(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string
  ) {
    return this.reservationsService.getBookingEvents(userId, id);
  }
}
