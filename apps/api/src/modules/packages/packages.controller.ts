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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PackagesService } from './packages.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { TenantGuard, RequireRestaurantRoles } from '../../common/auth/tenant.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import {
  CreatePackageRequestDto,
  UpdatePackageRequestDto,
} from '@dine/contracts';

@ApiTags('Dining Experiences & Packages')
@Controller()
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get('restaurants/:id/packages')
  @ApiOperation({
    summary: 'Get published dining experiences and packages for a restaurant',
    description:
      'Returns published packages, tasting menus, and celebration options with server-governed party limits, price, and duration.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'List of published dining packages' })
  @ApiResponse({ status: 404, description: 'Restaurant not found or unpublished' })
  async getPublishedPackages(@Param('id') id: string) {
    return this.packagesService.getPublishedPackages(id);
  }

  @Get('restaurants/:restaurantId/packages/:packageId')
  @ApiOperation({
    summary: 'Get published dining package details by ID',
    description: 'Retrieves a single published package. Enforces restaurant ownership (AC1).',
  })
  @ApiParam({ name: 'restaurantId', description: 'Restaurant UUID' })
  @ApiParam({ name: 'packageId', description: 'Package UUID' })
  @ApiResponse({ status: 200, description: 'Published package details' })
  @ApiResponse({ status: 403, description: 'Package does not belong to specified restaurant' })
  @ApiResponse({ status: 404, description: 'Package not found or unpublished' })
  async getPackageById(
    @Param('restaurantId') restaurantId: string,
    @Param('packageId') packageId: string
  ) {
    return this.packagesService.getPackageById(restaurantId, packageId);
  }

  @Get('owner/restaurants/:id/packages')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all packages for restaurant (staff view)',
    description: 'Returns all packages including draft and retired options for authorized staff.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiResponse({ status: 200, description: 'List of all restaurant packages' })
  @ApiResponse({ status: 403, description: 'Forbidden: staff member lacks required role' })
  async getOwnerPackages(
    @CurrentUser('userId') staffUserId: string,
    @Param('id') id: string
  ) {
    return this.packagesService.getOwnerPackages(staffUserId, id);
  }

  @Post('owner/restaurants/:id/packages')
  @UseGuards(AuthGuard, TenantGuard)
  @RequireRestaurantRoles('OWNER', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create new dining package (owner/manager only)',
    description: 'Defines package fields, capacity bounds, dining duration, and deposit price.',
  })
  @ApiParam({ name: 'id', description: 'Restaurant UUID' })
  @ApiResponse({ status: 201, description: 'Package created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error in package fields' })
  @ApiResponse({ status: 403, description: 'Forbidden: staff member lacks OWNER or MANAGER role' })
  @ApiResponse({ status: 409, description: 'Package slug conflict' })
  async createPackage(
    @CurrentUser('userId') staffUserId: string,
    @Param('id') id: string,
    @Body() dto: CreatePackageRequestDto,
    @Req() req: Request
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    return this.packagesService.createPackage(staffUserId, id, dto, requestId);
  }

  @Patch('owner/packages/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update package terms (owner/manager only)',
    description: 'Updates package duration, limits, price, or publication state. Increments version.',
  })
  @ApiParam({ name: 'id', description: 'Package UUID' })
  @ApiResponse({ status: 200, description: 'Package updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error in updated fields' })
  @ApiResponse({ status: 403, description: 'Forbidden: staff member lacks OWNER or MANAGER role' })
  @ApiResponse({ status: 404, description: 'Package not found' })
  async updatePackage(
    @CurrentUser('userId') staffUserId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePackageRequestDto,
    @Req() req: Request
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    return this.packagesService.updatePackage(staffUserId, id, dto, requestId);
  }
}
