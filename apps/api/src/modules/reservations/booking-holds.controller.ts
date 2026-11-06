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
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CreateHoldRequestDto } from '@dine/contracts';

@ApiTags('Reservations')
@Controller(['booking-holds', 'v1/holds'])
export class BookingHoldsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create atomic booking hold with idempotency protection',
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
    @Body() dto: CreateHoldRequestDto,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const requestId = (req.headers['x-request-id'] as string) || undefined;
    const { result, isReplay } = await this.reservationsService.createHold(
      userId,
      idempotencyKey,
      dto,
      { requestId, ipAddress: req.ip }
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
    summary: 'Get booking hold details scoped by customer ownership',
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
    summary: 'Cancel active booking hold',
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
