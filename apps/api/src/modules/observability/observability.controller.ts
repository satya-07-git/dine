import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ObservabilityService } from './observability.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  TriggerJobRequestDto,
  WorkerHeartbeatRequestDto,
  OperationalMetricsQueryDto,
  DisasterRecoveryRehearsalDto,
} from '@dine/contracts';

@ApiTags('Observability & Background Jobs')
@Controller('operations')
export class ObservabilityController {
  constructor(private readonly observabilityService: ObservabilityService) {}

  @Post('jobs/trigger')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Trigger or enqueue background job / sweep',
    description:
      'Manually or programmatically triggers background worker sweeps (safe expiry, payment review, offer expiry, outbox dispatch).',
  })
  @ApiResponse({ status: 201, description: 'Job enqueued successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden: Operational role required' })
  async triggerJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TriggerJobRequestDto
  ) {
    return this.observabilityService.triggerJob(user, dto);
  }

  @Get('jobs/dead-letter')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List poison dead-letter jobs',
    description:
      'Retrieves jobs that reached maximum retry attempts with visible error reasons for operator inspection.',
  })
  @ApiResponse({ status: 200, description: 'Dead-letter jobs retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden: Operational role required' })
  async getDeadLetterJobs(@CurrentUser() user: AuthenticatedUser) {
    return this.observabilityService.getDeadLetterJobs(user);
  }

  @Post('jobs/dead-letter/:id/retry')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Retry dead-letter job',
    description:
      'Resets attempt count and requeues a dead-letter poison job after operator remediation.',
  })
  @ApiParam({ name: 'id', description: 'Job UUID' })
  @ApiResponse({ status: 200, description: 'Job reset and requeued' })
  @ApiResponse({ status: 403, description: 'Forbidden: Operational role required' })
  async retryDeadLetterJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') jobId: string
  ) {
    return this.observabilityService.retryDeadLetterJob(user, jobId);
  }

  @Post('workers/heartbeat')
  @ApiOperation({
    summary: 'Record worker heartbeat',
    description: 'Heartbeat signal from background worker instances for liveness monitoring.',
  })
  @ApiResponse({ status: 200, description: 'Heartbeat acknowledged' })
  async recordWorkerHeartbeat(@Body() dto: WorkerHeartbeatRequestDto) {
    return this.observabilityService.recordWorkerHeartbeat(dto);
  }

  @Get('workers')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List background workers status',
    description: 'Lists all registered workers, heartbeats, and active job leases.',
  })
  @ApiResponse({ status: 200, description: 'Workers list retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden: Operational role required' })
  async getWorkers(@CurrentUser() user: AuthenticatedUser) {
    return this.observabilityService.getWorkers(user);
  }

  @Get('metrics')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get operational system metrics',
    description:
      'Returns hold conflicts, lock wait times, payment review age, outbox age, and error rates.',
  })
  @ApiResponse({ status: 200, description: 'Operational metrics retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden: Operational role required' })
  async getMetrics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OperationalMetricsQueryDto
  ) {
    return this.observabilityService.getOperationalMetrics(user, query);
  }

  @Post('recovery/rehearse')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rehearse backup restore and disaster recovery',
    description:
      'Simulates point-in-time restore and reconciles relational invariants across table allocations, payments, and audit logs.',
  })
  @ApiResponse({ status: 200, description: 'Disaster recovery report generated' })
  @ApiResponse({ status: 403, description: 'Forbidden: Operational role required' })
  async rehearseRecovery(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisasterRecoveryRehearsalDto
  ) {
    return this.observabilityService.rehearseDisasterRecovery(user, dto);
  }

  @Get('performance/slo-report')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get pilot performance and SLO measurement report',
    description:
      'Reports empirical p95 availability read latency, uncontended hold latency, and concurrency ratios.',
  })
  @ApiResponse({ status: 200, description: 'SLO performance report retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden: Operational role required' })
  async getPerformanceSloReport(@CurrentUser() user: AuthenticatedUser) {
    return this.observabilityService.getPerformanceSloReport(user);
  }
}
