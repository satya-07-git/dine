import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';

@ApiTags('Availability')
@Controller()
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('restaurants/:id/availability')
  @ApiOperation({
    summary: 'Time-range table availability for restaurant',
    description:
      'Computes restaurant-local dining intervals and time-scoped eligibility from policy, blocks, and protected allocations. Returns floor plan version and timestamped snapshot without customer identities.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiQuery({ name: 'party_size', required: true, description: 'Requested party size (positive integer)' })
  @ApiQuery({ name: 'requested_start', required: false, description: 'Requested start timestamp (ISO 8601 UTC or local YYYY-MM-DDTHH:mm)' })
  @ApiQuery({ name: 'date', required: false, description: 'Alias for requested_start' })
  @ApiResponse({ status: 200, description: 'Restaurant table availability snapshot' })
  @ApiResponse({ status: 400, description: 'Invalid party size or interval' })
  @ApiResponse({ status: 404, description: 'Restaurant not found or unavailable' })
  async getRestaurantAvailability(
    @Param('id') id: string,
    @Query('party_size') partySize: number,
    @Query('requested_start') requestedStart?: string,
    @Query('date') date?: string
  ) {
    return this.availabilityService.getRestaurantAvailability(
      id,
      Number(partySize),
      requestedStart || date
    );
  }

  @Get('tables/:id/availability')
  @ApiOperation({
    summary: 'Single table availability by interval',
    description:
      'Checks time-scoped eligibility, blocks, and protected allocations for a specific physical table. Returns server-derived interval and snapshot without leaking guest details.',
  })
  @ApiParam({ name: 'id', description: 'Table UUID' })
  @ApiQuery({ name: 'requested_start', required: false, description: 'Requested start timestamp (ISO 8601 UTC or local YYYY-MM-DDTHH:mm)' })
  @ApiQuery({ name: 'date', required: false, description: 'Alias for requested_start' })
  @ApiQuery({ name: 'party_size', required: false, description: 'Party size to evaluate capacity against' })
  @ApiResponse({ status: 200, description: 'Table availability snapshot' })
  @ApiResponse({ status: 404, description: 'Table not found or unavailable' })
  async getTableAvailability(
    @Param('id') id: string,
    @Query('requested_start') requestedStart?: string,
    @Query('date') date?: string,
    @Query('party_size') partySize?: number
  ) {
    return this.availabilityService.getTableAvailability(
      id,
      requestedStart || date,
      partySize !== undefined ? Number(partySize) : undefined
    );
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Check table availability for date and party size (backward-compatible alias)',
    description: 'Legacy endpoint for restaurant availability check.',
  })
  @ApiQuery({ name: 'restaurant_id', required: true, description: 'Restaurant UUID' })
  @ApiQuery({ name: 'party_size', required: true, description: 'Party size' })
  @ApiQuery({ name: 'date', required: false, description: 'Requested start date/time' })
  @ApiQuery({ name: 'requested_start', required: false, description: 'Requested start timestamp' })
  async checkAvailability(
    @Query('restaurant_id') restaurantId: string,
    @Query('party_size') partySize: number,
    @Query('date') date?: string,
    @Query('requested_start') requestedStart?: string
  ) {
    return this.availabilityService.getRestaurantAvailability(
      restaurantId,
      Number(partySize) || 2,
      requestedStart || date || new Date().toISOString()
    );
  }
}
