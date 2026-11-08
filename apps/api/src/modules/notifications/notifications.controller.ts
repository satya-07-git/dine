import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  AuthorizeTopicRequestDto,
  AuthorizeTopicResponseDto,
  ProcessOutboxBatchRequestDto,
  ProcessOutboxBatchResponseDto,
  ClientSyncStateResponseDto,
  OutboxQueryDto,
  NotificationDeliveryQueryDto,
  NotificationChannel,
} from '@dine/contracts';

@ApiTags('Notifications & Realtime')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('realtime/authorize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Authorize private Realtime topic subscription',
    description:
      'Validates caller identity against requested user or restaurant topic. Rejects unauthorized topic subscription attempts with 403 Forbidden.',
  })
  @ApiBody({
    description: 'Target topic string (e.g. user:<userId> or restaurant:<restaurantId>)',
    schema: {
      type: 'object',
      required: ['topic'],
      properties: {
        topic: { type: 'string', example: 'user:123e4567-e89b-12d3-a456-426614174000' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Topic subscription authorized' })
  @ApiResponse({ status: 400, description: 'Invalid topic format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: caller cannot subscribe to another user or unassigned restaurant private topic',
  })
  async authorizeTopic(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AuthorizeTopicRequestDto
  ): Promise<AuthorizeTopicResponseDto> {
    return this.notificationsService.authorizeTopic(user, body.topic);
  }

  @Post('outbox/process')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Trigger outbox claim and dispatch worker cycle',
    description:
      'Claims pending and retryable outbox events and dispatches them across notification channels with deduplication and bounded retries.',
  })
  @ApiResponse({ status: 200, description: 'Outbox batch processed successfully' })
  async processOutboxBatch(
    @Body() body?: ProcessOutboxBatchRequestDto
  ): Promise<ProcessOutboxBatchResponseDto> {
    return this.notificationsService.dispatchOutboxBatch({
      batchSize: body?.batch_size || 10,
      workerId: body?.worker_id,
      channels: body?.channels,
      simulateProviderFailure: body?.simulate_provider_failure,
    });
  }

  @Get('outbox')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Query transactional outbox events',
    description: 'Retrieves outbox events, claim statuses, retry metadata, and aggregate linkage.',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by outbox status' })
  @ApiQuery({ name: 'aggregateType', required: false, description: 'Filter by aggregate type' })
  @ApiQuery({ name: 'aggregateId', required: false, description: 'Filter by aggregate UUID' })
  @ApiResponse({ status: 200, description: 'Outbox events retrieved' })
  async getOutboxEvents(@Query() query: OutboxQueryDto) {
    return this.notificationsService.getOutboxEvents({
      status: query?.status,
      aggregateType: query?.aggregate_type,
      aggregateId: query?.aggregate_id,
      limit: query?.limit,
      offset: query?.offset,
    });
  }

  @Get('deliveries')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Query notification delivery deduplication store',
    description: 'Retrieves notification deliveries, attempt counts, channels, and delivery timestamps.',
  })
  @ApiQuery({ name: 'recipientId', required: false, description: 'Filter by recipient UUID' })
  @ApiQuery({ name: 'channel', required: false, description: 'Filter by channel' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by delivery status' })
  @ApiResponse({ status: 200, description: 'Notification deliveries retrieved' })
  async getNotificationDeliveries(@Query() query: NotificationDeliveryQueryDto) {
    return this.notificationsService.getNotificationDeliveries({
      recipientId: query?.recipient_id,
      channel: query?.channel,
      status: query?.status,
      outboxEventId: query?.outbox_event_id,
      limit: query?.limit,
      offset: query?.offset,
    });
  }

  @Get('sync/:bookingId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Client reconnect canonical state sync',
    description:
      'Returns authoritative REST snapshot upon client launch or reconnect. Evaluates client last-seen sequence number to prevent stale or out-of-order events from overriding canonical state.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID to reconcile' })
  @ApiQuery({ name: 'lastSeenSequence', required: false, description: 'Client last-seen event sequence number' })
  @ApiQuery({ name: 'lastSeenVersion', required: false, description: 'Client last-seen booking version' })
  @ApiResponse({ status: 200, description: 'Canonical state and reconciliation result returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: cannot view another customer booking' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async syncBookingState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Query('lastSeenSequence') lastSeenSequence?: string,
    @Query('lastSeenVersion') lastSeenVersion?: string
  ): Promise<ClientSyncStateResponseDto> {
    const seq = lastSeenSequence ? parseInt(lastSeenSequence, 10) : undefined;
    const ver = lastSeenVersion ? parseInt(lastSeenVersion, 10) : undefined;
    return this.notificationsService.syncBookingState(user, bookingId, seq, ver);
  }
}
