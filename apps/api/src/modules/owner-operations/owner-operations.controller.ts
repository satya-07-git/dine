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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { OwnerOperationsService } from './owner-operations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import { CreateTableBlockDto } from '../../common/dto/canonical-validation.dto';
import {
  OwnerBookingListQueryDto,
  RecordWalkInRequestDto,
  CheckInRequestDto,
  UpdateBookingStatusRequestDto,
} from '@dine/contracts';

@ApiTags('Owner Operations')
@Controller(['api/v1/restaurant-ops', 'v1/owner', 'owner'])
export class OwnerOperationsController {
  constructor(private readonly ownerOpsService: OwnerOperationsService) {}

  @Get(['reservations', 'restaurants/:id/bookings', '/api/v1/restaurant-ops/reservations', '/v1/owner/reservations'])
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get restaurant bookings (GET /api/v1/restaurant-ops/reservations)',
    description: 'Enforces tenant isolation: host/manager/owner in restaurant A cannot access restaurant B. Returns bounded, paginated projection of bookings.',
  })
  @ApiParam({ name: 'id', required: false, description: 'Restaurant UUID (optional if provided via query or membership)' })
  @ApiQuery({ name: 'restaurant_id', required: false, type: String, description: 'Restaurant UUID' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'is_walk_in', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Bookings list for restaurant' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks active membership in this restaurant' })
  async getRestaurantBookings(
    @Param('id') id?: string,
    @Query('restaurant_id') queryRestaurantId?: string,
    @Query() query?: OwnerBookingListQueryDto,
    @CurrentUser() user?: AuthenticatedUser
  ) {
    const targetId = id || queryRestaurantId || (query as any)?.restaurant_id || user?.memberships?.[0]?.restaurantId || '';
    return this.ownerOpsService.getRestaurantBookings(targetId, query);
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

  @Post(['bookings/:id/check-in', 'check-in', '/api/v1/restaurant-ops/bookings/:id/check-in', '/v1/owner/check-in'])
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check in guest using booking ID or QR token (POST /api/v1/restaurant-ops/bookings/:id/check-in)',
    description:
      'Performs verified server-side arrival check-in. Validates restaurant binding (host from A cannot check in booking for B) and provides repeat-safe idempotent replays.',
  })
  @ApiParam({ name: 'id', required: false, description: 'Booking UUID' })
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

    const targetId = bookingId || body?.booking_id || (body as any)?.bookingId;
    return this.ownerOpsService.verifyAndCheckIn(
      user.userId,
      staffRestaurantId,
      { ...body, booking_id: targetId },
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

  @Post(['bookings/:id/seat', 'seat', '/api/v1/restaurant-ops/bookings/:id/seat', '/v1/owner/seat'])
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Seat guest booking (POST /api/v1/restaurant-ops/bookings/:id/seat)',
    description: 'Transitions checked-in/ready booking to SEATED state.',
  })
  @ApiParam({ name: 'id', required: false, description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking seated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async seatBooking(
    @Param('id') bookingId: string,
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    const targetId = bookingId || body?.booking_id || body?.bookingId;
    return this.ownerOpsService.updateBookingStatus(
      targetId,
      { status: 'SEATED', target_status: 'SEATED', ...body },
      user?.userId,
      requestId
    );
  }

  @Post(['bookings/:id/complete', 'complete', '/api/v1/restaurant-ops/bookings/:id/complete', '/v1/owner/complete'])
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete dining visit (POST /api/v1/restaurant-ops/bookings/:id/complete)',
    description: 'Transitions seated booking to COMPLETED state and frees table allocation.',
  })
  @ApiParam({ name: 'id', required: false, description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Booking completed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request or invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async completeBooking(
    @Param('id') bookingId: string,
    @Body() body: any,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    const targetId = bookingId || body?.booking_id || body?.bookingId;
    return this.ownerOpsService.updateBookingStatus(
      targetId,
      { status: 'COMPLETED', target_status: 'COMPLETED', ...body },
      user?.userId,
      requestId
    );
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

  @Post(['table-blocks', 'tables/:id/blocks', '/api/v1/restaurant-ops/table-blocks', '/v1/owner/blocks'])
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Schedule table maintenance block (POST /api/v1/restaurant-ops/table-blocks)',
    description: 'Creates a table block interval. Checks for conflicts against existing confirmed/held bookings unless force=true.',
  })
  @ApiParam({ name: 'id', required: false, description: 'Table UUID (optional if provided in body)' })
  @ApiResponse({ status: 201, description: 'Table block scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request: Invalid time range or parameters' })
  @ApiResponse({ status: 403, description: 'Forbidden: Caller lacks OWNER or MANAGER role' })
  @ApiResponse({ status: 409, description: 'Conflict: Table block overlaps with existing reservations or holds' })
  async addTableBlock(
    @Param('id') paramTableId: string,
    @Body() body: CreateTableBlockDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any
  ) {
    const requestId = req.headers ? req.headers['x-request-id'] : undefined;
    const tableId = paramTableId || body.tableId || body.table_id || '';
    const restaurantId =
      body.restaurantId ||
      body.restaurant_id ||
      (req.headers ? req.headers['x-restaurant-id'] : undefined) ||
      user.memberships?.[0]?.restaurantId ||
      '';
    const startTime = body.startsAt || body.start_time || '';
    const endTime = body.endsAt || body.end_time || '';
    return this.ownerOpsService.addTableBlock(
      restaurantId,
      { ...body, table_id: tableId, start_time: startTime, end_time: endTime, reason: body.reason || 'Operational maintenance' } as any,
      user?.userId,
      requestId
    );
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
  @RequireRestaurantRoles('OWNER', 'MANAGER')
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
  @ApiOperation({ summary: 'List scheduled special closures for restaurant' })
  @ApiResponse({ status: 200, description: 'List of special closures' })
  async listSpecialClosures(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.ownerOpsService.getClosures(id);
  }

  @Get('restaurants/:id/policy-history')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Audit log of restaurant policy changes' })
  @ApiResponse({ status: 200, description: 'Policy audit trail' })
  async getPolicyHistory(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.ownerOpsService.getPolicyHistory(id);
  }
}
