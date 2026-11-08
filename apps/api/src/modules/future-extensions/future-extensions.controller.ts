import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { FutureExtensionsService } from './future-extensions.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  ExtensionFeasibilityAssessmentRequestDto,
  MicroserviceDecompositionScaleCheckRequestDto,
  SimulateDeferredRouteRequestDto,
} from '@dine/contracts';

@ApiTags('Future Extensions & Scope Definition')
@Controller('future-extensions')
export class FutureExtensionsController {
  constructor(
    private readonly futureExtensionsService: FutureExtensionsService,
  ) {}

  @Get('register')
  @ApiOperation({
    summary: 'Get deferred scope register',
    description:
      'Returns the official deferred scope register with accountable owners, rationale, prerequisites, and risk criteria (Blueprint §1.3, §20.3).',
  })
  @ApiResponse({ status: 200, description: 'Deferred scope register retrieved' })
  getDeferredScopeRegister(@CurrentUser() user?: AuthenticatedUser) {
    return this.futureExtensionsService.getDeferredScopeRegister(user);
  }

  @Get('unresolved-contracts')
  @ApiOperation({
    summary: 'Get unresolved operational contracts',
    description:
      'Returns the unresolved commercial contracts for no-show, settlement fees, disputes, packages, and review moderation (Blueprint §19.1).',
  })
  @ApiResponse({ status: 200, description: 'Unresolved contracts register retrieved' })
  getUnresolvedContracts(@CurrentUser() user?: AuthenticatedUser) {
    return this.futureExtensionsService.getUnresolvedContractsRegister(user);
  }

  @Post('evaluate-feasibility')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Evaluate extension feasibility against invariants',
    description:
      'Validates candidate extension designs against core invariants: deterministic table lock ordering for joined tables, non-bypass rules for POS, and prohibition of speculative schema.',
  })
  @ApiResponse({ status: 200, description: 'Extension feasibility evaluated' })
  evaluateFeasibility(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExtensionFeasibilityAssessmentRequestDto,
  ) {
    return this.futureExtensionsService.evaluateExtensionFeasibility(dto, user);
  }

  @Post('scale-check')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Evaluate microservices scale triggers',
    description:
      'Evaluates empirical production scale metrics against decomposition triggers to enforce ADR-001 modular monolith architecture.',
  })
  @ApiResponse({ status: 200, description: 'Scale triggers evaluated' })
  evaluateScaleTriggers(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MicroserviceDecompositionScaleCheckRequestDto,
  ) {
    return this.futureExtensionsService.evaluateMicroservicesScaleTriggers(dto, user);
  }

  @Post('simulate-deferred-route')
  @ApiOperation({
    summary: 'Simulate deferred route rejection',
    description:
      'Proves that candidate future endpoints return HTTP 501 / RFC 7807 FEATURE_DEFERRED_TO_FUTURE_RELEASE.',
  })
  @ApiResponse({ status: 501, description: 'Feature deferred error response' })
  simulateDeferredRoute(@Body() dto: SimulateDeferredRouteRequestDto) {
    return this.futureExtensionsService.simulateDeferredRouteRejection(dto);
  }

  @Get('independence-check')
  @ApiOperation({
    summary: 'Verify first release dependency independence',
    description:
      'Confirms that core release epics (EPIC-001 through EPIC-019) execute completely without dependency on future extensions.',
  })
  @ApiResponse({ status: 200, description: 'Independence verified' })
  checkIndependence() {
    return this.futureExtensionsService.checkFirstReleaseIndependence();
  }
}
