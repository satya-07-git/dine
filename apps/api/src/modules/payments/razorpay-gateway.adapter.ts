import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '../../common/config/config.service';
import {
  IPaymentGateway,
  GatewayPaymentStatusResult,
  GatewayRefundResult,
} from './payment-gateway.interface';

@Injectable()
export class RazorpayGatewayAdapter implements IPaymentGateway {
  private readonly logger = new Logger(RazorpayGatewayAdapter.name);

  constructor(private readonly config: ConfigService) {}

  isTestMode(): boolean {
    return true;
  }

  isLiveDisabled(): boolean {
    return true;
  }

  getKeyId(): string {
    return this.config?.get('RAZORPAY_KEY_ID') || 'rzp_test_mock_1234567890';
  }

  getKeySecret(): string {
    return this.config?.get('RAZORPAY_KEY_SECRET') || 'mock_key_secret_1234567890';
  }

  getWebhookSecret(): string {
    return this.config?.get('RAZORPAY_WEBHOOK_SECRET') || 'test_webhook_secret_key_123456';
  }

  async createOrder(params: {
    amountMinor: number;
    currency: string;
    receipt?: string;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amount: number; currency: string; status: string; receipt?: string; notes?: any }> {
    const { amountMinor, currency, receipt, notes } = params;

    if (!amountMinor || amountMinor <= 0) {
      throw new Error('amountMinor must be a positive integer in minor units (paise)');
    }

    const orderId = `order_test_${crypto.randomBytes(8).toString('hex')}`;
    this.logger.log(`[RazorpayAdapter] Created test order ${orderId} for ${amountMinor} ${currency}`);

    return {
      id: orderId,
      amount: amountMinor,
      currency: (currency || 'INR').toUpperCase(),
      status: 'created',
      receipt: receipt || `rcpt_${crypto.randomBytes(4).toString('hex')}`,
      notes: notes || {},
    };
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string, secretOverride?: string): boolean {
    if (!rawBody || !signature) {
      return false;
    }
    const secret = secretOverride || this.getWebhookSecret();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  async fetchPaymentStatus(gatewayOrderId: string): Promise<GatewayPaymentStatusResult> {
    this.logger.log(`[RazorpayAdapter] Fetching status for order ${gatewayOrderId}`);
    if (gatewayOrderId.includes('fail')) {
      return {
        status: 'FAILED',
        amountMinor: 50000,
        currency: 'INR',
      };
    }
    if (gatewayOrderId.includes('unknown') || gatewayOrderId.includes('timeout')) {
      return {
        status: 'UNKNOWN',
        amountMinor: 50000,
        currency: 'INR',
      };
    }
    return {
      status: 'CAPTURED',
      gatewayPaymentId: `pay_${crypto.randomBytes(8).toString('hex')}`,
      amountMinor: 50000,
      currency: 'INR',
    };
  }

  async initiateRefund(
    gatewayPaymentId: string,
    amountMinor: number,
    idempotencyKey: string,
    reason: string
  ): Promise<GatewayRefundResult> {
    this.logger.log(
      `[RazorpayAdapter] Initiating refund for payment ${gatewayPaymentId}, amount: ${amountMinor}, idempotency: ${idempotencyKey}`
    );
    if (gatewayPaymentId.includes('fail_refund')) {
      return {
        status: 'FAILED',
        gatewayRefundId: `rfnd_failed_${crypto.randomBytes(6).toString('hex')}`,
        amountMinor,
        currency: 'INR',
      };
    }
    const gatewayRefundId = `rfnd_${crypto.createHash('sha256').update(idempotencyKey).digest('hex').substring(0, 16)}`;
    return {
      status: 'SUCCEEDED',
      gatewayRefundId,
      amountMinor,
      currency: 'INR',
    };
  }
}
