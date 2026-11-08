import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/db/database.service';
import { AuthenticatedUser } from '../../common/auth/current-user.decorator';
import {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  InvalidStateTransitionError,
} from '../../common/errors/app-error';
import {
  ErrorCode,
  SupportInterventionType,
  PrivacyErasureStatus,
  AuditEnvelopeDto,
  AuditLogEntryDto,
  AuditLogQueryDto,
  AuditLogListResponseDto,
  SupportInterventionRequestDto,
  SupportInterventionResponseDto,
  SupportIncidentTraceDto,
  IncidentExportRequestDto,
  IncidentExportResponseDto,
  PrivacyErasureResponseDto,
} from '@dine/contracts';
import { recordAuditLog, redactSensitiveData, maskEmail, maskPhone } from './audit.helper';

@Injectable()
export class AuditSupportService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Transactional audit logging helper.
   */
  async recordAudit(client: any, envelope: AuditEnvelopeDto): Promise<string> {
    return recordAuditLog(client, envelope);
  }

  /**
   * Filtered least-privilege audit query.
   * Restricts restaurant operators to their owned venues; support/admins can query across tenants.
   */
  async getAuditLogs(
    user: AuthenticatedUser,
    query: AuditLogQueryDto
  ): Promise<AuditLogListResponseDto> {
    const isSupportOrAdmin =
      user.role === 'SUPPORT' ||
      user.role === 'PLATFORM_ADMIN' ||
      user.role === 'SUPER_ADMIN';

    // Tenant authorization check
    if (!isSupportOrAdmin) {
      if (!query.restaurant_id) {
        throw new ForbiddenError(
          'Tenant scoping required: restaurant operators cannot query platform-wide audit logs',
          ErrorCode.SUPPORT_ACCESS_FORBIDDEN
        );
      }

      const hasMembership = user.memberships?.some(
        (m) =>
          m.restaurantId === query.restaurant_id &&
          (m.role === 'OWNER' || m.role === 'MANAGER') &&
          m.status === 'ACTIVE'
      );

      if (!hasMembership) {
        // Authoritative database check
        const pool = this.db.getPool();
        const memRes = await pool.query(
          `SELECT role, status FROM restaurant_memberships 
           WHERE restaurant_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
          [query.restaurant_id, user.userId]
        );
        if (
          memRes.rows.length === 0 ||
          !['OWNER', 'MANAGER'].includes(memRes.rows[0].role)
        ) {
          throw new ForbiddenError(
            'Foreign tenant audit log access forbidden',
            ErrorCode.SUPPORT_ACCESS_FORBIDDEN
          );
        }
      }
    }

    const pool = this.db.getPool();
    const whereClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (query.restaurant_id) {
      whereClauses.push(`restaurant_id = $${idx++}`);
      values.push(query.restaurant_id);
    }
    if (query.action) {
      whereClauses.push(`action = $${idx++}`);
      values.push(query.action);
    }
    if (query.entity_type) {
      whereClauses.push(`entity_type = $${idx++}`);
      values.push(query.entity_type);
    }
    if (query.entity_id) {
      whereClauses.push(`entity_id = $${idx++}`);
      values.push(query.entity_id);
    }
    if (query.actor_id) {
      whereClauses.push(`actor_id = $${idx++}`);
      values.push(query.actor_id);
    }
    if (query.request_id) {
      whereClauses.push(`request_id = $${idx++}`);
      values.push(query.request_id);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${whereSql}`,
      values
    );
    const total = countRes.rows[0]?.total || 0;

    const listRes = await pool.query(
      `SELECT id, actor_id, actor_role, restaurant_id, action, entity_type, entity_id, diff, reason, request_id, ip_address, metadata, created_at
       FROM audit_logs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    const items: AuditLogEntryDto[] = listRes.rows.map((r: any) => ({
      id: r.id,
      actor_id: r.actor_id,
      actor_role: r.actor_role,
      restaurant_id: r.restaurant_id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      reason: r.reason,
      diff: r.diff,
      request_id: r.request_id,
      ip_address: r.ip_address,
      metadata: r.metadata,
      created_at:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : String(r.created_at),
    }));

    return { total, limit, offset, items };
  }

  /**
   * Retrieves aggregated lifecycle incident trace across booking, allocations,
   * payment attempts, status transitions, notifications, and immutable audit logs.
   */
  async getIncidentTrace(
    user: AuthenticatedUser,
    bookingId: string
  ): Promise<SupportIncidentTraceDto> {
    const pool = this.db.getPool();

    // 1. Fetch booking record
    const bookingRes = await pool.query(
      `SELECT id, user_id, restaurant_id, party_size, requested_start, dining_period, status, created_at, updated_at
       FROM bookings WHERE id = $1`,
      [bookingId]
    );

    if (bookingRes.rows.length === 0) {
      throw new NotFoundError(
        `Incident trace not found for booking ${bookingId}`,
        ErrorCode.SUPPORT_TRACE_NOT_FOUND
      );
    }

    const booking = bookingRes.rows[0];

    // 2. Authorization check
    const isSupportOrAdmin =
      user.role === 'SUPPORT' ||
      user.role === 'PLATFORM_ADMIN' ||
      user.role === 'SUPER_ADMIN';

    if (!isSupportOrAdmin) {
      const isCustomer = user.userId === booking.user_id;
      const isStaff = user.memberships?.some(
        (m) =>
          m.restaurantId === booking.restaurant_id &&
          ['OWNER', 'MANAGER', 'HOST'].includes(m.role) &&
          m.status === 'ACTIVE'
      );

      if (!isCustomer && !isStaff) {
        // Query membership table as fallback
        const memRes = await pool.query(
          `SELECT role FROM restaurant_memberships 
           WHERE restaurant_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
          [booking.restaurant_id, user.userId]
        );
        if (memRes.rows.length === 0) {
          throw new ForbiddenError(
            'Forbidden: Unauthorized to inspect incident trace for this booking',
            ErrorCode.SUPPORT_ACCESS_FORBIDDEN
          );
        }
      }
    }

    // 3. Fetch allocations
    const allocRes = await pool.query(
      `SELECT id, table_id, status, dining_period FROM table_allocations WHERE booking_id = $1`,
      [bookingId]
    );

    // 4. Fetch sequenced status events
    const statusRes = await pool.query(
      `SELECT id, from_status, to_status, actor_id, actor_role, reason, sequence_number, created_at
       FROM booking_status_events WHERE booking_id = $1 ORDER BY sequence_number ASC`,
      [bookingId]
    );

    // 5. Fetch payment attempts
    const payRes = await pool.query(
      `SELECT id, status, amount_minor, currency, reconciliation_status, gateway_order_id, created_at
       FROM payment_attempts WHERE booking_id = $1 ORDER BY created_at ASC`,
      [bookingId]
    );

    // 6. Fetch refunds
    const refRes = await pool.query(
      `SELECT id, amount_minor, status, escalation_reason, created_at
       FROM refunds WHERE booking_id = $1 ORDER BY created_at ASC`,
      [bookingId]
    );

    // 7. Fetch notifications
    const notifRes = await pool.query(
      `SELECT n.id, n.channel, n.status, n.created_at
       FROM notification_deliveries n
       JOIN outbox_events o ON n.outbox_event_id = o.id
       WHERE o.aggregate_id = $1 OR o.payload->>'booking_id' = $1`,
      [bookingId]
    );

    // 8. Fetch audit logs
    const auditRes = await pool.query(
      `SELECT id, actor_id, actor_role, restaurant_id, action, entity_type, entity_id, diff, reason, request_id, ip_address, metadata, created_at
       FROM audit_logs
       WHERE entity_id = $1 OR metadata->>'booking_id' = $1
       ORDER BY created_at ASC`,
      [bookingId]
    );

    // 9. Fetch support interventions
    const intervRes = await pool.query(
      `SELECT id, ticket_id, actor_id, actor_role, restaurant_id, booking_id, intervention_type, reason, prior_state, new_state, request_id, created_at
       FROM support_interventions WHERE booking_id = $1 ORDER BY created_at ASC`,
      [bookingId]
    );

    return {
      booking_id: booking.id,
      restaurant_id: booking.restaurant_id,
      customer_id: booking.user_id,
      status: booking.status,
      dining_period: booking.dining_period,
      allocations: allocRes.rows.map((a: any) => ({
        id: a.id,
        table_id: a.table_id,
        status: a.status,
        dining_period: String(a.dining_period),
      })),
      status_events: statusRes.rows.map((s: any) => ({
        id: s.id,
        from_status: s.from_status,
        to_status: s.to_status,
        actor_id: s.actor_id,
        actor_role: s.actor_role,
        reason: s.reason,
        sequence_number: s.sequence_number,
        created_at:
          s.created_at instanceof Date
            ? s.created_at.toISOString()
            : String(s.created_at),
      })),
      payment_attempts: payRes.rows.map((p: any) => ({
        id: p.id,
        status: p.status,
        amount_minor: p.amount_minor,
        currency: p.currency,
        reconciliation_status: p.reconciliation_status,
        gateway_order_id: p.gateway_order_id,
        created_at:
          p.created_at instanceof Date
            ? p.created_at.toISOString()
            : String(p.created_at),
      })),
      refunds: refRes.rows.map((r: any) => ({
        id: r.id,
        amount_minor: r.amount_minor,
        status: r.status,
        reason: r.escalation_reason,
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
      })),
      notifications: notifRes.rows.map((n: any) => ({
        id: n.id,
        channel: n.channel,
        status: n.status,
        created_at:
          n.created_at instanceof Date
            ? n.created_at.toISOString()
            : String(n.created_at),
      })),
      audit_logs: auditRes.rows.map((a: any) => ({
        id: a.id,
        actor_id: a.actor_id,
        actor_role: a.actor_role,
        restaurant_id: a.restaurant_id,
        action: a.action,
        entity_type: a.entity_type,
        entity_id: a.entity_id,
        reason: a.reason,
        diff: a.diff,
        request_id: a.request_id,
        ip_address: a.ip_address,
        metadata: a.metadata,
        created_at:
          a.created_at instanceof Date
            ? a.created_at.toISOString()
            : String(a.created_at),
      })),
      interventions: intervRes.rows.map((i: any) => ({
        id: i.id,
        ticket_id: i.ticket_id,
        actor_id: i.actor_id,
        actor_role: i.actor_role,
        restaurant_id: i.restaurant_id,
        booking_id: i.booking_id,
        intervention_type: i.intervention_type,
        reason: i.reason,
        prior_state: i.prior_state,
        new_state: i.new_state,
        request_id: i.request_id,
        created_at:
          i.created_at instanceof Date
            ? i.created_at.toISOString()
            : String(i.created_at),
        message: `Support intervention applied: ${i.intervention_type}`,
      })),
    };
  }

  /**
   * Applies controlled support intervention with immutable prior state snapshot,
   * non-rewriting audit trail, and mandatory justification reason (AC3).
   */
  async applySupportIntervention(
    user: AuthenticatedUser,
    dto: SupportInterventionRequestDto,
    requestId?: string
  ): Promise<SupportInterventionResponseDto> {
    // 1. Role validation: Caller must be SUPPORT or PLATFORM_ADMIN
    const isSupportOrAdmin =
      user.role === 'SUPPORT' ||
      user.role === 'PLATFORM_ADMIN' ||
      user.role === 'SUPER_ADMIN';

    if (!isSupportOrAdmin) {
      throw new ForbiddenError(
        'Privileged action denied: caller lacks SUPPORT or PLATFORM_ADMIN privileges',
        ErrorCode.SUPPORT_ACCESS_FORBIDDEN
      );
    }

    // 2. Reason requirement validation (AC3 / POL-015)
    if (!dto.reason || typeof dto.reason !== 'string' || dto.reason.trim().length === 0) {
      throw new AppError(
        'Audit justification required: platform support interventions must specify an explicit reason',
        422,
        ErrorCode.AUDIT_REASON_REQUIRED
      );
    }

    const pool = this.db.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let priorState: Record<string, any> = {};
      let newState: Record<string, any> = {};
      let restaurantId = dto.restaurant_id || null;

      // 3. If target is booking, lock row, snapshot prior state and execute intervention
      if (dto.booking_id) {
        const bRes = await client.query(
          `SELECT id, restaurant_id, user_id, status, party_size, requested_start, dining_period, version
           FROM bookings WHERE id = $1 FOR UPDATE`,
          [dto.booking_id]
        );

        if (bRes.rows.length === 0) {
          throw new NotFoundError(
            `Target booking ${dto.booking_id} not found`,
            ErrorCode.SUPPORT_TRACE_NOT_FOUND
          );
        }

        const b = bRes.rows[0];
        priorState = {
          status: b.status,
          party_size: b.party_size,
          requested_start: b.requested_start,
          version: b.version,
        };
        restaurantId = b.restaurant_id;

        // Perform specific intervention
        if (dto.intervention_type === SupportInterventionType.MANUAL_STATUS_CORRECTION && dto.override_status) {
          const nextVersion = (b.version || 1) + 1;
          await client.query(
            `UPDATE bookings SET status = $1, version = $2, updated_at = NOW() WHERE id = $3`,
            [dto.override_status, nextVersion, b.id]
          );

          // Append to booking_status_events to keep sequence unbroken without rewriting history
          const seqRes = await client.query(
            `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq FROM booking_status_events WHERE booking_id = $1`,
            [b.id]
          );
          const nextSeq = seqRes.rows[0]?.next_seq || 1;

          await client.query(
            `INSERT INTO booking_status_events (
              id, booking_id, from_status, to_status, actor_id, actor_role, reason, sequence_number, request_id
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
            )`,
            [
              b.id,
              b.status,
              dto.override_status,
              user.userId,
              'SUPPORT',
              `[SUPPORT_INTERVENTION] ${dto.reason.trim()}`,
              nextSeq,
              requestId || null,
            ]
          );

          newState = {
            status: dto.override_status,
            party_size: b.party_size,
            requested_start: b.requested_start,
            version: nextVersion,
          };
        } else {
          newState = {
            ...priorState,
            intervened: true,
            intervention_type: dto.intervention_type,
            notes: dto.notes || null,
          };
        }
      } else {
        priorState = { status: 'INITIAL' };
        newState = { status: 'APPLIED', notes: dto.notes || null };
      }

      // 4. Record support intervention
      const intervRes = await client.query(
        `INSERT INTO support_interventions (
          ticket_id, actor_id, actor_role, restaurant_id, booking_id, intervention_type, reason, prior_state, new_state, request_id, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) RETURNING id, created_at`,
        [
          dto.ticket_id || null,
          user.userId,
          user.role || 'SUPPORT',
          restaurantId,
          dto.booking_id || null,
          dto.intervention_type,
          dto.reason.trim(),
          JSON.stringify(priorState),
          JSON.stringify(newState),
          requestId || null,
          JSON.stringify({ notes: dto.notes || null }),
        ]
      );

      const interventionId = intervRes.rows[0]?.id;
      const createdAt = intervRes.rows[0]?.created_at;

      // 5. Emit corresponding audit log record in same atomic transaction (AC1)
      await recordAuditLog(client, {
        actor_id: user.userId,
        actor_role: user.role || 'SUPPORT',
        restaurant_id: restaurantId,
        action: `SUPPORT_INTERVENTION_${dto.intervention_type}`,
        entity_type: dto.booking_id ? 'BOOKING' : 'RESTAURANT',
        entity_id: dto.booking_id || restaurantId || interventionId,
        reason: dto.reason.trim(),
        diff: {
          prior_state: priorState,
          new_state: newState,
          ticket_id: dto.ticket_id || null,
        },
        request_id: requestId || null,
      });

      await client.query('COMMIT');

      return {
        id: interventionId,
        ticket_id: dto.ticket_id || null,
        actor_id: user.userId,
        actor_role: user.role || 'SUPPORT',
        restaurant_id: restaurantId,
        booking_id: dto.booking_id || null,
        intervention_type: dto.intervention_type,
        reason: dto.reason.trim(),
        prior_state: priorState,
        new_state: newState,
        request_id: requestId || null,
        created_at:
          createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
        message: `Support intervention ${dto.intervention_type} executed successfully with verified audit evidence`,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Sanitized incident evidence export for legal/dispute investigations (T05 & AC4).
   * Automatically strips payment gateway credentials, CVVs, passwords, and private secrets.
   */
  async exportIncidentEvidence(
    user: AuthenticatedUser,
    dto: IncidentExportRequestDto
  ): Promise<IncidentExportResponseDto> {
    const isSupportOrAdmin =
      user.role === 'SUPPORT' ||
      user.role === 'PLATFORM_ADMIN' ||
      user.role === 'SUPER_ADMIN';

    if (!isSupportOrAdmin) {
      throw new ForbiddenError(
        'Export denied: only platform support and administrators can generate certified incident evidence exports',
        ErrorCode.INCIDENT_EXPORT_DENIED
      );
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new AppError(
        'Export reason required for audit evidence tracking',
        422,
        ErrorCode.AUDIT_REASON_REQUIRED
      );
    }

    const rawTrace = await this.getIncidentTrace(user, dto.booking_id);

    // Deeply redact sensitive secrets
    const redactedTrace = redactSensitiveData(rawTrace);

    // Mask customer PII
    if (redactedTrace.customer_id) {
      redactedTrace.customer_id = `user_${redactedTrace.customer_id.slice(0, 8)}...`;
    }

    const payloadString = JSON.stringify(redactedTrace);
    const checksum = crypto.createHash('sha256').update(payloadString).digest('hex');
    const exportId = crypto.randomUUID();

    // Log the export action itself to audit_logs
    const pool = this.db.getPool();
    await recordAuditLog(pool, {
      actor_id: user.userId,
      actor_role: user.role || 'SUPPORT',
      restaurant_id: rawTrace.restaurant_id,
      action: 'EXPORT_INCIDENT_EVIDENCE',
      entity_type: 'BOOKING_INCIDENT',
      entity_id: dto.booking_id,
      reason: dto.reason.trim(),
      diff: {
        export_id: exportId,
        checksum_sha256: checksum,
        ticket_id: dto.ticket_id || null,
      },
    });

    return {
      export_id: exportId,
      booking_id: dto.booking_id,
      exported_at: new Date().toISOString(),
      exported_by: user.userId,
      reason: dto.reason.trim(),
      ticket_id: dto.ticket_id || null,
      redacted_evidence: redactedTrace,
      checksum_sha256: checksum,
    };
  }

  /**
   * Handles customer privacy erasure / Right-to-be-Forgotten requests (T04, AC5).
   * Resolves the conflict between privacy deletion and statutory financial retention (POL-017 / GATE-006)
   * by anonymizing customer profile while retaining immutable booking, financial, and audit references.
   */
  async processPrivacyErasure(
    user: AuthenticatedUser,
    targetUserId: string
  ): Promise<PrivacyErasureResponseDto> {
    const isSelf = user.userId === targetUserId;
    const isSupportOrAdmin =
      user.role === 'SUPPORT' ||
      user.role === 'PLATFORM_ADMIN' ||
      user.role === 'SUPER_ADMIN';

    if (!isSelf && !isSupportOrAdmin) {
      throw new ForbiddenError(
        'Privacy erasure forbidden: cannot request deletion of foreign customer identity',
        ErrorCode.FORBIDDEN
      );
    }

    const pool = this.db.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Check for statutory financial and booking records
      const bookingCheck = await client.query(
        `SELECT COUNT(*)::int AS count FROM bookings WHERE user_id = $1`,
        [targetUserId]
      );
      const financialCount = bookingCheck.rows[0]?.count || 0;

      const auditCheck = await client.query(
        `SELECT COUNT(*)::int AS count FROM audit_logs WHERE actor_id = $1`,
        [targetUserId]
      );
      const auditCount = auditCheck.rows[0]?.count || 0;

      const requestId = crypto.randomUUID();
      let status: PrivacyErasureStatus;

      // 2. Delete non-financial engagement artifacts (favorites, preferences)
      await client.query(`DELETE FROM favorites WHERE user_id = $1`, [targetUserId]);
      await client.query(`DELETE FROM customer_preferences WHERE user_id = $1`, [targetUserId]);

      if (financialCount > 0) {
        // POL-017 / GATE-006: Statutory financial records exist.
        // DO NOT execute cascading delete on bookings/payments/audit.
        // Anonymize personal identifiers on profile instead.
        status = PrivacyErasureStatus.ANONYMIZED_WITH_RETAINED_EVIDENCE;

        const anonymizedName = 'Anonymized Customer';
        const anonymizedEmail = `anonymized_${targetUserId.slice(0, 8)}@deleted.dine.local`;

        await client.query(
          `UPDATE profiles 
           SET full_name = $1, email = $2, phone = NULL, avatar_url = NULL, updated_at = NOW()
           WHERE id = $3`,
          [anonymizedName, anonymizedEmail, targetUserId]
        );

        await client.query(
          `INSERT INTO privacy_erasure_requests (
            id, user_id, status, has_financial_records, retained_records_summary, anonymized_at
          ) VALUES (
            $1, $2, $3, true, $4, NOW()
          )`,
          [
            requestId,
            targetUserId,
            status,
            JSON.stringify({
              bookings_retained: financialCount,
              audit_logs_retained: auditCount,
              retention_justification: 'POL-017 Statutory financial and tax audit preservation',
            }),
          ]
        );
      } else {
        // No financial records: can complete full profile deletion
        status = PrivacyErasureStatus.COMPLETED;
        await client.query(`DELETE FROM profiles WHERE id = $1`, [targetUserId]);

        await client.query(
          `INSERT INTO privacy_erasure_requests (
            id, user_id, status, has_financial_records, retained_records_summary
          ) VALUES (
            $1, $2, $3, false, '{}'::jsonb
          )`,
          [requestId, targetUserId, status]
        );
      }

      await client.query('COMMIT');

      return {
        request_id: requestId,
        user_id: targetUserId,
        status,
        has_financial_records: financialCount > 0,
        profile_anonymized: financialCount > 0,
        preferences_deleted: true,
        favorites_deleted: true,
        financial_records_retained_count: financialCount,
        audit_evidence_retained_count: auditCount,
        message:
          financialCount > 0
            ? 'Personal profile and preferences anonymized; statutory financial and audit records retained under POL-017'
            : 'Personal profile, preferences, and engagement data completely removed',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
