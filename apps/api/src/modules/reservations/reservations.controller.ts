import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { ResourceOwnershipGuard, CheckResourceOwnership } from '../../common/auth/ownership.guard';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get(':id')
  @UseGuards(AuthGuard, ResourceOwnershipGuard)
  @CheckResourceOwnership('booking')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get reservation details scoped by customer ownership',
    description: 'Enforces that a customer cannot access another customer booking',
  })
  @ApiResponse({ status: 200, description: 'Booking details retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot access another booking' })
  async getReservation(@Param('id') id: string) {
    return this.reservationsService.getReservation(id);
  }
}
