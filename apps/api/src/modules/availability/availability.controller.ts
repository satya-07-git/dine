import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';

@ApiTags('Availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Check table availability for date and party size' })
  async getAvailability(
    @Query('restaurant_id') restaurantId: string,
    @Query('party_size') partySize: number,
    @Query('date') date: string
  ) {
    return this.availabilityService.checkAvailability(restaurantId, Number(partySize) || 2, date || new Date().toISOString());
  }
}
