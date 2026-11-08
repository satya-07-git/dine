import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
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
import { AuditSupportService } from './audit-support.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  AuditLogQueryDto,
  SupportInterventionRequestDto,
  IncidentExportRequestDto,
  PrivacyErasureRequestDto,
} from '@dine/contracts';

@ApiTags('Audit, Support & Privacy')
@Controller('support')
export class AuditSupportController {
  constructor(private readonly auditSupportService: AuditSupportService) {}

  @Get('audit-logs')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search immutable audit logs',
    description:
      'Retrieves append-only audit trail records with actor, action, diff, and request correlation. Scoped to restaurant operators for their venue, or global for platform support.',
  })
  @ApiQuery({ name: 'restaurant_id', required: false, description: 'Filter by restaurant UUID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action name' })
  @ApiQuery({ name: 'entity_type', required: false, description: 'Filter by entity type (e.g. BOOKING)' })
  @ApiQuery({ name: 'entity_id', required: false, description: 'Filter by entity UUID' })
  @ApiQuery({ name: 'actor_id', required: false, description: 'Filter by actor UUID' })
  @ApiResponse({ status: 200, description: 'Audit log records retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: foreign tenant log access rejected' })
  async getAuditLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AuditLogQueryDto
  ) {
    return this.auditSupportService.getAuditLogs(user, query);
  }

  @Get('bookings/:bookingId/trace')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get end-to-end incident trace across booking lifecycle',
    description:
      'Aggregates allocations, payment attempts, sequenced status events, notifications, and immutable audit logs for operational and support investigation.',
  })
  @ApiParam({ name: 'bookingId', description: 'Booking UUID' })
  @ApiResponse({ status: 200, description: 'Complete incident trace retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: unauthorized to inspect booking trace' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getIncidentTrace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string
  ) {
    return this.auditSupportService.getIncidentTrace(user, bookingId);
  }

  @Post('interventions')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Execute controlled platform support intervention',
    description:
      'Performs audited support correction (e.g. status correction, emergency release). Mandates explicit justification reason, captures prior state, and appends immutable audit records (AC3).',
  })
  @ApiResponse({ status: 201, description: 'Support intervention executed and audited' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: caller lacks SUPPORT privileges' })
  @ApiResponse({ status: 422, description: 'Unprocessable: audit justification reason missing' })
  async applySupportIntervention(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SupportInterventionRequestDto,
    @Req() req: any
  ) {
    const requestId = (req.headers?.['x-request-id'] as string) || undefined;
    return this.auditSupportService.applySupportIntervention(user, dto, requestId);
  }

  @Post('export/incident')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export certified sanitized incident evidence package',
    description:
      'Generates evidence package for dispute resolution with SHA-256 checksum. Automatically redacts payment secrets, customer PII, and credentials (AC4).',
  })
  @ApiResponse({ status: 201, description: 'Sanitized evidence export generated' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: export restricted to support/admins' })
  @ApiResponse({ status: 422, description: 'Unprocessable: export reason required' })
  async exportIncidentEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IncidentExportRequestDto
  ) {
    return this.auditSupportService.exportIncidentEvidence(user, dto);
  }

  @Post('privacy/erasure-request')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Process customer privacy erasure / Right-to-be-Forgotten request',
    description:
      'Enforces data-retention vs privacy decisions (POL-017 / GATE-006). Deletes non-financial engagement artifacts while preserving statutory financial/audit records via profile anonymization (AC5).',
  })
  @ApiResponse({ status: 200, description: 'Privacy erasure evaluated and executed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden: cannot erase foreign identity' })
  async processPrivacyErasure(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PrivacyErasureRequestDto
  ) {
    const targetUserId = dto.user_id || user.userId;
    return this.auditSupportService.processPrivacyErasure(user, targetUserId);
  }
}
