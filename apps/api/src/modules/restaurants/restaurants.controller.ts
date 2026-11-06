import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';

@ApiTags('Restaurants')
@Controller('restaurants')
export class RestaurantsController {
  constructor(private readonly restaurantsService: RestaurantsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get restaurant by ID',
    description: 'Returns published restaurant details, operating hours, special closures, cuisines, and current booking policies.',
  })
  @ApiResponse({ status: 200, description: 'Published restaurant details and policies' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async getRestaurant(@Param('id') id: string) {
    return this.restaurantsService.getPublishedDetails(id);
  }
}
