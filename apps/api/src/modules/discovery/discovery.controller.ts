import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DiscoveryService } from './discovery.service';

@ApiTags('Discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search restaurants by location and cuisine' })
  async search(@Query('q') q?: string) {
    return this.discoveryService.searchRestaurants({ query: q });
  }
}
