import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { OwnerOperationsService } from './owner-operations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';

@ApiTags('Owner Operations')
@Controller('owner')
export class OwnerOperationsController {
  constructor(private readonly ownerOpsService: OwnerOperationsService) {}

  @Get('restaurants/:id/bookings')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get restaurant bookings (staff only)',
    description: 'Enforces tenant isolation: host/manager/owner in restaurant A cannot access restaurant B',
  })
  @ApiResponse({ status: 200, description: 'Bookings list for restaurant' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks active membership in this restaurant' })
  async getRestaurantBookings(@Param('id') id: string) {
    return this.ownerOpsService.getRestaurantBookings(id);
  }

  @Post('walk-ins')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record immediate staff walk-in seating' })
  @ApiResponse({ status: 201, description: 'Walk-in seated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks membership in restaurant' })
  async recordWalkIn(@Body() body: any) {
    return this.ownerOpsService.recordWalkIn(body.restaurant_id, body.table_id, body.party_size || 2);
  }
}
