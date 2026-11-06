import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FloorPlansService } from './floor-plans.service';

@ApiTags('Floor Plans')
@Controller('floor-plans')
export class FloorPlansController {
  constructor(private readonly floorPlansService: FloorPlansService) {}

  @Get(':restaurantId')
  @ApiOperation({ summary: 'Get active floor plan layout for restaurant' })
  async getFloorPlan(@Param('restaurantId') restaurantId: string) {
    return this.floorPlansService.getFloorPlan(restaurantId);
  }
}
