import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingStatusService } from './booking-status.service';
import { AuthGuard } from '../../common/auth/auth.guard';

@ApiTags('Booking Status')
@Controller('booking-status')
export class BookingStatusController {
  constructor(private readonly bookingStatusService: BookingStatusService) {}

  @Get(':bookingId/history')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get append-only state transition history for a booking' })
  async getStatusHistory(@Param('bookingId') bookingId: string) {
    return this.bookingStatusService.getHistory(bookingId);
  }
}
