/**
 * Shared Request and Response DTO interfaces for Dine API.
 */

import {
  BookingStatus,
  AllocationStatus,
  PolicyMode,
  PaymentAttemptStatus,
  RefundStatus,
  PaymentReconciliationStatus,
  PaymentIncidentType,
  PaymentIncidentSeverity,
  PaymentIncidentStatus,
  WaitlistStatus,
  WaitlistOfferStatus,
  WaitlistSkipReason,
  OutboxEventStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
  RealtimeTopicType,
} from './enums';

export interface HealthResponseDto {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  dependencies: {
    database: {
      status: 'up' | 'down';
      latency_ms?: number;
    };
  };
}

export interface CreateHoldRequestDto {
  restaurant_id: string;
  table_id: string;
  party_size: number;
  requested_start: string; // ISO 8601 UTC
}

export interface HoldResponseDto {
  id: string;
  table_id: string;
  booking_id: string;
  dining_period: {
    start: string;
    end: string;
  };
  status: AllocationStatus;
  expires_at: string;
  created_at: string;
}

export interface OpeningHourDto {
  day_of_week: number;
  open_time: string;
  close_time: string;
}

export interface SpecialClosureDto {
  id: string;
  start_time: string;
  end_time: string;
  reason?: string;
}

export interface CuisineDto {
  id: string;
  name: string;
  slug: string;
}

export interface RestaurantResponseDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  timezone: string;
  policy_mode: PolicyMode;
  deposit_amount_minor: number;
  deposit_currency: string;
  policy_version: number;
  default_duration_min: number;
  turnover_buffer_min: number;
  min_party_size: number;
  max_party_size: number;
  lead_time_min_minutes: number;
  lead_time_max_days: number;
  latitude?: number | null;
  longitude?: number | null;
  is_published?: boolean;
  status?: string;
  price_tier?: string;
  cover_image_url?: string | null;
  media_gallery?: any[];
  opening_hours?: OpeningHourDto[];
  special_closures?: SpecialClosureDto[];
  cuisines?: CuisineDto[];
}

export interface UpdateRestaurantPolicyDto {
  timezone?: string;
  policy_mode?: PolicyMode;
  deposit_amount_minor?: number;
  deposit_currency?: string;
  default_duration_min?: number;
  turnover_buffer_min?: number;
  min_party_size?: number;
  max_party_size?: number;
  lead_time_min_minutes?: number;
  lead_time_max_days?: number;
  change_reason?: string;
}

export interface CreateSpecialClosureDto {
  start_time: string; // ISO 8601
  end_time: string;   // ISO 8601
  reason?: string;
  force?: boolean;
}

export interface BookingResponseDto {
  id: string;
  user_id: string;
  restaurant_id: string;
  party_size: number;
  requested_start: string;
  status: BookingStatus;
  policy_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// EPIC-005 Discovery, Menus & Public Media DTOs
// ============================================================================

export interface PaginatedResponseDto<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface RestaurantDiscoveryDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  timezone: string;
  price_tier: string;
  policy_mode: PolicyMode;
  deposit_amount_minor: number;
  deposit_currency: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  cover_image_url?: string | null;
  cuisines: CuisineDto[];
}

export interface RestaurantSearchQueryDto {
  q?: string;
  cuisine?: string;
  price_tier?: string;
  limit?: number;
  offset?: number;
  sort?: string;
}

export interface NearbySearchQueryDto {
  lat: number;
  lng: number;
  radius_km?: number;
  cuisine?: string;
  price_tier?: string;
  limit?: number;
  offset?: number;
}

export interface MenuItemDto {
  id: string;
  restaurant_id: string;
  category_id?: string | null;
  name: string;
  description?: string | null;
  price_minor: number;
  currency: string;
  is_available: boolean;
  dietary_tags: string[];
  image_url?: string | null;
  display_order: number;
}

export interface MenuCategoryDto {
  id: string;
  restaurant_id: string;
  name: string;
  description?: string | null;
  display_order: number;
  items: MenuItemDto[];
}

export interface RestaurantMediaDto {
  id: string;
  restaurant_id: string;
  url: string;
  caption?: string | null;
  media_type: string;
  is_featured: boolean;
  display_order: number;
}

export interface RestaurantMenuDto {
  restaurant_id: string;
  categories: MenuCategoryDto[];
  media: RestaurantMediaDto[];
}

// ============================================================================
// EPIC-006 Versioned Floor Plans & Table Inventory DTOs
// ============================================================================

export interface RestaurantTableDto {
  id: string;
  floor_id: string;
  table_number: string;
  capacity: number;
  min_covers: number;
  zone: string;
  x: number;
  y: number;
  w: number;
  h: number;
  is_active: boolean;
  created_at?: string;
}

export interface FloorDto {
  id: string;
  restaurant_id: string;
  name: string;
  floor_number: number;
  version_number: number;
  svg_layout_url?: string | null;
  tables: RestaurantTableDto[];
  created_at?: string;
}

export interface RestaurantFloorPlanDto {
  restaurant_id: string;
  floors: FloorDto[];
}

export interface UpdateFloorPlanTableDto {
  id?: string;
  table_number: string;
  capacity: number;
  min_covers?: number;
  zone?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  is_active?: boolean;
}

export interface UpdateFloorPlanRequestDto {
  floor_id: string;
  base_version: number;
  name?: string;
  svg_layout_url?: string | null;
  tables: UpdateFloorPlanTableDto[];
}

export interface UpdateFloorPlanResponseDto {
  success: boolean;
  floor_id: string;
  version_number: number;
  tables_count: number;
  message: string;
}

// ============================================================================
// EPIC-007 Time-Range Availability & Policy Engine DTOs
// ============================================================================

export type TableAvailabilityState = 'AVAILABLE' | 'UNAVAILABLE';

export type TableUnavailabilityReason =
  | 'ALLOCATED'
  | 'BLOCKED'
  | 'CAPACITY_MISMATCH'
  | 'TABLE_INACTIVE'
  | 'RESTAURANT_INELIGIBLE';

export interface TableAvailabilityDto {
  table_id: string;
  table_number: string;
  floor_id: string;
  floor_name?: string;
  capacity: number;
  min_covers: number;
  zone: string;
  state: TableAvailabilityState;
  reason?: TableUnavailabilityReason | null;
}

export interface DiningIntervalDto {
  requested_start: string; // ISO 8601 UTC
  derived_end: string;     // ISO 8601 UTC
  dining_duration_min: number;
  turnover_buffer_min: number;
  protection_duration_min: number;
  timezone: string;
}

export interface RestaurantAvailabilityQueryDto {
  party_size: number;
  date?: string;
  requested_start?: string;
}

export interface RestaurantAvailabilityResponseDto {
  restaurant_id: string;
  eligible: boolean;
  reason?: string | null;
  message?: string | null;
  availability_snapshot_at: string;
  floor_plan_version: number;
  interval?: DiningIntervalDto | null;
  party_size: number;
  tables: TableAvailabilityDto[];
  available_tables_count: number;
  total_tables_count: number;
}

export interface SingleTableAvailabilityQueryDto {
  date?: string;
  requested_start?: string;
  party_size?: number;
}

export interface SingleTableAvailabilityResponseDto {
  table_id: string;
  restaurant_id: string;
  table_number: string;
  floor_id: string;
  floor_name?: string;
  capacity: number;
  min_covers: number;
  zone: string;
  floor_plan_version: number;
  availability_snapshot_at: string;
  state: TableAvailabilityState;
  reason?: TableUnavailabilityReason | string | null;
  interval?: DiningIntervalDto | null;
  eligible: boolean;
}

// ============================================================================
// EPIC-008 Atomic Holds, Idempotency & Safe Expiry DTOs
// ============================================================================

export interface DepositSummaryDto {
  policy_mode: PolicyMode | string;
  amount_minor: number;
  currency: string;
}

export interface BookingHoldResponseDto {
  hold_id: string;
  booking_id: string;
  table_id: string;
  restaurant_id: string;
  status: AllocationStatus | string;
  dining_period: {
    start: string;
    end: string;
  };
  expires_at: string;
  server_time: string;
  deposit: DepositSummaryDto;
}

export interface CancelHoldResponseDto {
  message: string;
  hold_id: string;
  status: string;
}

// ============================================================================
// EPIC-009 Reservation Lifecycle & Service Status DTOs
// ============================================================================

export interface CreateFreeBookingRequestDto {
  restaurant_id: string;
  table_id: string;
  party_size: number;
  requested_start: string;
  special_requests?: string;
}

export interface CancelBookingRequestDto {
  reason?: string;
}

export interface UpdateBookingStatusRequestDto {
  status: BookingStatus;
  expected_version?: number;
  reason?: string;
}

export interface BookingStatusEventDto {
  id: string;
  booking_id: string;
  from_status: string | null;
  to_status: string;
  actor_id?: string | null;
  actor_role?: string | null;
  reason?: string | null;
  sequence_number: number;
  request_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface BookingLifecycleDetailDto {
  id: string;
  user_id: string;
  restaurant_id: string;
  restaurant_name?: string;
  table_id?: string;
  table_number?: string;
  floor_id?: string;
  floor_name?: string;
  party_size: number;
  requested_start: string;
  dining_period?: {
    start: string;
    end: string;
  };
  status: BookingStatus | string;
  allocation_status?: AllocationStatus | string;
  version: number;
  policy_snapshot: Record<string, unknown>;
  checked_in_at?: string | null;
  seated_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
  updated_at: string;
  events?: BookingStatusEventDto[];
}

export interface BookingListQueryDto {
  status?: BookingStatus | string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// EPIC-010 Payment Orders & Verified Webhook Inbox DTOs
// ============================================================================

export interface CreatePaymentOrderRequestDto {
  hold_id?: string;
  booking_id?: string;
  notes?: Record<string, string>;
}

export interface PaymentOrderResponseDto {
  order_id: string;
  payment_attempt_id: string;
  booking_id: string;
  hold_id?: string;
  amount_minor: number;
  currency: string;
  key_id: string;
  status: PaymentAttemptStatus | string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  policy_mode: PolicyMode | string;
  is_test_mode: boolean;
  created_at: string;
}

export interface PaymentStatusResponseDto {
  id: string;
  booking_id: string;
  gateway: string;
  gateway_order_id: string;
  amount_minor: number;
  currency: string;
  status: PaymentAttemptStatus | string;
  booking_status?: BookingStatus | string;
  allocation_status?: AllocationStatus | string;
  created_at: string;
  updated_at: string;
}

export interface RazorpayWebhookResponseDto {
  received: boolean;
  event_id: string;
  duplicate?: boolean;
  action_taken: string;
}

// ============================================================================
// EPIC-011 Payment Review, Reconciliation & Refunds DTOs
// ============================================================================

export interface RefundResponseDto {
  id: string;
  booking_id: string;
  payment_attempt_id: string;
  gateway_refund_id: string | null;
  amount_minor: number;
  currency: string;
  status: RefundStatus | string;
  reason: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRefundRequestDto {
  amount_minor: number;
  reason: string;
  idempotency_key: string;
}

export interface PaymentReconciliationDetailDto {
  id: string;
  booking_id: string;
  gateway: string;
  gateway_order_id: string;
  gateway_payment_id: string | null;
  amount_minor: number;
  currency: string;
  status: PaymentAttemptStatus | string;
  reconciliation_status: PaymentReconciliationStatus | string;
  review_started_at: string | null;
  review_expires_at: string | null;
  reconciled_at: string | null;
  last_reconciled_at: string | null;
  retry_count: number;
  escalation_reason: string | null;
  booking_status?: BookingStatus | string;
  allocation_status?: AllocationStatus | string;
  refunds: RefundResponseDto[];
  created_at: string;
  updated_at: string;
}

export interface ReconcilePaymentRequestDto {
  force_provider_status?: 'CAPTURED' | 'FAILED' | 'UNKNOWN';
}

export interface ReconciliationResultDto {
  payment_attempt_id: string;
  booking_id: string;
  previous_status: string;
  new_status: string;
  reconciliation_status: string;
  decision:
    | 'CONFIRMED'
    | 'SAFE_RELEASE_EXPIRED'
    | 'LATE_CAPTURE_REFUND_TRIGGERED'
    | 'REVIEW_MAINTAINED'
    | 'MANUAL_ESCALATION';
  refund_issued?: boolean;
  refund_id?: string;
  incident_created?: boolean;
  incident_id?: string;
  message: string;
}

export interface PaymentIncidentDto {
  id: string;
  booking_id: string;
  payment_attempt_id: string | null;
  refund_id: string | null;
  incident_type: PaymentIncidentType | string;
  severity: PaymentIncidentSeverity | string;
  status: PaymentIncidentStatus | string;
  reason: string;
  metadata: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PaymentIncidentListQueryDto {
  status?: PaymentIncidentStatus | string;
  severity?: PaymentIncidentSeverity | string;
  limit?: number;
  offset?: number;
}

export interface ResolvePaymentIncidentRequestDto {
  resolution_status: 'RESOLVED' | 'DISMISSED';
  reason: string;
}

export interface ResolvePaymentIncidentResponseDto {
  success: boolean;
  incident_id: string;
  status: string;
  resolved_at: string;
  message: string;
}

// ============================================================================
// EPIC-012 Eligible Waitlist & Exclusive Priority Offers DTOs
// ============================================================================

export interface CreateWaitlistEntryRequestDto {
  restaurant_id: string;
  party_size: number;
  requested_start: string; // ISO 8601 UTC
  table_id?: string;
  notes?: string;
}

export interface WaitlistEntryResponseDto {
  id: string;
  restaurant_id: string;
  user_id: string;
  party_size: number;
  requested_start: string;
  requested_end?: string | null;
  table_id?: string | null;
  priority_score: number;
  status: WaitlistStatus | string;
  position: number;
  estimated_wait_minutes?: number;
  skip_reason?: string | null;
  created_at: string;
}

export interface WaitlistOfferResponseDto {
  id: string;
  waitlist_entry_id: string;
  restaurant_id: string;
  table_id: string;
  allocation_id: string;
  offered_start?: string;
  offered_end?: string;
  expires_at: string;
  server_time: string;
  status: WaitlistOfferStatus | string;
  seconds_remaining: number;
  deposit_required: boolean;
  deposit_amount_minor: number;
  currency: string;
  created_at: string;
}

export interface AcceptWaitlistOfferResponseDto {
  offer_id: string;
  booking_id: string;
  status: string;
  policy_mode: PolicyMode | string;
  payment_order_required: boolean;
  gateway_order_id?: string | null;
  amount_minor?: number;
  currency?: string;
  message: string;
}

export interface DeclineWaitlistOfferResponseDto {
  offer_id: string;
  status: string;
  released: boolean;
  message: string;
}

export interface LeaveWaitlistResponseDto {
  entry_id: string;
  status: string;
  message: string;
}

export interface WaitlistPromotionResultDto {
  promoted: boolean;
  offer_id?: string | null;
  waitlist_entry_id?: string | null;
  table_id: string;
  allocation_status: string;
  skipped_count: number;
  reason?: string | null;
}

// ============================================================================
// EPIC-013 Transactional Events, Private Realtime & Notifications DTOs
// ============================================================================

export interface EventEnvelopeDto<T = Record<string, unknown>> {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  sequence_number: number;
  occurred_at: string;
  restaurant_id?: string | null;
  user_id?: string | null;
  payload: T;
}

export interface AuthorizeTopicRequestDto {
  topic: string; // e.g. "user:<userId>" or "restaurant:<restaurantId>" or "booking:<bookingId>"
}

export interface AuthorizeTopicResponseDto {
  authorized: boolean;
  topic: string;
  topic_type: RealtimeTopicType | string;
  recipient_id: string;
  expires_at: string;
  token: string;
  allowed_events: string[];
}

export interface OutboxEventResponseDto {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: OutboxEventStatus | string;
  attempts: number;
  max_attempts: number;
  claimed_by?: string | null;
  claimed_at?: string | null;
  claim_expires_at?: string | null;
  next_retry_at?: string | null;
  last_error?: string | null;
  published_at?: string | null;
  sequence_number: number;
  restaurant_id?: string | null;
  user_id?: string | null;
  created_at: string;
}

export interface OutboxQueryDto {
  status?: OutboxEventStatus | string;
  aggregate_type?: string;
  aggregate_id?: string;
  limit?: number;
  offset?: number;
}

export interface ProcessOutboxBatchRequestDto {
  batch_size?: number;
  worker_id?: string;
  channels?: NotificationChannel[];
  simulate_provider_failure?: boolean;
}

export interface ProcessOutboxBatchResponseDto {
  processed_count: number;
  published_count: number;
  failed_count: number;
  dead_letter_count: number;
  skipped_duplicate_count: number;
  events: Array<{
    event_id: string;
    event_type: string;
    status: string;
    deliveries: Array<{
      channel: string;
      status: string;
      duplicate: boolean;
    }>;
  }>;
}

export interface NotificationDeliveryResponseDto {
  id: string;
  outbox_event_id: string;
  recipient_id: string;
  channel: NotificationChannel | string;
  idempotency_key: string;
  status: NotificationDeliveryStatus | string;
  attempts: number;
  payload: Record<string, unknown>;
  last_error?: string | null;
  delivered_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationDeliveryQueryDto {
  recipient_id?: string;
  channel?: NotificationChannel | string;
  status?: NotificationDeliveryStatus | string;
  outbox_event_id?: string;
  limit?: number;
  offset?: number;
}

export interface ClientSyncStateRequestDto {
  booking_id: string;
  last_seen_sequence?: number;
  last_seen_version?: number;
}

export interface ClientSyncStateResponseDto {
  booking_id: string;
  canonical_status: BookingStatus | string;
  allocation_status?: AllocationStatus | string;
  version: number;
  latest_sequence_number: number;
  is_stale: boolean;
  missed_events_count: number;
  booking: BookingLifecycleDetailDto;
  reconnect_recommended: boolean;
}
