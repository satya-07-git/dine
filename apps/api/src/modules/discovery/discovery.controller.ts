import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';

@ApiTags('Discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search restaurants by cuisine, price, and text query',
    description: 'Returns bounded paginated list of published restaurants matching criteria.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Search term for restaurant name or description' })
  @ApiQuery({ name: 'cuisine', required: false, description: 'Cuisine slug or name filter' })
  @ApiQuery({ name: 'price_tier', required: false, description: 'Price tier filter: $, $$, $$$, $$$$' })
  @ApiQuery({ name: 'limit', required: false, description: 'Pagination limit (1-50, default 20)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset (>= 0, default 0)' })
  @ApiResponse({ status: 200, description: 'Matching published restaurants' })
  @ApiResponse({ status: 400, description: 'Invalid filter parameters' })
  async search(
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
    summary: 'Search restaurants nearby coordinates within radius',
    description: 'Returns published restaurants within radius (km) sorted by distance.',
  })
  @ApiQuery({ name: 'lat', required: true, description: 'Latitude [-90, +90]' })
  @ApiQuery({ name: 'lng', required: true, description: 'Longitude [-180, +180]' })
  @ApiQuery({ name: 'radius_km', required: false, description: 'Radius in km (max 50 km)' })
  @ApiQuery({ name: 'cuisine', required: false, description: 'Cuisine filter' })
  @ApiQuery({ name: 'price_tier', required: false, description: 'Price tier filter' })
  @ApiQuery({ name: 'limit', required: false, description: 'Pagination limit' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset' })
  @ApiResponse({ status: 200, description: 'Nearby published restaurants' })
  @ApiResponse({ status: 400, description: 'Out-of-range coordinates or excessive radius' })
  async nearby(
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
}
