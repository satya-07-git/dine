import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { FloorPlansService } from './floor-plans.service';

@ApiTags('Floor Plans')
@Controller()
export class FloorPlansController {
  constructor(private readonly floorPlansService: FloorPlansService) {}

  @Get('restaurants/:id/floor-plan')
  @ApiOperation({
    summary: 'Get active floor plan layout for restaurant',
    description:
      'Returns versioned static floor geometry, capacities, and stable table IDs without mutable availability flags.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'Active floor plan layout and tables' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async getRestaurantFloorPlan(@Param('id') id: string) {
    return this.floorPlansService.getActiveFloorPlan(id);
  }

  @Get('floor-plans/:restaurantId')
  @ApiOperation({
    summary: 'Get active floor plan layout for restaurant (alias)',
    description: 'Alias endpoint for retrieving active versioned floor plan layout.',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'Active floor plan layout and tables' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async getFloorPlan(@Param('restaurantId') restaurantId: string) {
    return this.floorPlansService.getActiveFloorPlan(restaurantId);
  }
}
