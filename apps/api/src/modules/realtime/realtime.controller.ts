import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  SocketAuthorizeRequestDto,
  SocketAuthorizeResponseDto,
  EventReplayResponseDto,
  RedisRebuildRequestDto,
  RedisRebuildResponseDto,
  DeadLetterListResponseDto,
  RealtimeMetricsResponseDto,
  ErrorCode,
} from '@dine/contracts';
import { AuthGuard } from '../../common/auth/auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../../common/auth/current-user.decorator';
import { SocketIoGateway, validateRoomFormat } from './socket-io.gateway';
import { EventRecoveryService } from './event-recovery.service';
import { BullMqQueueService } from './bullmq-queue.service';
import { ValidationError } from '../../common/errors/app-error';
import * as crypto from 'crypto';

@ApiTags('Socket.IO, BullMQ & Event Recovery')
@Controller('api/v1/realtime')
export class RealtimeController {
  constructor(
    private readonly gateway: SocketIoGateway,
    private readonly recoveryService: EventRecoveryService,
    private readonly queueService: BullMqQueueService
  ) {}

  @Post('socket/authorize')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Authorize Socket.IO Room Subscription',
    description:
      'Validates caller ownership or active restaurant staff membership to join an authorized room.',
  })
  @ApiResponse({
    status: 200,
    description: 'Room subscription authorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: caller lacks permissions for requested room',
  })
  async authorizeSocketRoom(
    @Body() body: SocketAuthorizeRequestDto,
    @CurrentUser() user: AuthenticatedUser
  ): Promise<SocketAuthorizeResponseDto> {
    if (!body.room) {
      throw new ValidationError('room parameter is required');
    }

    const socketId = body.socket_id || `sock_${crypto.randomUUID().slice(0, 8)}`;
    const sub = await this.gateway.joinRoom(socketId, body.room, user);

    const roomToken = crypto
      .createHmac('sha256', 'dine_socket_secret_key')
      .update(`${user.userId}:${body.room}:${sub.joinedAt}`)
      .digest('hex');

    return {
      authorized: true,
      room: sub.room,
      room_type: sub.roomType,
      entity_id: sub.entityId,
      audience: sub.audience,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      room_token: roomToken,
      message: `Successfully authorized for ${sub.roomType} room`,
    };
  }

  @Get('events/replay')
  @ApiOperation({
    summary: 'Database-Backed Event Replay & Reconnect Recovery',
    description:
      'Replays missed sequenced reservation events or directs reconnecting clients to authoritative REST snapshot if retention window is exceeded.',
  })
  @ApiResponse({
    status: 200,
    description: 'Missed events or mandatory snapshot fallback returned',
  })
  async replayEvents(
    @Query('entity_id') entityId: string,
    @Query('since_sequence') sinceSeq?: string,
    @Query('since_version') sinceVer?: string
  ): Promise<EventReplayResponseDto> {
    if (!entityId) {
      throw new ValidationError('entity_id query parameter is required');
    }

    const seq = sinceSeq ? parseInt(sinceSeq, 10) : undefined;
    const ver = sinceVer ? parseInt(sinceVer, 10) : undefined;

    const result = await this.recoveryService.replayEvents({
      entityId,
      sinceSequence: seq,
      sinceVersion: ver,
    });

    return {
      entity_id: entityId,
      mode: result.mode,
      current_version: ver || 1,
      current_sequence: seq || 1,
      events: result.events as any,
      resync_required: result.resyncRequired,
      snapshot_url: result.snapshotUrl,
      min_retained_sequence: 1,
      message: result.message,
    };
  }

  @Post('redis/rebuild')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rebuild Redis Queues from PostgreSQL Authority',
    description:
      'Scans PostgreSQL tables to reconstruct hold-expiry, payment-reconciliation, and outbox-dispatch queues after Redis outage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Queue rebuild completed from PostgreSQL authority',
  })
  async rebuildRedis(
    @Body() body: RedisRebuildRequestDto
  ): Promise<RedisRebuildResponseDto> {
    return this.queueService.rebuildFromPostgres();
  }

  @Get('redis/health')
  @ApiOperation({
    summary: 'Redis & BullMQ Queue Health',
    description: 'Returns connection status and queue degradation metrics.',
  })
  async getRedisHealth(): Promise<{
    state: string;
    degraded: boolean;
    recoverySource: string;
    timestamp: string;
  }> {
    const state = this.queueService.getRedisState();
    return {
      state,
      degraded: state !== 'ONLINE',
      recoverySource: 'POSTGRESQL_AUTHORITY',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('dead-letters')
  @ApiOperation({
    summary: 'List Visible Dead-Letter Jobs',
    description: 'Inspects failed worker jobs that reached max retry limit with recovery owners.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dead letters listed with safe recovery owner',
  })
  async listDeadLetters(): Promise<DeadLetterListResponseDto> {
    const res = await this.queueService.listDeadLetters();
    return {
      total: res.total,
      jobs: res.jobs as any,
      recovery_owner: res.recoveryOwner,
    };
  }

  @Post('dead-letters/:id/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry Dead-Letter Job',
    description: 'Resets attempt count to allow safe re-execution of a dead-letter job.',
  })
  async retryDeadLetter(@Param('id') jobId: string): Promise<any> {
    return this.queueService.retryDeadLetter(jobId);
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Realtime & Contention Operational Metrics',
    description:
      'Provides telemetry for connected clients, p95 delivery latency, and DB contention.',
  })
  @ApiResponse({
    status: 200,
    description: 'Realtime metrics report',
  })
  async getMetrics(): Promise<RealtimeMetricsResponseDto> {
    const gatewayMetrics = this.gateway.getMetrics();
    const redisState = this.queueService.getRedisState();

    return {
      ws_connected_clients: gatewayMetrics.connectedClients,
      active_room_subscriptions: gatewayMetrics.activeRooms,
      p95_delivery_latency_ms: gatewayMetrics.p95DeliveryLatencyMs,
      db_contention_events: 0,
      redis_queue_state: redisState === 'ONLINE' ? 'ONLINE' : 'DEGRADED',
      reconstructed_jobs_total: gatewayMetrics.totalEventsDelivered,
      timestamp: new Date().toISOString(),
    };
  }
}
