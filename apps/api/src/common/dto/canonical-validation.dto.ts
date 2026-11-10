import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsInt,
  Min,
  IsISO8601,
  IsOptional,
  IsArray,
  IsObject,
  Length,
} from 'class-validator';

/**
 * DTO for creating an atomic booking hold (POST /api/v1/holds)
 */
export class CreateHoldDto {
  @IsUUID('4', { message: 'restaurantId must be a valid UUID' })
  restaurantId: string;

  @IsUUID('4', { message: 'tableId must be a valid UUID' })
  tableId: string;

  @IsISO8601({ strict: false }, { message: 'startsAt must be a valid ISO 8601 date string' })
  startsAt: string;

  @IsInt({ message: 'partySize must be an integer' })
  @Min(1, { message: 'partySize must be at least 1' })
  partySize: number;
}

/**
 * DTO for table recommendation ranking (POST /api/v1/recommendations/tables)
 */
export class TableRecommendationDto {
  @IsUUID('4', { message: 'restaurantId must be a valid UUID' })
  restaurantId: string;

  @IsISO8601({ strict: false }, { message: 'startsAt must be a valid ISO 8601 date string' })
  startsAt: string;

  @IsInt({ message: 'partySize must be an integer' })
  @Min(1, { message: 'partySize must be at least 1' })
  partySize: number;

  @IsArray({ message: 'features must be an array of strings' })
  @IsOptional()
  features?: string[];

  @IsArray({ message: 'seating_locations must be an array of strings' })
  @IsOptional()
  seating_locations?: string[];
}

/**
 * DTO for server-side payment verification (POST /api/v1/payments/verify)
 */
export class VerifyPaymentDto {
  @IsString({ message: 'razorpay_order_id must be a string' })
  @IsNotEmpty({ message: 'razorpay_order_id is required' })
  razorpay_order_id: string;

  @IsString({ message: 'razorpay_payment_id must be a string' })
  @IsNotEmpty({ message: 'razorpay_payment_id is required' })
  razorpay_payment_id: string;

  @IsString({ message: 'razorpay_signature must be a string' })
  @IsNotEmpty({ message: 'razorpay_signature is required' })
  razorpay_signature: string;

  @IsUUID('4', { message: 'payment_attempt_id must be a valid UUID' })
  @IsOptional()
  payment_attempt_id?: string;
}

/**
 * DTO for creating a refund (POST /api/v1/payments/:id/refund)
 */
export class CreateRefundDto {
  @IsInt({ message: 'amount_minor must be an integer (minor units/paise)' })
  @Min(1, { message: 'amount_minor must be at least 1' })
  amount_minor: number;

  @IsString({ message: 'reason must be a string' })
  @IsNotEmpty({ message: 'reason is required' })
  reason: string;

  @IsString({ message: 'idempotency_key must be a string' })
  @IsNotEmpty({ message: 'idempotency_key is required' })
  idempotency_key: string;
}

/**
 * DTO for creating a payment order (POST /api/v1/payments/orders)
 */
export class CreatePaymentOrderDto {
  @IsUUID('4', { message: 'hold_id must be a valid UUID' })
  @IsOptional()
  hold_id?: string;

  @IsUUID('4', { message: 'booking_id must be a valid UUID' })
  @IsOptional()
  booking_id?: string;

  @IsObject({ message: 'notes must be an object' })
  @IsOptional()
  notes?: Record<string, string>;
}

/**
 * DTO for free reservation confirmation (POST /api/v1/reservations/free)
 */
export class ConfirmFreeReservationDto {
  @IsUUID('4', { message: 'hold_id must be a valid UUID' })
  @IsOptional()
  hold_id?: string;

  @IsUUID('4', { message: 'holdId must be a valid UUID' })
  @IsOptional()
  holdId?: string;

  @IsUUID('4', { message: 'booking_id must be a valid UUID' })
  @IsOptional()
  booking_id?: string;
}

/**
 * DTO for booking cancellation (POST /api/v1/bookings/:id/cancel)
 */
export class CancelBookingDto {
  @IsString({ message: 'reason must be a string' })
  @IsOptional()
  reason?: string;
}

/**
 * DTO for creating a table maintenance block (POST /api/v1/restaurant-ops/table-blocks)
 */
export class CreateTableBlockDto {
  @IsUUID('4', { message: 'restaurantId must be a valid UUID' })
  @IsOptional()
  restaurantId?: string;

  @IsUUID('4', { message: 'restaurant_id must be a valid UUID' })
  @IsOptional()
  restaurant_id?: string;

  @IsUUID('4', { message: 'tableId must be a valid UUID' })
  @IsOptional()
  tableId?: string;

  @IsUUID('4', { message: 'table_id must be a valid UUID' })
  @IsOptional()
  table_id?: string;

  @IsISO8601({ strict: false }, { message: 'startsAt must be a valid ISO 8601 date string' })
  @IsOptional()
  startsAt?: string;

  @IsISO8601({ strict: false }, { message: 'start_time must be a valid ISO 8601 date string' })
  @IsOptional()
  start_time?: string;

  @IsISO8601({ strict: false }, { message: 'endsAt must be a valid ISO 8601 date string' })
  @IsOptional()
  endsAt?: string;

  @IsISO8601({ strict: false }, { message: 'end_time must be a valid ISO 8601 date string' })
  @IsOptional()
  end_time?: string;

  @IsString({ message: 'reason must be a string' })
  @IsOptional()
  reason?: string;
}

/**
 * DTO for requesting a phone OTP (POST /api/v1/auth/otp/request)
 */
export class RequestOtpDto {
  @IsString({ message: 'phone is required' })
  @IsNotEmpty({ message: 'phone cannot be empty' })
  phone: string;
}

/**
 * DTO for verifying a phone OTP (POST /api/v1/auth/otp/verify)
 */
export class VerifyOtpDto {
  @IsString({ message: 'phone is required' })
  @IsNotEmpty({ message: 'phone cannot be empty' })
  phone: string;

  @IsString({ message: 'code is required' })
  @Length(6, 6, { message: 'code must be exactly 6 digits' })
  code: string;
}
