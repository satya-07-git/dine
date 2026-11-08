import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { V2CompatibilityService } from './v2-compatibility.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  V2AcquireHoldRequestDto,
  V2FreeConfirmationRequestDto,
  V2LatePaymentReconciliationRequestDto,
  V2ConcurrencyProofRequestDto,
} from '@dine/contracts';

@ApiTags('Finalized V2 Compatibility & Claims')
@Controller('v2-compatibility')
export class V2CompatibilityController {
  constructor(private readonly service: V2CompatibilityService) {}

  @Get('source-provenance')
  @ApiOperation({
    summary: 'Get source cryptographic provenance SHA-256 hashes',
    description: 'Returns the verified SHA-256 digests for all 3 text sources and 4 architectural diagrams (Task T01).',
  })
  @ApiResponse({ status: 200, description: 'Source provenance verified' })
  getSourceProvenance() {
    return this.service.getSourceProvenance();
  }

  @Get('compatibility-map')
  @ApiOperation({
    summary: 'Get canonical REST catalog & legacy alias compatibility map',
    description: 'Returns the 23 canonical /api/v1 endpoints, single migration authority, and claim mapping (Tasks T03, T04, T08).',
  })
  @ApiResponse({ status: 200, description: 'Compatibility map retrieved' })
  getCompatibilityMap() {
    return this.service.getCompatibilityMap();
  }

  @Get('state-matrix')
  @ApiOperation({
    summary: 'Get canonical state transition matrices',
    description: 'Returns complete state machines for inventory_claims, reservation_holds, reservations, payments, and financial reconciliation (Task T32).',
  })
  @ApiResponse({ status: 200, description: 'State matrix retrieved' })
  getStateMatrix() {
    return this.service.getStateMatrix();
  }

  @Post('holds/acquire')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({
    summary: 'Acquire atomic 120s hold with decision clock & serialized expiry cleanup',
    description: 'Serializes physical table row, cleans expired claims, captures post-lock clock, enforces capacity and exclusion, and sets 120s server-derived expiry (Tasks T13, T26, T27, T31).',
  })
  @ApiResponse({ status: 201, description: 'Hold acquired successfully' })
  @ApiResponse({ status: 409, description: 'Table unavailable conflict' })
  acquireHold(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: V2AcquireHoldRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.acquireHold(dto, user?.userId || 'default_user', idempotencyKey);
  }

  @Post('reservations/confirm-free')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm FREE reservation repeat-safely',
    description: 'Atomically transitions hold ACTIVE -> CONSUMED and claim HELD -> RESERVED, prevents DEPOSIT bypass, and issues unique booking reference (Tasks T33, T34).',
  })
  @ApiResponse({ status: 201, description: 'Reservation confirmed' })
  @ApiResponse({ status: 422, description: 'Deposit bypass attempted' })
  confirmFreeReservation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: V2FreeConfirmationRequestDto,
  ) {
    return this.service.confirmFreeReservation(dto, user?.userId || 'default_user');
  }

  @Post('payments/reconcile-late')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Execute financial reconciliation for late payment capture',
    description: 'Preserves Customer B allocation and automatically dispatches refund for Customer A without reclaiming inventory (Tasks T37, T38, T39).',
  })
  @ApiResponse({ status: 200, description: 'Reconciliation outcome resolved' })
  reconcileLatePayment(@Body() dto: V2LatePaymentReconciliationRequestDto) {
    return this.service.reconcileLatePayment(dto);
  }

  @Post('concurrency/prove-exclusion')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Prove 100-client same-table concurrency exclusion',
    description: 'Simulates 100 simultaneous requests for same table and interval, yielding exactly 1 winner and 99 conflicts (C-001, Tasks T31, T43).',
  })
  @ApiResponse({ status: 200, description: 'Concurrency proof evaluated' })
  proveConcurrency(@Body() dto: V2ConcurrencyProofRequestDto) {
    return this.service.runConcurrencyProof(dto);
  }
}
