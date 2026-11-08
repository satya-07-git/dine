import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { OwnerOperationsService } from './owner-operations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  OwnerBookingListQueryDto,
  RecordWalkInRequestDto,
  CheckInRequestDto,
  CreateTableBlockRequestDto,
  UpdateBookingStatusRequestDto,
} from '@dine/contracts';

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
    description: 'Enforces tenant isolation: host/manager/owner in restaurant A cannot access restaurant B. Returns bounded, paginated projection of bookings.',
  })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'is_walk_in', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Bookings list for restaurant' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks active membership in this restaurant' })
  async getRestaurantBookings(
    @Param('id') id: string,
    @Query() query?: OwnerBookingListQueryDto
  ) {
    return this.ownerOpsService.getRestaurantBookings(id, query);
  }

  @Post('bookings/:id/qr-token')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate cryptographically signed QR check-in token for booking',
    description: 'Creates HMAC-SHA256 signed check-in token binding booking and restaurant.',
  })
  @ApiResponse({ status: 201, description: 'QR check-in token generated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks membership in restaurant' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async generateCheckInQr(
    @Param('id') bookingId: string,
    @Body() body: { ttl_hours?: number },
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.ownerOpsService.generateCheckInQr(user.userId, bookingId, body?.ttl_hours || 24);
  }

  @Post('bookings/:id/check-in')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check in guest using booking ID or QR token',
    description:
      'Performs verified server-side arrival check-in. Validates restaurant binding (host from A cannot check in booking for B) and provides repeat-safe idempotent replays.',
  })
  @ApiResponse({ status: 200, description: 'Guest checked in successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid QR token' })
  @ApiResponse({ status: 403, description: 'Forbidden: Host lacks active membership in booking restaurant' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 410, description: 'Gone: QR token expired' })
  async checkInBooking(
    @Param('id') bookingId: string,
    @Body() body: CheckInRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    const restaurantId = req.headers ? req.headers['x-restaurant-id'] : undefined;
    const staffRestaurantId =
      restaurantId ||
      user.memberships?.[0]?.restaurantId ||
      '';

    return this.ownerOpsService.verifyAndCheckIn(
      user.userId,
      staffRestaurantId,
      { ...body, booking_id: bookingId },
      { requestId }
    );
  }

  @Post('check-in')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check in guest using scanned QR token directly',
    description: 'Decodes signed QR token and verifies restaurant binding and repeat-safety.',
  })
  @ApiResponse({ status: 200, description: 'Guest checked in successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid QR token' })
  @ApiResponse({ status: 403, description: 'Forbidden: Host lacks membership in token restaurant' })
  @ApiResponse({ status: 410, description: 'Gone: QR token expired' })
  async checkInWithQr(
    @Body() body: CheckInRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    const staffRestaurantId = req.headers ? req.headers['x-restaurant-id'] : user.memberships?.[0]?.restaurantId;
    return this.ownerOpsService.verifyAndCheckIn(user.userId, staffRestaurantId || '', body, { requestId });
  }

  @Post('walk-ins')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record immediate staff walk-in seating through reservation core',
    description:
      'Routes walk-in through reservation core engine. Competes with online customers and offers under PostgreSQL GiST range exclusion. Rejects overlapping allocations with 409 Conflict.',
  })
  @ApiResponse({ status: 201, description: 'Walk-in seated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid party size or table' })
  @ApiResponse({ status: 403, description: 'Forbidden: Caller lacks membership in restaurant' })
  @ApiResponse({ status: 409, description: 'Conflict: Table is currently held, reserved, or blocked' })
  async recordWalkIn(
    @Body() body: RecordWalkInRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    return this.ownerOpsService.recordWalkIn(user.userId, body, { requestId });
  }

  @Patch('bookings/:id/status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update booking service status with optimistic version check (staff only)',
    description:
      'Guarded staff status transition (READY, SEATED, COMPLETED, NO_SHOW, CANCELLED). Verifies staff membership and rejects stale versions with 409 Conflict. Enforces POL-008 15-minute lateness grace period before NO_SHOW can be recorded.',
  })
  @ApiResponse({ status: 200, description: 'Booking status updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: staff lacks role or restaurant membership' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'Conflict: Stale booking version (VERSION_CONFLICT)' })
  @ApiResponse({ status: 422, description: 'Unprocessable: Invalid transition or NO_SHOW before 15m grace period' })
  async updateBookingStatus(
    @Param('id') id: string,
    @Body() body: UpdateBookingStatusRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    return this.ownerOpsService.updateBookingStatus(id, body, user?.userId, requestId);
  }

  @Post('tables/:id/blocks')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Schedule table maintenance block (owner / manager only)',
    description: 'Creates a table block interval. Checks for conflicts against existing confirmed/held bookings unless force=true.',
  })
  @ApiResponse({ status: 201, description: 'Table block scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid time range or parameters' })
  @ApiResponse({ status: 403, description: 'Forbidden: Caller lacks OWNER or MANAGER role' })
  @ApiResponse({ status: 409, description: 'Conflict: Table block overlaps with existing reservations or holds' })
  async addTableBlock(
    @Param('id') tableId: string,
    @Body() body: CreateTableBlockRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    const restaurantId = req.headers ? req.headers['x-restaurant-id'] : undefined;
    const restId = restaurantId || user.memberships?.[0]?.restaurantId || '';
    return this.ownerOpsService.addTableBlock(restId, { ...body, table_id: tableId }, user?.userId, requestId);
  }

  @Get('tables/:id/blocks')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List table blocks (staff only)' })
  @ApiResponse({ status: 200, description: 'List of table blocks' })
  async getTableBlocks(
    @Param('id') tableId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const restaurantId = req.headers ? req.headers['x-restaurant-id'] : user.memberships?.[0]?.restaurantId || '';
    return this.ownerOpsService.getTableBlocks(restaurantId, { table_id: tableId });
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

  @Put('restaurants/:id/floor-plan')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update restaurant floor plan with optimistic version guard',
    description:
      'Updates floor layout and tables with optimistic version lock. Rejects stale versions (409 Conflict), invalid geometry/capacities (400 Bad Request), and attempts to retire tables with active holds or confirmed reservations (409 Conflict).',
  })
  @ApiResponse({ status: 200, description: 'Floor plan updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid table geometry or capacity' })
  @ApiResponse({ status: 403, description: 'Forbidden: Caller lacks OWNER or MANAGER membership in this restaurant' })
  @ApiResponse({ status: 409, description: 'Conflict: Stale floor plan version or table has active bookings/holds' })
  async updateFloorPlan(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    return this.ownerOpsService.updateFloorPlan(id, body, user?.userId, requestId);
  }
}
