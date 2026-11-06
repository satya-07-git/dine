import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { OwnerOperationsService } from './owner-operations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';

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

  @Patch('restaurants/:id/policies')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update restaurant policies (owner only)',
    description: 'Updates reservation policies, timezone, deposit amount, and duration. Increments policy version and audits change.',
  })
  @ApiResponse({ status: 200, description: 'Policies updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid timezone or non-positive deposit amount' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller is not an active OWNER of this restaurant' })
  async updateRestaurantPolicies(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    return this.ownerOpsService.updatePolicies(id, body, user?.userId, requestId);
  }

  @Post('restaurants/:id/closures')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Schedule special restaurant closure (owner / manager only)',
    description: 'Creates a temporary closure interval. Checks for conflicts against existing confirmed bookings unless force=true.',
  })
  @ApiResponse({ status: 201, description: 'Special closure scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid time range or end_time <= start_time' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks OWNER or MANAGER role in this restaurant' })
  @ApiResponse({ status: 409, description: 'Conflict: Closure overlaps with existing confirmed reservations' })
  async addSpecialClosure(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    return this.ownerOpsService.addClosure(id, body, user?.userId, requestId);
  }

  @Get('restaurants/:id/closures')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List special closures for restaurant (staff only)' })
  @ApiResponse({ status: 200, description: 'List of special closures' })
  async getSpecialClosures(@Param('id') id: string) {
    return this.ownerOpsService.getClosures(id);
  }

  @Get('restaurants/:id/policy-history')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get policy version history for restaurant (owner only)' })
  @ApiResponse({ status: 200, description: 'List of historical policy versions' })
  async getPolicyHistory(@Param('id') id: string) {
    return this.ownerOpsService.getPolicyHistory(id);
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
