/**
 * Canonical domain enums for the Dine platform.
 * Conforms to ADR-001 through ADR-007 and Blueprint specifications.
 */

export enum PolicyMode {
  FREE_RESERVATION = 'FREE_RESERVATION',
  DEPOSIT_REQUIRED = 'DEPOSIT_REQUIRED',
}

export enum MembershipRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  HOST = 'HOST',
}

export enum MembershipStatus {
  ACTIVE = 'ACTIVE',
  INVITED = 'INVITED',
  SUSPENDED = 'SUSPENDED',
}

export enum BookingStatus {
  HOLD_ACTIVE = 'HOLD_ACTIVE',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_REVIEW = 'PAYMENT_REVIEW',
  CONFIRMED = 'CONFIRMED',
  READY = 'READY',
  SEATED = 'SEATED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
  EXPIRED = 'EXPIRED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

export enum AllocationStatus {
  HELD = 'HELD',
  OFFER_HELD = 'OFFER_HELD',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_REVIEW = 'PAYMENT_REVIEW',
  CONFIRMED = 'CONFIRMED',
  READY = 'READY',
  SEATED = 'SEATED',
  COMPLETED = 'COMPLETED',
  RELEASED = 'RELEASED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentAttemptStatus {
  INITIATED = 'INITIATED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum WaitlistStatus {
  WAITING = 'WAITING',
  OFFER_EXTENDED = 'OFFER_EXTENDED',
  SEATED = 'SEATED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum WaitlistOfferStatus {
  OFFERED = 'OFFERED',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  DECLINED = 'DECLINED',
}

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
}
