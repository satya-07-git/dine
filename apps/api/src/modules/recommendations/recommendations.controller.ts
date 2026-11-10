import {
  Controller,
  Post,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import { TableRecommendationDto } from '../../common/dto/canonical-validation.dto';
import {
  TableRecommendationResponseDto,
  AutoHoldRequestDto,
  AutoHoldResponseDto,
} from '@dine/contracts';

@ApiTags('Recommendations')
@Controller()
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Post(['api/v1/recommendations/tables', 'v1/recommendations', 'recommendations/tables', 'recommendations'])
  @ApiOperation({
    summary: 'Get deterministic best-available table recommendations (POST /api/v1/recommendations/tables)',
    description:
      'Filters mandatory eligibility first, then evaluates deterministic scoring (Capacity Fit 40%, Preference 25%, Location 20%, Operations 15%) with stable tie-breaking. Returns ranked candidates with score explanation; grants NO allocation claim.',
  })
  @ApiResponse({ status: 200, description: 'Ranked table recommendations' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Restaurant not found' })
  async getRecommendations(
    @Body() dto: TableRecommendationDto,
  ): Promise<TableRecommendationResponseDto> {
    return this.recommendationsService.getRecommendations(dto as any);
  }

  @Post('v1/recommendations')
  @ApiOperation({
    summary: 'Get deterministic best-available table recommendations (legacy alias)',
    description: 'Backward-compatible alias for POST /api/v1/recommendations/tables.',
  })
  @ApiResponse({ status: 200, description: 'Ranked table recommendations' })
  async getRecommendationsLegacy(
    @Body() dto: TableRecommendationDto,
  ): Promise<TableRecommendationResponseDto> {
    return this.recommendationsService.getRecommendations(dto as any);
  }

  @Post(['api/v1/recommendations/holds', 'v1/recommendations/holds', 'recommendations/holds'])
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Client idempotency key' })
  @ApiOperation({
    summary: 'Acquire atomic hold with bounded automatic fallback',
    description:
      'Attempts hold on ranked candidate #1; on concurrent race conflict, retries next candidate up to retry_cap. Customer explicit manual selection never silently substitutes tables.',
  })
  @ApiResponse({ status: 201, description: 'Automatic hold acquired successfully' })
  @ApiResponse({ status: 409, description: 'All eligible candidates exhausted or table unavailable' })
  async acquireAutoHold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AutoHoldRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AutoHoldResponseDto> {
    return this.recommendationsService.acquireAutoHold(
      dto,
      user?.userId || 'default_user',
      idempotencyKey,
    );
  }

  @Post(['api/v1/holds/auto', 'v1/holds/auto', 'holds/auto'])
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Acquire atomic hold with bounded automatic fallback (alias)',
    description: 'Alias for POST /api/v1/recommendations/holds.',
  })
  @ApiResponse({ status: 201, description: 'Automatic hold acquired successfully' })
  @ApiResponse({ status: 409, description: 'Candidates exhausted' })
  async acquireAutoHoldAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AutoHoldRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AutoHoldResponseDto> {
    return this.recommendationsService.acquireAutoHold(
      dto,
      user?.userId || 'default_user',
      idempotencyKey,
    );
  }
}
