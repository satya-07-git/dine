import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { RestaurantsService } from './restaurants.service';
import { DiscoveryService } from '../discovery/discovery.service';

@ApiTags('Restaurants', 'Discovery')
@Controller('restaurants')
export class RestaurantsController {
  constructor(
    private readonly restaurantsService: RestaurantsService,
    private readonly discoveryService: DiscoveryService
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Public filtered restaurant discovery',
    description: 'Returns a bounded paginated list of published restaurants matching cuisine, price tier, and text query.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search term for restaurant name or description' })
  @ApiQuery({ name: 'cuisine', required: false, description: 'Cuisine slug or name filter' })
  @ApiQuery({ name: 'price_tier', required: false, description: 'Price tier filter: $, $$, $$$, $$$$' })
  @ApiQuery({ name: 'limit', required: false, description: 'Pagination limit (1-50, default 20)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (>= 0, default 0)' })
  @ApiResponse({ status: 200, description: 'Paginated list of matching published restaurants' })
  @ApiResponse({ status: 400, description: 'Invalid filter or excessive pagination bound' })
  async searchRestaurants(
    @Query('q') q?: string,
    @Query('cuisine') cuisine?: string,
    @Query('price_tier') priceTier?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.discoveryService.searchRestaurants({
      q,
      cuisine,
      price_tier: priceTier,
      limit,
      offset,
    });
  }

  @Get('nearby')
  @ApiOperation({
    summary: 'Geospatial nearby restaurant discovery',
    description: 'Returns published restaurants within the requested radius (km) sorted by distance using PostGIS geography.',
  })
  @ApiQuery({ name: 'lat', required: true, description: 'Latitude [-90, +90]' })
  @ApiQuery({ name: 'lng', required: true, description: 'Longitude [-180, +180]' })
  @ApiQuery({ name: 'radius_km', required: false, description: 'Search radius in km (0 < radius <= 50, default 10)' })
  @ApiQuery({ name: 'cuisine', required: false, description: 'Cuisine slug or name filter' })
  @ApiQuery({ name: 'price_tier', required: false, description: 'Price tier filter: $, $$, $$$, $$$$' })
  @ApiQuery({ name: 'limit', required: false, description: 'Pagination limit (1-50, default 20)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (>= 0, default 0)' })
  @ApiResponse({ status: 200, description: 'Nearby published restaurants sorted by distance' })
  @ApiResponse({ status: 400, description: 'Out-of-range coordinates or excessive radius bounds' })
  async getNearby(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius_km') radiusKm?: number,
    @Query('cuisine') cuisine?: string,
    @Query('price_tier') priceTier?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.discoveryService.nearbyRestaurants({
      lat,
      lng,
      radius_km: radiusKm,
      cuisine,
      price_tier: priceTier,
      limit,
      offset,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get restaurant by ID',
    description: 'Returns published restaurant details, operating hours, special closures, cuisines, and current booking policies.',
  })
  @ApiResponse({ status: 200, description: 'Published restaurant details and policies' })
  @ApiResponse({ status: 404, description: 'Restaurant not found or unpublished' })
  async getRestaurant(@Param('id') id: string) {
    return this.restaurantsService.getPublishedDetails(id);
  }

  @Get(':id/menu')
  @ApiOperation({
    summary: 'Get published restaurant menu catalog',
    description: 'Returns public menu categories, available dishes with minor-unit pricing, and public restaurant media.',
  })
  @ApiResponse({ status: 200, description: 'Published menu catalog and public media' })
  @ApiResponse({ status: 404, description: 'Restaurant not found or unpublished' })
  async getRestaurantMenu(@Param('id') id: string) {
    return this.restaurantsService.getPublishedMenu(id);
  }
}
