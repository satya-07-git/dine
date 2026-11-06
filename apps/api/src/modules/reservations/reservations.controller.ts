import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { AuthGuard } from '../../common/auth/auth.guard';

@ApiTags('Reservations')
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reservation details' })
  async getReservation(@Param('id') id: string) {
    return this.reservationsService.getReservation(id);
  }
}
