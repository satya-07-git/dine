import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  CreatePaymentOrderRequestDto,
  CreateRefundRequestDto,
  ReconcilePaymentRequestDto,
  PaymentIncidentListQueryDto,
  ResolvePaymentIncidentRequestDto,
} from '@dine/contracts';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhooks/razorpay')
  @ApiOperation({
    summary: 'Razorpay webhook inbox endpoint',
    description: 'Ingests verified raw gateway webhook events and deduplicates receipt.',
  })
  @ApiResponse({ status: 200, description: 'Webhook event received and acknowledged' })
  @ApiResponse({ status: 401, description: 'Missing or invalid webhook signature' })
  async handleWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: Request,
    @Body() body: any
  ) {
    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }
    const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(body));
    return this.paymentsService.processWebhook(rawBody, signature, body);
  }

  @Post('orders')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or reuse Razorpay test-mode payment order',
    description:
      'Creates or reuses a server-owned payment order for an active deposit-required booking hold. Network calls execute outside database row locks with idempotent replay safety.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Unique client-generated idempotency key',
  })
  @ApiResponse({ status: 201, description: 'Payment order created or reused successfully' })
  @ApiResponse({ status: 400, description: 'Validation error: hold_id is required or free reservation' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot create order for another user hold' })
  @ApiResponse({ status: 409, description: 'Booking already confirmed or idempotency conflict' })
  @ApiResponse({ status: 410, description: 'Hold expired on server clock' })
  async createPaymentOrder(
    @CurrentUser('userId') userId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreatePaymentOrderRequestDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const targetId = dto.hold_id || dto.booking_id;
    if (!targetId) {
      throw new BadRequestException('hold_id or booking_id is required');
    }

    const requestId = (req.headers['x-request-id'] as string) || undefined;
    const { result, isReplay } = await this.paymentsService.createPaymentOrder(
      userId,
      targetId,
      idempotencyKey,
      { requestId }
    );

    if (isReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }
    return res.status(HttpStatus.CREATED).json(result);
  }

  @Get(':id/status')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get payment status and review metadata',
    description: 'Returns canonical payment attempt status, review window, reconciliation metadata, and associated refunds.',
  })
  @ApiParam({ name: 'id', description: 'Payment attempt UUID' })
  @ApiResponse({ status: 200, description: 'Payment status retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller does not own this payment or hold appropriate staff role' })
  @ApiResponse({ status: 404, description: 'Payment attempt not found' })
  async getPaymentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') paymentAttemptId: string
  ) {
    const isStaffOrSupport = user.role === 'OWNER' || user.role === 'MANAGER' || user.role === 'ADMIN';
    return this.paymentsService.getPaymentStatus(user.userId, paymentAttemptId, isStaffOrSupport);
  }

  @Post(':id/reconcile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger payment reconciliation check',
    description: 'Executes out-of-lock gateway status lookup followed by an atomic commit transaction to confirm booking or safely release allocation.',
  })
  @ApiParam({ name: 'id', description: 'Payment attempt UUID' })
  @ApiResponse({ status: 200, description: 'Reconciliation executed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Payment attempt not found' })
  async reconcilePayment(
    @Param('id') paymentAttemptId: string,
    @Body() options?: ReconcilePaymentRequestDto
  ) {
    return this.paymentsService.reconcilePayment(paymentAttemptId, options);
  }

  @Post(':id/refund')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate idempotent refund',
    description: 'Issues an idempotent refund with replay safety, amount validation, and immutable audit logging.',
  })
  @ApiParam({ name: 'id', description: 'Payment attempt UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount_minor', 'reason', 'idempotency_key'],
      properties: {
        amount_minor: { type: 'integer', example: 50000 },
        reason: { type: 'string', example: 'Customer cancellation within free window' },
        idempotency_key: { type: 'string', example: 'rfnd_req_12345' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Refund created or idempotent replay returned' })
  @ApiResponse({ status: 400, description: 'Validation error (invalid amount or missing idempotency key)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Payment attempt not found' })
  async issueRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') paymentAttemptId: string,
    @Body() dto: CreateRefundRequestDto
  ) {
    const isStaffOrSupport = user.role === 'OWNER' || user.role === 'MANAGER' || user.role === 'ADMIN';
    return this.paymentsService.issueRefund(user.userId, paymentAttemptId, dto, isStaffOrSupport);
  }

  @Get('incidents')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List payment review and refund escalation incidents',
    description: 'Support visibility into review timeouts, late capture refund triggers, and gateway errors.',
  })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by incident status (OPEN, INVESTIGATING, RESOLVED, DISMISSED)' })
  @ApiQuery({ name: 'severity', required: false, description: 'Filter by severity (LOW, MEDIUM, HIGH, CRITICAL)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Payment incidents retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listIncidents(
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.paymentsService.listIncidents({ status, severity, limit, offset });
  }

  @Get('incidents/:id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get payment incident details',
    description: 'Retrieves an individual payment incident record with audit context.',
  })
  @ApiParam({ name: 'id', description: 'Payment incident UUID' })
  @ApiResponse({ status: 200, description: 'Payment incident retrieved' })
  @ApiResponse({ status: 404, description: 'Payment incident not found' })
  async getIncident(@Param('id') incidentId: string) {
    return this.paymentsService.getIncidentById(incidentId);
  }

  @Patch('incidents/:id/resolve')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resolve payment incident',
    description: 'Allows authorized staff or support to resolve or dismiss a payment escalation incident.',
  })
  @ApiParam({ name: 'id', description: 'Payment incident UUID' })
  @ApiResponse({ status: 200, description: 'Incident resolved successfully' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async resolveIncident(
    @CurrentUser('userId') userId: string,
    @Param('id') incidentId: string,
    @Body() dto: ResolvePaymentIncidentRequestDto
  ) {
    return this.paymentsService.resolveIncident(userId, incidentId, dto);
  }
}
