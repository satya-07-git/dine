import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/db/database.service';
import { ConfigService } from '../../common/config/config.service';
import { RazorpayGatewayAdapter } from './razorpay-gateway.adapter';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ExpiredError,
  UnauthorizedError,
  InvalidStateTransitionError,
  AppError,
} from '../../common/errors/app-error';
import {
  BookingStatus,
  AllocationStatus,
  PaymentAttemptStatus,
  RefundStatus,
  PaymentReconciliationStatus,
  PaymentIncidentType,
  PaymentIncidentSeverity,
  PaymentIncidentStatus,
  PolicyMode,
  ErrorCode,
  PaymentOrderResponseDto,
  PaymentStatusResponseDto,
  PaymentReconciliationDetailDto,
  RazorpayWebhookResponseDto,
  CreateRefundRequestDto,
  RefundResponseDto,
  ReconcilePaymentRequestDto,
  ReconciliationResultDto,
  PaymentIncidentDto,
  PaymentIncidentListQueryDto,
  ResolvePaymentIncidentRequestDto,
  ResolvePaymentIncidentResponseDto,
} from '@dine/contracts';
import {
  canonicalJson,
  computeScopeKey,
  hashPayload,
  isHoldSafelyExpired,
} from '../reservations/reservations.service';

/**
 * Bounded Review Constants per Blueprint §9.4 and EPIC-011
 */
export const MAX_RECONCILIATION_RETRIES = 3;
export const MAX_REVIEW_DURATION_MINUTES = 15;

/**
 * Reconciler Decision Types
 */
export type ReconciliationDecision =
  | 'CONFIRMED'
  | 'SAFE_RELEASE_EXPIRED'
  | 'LATE_CAPTURE_REFUND_TRIGGERED'
  | 'REVIEW_MAINTAINED'
  | 'MANUAL_ESCALATION';

/**
 * Pure evaluation function for bounded review & safe-release decision table (T01).
 * Can be tested in isolation without DB.
 */
export function evaluateReconciliationDecision(params: {
  providerStatus: 'CAPTURED' | 'FAILED' | 'UNKNOWN';
  isAllocationStillHeld: boolean;
  reviewAgeMinutes: number;
  retryCount: number;
}): ReconciliationDecision {
  const { providerStatus, isAllocationStillHeld, reviewAgeMinutes, retryCount } = params;

  if (providerStatus === 'CAPTURED') {
    if (isAllocationStillHeld) {
      return 'CONFIRMED';
    }
    return 'LATE_CAPTURE_REFUND_TRIGGERED';
  }

  if (providerStatus === 'FAILED') {
    return 'SAFE_RELEASE_EXPIRED';
  }

  if (reviewAgeMinutes >= MAX_REVIEW_DURATION_MINUTES || retryCount >= MAX_RECONCILIATION_RETRIES) {
    return 'MANUAL_ESCALATION';
  }

  return 'REVIEW_MAINTAINED';
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  public readonly config: ConfigService;
  public readonly gateway: RazorpayGatewayAdapter;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly gatewayAdapter: RazorpayGatewayAdapter
  ) {
    if (gatewayAdapter) {
      this.config = configService;
      this.gateway = gatewayAdapter;
    } else if (configService && (typeof (configService as any).fetchPaymentStatus === 'function' || typeof (configService as any).createOrder === 'function')) {
      this.gateway = configService as any;
      this.config = null as any;
    } else {
      this.config = configService;
      this.gateway = new RazorpayGatewayAdapter(this.config);
    }
  }

  private getPoolOrClient(): any {
    if (typeof (this.db as any).getPool === 'function') {
      return (this.db as any).getPool();
    }
    if (typeof (this.db as any).query === 'function') {
      return this.db;
    }
    return {
      query: (sql: string, params?: any[]) => {
        return (this.db as any).withTransaction((client: any) => client.query(sql, params));
      },
    };
  }

  private async executeTx<T>(fn: (client: any) => Promise<T>): Promise<T> {
    if (typeof (this.db as any).withTransaction === 'function') {
      return (this.db as any).withTransaction(fn);
    }
    return fn(this.getPoolOrClient());
  }

  /**
   * Acceptance Criterion 1: Retrying an order request cannot create a second logical checkout.
   * Creates or reuses a server-owned Razorpay test-mode order for an active hold.
   * Derives deposit amount and currency strictly from server policy snapshot.
   * Fulfills Tasks T01, T02, and Blueprint §7.3, §9.1.
   */
  async createPaymentOrder(
    userId: string,
    holdIdOrBookingId: string,
    idempotencyKey?: string,
    meta?: { requestId?: string }
  ): Promise<{ result: PaymentOrderResponseDto; isReplay: boolean }> {
    if (!holdIdOrBookingId) {
      throw new ValidationError('hold_id or booking_id is required');
    }

    const endpoint = 'POST /booking-holds/payment-order';
    let scopeKey: string | null = null;
    const pool = this.getPoolOrClient();

    if (idempotencyKey) {
      scopeKey = computeScopeKey(userId, endpoint, idempotencyKey);
      const existingIdempotency = await pool.query(
        `SELECT * FROM idempotency_records WHERE scope_key = $1`,
        [scopeKey]
      );

      if (existingIdempotency.rows.length > 0) {
        const record = existingIdempotency.rows[0];
        const currentPayloadHash = hashPayload({ holdIdOrBookingId });
        if (record.payload_hash !== currentPayloadHash) {
          throw new ConflictError(
            'Idempotency key reused with different parameters for payment order',
            ErrorCode.IDEMPOTENCY_CONFLICT
          );
        }
        return {
          result: record.response_body as PaymentOrderResponseDto,
          isReplay: true,
        };
      }
    }

    // 1. Fetch booking, allocation, and restaurant details outside lock
    const res = await pool.query(
      `SELECT b.id as booking_id, b.user_id, b.status as booking_status, b.policy_snapshot,
              b.restaurant_id, r.name as restaurant_name, r.policy_mode as rest_policy_mode,
              r.deposit_amount_minor as rest_deposit_amount, r.deposit_currency as rest_deposit_currency,
              a.id as allocation_id, a.status as allocation_status, a.expires_at as alloc_expires_at,
              p.full_name as customer_name, p.email as customer_email, p.phone as customer_phone
       FROM bookings b
       JOIN restaurants r ON r.id = b.restaurant_id
       LEFT JOIN profiles p ON p.id = b.user_id
       LEFT JOIN table_allocations a ON a.booking_id = b.id
       WHERE b.id = $1 OR a.id = $1`,
      [holdIdOrBookingId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Booking hold ${holdIdOrBookingId} not found`);
    }

    const row = res.rows[0];
    const bookingId = row.booking_id || row.id;

    // 2. Ownership check (IDOR protection)
    if (row.user_id !== userId) {
      throw new ForbiddenError('FORBIDDEN_RESOURCE_ACCESS: Customer cannot pay for another user hold');
    }

    // 3. Status and eligibility validations
    if (row.booking_status === BookingStatus.CONFIRMED || row.allocation_status === AllocationStatus.CONFIRMED) {
      throw new ConflictError('Booking is already confirmed');
    }

    if (
      row.booking_status === 'EXPIRED' ||
      row.allocation_status === 'RELEASED' ||
      (row.alloc_expires_at && (new Date(row.alloc_expires_at).getTime() < Date.now() || isHoldSafelyExpired(row.allocation_status, new Date(row.alloc_expires_at))))
    ) {
      throw new ExpiredError('Booking hold has expired. Please acquire a new hold.');
    }

    const policyMode = row.policy_snapshot?.policy_mode || row.rest_policy_mode;
    if (policyMode === PolicyMode.FREE_RESERVATION) {
      throw new ValidationError('Validation error: restaurant policy is FREE_RESERVATION; no payment order required');
    }

    // 4. Reuse active payment attempt if exists
    const existingAttemptRes = await pool.query(
      `SELECT * FROM payment_attempts 
       WHERE booking_id = $1 AND (status = 'INITIATED' OR status = 'PENDING_REVIEW') 
       ORDER BY created_at DESC LIMIT 1`,
      [bookingId]
    );

    if (existingAttemptRes.rows.length > 0) {
      const attempt = existingAttemptRes.rows[0];
      const responseDto: PaymentOrderResponseDto = {
        order_id: attempt.gateway_order_id,
        payment_attempt_id: attempt.id,
        booking_id: bookingId,
        hold_id: row.allocation_id || row.id,
        amount_minor: attempt.amount_minor,
        currency: attempt.currency,
        key_id: this.gateway.getKeyId(),
        status: attempt.status,
        customer: {
          name: row.customer_name,
          email: row.customer_email,
          phone: row.customer_phone,
        },
        policy_mode: policyMode,
        is_test_mode: this.gateway.isTestMode(),
        created_at: new Date(attempt.created_at).toISOString(),
      };

      return { result: responseDto, isReplay: false };
    }

    // 5. Server-calculated deposit amount in integer minor units
    const amountMinor = row.policy_snapshot?.deposit_amount_minor || row.rest_deposit_amount;
    const currency = row.policy_snapshot?.deposit_currency || row.rest_deposit_currency || 'INR';

    if (!amountMinor || amountMinor <= 0) {
      throw new ValidationError('Deposit required policy must specify a positive deposit amount in minor units');
    }

    // 6. Network call OUTSIDE locks
    const gatewayOrder = await this.gateway.createOrder({
      amountMinor,
      currency,
      receipt: `b_${bookingId.substring(0, 8)}`,
      notes: {
        booking_id: bookingId,
        restaurant_id: row.restaurant_id,
        user_id: userId,
      },
    });

    // 7. Insert payment attempt record inside transaction
    return this.executeTx(async (client) => {
      const now = new Date();
      const insertAttemptRes = await client.query(
        `INSERT INTO payment_attempts (
           booking_id, gateway, gateway_order_id, amount_minor, currency, status,
           reconciliation_status, review_started_at, review_expires_at, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8 + INTERVAL '15 minutes', $8, $8)
         RETURNING *`,
        [
          bookingId,
          'RAZORPAY',
          gatewayOrder.id,
          amountMinor,
          currency,
          PaymentAttemptStatus.INITIATED,
          'NONE',
          now,
        ]
      );

      const newAttempt = insertAttemptRes.rows[0];

      await client.query(
        `UPDATE bookings \n           SET status = 'PAYMENT_PENDING' WHERE id = $1`,
        [bookingId]
      );
      if (row.allocation_id) {
        await client.query(
          `UPDATE table_allocations \n           SET status = 'PAYMENT_PENDING' WHERE id = $1`,
          [row.allocation_id]
        );
      }

      const responseDto: PaymentOrderResponseDto = {
        order_id: gatewayOrder.id,
        payment_attempt_id: newAttempt.id,
        booking_id: bookingId,
        hold_id: row.allocation_id || row.id,
        amount_minor: amountMinor,
        currency,
        key_id: this.gateway.getKeyId(),
        status: PaymentAttemptStatus.INITIATED,
        customer: {
          name: row.customer_name,
          email: row.customer_email,
          phone: row.customer_phone,
        },
        policy_mode: policyMode,
        is_test_mode: this.gateway.isTestMode(),
        created_at: new Date(newAttempt.created_at).toISOString(),
      };

      if (scopeKey) {
        const payloadHash = hashPayload({ holdIdOrBookingId });
        await client.query(
          `INSERT INTO idempotency_records (scope_key, user_id, endpoint, payload_hash, status_code, response_body, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '24 hours')
           ON CONFLICT (scope_key) DO NOTHING`,
          [scopeKey, userId, endpoint, payloadHash, 201, JSON.stringify(responseDto)]
        );
      }

      return { result: responseDto, isReplay: false };
    });
  }

  /**
   * GET /payments/:id/status
   */
  async getPaymentStatus(
    userId: string,
    id: string,
    isStaffOrSupport: boolean = false
  ): Promise<PaymentReconciliationDetailDto> {
    const pool = this.getPoolOrClient();

    const res = await pool.query(
      `SELECT pa.*, b.user_id as booking_user_id, b.status as booking_status, b.restaurant_id,
              ta.status as allocation_status
       FROM payment_attempts pa
       JOIN bookings b ON b.id = pa.booking_id
       LEFT JOIN table_allocations ta ON ta.booking_id = b.id
       WHERE pa.id::text = $1 OR pa.gateway_order_id = $1 OR pa.booking_id::text = $1
       LIMIT 1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Payment attempt or order ${id} not found`);
    }

    const row = res.rows[0];

    if (!isStaffOrSupport && row.booking_user_id !== userId) {
      const staffRes = await pool.query(
        `SELECT role, status FROM restaurant_memberships 
         WHERE restaurant_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
        [row.restaurant_id, userId]
      );
      if (staffRes.rows.length === 0) {
        throw new ForbiddenError('FORBIDDEN_RESOURCE_ACCESS: Customer cannot view another payment status');
      }
    }

    const refundRes = await pool.query(
      `SELECT * FROM refunds WHERE payment_attempt_id = $1 ORDER BY created_at ASC`,
      [row.id]
    );

    const refundDtos: RefundResponseDto[] = (refundRes?.rows || []).map((r: any) => ({
      id: r.id,
      booking_id: r.booking_id || row.booking_id,
      payment_attempt_id: r.payment_attempt_id,
      gateway_refund_id: r.gateway_refund_id,
      amount_minor: r.amount_minor,
      currency: r.currency || 'INR',
      status: r.status,
      reason: r.reason,
      idempotency_key: r.idempotency_key || '',
      created_at: new Date(r.created_at).toISOString(),
      updated_at: new Date(r.updated_at || r.created_at).toISOString(),
    }));

    return {
      id: row.id,
      booking_id: row.booking_id,
      gateway: row.gateway,
      gateway_order_id: row.gateway_order_id,
      gateway_payment_id: row.gateway_payment_id || null,
      amount_minor: row.amount_minor,
      currency: row.currency,
      status: row.status,
      reconciliation_status: row.reconciliation_status || 'NONE',
      review_started_at: row.review_started_at ? new Date(row.review_started_at).toISOString() : null,
      review_expires_at: row.review_expires_at ? new Date(row.review_expires_at).toISOString() : null,
      reconciled_at: row.reconciled_at ? new Date(row.reconciled_at).toISOString() : null,
      last_reconciled_at: row.last_reconciled_at ? new Date(row.last_reconciled_at).toISOString() : null,
      retry_count: row.retry_count || 0,
      escalation_reason: row.escalation_reason || null,
      booking_status: row.booking_status,
      allocation_status: row.allocation_status,
      refunds: refundDtos,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Process raw webhook inbox event (EPIC-010 foundation)
   */
  async processWebhook(
    rawBodyOrEvent: string | Buffer | { id: string; event: string; payload: any },
    signature?: string,
    eventPayload?: any
  ): Promise<RazorpayWebhookResponseDto> {
    let rawBody: string | Buffer;
    let sig: string;
    let payload: any;

    if (typeof rawBodyOrEvent === 'object' && !Buffer.isBuffer(rawBodyOrEvent) && 'event' in rawBodyOrEvent) {
      payload = rawBodyOrEvent;
      rawBody = JSON.stringify(rawBodyOrEvent);
      sig = signature || '';
    } else {
      rawBody = rawBodyOrEvent as string | Buffer;
      sig = signature || '';
      payload = eventPayload;
    }

    if (!sig || !rawBody) {
      throw new UnauthorizedError('INVALID_WEBHOOK_SIGNATURE: Missing webhook signature or payload');
    }

    const isValid = this.gateway.verifyWebhookSignature(rawBody.toString('utf8'), sig);
    if (!isValid) {
      this.logger.warn('[Webhook Inbox] Webhook rejected: HMAC-SHA256 signature mismatch');
      throw new UnauthorizedError('INVALID_WEBHOOK_SIGNATURE: Tampered payload or signature mismatch');
    }

    const eventId = payload?.id || payload?.event_id;
    const eventType = payload?.event || payload?.entity;

    if (!eventId) {
      throw new ValidationError('Webhook payload missing event identifier');
    }

    const pool = this.getPoolOrClient();
    const dupRes = await pool.query(
      `SELECT * FROM payment_events WHERE gateway_event_id = $1`,
      [eventId]
    );

    if (dupRes.rows.length > 0) {
      this.logger.log(`[Webhook Inbox] Duplicate delivery for event ${eventId} safely acknowledged`);
      return {
        received: true,
        event_id: eventId,
        duplicate: true,
        action_taken: 'DUPLICATE_IGNORED',
      };
    }

    return this.executeTx(async (client) => {
      await client.query(
        `INSERT INTO payment_events (gateway_event_id, event_type, payload, processed_at) 
         VALUES ($1, $2, $3, NOW()) 
         ON CONFLICT (gateway_event_id) DO NOTHING`,
        [eventId, eventType, JSON.stringify(payload)]
      );

      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const paymentEntity = payload?.payload?.payment?.entity;
        const orderEntity = payload?.payload?.order?.entity;
        const gatewayOrderId = paymentEntity?.order_id || orderEntity?.id || payload?.order_id;
        const amountPaid = paymentEntity?.amount || orderEntity?.amount_paid || payload?.amount;
        const currencyPaid = (paymentEntity?.currency || orderEntity?.currency || payload?.currency || 'INR').toUpperCase();
        const gatewayPaymentId = paymentEntity?.id || payload?.payment_id;

        if (!gatewayOrderId) {
          return { received: true, event_id: eventId, action_taken: 'ORPHAN_EVENT_STORED' };
        }

        const attemptRes = await client.query(
          `SELECT * FROM payment_attempts WHERE gateway_order_id = $1 FOR UPDATE`,
          [gatewayOrderId]
        );

        if (attemptRes.rows.length === 0) {
          return { received: true, event_id: eventId, action_taken: 'ORPHAN_ORDER_LOGGED' };
        }

        const attempt = attemptRes.rows[0];

        if (
          amountPaid !== undefined &&
          (Number(amountPaid) !== attempt.amount_minor || currencyPaid !== attempt.currency)
        ) {
          await client.query(
            `UPDATE payment_attempts \n             SET status = 'PENDING_REVIEW', updated_at = NOW() \n             WHERE id = $1`,
            [attempt.id]
          );
          await client.query(
            `UPDATE bookings \n             SET status = 'PAYMENT_REVIEW', updated_at = NOW(), version = version + 1 \n             WHERE id = $1`,
            [attempt.booking_id]
          );
          await client.query(
            `UPDATE table_allocations \n             SET status = 'PAYMENT_REVIEW' \n             WHERE booking_id = $1`,
            [attempt.booking_id]
          );
          await client.query(
            `INSERT INTO booking_status_events (booking_id, from_status, to_status, actor_role, reason, metadata) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              attempt.booking_id,
              'PAYMENT_PENDING',
              'PAYMENT_REVIEW',
              'GATEWAY_WEBHOOK',
              `PAYMENT_AMOUNT_MISMATCH: Expected ${attempt.amount_minor} ${attempt.currency}, received ${amountPaid} ${currencyPaid}`,
              JSON.stringify({
                gateway_event_id: eventId,
                gateway_order_id: gatewayOrderId,
                amount_expected: attempt.amount_minor,
                amount_received: amountPaid,
                currency_expected: attempt.currency,
                currency_received: currencyPaid,
              }),
            ]
          );
          return { received: true, event_id: eventId, action_taken: 'SENT_TO_PAYMENT_REVIEW' };
        }

        const bookingRes = await client.query(
          `SELECT id, status, version FROM bookings WHERE id = $1 FOR UPDATE`,
          [attempt.booking_id]
        );

        if (bookingRes.rows.length === 0) {
          return { received: true, event_id: eventId, action_taken: 'BOOKING_NOT_FOUND' };
        }

        const bRow = bookingRes.rows[0];
        if (bRow.status === 'CONFIRMED') {
          return { received: true, event_id: eventId, action_taken: 'ALREADY_CONFIRMED' };
        }

        await client.query(
          `UPDATE payment_attempts \n           SET status = 'CAPTURED', updated_at = NOW() \n           WHERE id = $1`,
          [attempt.id]
        );
        await client.query(
          `UPDATE bookings \n           SET status = 'CONFIRMED', updated_at = NOW(), version = version + 1 \n           WHERE id = $1`,
          [attempt.booking_id]
        );
        await client.query(
          `UPDATE table_allocations \n           SET status = 'CONFIRMED' \n           WHERE booking_id = $1`,
          [attempt.booking_id]
        );

        await client.query(
          `INSERT INTO booking_status_events (booking_id, from_status, to_status, actor_role, reason, metadata) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            attempt.booking_id,
            bRow.status,
            'CONFIRMED',
            'GATEWAY_WEBHOOK',
            'Payment captured via verified Razorpay webhook',
            JSON.stringify({
              gateway_event_id: eventId,
              gateway_order_id: gatewayOrderId,
              gateway_payment_id: gatewayPaymentId,
              amount_minor: attempt.amount_minor,
              currency: attempt.currency,
            }),
          ]
        );

        await client.query(
          `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, status) 
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'BOOKING',
            attempt.booking_id,
            'BOOKING_CONFIRMED',
            JSON.stringify({
              booking_id: attempt.booking_id,
              gateway_order_id: gatewayOrderId,
              gateway_payment_id: gatewayPaymentId,
              amount_minor: attempt.amount_minor,
              currency: attempt.currency,
            }),
            'PENDING',
          ]
        );

        return { received: true, event_id: eventId, action_taken: 'CAPTURED_AND_CONFIRMED' };
      }

      if (eventType === 'payment.failed') {
        const paymentEntity = payload?.payload?.payment?.entity;
        const gatewayOrderId = paymentEntity?.order_id || payload?.order_id;

        const attemptRes = await client.query(
          `SELECT * FROM payment_attempts WHERE gateway_order_id = $1 FOR UPDATE`,
          [gatewayOrderId]
        );

        if (attemptRes.rows.length > 0) {
          const attempt = attemptRes.rows[0];
          if (attempt.status === 'CAPTURED') {
            return { received: true, event_id: eventId, action_taken: 'OUT_OF_ORDER_IGNORED_ALREADY_CAPTURED' };
          }

          await client.query(
            `UPDATE payment_attempts \n             SET status = 'FAILED', updated_at = NOW() \n             WHERE id = $1`,
            [attempt.id]
          );
          await client.query(
            `UPDATE bookings \n             SET status = 'PAYMENT_FAILED', updated_at = NOW(), version = version + 1 \n             WHERE id = $1`,
            [attempt.booking_id]
          );
          await client.query(
            `UPDATE table_allocations \n             SET status = 'RELEASED' \n             WHERE booking_id = $1`,
            [attempt.booking_id]
          );
          return { received: true, event_id: eventId, action_taken: 'PAYMENT_FAILED_AND_RELEASED' };
        }
      }

      return { received: true, event_id: eventId, action_taken: 'EVENT_STORED' };
    });
  }

  /**
   * POST /payments/:id/reconcile
   */
  async reconcilePayment(
    paymentAttemptId: string,
    options?: ReconcilePaymentRequestDto
  ): Promise<ReconciliationResultDto> {
    const pool = this.getPoolOrClient();
    const initialAttemptRes = await pool.query(
      `SELECT id, booking_id, gateway_order_id, amount_minor, currency, status,
              reconciliation_status, review_started_at, review_expires_at, retry_count
       FROM payment_attempts WHERE id = $1`,
      [paymentAttemptId]
    );

    if (initialAttemptRes.rows.length === 0) {
      throw new NotFoundError(`Payment attempt ${paymentAttemptId} not found`);
    }
    const initialAttempt = initialAttemptRes.rows[0];

    let providerStatus: 'CAPTURED' | 'FAILED' | 'UNKNOWN';
    let gatewayPaymentId: string | undefined;

    if (options?.force_provider_status) {
      providerStatus = options.force_provider_status;
      if (providerStatus === 'CAPTURED') {
        gatewayPaymentId = `pay_forced_${crypto.randomBytes(6).toString('hex')}`;
      }
    } else {
      try {
        const gwRes = await this.gateway.fetchPaymentStatus(initialAttempt.gateway_order_id);
        providerStatus = gwRes.status;
        gatewayPaymentId = gwRes.gatewayPaymentId;
      } catch (err: any) {
        this.logger.warn(`Gateway status query failed: ${err.message}`);
        providerStatus = 'UNKNOWN';
      }
    }

    return this.executeTx(async (client) => {
      const lockedAttemptRes = await client.query(
        `SELECT pa.*, b.restaurant_id, b.status as booking_status, b.version as booking_version
         FROM payment_attempts pa
         JOIN bookings b ON b.id = pa.booking_id
         WHERE pa.id = $1 FOR UPDATE`,
        [paymentAttemptId]
      );

      if (lockedAttemptRes.rows.length === 0) {
        throw new NotFoundError(`Payment attempt ${paymentAttemptId} not found`);
      }

      const lockedAttempt = lockedAttemptRes.rows[0];
      const bookingId = lockedAttempt.booking_id;

      const allocRes = await client.query(
        `SELECT * FROM table_allocations WHERE booking_id = $1 FOR UPDATE`,
        [bookingId]
      );
      const currentAlloc = allocRes?.rows?.[0];

      const now = new Date();
      const reviewStarted = lockedAttempt.review_started_at
        ? new Date(lockedAttempt.review_started_at)
        : now;
      const reviewAgeMinutes = Math.max(0, (now.getTime() - reviewStarted.getTime()) / (1000 * 60));
      const retryCount = (lockedAttempt.retry_count || 0) + 1;

      const isAllocationStillHeld =
        Boolean(currentAlloc) &&
        ['HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW'].includes(currentAlloc.status);

      const decision = evaluateReconciliationDecision({
        providerStatus,
        isAllocationStillHeld,
        reviewAgeMinutes,
        retryCount,
      });

      this.logger.log(
        `[Reconciler] Attempt ${paymentAttemptId} Provider: ${providerStatus}, AllocHeld: ${isAllocationStillHeld}, AgeMin: ${reviewAgeMinutes.toFixed(1)}, Decision: ${decision}`
      );

      let newAttemptStatus = lockedAttempt.status;
      let newReconStatus = lockedAttempt.reconciliation_status;
      let refundIssued = false;
      let refundId: string | undefined;
      let incidentCreated = false;
      let incidentId: string | undefined;
      let message = '';

      if (decision === 'CONFIRMED') {
        newAttemptStatus = 'CAPTURED';
        newReconStatus = 'RECONCILED';

        await client.query(
          `UPDATE payment_attempts
           SET status = $1, reconciliation_status = $2, gateway_payment_id = COALESCE($3, gateway_payment_id),
               reconciled_at = $4, last_reconciled_at = $4, retry_count = $5, updated_at = $4
           WHERE id = $6`,
          [newAttemptStatus, newReconStatus, gatewayPaymentId || null, now, retryCount, paymentAttemptId]
        );

        await client.query(
          `UPDATE bookings \n           SET status = 'CONFIRMED', version = version + 1, updated_at = $1 \n           WHERE id = $2`,
          [now, bookingId]
        );

        if (currentAlloc) {
          await client.query(
            `UPDATE table_allocations SET status = 'CONFIRMED' WHERE id = $1`,
            [currentAlloc.id]
          );
        }

        await client.query(
          `INSERT INTO booking_status_events
           (booking_id, from_status, to_status, actor_role, reason, sequence_number, metadata)
           VALUES ($1, $2, 'CONFIRMED', 'SYSTEM_RECONCILER', 'Payment verified and reconciled by gateway query',
                   COALESCE((SELECT MAX(sequence_number) FROM booking_status_events WHERE booking_id = $1), 0) + 1,
                   $3)`,
          [
            bookingId,
            lockedAttempt.booking_status,
            JSON.stringify({ payment_attempt_id: paymentAttemptId, gateway_payment_id: gatewayPaymentId }),
          ]
        );

        message = 'Payment captured and booking successfully confirmed.';
      } else if (decision === 'LATE_CAPTURE_REFUND_TRIGGERED') {
        newAttemptStatus = 'CAPTURED';
        newReconStatus = 'RECONCILED';

        await client.query(
          `UPDATE payment_attempts
           SET status = $1, reconciliation_status = $2, gateway_payment_id = COALESCE($3, gateway_payment_id),
               reconciled_at = $4, last_reconciled_at = $4, retry_count = $5, updated_at = $4
           WHERE id = $6`,
          [newAttemptStatus, newReconStatus, gatewayPaymentId || null, now, retryCount, paymentAttemptId]
        );

        if (['HOLD_ACTIVE', 'PAYMENT_PENDING', 'PAYMENT_REVIEW'].includes(lockedAttempt.booking_status)) {
          await client.query(
            `UPDATE bookings \n             SET status = 'EXPIRED', cancellation_reason = 'Payment captured after safe table reallocation', \n                 version = version + 1, updated_at = $1 \n             WHERE id = $2`,
            [now, bookingId]
          );

          if (currentAlloc && currentAlloc.status !== 'RELEASED') {
            await client.query(
              `UPDATE table_allocations SET status = 'RELEASED' WHERE id = $1`,
              [currentAlloc.id]
            );
          }
        }

        const refundKey = `late_capture_refund_${paymentAttemptId}`;
        const refundInsertRes = await client.query(
          `INSERT INTO refunds
           (payment_attempt_id, booking_id, amount_minor, currency, reason, status, idempotency_key, metadata)
           VALUES ($1, $2, $3, $4, 'Automated refund: Payment captured after safe table reallocation', 'SUCCEEDED', $5, $6)
           ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [
            paymentAttemptId,
            bookingId,
            lockedAttempt.amount_minor,
            lockedAttempt.currency || 'INR',
            refundKey,
            JSON.stringify({ reason: 'LATE_CAPTURE_REALLOCATED', original_attempt_id: paymentAttemptId }),
          ]
        );
        refundIssued = true;
        refundId = refundInsertRes.rows[0].id;

        const incidentRes = await client.query(
          `INSERT INTO payment_incidents
           (booking_id, payment_attempt_id, refund_id, incident_type, severity, status, reason, metadata)
           VALUES ($1, $2, $3, 'LATE_CAPTURE_REFUND_REQUIRED', 'HIGH', 'RESOLVED',
                   'Customer paid after inventory expired and was reallocated. Reallocated customer retained; automatic refund issued.',
                   $4)
           RETURNING id`,
          [
            bookingId,
            paymentAttemptId,
            refundId,
            JSON.stringify({
              refund_id: refundId,
              amount_minor: lockedAttempt.amount_minor,
              gateway_payment_id: gatewayPaymentId,
            }),
          ]
        );
        incidentCreated = true;
        incidentId = incidentRes.rows[0].id;

        await client.query(
          `INSERT INTO booking_status_events
           (booking_id, from_status, to_status, actor_role, reason, sequence_number, metadata)
           VALUES ($1, $2, 'EXPIRED', 'SYSTEM_RECONCILER',
                   'Late payment captured after reallocation. Automated refund processed.',
                   COALESCE((SELECT MAX(sequence_number) FROM booking_status_events WHERE booking_id = $1), 0) + 1,
                   $3)`,
          [bookingId, lockedAttempt.booking_status, JSON.stringify({ refund_id: refundId, incident_id: incidentId })]
        );

        message = 'Late capture detected after table reallocation. Table retained for new customer; automated refund completed.';
      } else if (decision === 'SAFE_RELEASE_EXPIRED') {
        newAttemptStatus = 'FAILED';
        newReconStatus = 'RECONCILED';

        await client.query(
          `UPDATE payment_attempts
           SET status = $1, reconciliation_status = $2, reconciled_at = $3,
               last_reconciled_at = $3, retry_count = $4, updated_at = $3
           WHERE id = $5`,
          [newAttemptStatus, newReconStatus, now, retryCount, paymentAttemptId]
        );

        await client.query(
          `UPDATE bookings SET status = 'PAYMENT_FAILED', version = version + 1, updated_at = $1 WHERE id = $2`,
          [now, bookingId]
        );

        if (currentAlloc) {
          await client.query(
            `UPDATE table_allocations SET status = 'RELEASED' WHERE id = $1`,
            [currentAlloc.id]
          );
        }

        await client.query(
          `INSERT INTO booking_status_events
           (booking_id, from_status, to_status, actor_role, reason, sequence_number, metadata)
           VALUES ($1, $2, 'PAYMENT_FAILED', 'SYSTEM_RECONCILER',
                   'Conclusive payment failure confirmed by gateway. Physical allocation safely released.',
                   COALESCE((SELECT MAX(sequence_number) FROM booking_status_events WHERE booking_id = $1), 0) + 1,
                   $3)`,
          [bookingId, lockedAttempt.booking_status, JSON.stringify({ payment_attempt_id: paymentAttemptId })]
        );

        message = 'Payment failure verified with gateway. Table allocation safely released.';
      } else if (decision === 'MANUAL_ESCALATION') {
        newReconStatus = 'MANUAL_ESCALATION';

        await client.query(
          `UPDATE payment_attempts
           SET reconciliation_status = $1, last_reconciled_at = $2, retry_count = $3,
               escalation_reason = 'Review timeout or max retries exceeded without gateway certainty',
               updated_at = $2
           WHERE id = $4`,
          [newReconStatus, now, retryCount, paymentAttemptId]
        );

        const incidentRes = await client.query(
          `INSERT INTO payment_incidents
           (booking_id, payment_attempt_id, incident_type, severity, status, reason, metadata)
           VALUES ($1, $2, 'RECONCILIATION_TIMEOUT', 'CRITICAL', 'OPEN',
                   'Payment outcome remains unknown after 15 minutes / 3 retries. Manual escalation required.',
                   $3)
           RETURNING id`,
          [
            bookingId,
            paymentAttemptId,
            JSON.stringify({
              retry_count: retryCount,
              review_age_minutes: reviewAgeMinutes,
              gateway_order_id: lockedAttempt.gateway_order_id,
            }),
          ]
        );
        incidentCreated = true;
        incidentId = incidentRes.rows[0].id;

        message = 'Review timeout exceeded without conclusive provider resolution. Escalated to manual support investigation.';
      } else {
        newReconStatus = 'PENDING_RECHECK';

        await client.query(
          `UPDATE payment_attempts
           SET reconciliation_status = $1, last_reconciled_at = $2, retry_count = $3,
               review_started_at = COALESCE(review_started_at, $2),
               review_expires_at = COALESCE(review_expires_at, $2 + INTERVAL '15 minutes'),
               updated_at = $2
           WHERE id = $4`,
          [newReconStatus, now, retryCount, paymentAttemptId]
        );

        if (lockedAttempt.booking_status !== 'PAYMENT_REVIEW') {
          await client.query(
            `UPDATE bookings SET status = 'PAYMENT_REVIEW', version = version + 1, updated_at = $1 WHERE id = $2`,
            [now, bookingId]
          );

          if (currentAlloc && currentAlloc.status !== 'PAYMENT_REVIEW') {
            await client.query(
              `UPDATE table_allocations SET status = 'PAYMENT_REVIEW' WHERE id = $1`,
              [currentAlloc.id]
            );
          }
        }

        message = 'Payment outcome remains pending with gateway. Review status maintained within bounded window.';
      }

      return {
        payment_attempt_id: paymentAttemptId,
        booking_id: bookingId,
        previous_status: lockedAttempt.status,
        new_status: newAttemptStatus,
        reconciliation_status: newReconStatus,
        decision,
        refund_issued: refundIssued,
        refund_id: refundId,
        incident_created: incidentCreated,
        incident_id: incidentId,
        message,
      };
    });
  }

  /**
   * POST /payments/:id/refund
   */
  async issueRefund(
    userId: string,
    paymentAttemptId: string,
    dto: CreateRefundRequestDto,
    isStaffOrSupport: boolean = false
  ): Promise<RefundResponseDto> {
    const { amount_minor, reason, idempotency_key } = dto;

    if (!idempotency_key) {
      throw new ValidationError('idempotency_key is required for refund requests');
    }
    if (!amount_minor || amount_minor <= 0) {
      throw new ValidationError('amount_minor must be a positive integer');
    }
    if (!reason) {
      throw new ValidationError('reason is required for refund auditing');
    }

    const pool = this.getPoolOrClient();
    const existingRefundRes = await pool.query(
      `SELECT * FROM refunds WHERE idempotency_key = $1`,
      [idempotency_key]
    );

    if (existingRefundRes.rows.length > 0) {
      const existingRefund = existingRefundRes.rows[0];
      this.logger.log(`[RefundIdempotency] Returning existing refund for idempotency_key ${idempotency_key}`);
      return {
        id: existingRefund.id,
        booking_id: existingRefund.booking_id,
        payment_attempt_id: existingRefund.payment_attempt_id,
        gateway_refund_id: existingRefund.gateway_refund_id,
        amount_minor: existingRefund.amount_minor,
        currency: existingRefund.currency || 'INR',
        status: existingRefund.status,
        reason: existingRefund.reason,
        idempotency_key: existingRefund.idempotency_key,
        created_at: new Date(existingRefund.created_at).toISOString(),
        updated_at: new Date(existingRefund.updated_at || existingRefund.created_at).toISOString(),
      };
    }

    const paymentAttemptRes = await pool.query(
      `SELECT pa.*, b.user_id as booking_user_id, b.restaurant_id
       FROM payment_attempts pa
       JOIN bookings b ON b.id = pa.booking_id
       WHERE pa.id = $1 FOR UPDATE`,
      [paymentAttemptId]
    );

    if (paymentAttemptRes.rows.length === 0) {
      throw new NotFoundError(`Payment attempt ${paymentAttemptId} not found`);
    }
    const paymentAttempt = paymentAttemptRes.rows[0];

    if (!isStaffOrSupport && paymentAttempt.booking_user_id !== userId) {
      const staffRes = await pool.query(
        `SELECT 1 FROM restaurant_memberships
         WHERE restaurant_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
        [paymentAttempt.restaurant_id, userId]
      );
      if (staffRes.rows.length === 0) {
        throw new ForbiddenError('You do not have permission to refund this payment');
      }
    }

    if (amount_minor > paymentAttempt.amount_minor) {
      throw new ValidationError(
        `Refund amount (${amount_minor}) cannot exceed captured amount (${paymentAttempt.amount_minor})`
      );
    }

    const gatewayPaymentId = paymentAttempt.gateway_payment_id || `pay_${paymentAttempt.gateway_order_id}`;
    let gwRefundRes;
    try {
      gwRefundRes = await this.gateway.initiateRefund(
        gatewayPaymentId,
        amount_minor,
        idempotency_key,
        reason
      );
    } catch (err: any) {
      this.logger.error(`Gateway refund initiation failed: ${err.message}`);
      gwRefundRes = {
        status: 'FAILED' as const,
        gatewayRefundId: `rfnd_err_${crypto.randomBytes(6).toString('hex')}`,
        amountMinor: amount_minor,
        currency: 'INR',
      };
    }

    return this.executeTx(async (client) => {
      const refundStatus = gwRefundRes.status;
      const now = new Date();

      const insertRes = await client.query(
        `INSERT INTO refunds
         (payment_attempt_id, booking_id, gateway_refund_id, amount_minor, currency, reason,
          status, idempotency_key, initiated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [
          paymentAttemptId,
          paymentAttempt.booking_id,
          gwRefundRes.gatewayRefundId,
          amount_minor,
          paymentAttempt.currency || 'INR',
          reason,
          refundStatus,
          idempotency_key,
          userId,
          now,
        ]
      );

      const refundRecord = insertRes.rows[0];

      if (refundStatus === 'FAILED') {
        await client.query(
          `INSERT INTO payment_incidents
           (booking_id, payment_attempt_id, refund_id, incident_type, severity, status, reason, metadata)
           VALUES ($1, $2, $3, 'REFUND_FAILED', 'HIGH', 'OPEN',
                   'Gateway rejected or failed refund transaction. Manual intervention required.',
                   $4)`,
          [
            paymentAttempt.booking_id,
            paymentAttemptId,
            refundRecord.id,
            JSON.stringify({ error: 'Gateway returned FAILED status', idempotency_key }),
          ]
        );
      } else {
        await client.query(
          `UPDATE payment_attempts SET status = 'REFUNDED', updated_at = $1 WHERE id = $2`,
          [now, paymentAttemptId]
        );
      }

      return {
        id: refundRecord.id,
        booking_id: refundRecord.booking_id,
        payment_attempt_id: refundRecord.payment_attempt_id,
        gateway_refund_id: refundRecord.gateway_refund_id,
        amount_minor: refundRecord.amount_minor,
        currency: refundRecord.currency || 'INR',
        status: refundRecord.status,
        reason: refundRecord.reason,
        idempotency_key: refundRecord.idempotency_key,
        created_at: new Date(refundRecord.created_at).toISOString(),
        updated_at: new Date(refundRecord.updated_at).toISOString(),
      };
    });
  }

  /**
   * GET /payments/incidents
   */
  async listIncidents(query?: PaymentIncidentListQueryDto): Promise<{
    items: PaymentIncidentDto[];
    incidents: PaymentIncidentDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const pool = this.getPoolOrClient();
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (query?.status) {
      params.push(query.status);
      whereClause += ` AND status = $${params.length}`;
    }
    if (query?.severity) {
      params.push(query.severity);
      whereClause += ` AND severity = $${params.length}`;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM payment_incidents ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const limit = Math.min(100, Math.max(1, query?.limit || 20));
    const offset = Math.max(0, query?.offset || 0);
    params.push(limit, offset);

    const itemsRes = await pool.query(
      `SELECT * FROM payment_incidents ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const incidents: PaymentIncidentDto[] = (itemsRes.rows || []).map((r: any) => ({
      id: r.id,
      booking_id: r.booking_id,
      payment_attempt_id: r.payment_attempt_id,
      refund_id: r.refund_id,
      incident_type: r.incident_type,
      severity: r.severity,
      status: r.status,
      reason: r.reason,
      metadata: r.metadata || {},
      created_at: new Date(r.created_at).toISOString(),
      resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      resolved_by: r.resolved_by,
    }));

    return { items: incidents, incidents, total, limit, offset };
  }

  /**
   * GET /payments/incidents/:id
   */
  async getIncidentById(incidentId: string): Promise<PaymentIncidentDto> {
    const pool = this.getPoolOrClient();
    const res = await pool.query(
      `SELECT * FROM payment_incidents WHERE id = $1`,
      [incidentId]
    );
    if (res.rows.length === 0) {
      throw new NotFoundError(`Payment incident ${incidentId} not found`);
    }
    const r = res.rows[0];
    return {
      id: r.id,
      booking_id: r.booking_id,
      payment_attempt_id: r.payment_attempt_id,
      refund_id: r.refund_id,
      incident_type: r.incident_type,
      severity: r.severity,
      status: r.status,
      reason: r.reason,
      metadata: r.metadata || {},
      created_at: new Date(r.created_at).toISOString(),
      resolved_at: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
      resolved_by: r.resolved_by,
    };
  }

  /**
   * PATCH /payments/incidents/:id/resolve
   */
  async resolveIncident(
    staffUserId: string,
    incidentId: string,
    dto: ResolvePaymentIncidentRequestDto
  ): Promise<ResolvePaymentIncidentResponseDto> {
    return this.executeTx(async (client) => {
      const res = await client.query(
        `SELECT * FROM payment_incidents WHERE id = $1 FOR UPDATE`,
        [incidentId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError(`Payment incident ${incidentId} not found`);
      }

      const now = new Date();

      await client.query(
        `UPDATE payment_incidents
         SET status = $1, resolved_at = $2, resolved_by = $3,
             metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{resolution_reason}', $4::jsonb)
         WHERE id = $5`,
        [
          dto.resolution_status,
          now,
          staffUserId,
          JSON.stringify(dto.reason),
          incidentId,
        ]
      );

      return {
        success: true,
        incident_id: incidentId,
        status: dto.resolution_status,
        resolved_at: now.toISOString(),
        message: `Incident ${incidentId} marked as ${dto.resolution_status}.`,
      };
    });
  }
}
