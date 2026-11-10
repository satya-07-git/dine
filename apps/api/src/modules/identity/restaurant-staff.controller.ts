import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RestaurantStaffService } from './restaurant-staff.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  RestaurantStaffDto,
  CreateRestaurantStaffDto,
  UpdateRestaurantStaffDto,
  RoleActionMatrixDto,
} from '@dine/contracts';

@ApiTags('Identity & Access', 'Restaurant Staff RBAC')
@Controller()
export class RestaurantStaffController {
  constructor(private readonly staffService: RestaurantStaffService) {}

  @Get(['manager/roles/matrix', 'api/v1/manager/roles/matrix', 'roles/matrix'])
  @ApiOperation({
    summary: 'Get explicit role and action permission matrix (FR-A03, PRD §3)',
    description: 'Returns granular allowed and denied actions for CUSTOMER, HOST, MANAGER, OWNER, and PLATFORM_ADMIN roles.',
  })
  @ApiResponse({ status: 200, description: 'Role and action permission matrix' })
  getRoleMatrix(): RoleActionMatrixDto[] {
    return this.staffService.getRoleActionMatrix();
  }

  @Get([
    'manager/restaurants/:restaurantId/staff',
    'api/v1/manager/restaurants/:restaurantId/staff',
    'restaurants/:restaurantId/staff',
    'api/v1/restaurants/:restaurantId/staff',
  ])
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List restaurant staff members (Manager & Owner only)',
    description: 'Returns scoped staff memberships for restaurant. Tenant-isolated: manager of Restaurant A cannot view Restaurant B staff.',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'List of restaurant staff members' })
  @ApiResponse({ status: 403, description: 'Forbidden: Caller lacks active OWNER or MANAGER membership in this restaurant' })
  async listStaff(@Param('restaurantId') restaurantId: string): Promise<RestaurantStaffDto[]> {
    return this.staffService.listStaff(restaurantId);
  }

  @Post([
    'manager/restaurants/:restaurantId/staff',
    'api/v1/manager/restaurants/:restaurantId/staff',
    'restaurants/:restaurantId/staff',
    'api/v1/restaurants/:restaurantId/staff',
  ])
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Add / invite staff member to restaurant (Manager & Owner only)',
    description: 'Assigns scoped HOST, MANAGER, or STAFF role to user. Enforces restaurant tenant boundary.',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiResponse({ status: 201, description: 'Staff membership created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Caller lacks active OWNER or MANAGER role in this restaurant' })
  async addStaff(
    @Param('restaurantId') restaurantId: string,
    @Body() body: CreateRestaurantStaffDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<RestaurantStaffDto> {
    return this.staffService.addStaff(restaurantId, body, user?.userId);
  }

  @Patch([
    'manager/restaurants/:restaurantId/staff/:staffId',
    'api/v1/manager/restaurants/:restaurantId/staff/:staffId',
    'restaurants/:restaurantId/staff/:staffId',
    'api/v1/restaurants/:restaurantId/staff/:staffId',
  ])
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update staff role or revoke membership (Manager & Owner only)',
    description: 'Modifies staff role or status (ACTIVE -> SUSPENDED / REVOKED). Revocation immediately invalidates staff write operations and staff private room subscriptions.',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiParam({ name: 'staffId', description: 'Staff Membership UUID or User UUID' })
  @ApiResponse({ status: 200, description: 'Staff membership updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Caller lacks active OWNER or MANAGER role in this restaurant' })
  async updateStaff(
    @Param('restaurantId') restaurantId: string,
    @Param('staffId') staffId: string,
    @Body() body: UpdateRestaurantStaffDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<RestaurantStaffDto> {
    return this.staffService.updateStaff(restaurantId, staffId, body, user?.userId);
  }
}
