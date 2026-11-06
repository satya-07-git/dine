/**
 * Standardized RFC 7807 Problem Details Error taxonomy.
 * Conforms to docs/architecture/api-conventions.md.
 */

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  invalid_params?: Array<{
    name: string;
    reason: string;
  }>;
  request_id?: string;
}

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  INVENTORY_HOLD_CONFLICT = 'INVENTORY_HOLD_CONFLICT',
  HOLD_EXPIRED = 'HOLD_EXPIRED',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_UNAVAILABLE = 'DATABASE_UNAVAILABLE',
}
