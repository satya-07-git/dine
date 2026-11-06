/**
 * Payment Gateway Adapter Interface for Dine Platform.
 * Supports test-mode isolation, status lookups, and idempotent refunds.
 * Conforms to Blueprint §9.1–9.4, §17 and EPIC-011.
 */

export interface GatewayPaymentStatusResult {
  status: 'CAPTURED' | 'FAILED' | 'UNKNOWN';
  gatewayPaymentId?: string;
  amountMinor: number;
  currency: string;
  rawResponse?: Record<string, unknown>;
}

export interface GatewayRefundResult {
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  gatewayRefundId: string;
  amountMinor: number;
  currency: string;
  rawResponse?: Record<string, unknown>;
}

export interface IPaymentGateway {
  fetchPaymentStatus(gatewayOrderId: string): Promise<GatewayPaymentStatusResult>;
  initiateRefund(
    gatewayPaymentId: string,
    amountMinor: number,
    idempotencyKey: string,
    reason: string
  ): Promise<GatewayRefundResult>;
}
