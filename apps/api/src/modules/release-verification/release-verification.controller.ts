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
import { ReleaseVerificationService } from './release-verification.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  ConcurrencyCheckRequestDto,
  PaymentRecoveryReplayRequestDto,
  CreateVerificationRunDto,
} from '@dine/contracts';

@ApiTags('Release & Staging Verification')
@Controller('release')
export class ReleaseVerificationController {
  constructor(
    private readonly releaseVerificationService: ReleaseVerificationService
  ) {}

  @Get('acceptance-matrix')
  @ApiOperation({
    summary: 'Get Blueprint acceptance matrix',
    description:
      'Returns the verified acceptance matrix mapping scenarios to owning epics and Blueprint §17.1 / §19 source sections.',
  })
  @ApiResponse({ status: 200, description: 'Acceptance matrix retrieved' })
  getAcceptanceMatrix(@CurrentUser() user: AuthenticatedUser) {
    return this.releaseVerificationService.getAcceptanceMatrix(user);
  }

  @Post('concurrency-check')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Execute 100-client concurrency check',
    description:
      'Automates multi-client race conditions proving at most one protected allocation winner.',
  })
  @ApiResponse({ status: 200, description: 'Concurrency simulation evaluated' })
  runConcurrencyCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConcurrencyCheckRequestDto
  ) {
    return this.releaseVerificationService.runConcurrencyCheck(user, dto);
  }

  @Post('payment-recovery-replay')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Replay payment recovery scenarios',
    description:
      'Replays payment lateness, duplicates, out-of-order webhooks, and network-loss scenarios.',
  })
  @ApiResponse({ status: 200, description: 'Payment recovery replay evaluated' })
  runPaymentRecoveryReplay(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PaymentRecoveryReplayRequestDto
  ) {
    return this.releaseVerificationService.runPaymentRecoveryReplay(user, dto);
  }

  @Post('promoter-conflict-replay')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Replay waitlist promoter & walk-in conflict paths',
    description:
      'Verifies two queue promoters and owner walk-in contention paths.',
  })
  @ApiResponse({ status: 200, description: 'Promoter conflict replay evaluated' })
  runPromoterConflictReplay(@CurrentUser() user: AuthenticatedUser) {
    return this.releaseVerificationService.runPromoterConflictReplay(user);
  }

  @Post('security-load-check')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Execute security, secrets, and restore checks',
    description:
      'Verifies cross-tenant isolation, private topic access denial, secrets scrubbing, and backup restore coherence.',
  })
  @ApiResponse({ status: 200, description: 'Security and load check evaluated' })
  runSecurityLoadCheck(@CurrentUser() user: AuthenticatedUser) {
    return this.releaseVerificationService.runSecurityLoadCheck(user);
  }

  @Get('go-no-go')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Evaluate staging go/no-go and commercial release gates',
    description:
      'Evaluates all staging gates, blocks live payment release until commercial gates (GATE-001..GATE-007) are approved, and records designated observation and recovery owners.',
  })
  @ApiResponse({ status: 200, description: 'Staging go/no-go decision retrieved' })
  getStagingGoNoGo(@CurrentUser() user: AuthenticatedUser) {
    return this.releaseVerificationService.getStagingGoNoGo(user);
  }

  @Post('runs')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Record staging verification run',
    description: 'Records an automated staging verification run with structured evidence.',
  })
  @ApiResponse({ status: 201, description: 'Verification run recorded' })
  createVerificationRun(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVerificationRunDto
  ) {
    return this.releaseVerificationService.createVerificationRun(user, dto);
  }

  @Get('runs')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List staging verification runs',
    description: 'Lists all staging verification runs and evidence artifacts.',
  })
  @ApiResponse({ status: 200, description: 'Verification runs retrieved' })
  listVerificationRuns(@CurrentUser() user: AuthenticatedUser) {
    return this.releaseVerificationService.listVerificationRuns(user);
  }
}
