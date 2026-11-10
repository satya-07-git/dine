import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Headers,
  Req,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import { ReservationsService } from './reservations.service';
import { PaymentsService } from '../payments/payments.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CreateHoldDto } from '../../common/dto/canonical-validation.dto';

@ApiTags('Reservations')
@Controller(['api/v1/holds', 'v1/booking-holds', 'v1/holds', 'booking-holds'])
export class BookingHoldsController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly paymentsService: PaymentsService
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create atomic booking hold with idempotency protection (POST /api/v1/holds)',
    description:
      'Acquires table row lock, rechecks eligibility and safe-expiry, and places an atomic hold protected by GiST range exclusion. Returns hold_id, status, expires_at, server_time, and deposit.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique client-generated idempotency key (UUID or unique string)',
  })
  @ApiResponse({ status: 201, description: 'Hold created successfully or idempotent replay' })
  @ApiResponse({ status: 400, description: 'Missing Idempotency-Key or invalid parameters' })
  @ApiResponse({ status: 401, description: 'Missing, invalid, or expired Bearer JWT' })
  @ApiResponse({ status: 409, description: 'Table unavailable (competing hold) or idempotency conflict' })
  async createHold(
    @CurrentUser('userId') userId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateHoldDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    const { result, isReplay } = await this.reservationsService.createHold(
      userId,
      idempotencyKey,
      dto as any,
      { requestId, ipAddress: req.ip }
    );

    if (isReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }
    return res.status(HttpStatus.CREATED).json(result);
  }

  @Post(':id/payment-order')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or reuse Razorpay test-mode payment order for hold',
    description:
      'POST /booking-holds/:id/payment-order per Blueprint §12.3 and EPIC-010. Derives amount strictly from server policy snapshot and maps attempt idempotently.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Unique client-generated idempotency key',
  })
  @ApiParam({ name: 'id', description: 'Hold UUID or Booking UUID' })
  @ApiResponse({ status: 201, description: 'Payment order created or reused successfully' })
  @ApiResponse({ status: 400, description: 'Validation error: free reservation requires no order' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot create order for another user hold' })
  @ApiResponse({ status: 409, description: 'Booking already confirmed or idempotency conflict' })
  @ApiResponse({ status: 410, description: 'Hold expired on server clock' })
  async createPaymentOrderForHold(
    @CurrentUser('userId') userId: string,
    @Param('id') holdId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    const { result, isReplay } = await this.paymentsService.createPaymentOrder(
      userId,
      holdId,
      idempotencyKey,
      { requestId }
    );

    if (isReplay) {
      res.setHeader('X-Idempotent-Replay', 'true');
    }
    return res.status(HttpStatus.CREATED).json(result);
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get booking hold details scoped by customer ownership (GET /api/v1/holds/:id)',
    description:
      'Fetches hold details. Enforces customer IDOR ownership and returns 410 HOLD_EXPIRED if the hold has elapsed.',
  })
  @ApiParam({ name: 'id', description: 'Hold UUID' })
  @ApiResponse({ status: 200, description: 'Hold details retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot access another hold' })
  @ApiResponse({ status: 404, description: 'Hold not found' })
  @ApiResponse({ status: 410, description: 'Hold expired on server clock' })
  async getHold(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.reservationsService.getHold(userId, id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel active booking hold (DELETE /api/v1/holds/:id)',
    description:
      'Cancels hold, transitions allocation out of protected status, and emits outbox/audit records.',
  })
  @ApiParam({ name: 'id', description: 'Hold UUID' })
  @ApiResponse({ status: 200, description: 'Hold cancelled successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: customer cannot cancel another hold' })
  @ApiResponse({ status: 404, description: 'Hold not found' })
  @ApiResponse({ status: 410, description: 'Hold has already expired' })
  async cancelHold(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Req() req: Request
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    return this.reservationsService.cancelHold(userId, id, { requestId });
  }
}
