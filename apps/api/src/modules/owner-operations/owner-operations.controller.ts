import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OwnerOperationsService } from './owner-operations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { RolesGuard, Roles } from '../../common/auth/roles.guard';

@ApiTags('Owner Operations')
@Controller('operations')
export class OwnerOperationsController {
  constructor(private readonly ownerOpsService: OwnerOperationsService) {}

  @Post('walk-ins')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'HOST')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record immediate staff walk-in seating' })
  async recordWalkIn(@Body() body: any) {
    return this.ownerOpsService.recordWalkIn(body.restaurant_id, body.table_id, body.party_size || 2);
  }
}
