import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IdentityService } from './identity.service';
import { AuthGuard } from '../../common/auth/auth.guard';

@ApiTags('Identity & Access')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get('profile/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile' })
  async getProfile(@Param('id') id: string) {
    return this.identityService.getProfile(id);
  }
}
