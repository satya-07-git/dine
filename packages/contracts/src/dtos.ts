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
  ReviewStatus,
  SeatingPreference,
  SupportInterventionType,
  PrivacyErasureStatus,
  BackgroundJobType,
  BackgroundJobStatus,
  WorkerStatus,
  ReleaseGateStatus,
  ReleaseDecision,
  StagingEnvironment,
  DeferredExtensionId,
  ExtensionStatus,
  ScaleTriggerMetric,
  InventoryClaimState,
  ReservationHoldStatus,
  V2ReservationStatus,
  V2PaymentMode,
  V2PaymentStatus,
  V2RefundStatus,
  V2IdempotencyRecordStatus,
} from './enums';
import { ProblemDetails, ErrorCode } from './errors';

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
  package_id?: string;
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
  package?: PackageSnapshotDto | null;
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

// ============================================================================
// EPIC-014 Owner Operations, Check-in and Walk-ins DTOs
// ============================================================================

export interface OwnerBookingListQueryDto {
  status?: BookingStatus | string;
  date?: string; // YYYY-MM-DD
  is_walk_in?: boolean;
  limit?: number;
  offset?: number;
}

export interface OwnerBookingResponseDto {
  id: string;
  restaurant_id: string;
  user_id?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  party_size: number;
  requested_start: string;
  dining_period?: {
    start: string;
    end: string;
  };
  status: BookingStatus | string;
  allocation_status?: AllocationStatus | string;
  table_id?: string | null;
  table_number?: string | null;
  floor_id?: string | null;
  floor_name?: string | null;
  is_walk_in: boolean;
  version: number;
  checked_in_at?: string | null;
  ready_at?: string | null;
  seated_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  no_show_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnerBookingListResponseDto {
  items: OwnerBookingResponseDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface GenerateCheckInQrResponseDto {
  booking_id: string;
  restaurant_id: string;
  qr_token: string;
  expires_at: string;
  qr_payload: string;
}

export interface CheckInRequestDto {
  qr_token?: string;
  booking_id?: string;
}

export interface CheckInResponseDto {
  success: boolean;
  booking_id: string;
  restaurant_id: string;
  status: BookingStatus | string;
  checked_in_at: string;
  is_repeat: boolean;
  message: string;
}

export interface RecordWalkInRequestDto {
  restaurant_id: string;
  table_id: string;
  party_size: number;
  guest_name?: string;
  guest_phone?: string;
  guest_email?: string;
  duration_min?: number;
  notes?: string;
}

export interface WalkInResponseDto {
  booking_id: string;
  allocation_id: string;
  restaurant_id: string;
  table_id: string;
  table_number: string;
  party_size: number;
  status: BookingStatus | string;
  allocation_status: AllocationStatus | string;
  seated_at: string;
  dining_period: {
    start: string;
    end: string;
  };
  is_walk_in: boolean;
  version: number;
  message: string;
}

export interface CreateTableBlockRequestDto {
  table_id: string;
  start_time: string; // ISO 8601 UTC
  end_time: string;   // ISO 8601 UTC
  reason: string;
  force?: boolean;
}

export interface TableBlockResponseDto {
  id: string;
  table_id: string;
  restaurant_id: string;
  block_period: {
    start: string;
    end: string;
  };
  reason: string;
  created_by?: string | null;
  created_at: string;
}

export interface TableBlockListQueryDto {
  table_id?: string;
  date?: string;
}

// ============================================================================
// EPIC-015 Dining Experiences & Package Contracts DTOs
// ============================================================================

export interface PackageSnapshotDto {
  id: string;
  package_id?: string;
  name: string;
  price_minor: number;
  currency: string;
  duration_min: number;
  version: number;
  terms_and_conditions?: string | null;
}

export interface RestaurantPackageDto {
  id: string;
  restaurant_id: string;
  name: string;
  slug: string;
  description?: string | null;
  price_minor: number;
  currency: string;
  duration_min: number;
  min_party_size: number;
  max_party_size: number;
  is_published: boolean;
  version: number;
  terms_and_conditions?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackageListResponseDto {
  restaurant_id: string;
  count: number;
  packages: RestaurantPackageDto[];
}

export interface CreatePackageRequestDto {
  name: string;
  slug?: string;
  description?: string;
  price_minor: number;
  currency?: string;
  duration_min: number;
  min_party_size: number;
  max_party_size: number;
  is_published?: boolean;
  terms_and_conditions?: string;
}

export interface UpdatePackageRequestDto {
  name?: string;
  slug?: string;
  description?: string;
  price_minor?: number;
  currency?: string;
  duration_min?: number;
  min_party_size?: number;
  max_party_size?: number;
  is_published?: boolean;
  terms_and_conditions?: string;
}

// ============================================================================
// EPIC-016 Favorites, Reviews and Customer Preferences DTOs
// ============================================================================

export interface FavoriteRestaurantDto {
  id: string;
  restaurant_id: string;
  user_id: string;
  created_at: string;
  restaurant_name?: string;
  restaurant_cuisine?: string;
  cover_image_url?: string | null;
  price_tier?: string;
}

export interface AddFavoriteRequestDto {
  restaurant_id: string;
}

export interface AddFavoriteResponseDto {
  success: boolean;
  is_new: boolean;
  favorite: FavoriteRestaurantDto;
}

export interface RemoveFavoriteResponseDto {
  success: boolean;
  restaurant_id: string;
  message: string;
}

export interface FavoriteListResponseDto {
  items: FavoriteRestaurantDto[];
  total: number;
}

export interface CustomerPreferenceDto {
  id: string;
  user_id: string;
  dietary_requirements: string[];
  seating_preference: SeatingPreference | string;
  allergies: string[];
  special_notes?: string | null;
  marketing_opt_in: boolean;
  created_at?: string;
  updated_at: string;
}

export interface UpdateCustomerPreferenceDto {
  dietary_requirements?: string[];
  seating_preference?: SeatingPreference | string;
  allergies?: string[];
  special_notes?: string | null;
  marketing_opt_in?: boolean;
}

export interface CreateReviewRequestDto {
  booking_id: string;
  rating: number;
  title?: string;
  comment: string;
}

export interface PublicReviewDto {
  id: string;
  restaurant_id: string;
  rating: number;
  title?: string | null;
  comment: string;
  customer_display_name: string;
  created_at: string;
  owner_response?: string | null;
  owner_responded_at?: string | null;
}

export interface PublicReviewListResponseDto {
  restaurant_id: string;
  average_rating: number;
  total_reviews: number;
  reviews: PublicReviewDto[];
}

export interface CustomerReviewDetailDto {
  id: string;
  restaurant_id: string;
  restaurant_name?: string;
  booking_id: string;
  rating: number;
  title?: string | null;
  comment: string;
  status: ReviewStatus | string;
  created_at: string;
  updated_at: string;
  owner_response?: string | null;
  owner_responded_at?: string | null;
}

export interface OwnerReviewDto {
  id: string;
  restaurant_id: string;
  booking_id: string;
  user_id: string;
  customer_name?: string;
  rating: number;
  title?: string | null;
  comment: string;
  status: ReviewStatus | string;
  moderation_notes?: string | null;
  owner_response?: string | null;
  owner_responded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnerReviewListResponseDto {
  restaurant_id: string;
  total: number;
  items: OwnerReviewDto[];
}

export interface RespondToReviewRequestDto {
  response: string;
}

export interface ModerateReviewRequestDto {
  status: ReviewStatus | string;
  moderation_notes?: string;
}

export interface BookingPreferencesStaffResponseDto {
  booking_id: string;
  restaurant_id: string;
  user_id: string;
  dietary_requirements: string[];
  seating_preference: string;
  allergies: string[];
  special_notes?: string | null;
}

// ============================================================================
// EPIC-017 Audit, Support and Privacy Controls DTOs
// ============================================================================

export interface AuditEnvelopeDto {
  actor_id?: string | null;
  actor_role?: string;
  restaurant_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  reason?: string | null;
  diff?: Record<string, unknown> | null;
  request_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntryDto {
  id: string;
  actor_id?: string | null;
  actor_role?: string;
  restaurant_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  reason?: string | null;
  diff?: Record<string, unknown> | null;
  request_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogQueryDto {
  restaurant_id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
  request_id?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogListResponseDto {
  total: number;
  limit: number;
  offset: number;
  items: AuditLogEntryDto[];
}

export interface SupportInterventionRequestDto {
  booking_id?: string;
  restaurant_id?: string;
  intervention_type: SupportInterventionType | string;
  reason: string;
  ticket_id?: string;
  override_status?: string;
  compensation_minor?: number;
  notes?: string;
}

export interface SupportInterventionResponseDto {
  id: string;
  ticket_id?: string | null;
  actor_id: string;
  actor_role: string;
  restaurant_id?: string | null;
  booking_id?: string | null;
  intervention_type: SupportInterventionType | string;
  reason: string;
  prior_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
  request_id?: string | null;
  created_at: string;
  message: string;
}

export interface SupportIncidentTraceDto {
  booking_id: string;
  restaurant_id: string;
  customer_id?: string | null;
  status: string;
  dining_period?: {
    start: string;
    end: string;
  } | null;
  allocations: Array<{
    id: string;
    table_id: string;
    status: string;
    dining_period?: string;
  }>;
  status_events: Array<{
    id: string;
    from_status: string;
    to_status: string;
    actor_id?: string | null;
    actor_role?: string;
    reason?: string | null;
    sequence_number: number;
    created_at: string;
  }>;
  payment_attempts: Array<{
    id: string;
    status: string;
    amount_minor: number;
    currency: string;
    reconciliation_status?: string;
    gateway_order_id?: string | null;
    created_at: string;
  }>;
  refunds: Array<{
    id: string;
    amount_minor: number;
    status: string;
    reason?: string | null;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    channel: string;
    status: string;
    created_at: string;
  }>;
  audit_logs: AuditLogEntryDto[];
  interventions: SupportInterventionResponseDto[];
}

export interface IncidentExportRequestDto {
  booking_id: string;
  reason: string;
  format?: 'JSON' | 'CSV';
  ticket_id?: string;
}

export interface IncidentExportResponseDto {
  export_id: string;
  booking_id: string;
  exported_at: string;
  exported_by: string;
  reason: string;
  ticket_id?: string | null;
  redacted_evidence: SupportIncidentTraceDto;
  checksum_sha256: string;
}

export interface PrivacyErasureRequestDto {
  user_id?: string;
  reason?: string;
}

export interface PrivacyErasureResponseDto {
  request_id: string;
  user_id: string;
  status: PrivacyErasureStatus | string;
  has_financial_records: boolean;
  profile_anonymized: boolean;
  preferences_deleted: boolean;
  favorites_deleted: boolean;
  financial_records_retained_count: number;
  audit_evidence_retained_count: number;
  message: string;
}

// ============================================================================
// EPIC-018 Background Jobs, Observability and Recovery DTOs
// ============================================================================

export interface BackgroundJobDto {
  id: string;
  job_type: BackgroundJobType | string;
  status: BackgroundJobStatus | string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  claimed_at?: string | null;
  claimed_by?: string | null;
  claim_expires_at?: string | null;
  next_retry_at?: string | null;
  last_error?: string | null;
  dead_letter_reason?: string | null;
  execution_duration_ms?: number | null;
  result_summary?: Record<string, unknown> | null;
  created_at: string;
  completed_at?: string | null;
}

export interface TriggerJobRequestDto {
  job_type: BackgroundJobType | string;
  payload?: Record<string, unknown>;
  max_attempts?: number;
}

export interface TriggerJobResponseDto {
  job: BackgroundJobDto;
  message: string;
}

export interface WorkerHeartbeatRequestDto {
  worker_id: string;
  worker_name: string;
  hostname: string;
  status?: WorkerStatus | string;
  current_job_id?: string | null;
  metrics?: {
    processed_count: number;
    error_count: number;
    uptime_seconds: number;
  };
}

export interface WorkerHeartbeatResponseDto {
  worker_id: string;
  status: WorkerStatus | string;
  acknowledged_at: string;
  is_healthy: boolean;
}

export interface WorkerSummaryDto {
  worker_id: string;
  worker_name: string;
  hostname: string;
  status: WorkerStatus | string;
  last_heartbeat_at: string;
  started_at: string;
  current_job_id?: string | null;
  metrics: {
    processed_count: number;
    error_count: number;
    uptime_seconds: number;
  };
}

export interface WorkerListResponseDto {
  total: number;
  active_count: number;
  workers: WorkerSummaryDto[];
}

export interface DeadLetterJobListResponseDto {
  total: number;
  jobs: BackgroundJobDto[];
}

export interface RetryDeadLetterResponseDto {
  job_id: string;
  status: BackgroundJobStatus | string;
  message: string;
  requeued_at: string;
}

export interface OperationalMetricsQueryDto {
  metric_name?: string;
  since?: string;
}

export interface OperationalMetricsResponseDto {
  hold_conflicts: number;
  lock_wait_ms: number;
  payment_review_age_seconds: number;
  outbox_age_seconds: number;
  error_rate_percent: number;
  availability_read_p95_ms: number;
  uncontended_hold_p95_ms: number;
  recorded_at: string;
}

export interface DisasterRecoveryRehearsalDto {
  snapshot_tag: string;
  verify_invariants?: boolean;
}

export interface DisasterRecoveryReportDto {
  rehearsal_id: string;
  executed_at: string;
  snapshot_tag: string;
  status: 'RECOVERED_COHERENT' | 'INVARIANT_VIOLATIONS_DETECTED';
  checks: {
    allocation_overlap_count: number;
    orphan_payment_count: number;
    audit_chain_integrity: boolean;
    unreconciled_holds_count: number;
  };
  details: string;
}

export interface PerformanceSloReportDto {
  environment: string;
  measured_at: string;
  slo_benchmarks: {
    availability_read: {
      target: string;
      measured_p95_ms: number;
      compliant: boolean;
    };
    uncontended_hold: {
      target: string;
      measured_p95_ms: number;
      compliant: boolean;
    };
    concurrency_winner_ratio: {
      target: string;
      measured: string;
      compliant: boolean;
    };
  };
}

// ============================================================================
// EPIC-019 Backend Verification, Staging & Release Gates DTOs
// ============================================================================

export interface AcceptanceMatrixItemDto {
  scenario_id: string;
  owning_epic: string;
  source_section: string;
  description: string;
  expected_result: string;
  test_suite: string;
  status: 'VERIFIED' | 'PENDING' | 'FAILED';
}

export interface AcceptanceMatrixResponseDto {
  total: number;
  verified_count: number;
  items: AcceptanceMatrixItemDto[];
}

export interface ConcurrencyCheckRequestDto {
  table_id?: string;
  concurrency_level?: number;
  slot_start?: string;
}

export interface ConcurrencyCheckResponseDto {
  table_id: string;
  total_attempts: number;
  winners_count: number;
  conflicts_count: number;
  winner_hold_id: string;
  status: 'PASSED' | 'FAILED';
  invariant_maintained: boolean;
  message: string;
}

export interface PaymentRecoveryReplayRequestDto {
  scenario: 'LATE_CAPTURE' | 'WEBHOOK_DUPLICATE' | 'OUT_OF_ORDER' | 'NETWORK_LOSS';
}

export interface PaymentRecoveryReplayResponseDto {
  scenario: string;
  idempotent: boolean;
  inventory_preserved: boolean;
  refund_dispatched: boolean;
  status: 'PASSED' | 'FAILED';
  details: string;
}

export interface PromoterConflictReplayResponseDto {
  queue_promoters_simulated: number;
  exclusive_offers_created: number;
  conflicts_avoided: number;
  walk_in_contention_handled: boolean;
  status: 'PASSED' | 'FAILED';
  message: string;
}

export interface SecurityAndLoadCheckResponseDto {
  cross_tenant_access_denied: boolean;
  private_realtime_joins_denied: boolean;
  secrets_redacted_count: number;
  restore_rehearsal_verified: boolean;
  status: 'PASSED' | 'FAILED';
  message: string;
}

export interface ReleaseGateItemDto {
  gate_id: string;
  gate_name: string;
  owning_epic: string;
  status: ReleaseGateStatus | string;
  decision: ReleaseDecision | string;
  accountable_owner: string;
  blocking_reason?: string | null;
}

export interface StagingGoNoGoDecisionDto {
  evaluated_at: string;
  environment: StagingEnvironment | string;
  overall_decision: ReleaseDecision | string;
  live_money_allowed: boolean;
  commercial_gates_unresolved: string[];
  staging_gates_passed: number;
  total_gates: number;
  observation_owner: string;
  recovery_owner: string;
  gates: ReleaseGateItemDto[];
}

export interface StagingVerificationRunDto {
  id: string;
  run_tag: string;
  environment: string;
  suite_name: string;
  status: string;
  total_checks: number;
  passed_checks: number;
  failed_checks: number;
  evidence: Record<string, unknown>;
  executed_by: string;
  started_at: string;
  completed_at?: string | null;
}

export interface CreateVerificationRunDto {
  run_tag: string;
  suite_name: string;
  environment?: string;
}


// ============================================================================
// EPIC-020 Future Extensions and Unresolved Scope Definition DTOs
// ============================================================================

export interface DeferredExtensionItemDto {
  id: DeferredExtensionId | string;
  name: string;
  status: ExtensionStatus | string;
  accountable_owner: string;
  rationale: string;
  missing_requirements: string[];
  prerequisites: string[];
  risk_level: 'High' | 'Medium' | 'Low';
  threat_concerns: string[];
}

export interface DeferredScopeRegisterResponseDto {
  total: number;
  deferred_count: number;
  under_review_count: number;
  blocked_count: number;
  items: DeferredExtensionItemDto[];
}

export interface ExtensionFeasibilityAssessmentRequestDto {
  extension_id: DeferredExtensionId | string;
  proposed_tables_to_lock?: string[];
  bypass_trusted_inventory?: boolean;
  proposes_speculative_schema?: boolean;
}

export interface ExtensionFeasibilityAssessmentResponseDto {
  extension_id: string;
  feasible: boolean;
  status: 'REJECTED' | 'CONDITIONAL_APPROVAL' | 'BLOCKED_ON_INVARIANTS';
  rejection_code?: ErrorCode | string;
  lock_order_verified?: boolean;
  sorted_table_locks?: string[];
  invariant_violations: string[];
  required_actions: string[];
}

export interface MicroserviceDecompositionScaleCheckRequestDto {
  daily_reservations: number;
  concurrent_active_holds: number;
  db_connection_pool_saturation_pct: number;
  backend_engineers_count: number;
  availability_read_p95_ms: number;
}

export interface MicroserviceDecompositionScaleCheckResponseDto {
  decomposition_justified: boolean;
  monolith_architecture_retained: boolean;
  status: 'RETAIN_MODULAR_MONOLITH' | 'SCALE_TRIGGER_BREACHED';
  evaluated_metrics: {
    reservations_per_day: { value: number; threshold: number; breached: boolean };
    concurrent_active_holds: { value: number; threshold: number; breached: boolean };
    db_connection_saturation: { value: number; threshold: number; breached: boolean };
    team_contention: { value: number; threshold: number; breached: boolean };
    p95_read_latency: { value: number; threshold: number; breached: boolean };
  };
  adr_reference: string;
  recommendation: string;
}

export interface UnresolvedContractItemDto {
  contract_id: string;
  title: string;
  domain: string;
  status: string;
  accountable_owner: string;
  problem_statement: string;
  resolution_requirement: string;
  gating_impact: string;
}

export interface UnresolvedContractsRegisterResponseDto {
  total: number;
  contracts: UnresolvedContractItemDto[];
}

export interface SimulateDeferredRouteRequestDto {
  route_path: string;
  method: string;
}

export interface SimulateDeferredRouteResponseDto {
  route_path: string;
  method: string;
  status_code: number;
  error_code: ErrorCode | string;
  message: string;
  rfc7807_problem: ProblemDetails;
}

// ============================================================================
// EPIC-021 Finalized V2 Contracts, Claims and Compatibility DTOs
// ============================================================================

export interface V2AcquireHoldRequestDto {
  restaurantId: string;
  tableId: string;
  startsAt: string;
  partySize: number;
}

export interface V2AcquireHoldResponseDto {
  holdId: string;
  status: ReservationHoldStatus | string;
  tableId: string;
  claimId: string;
  expiresAt: string;
  serverTime: string;
  endsAt: string;
  effectiveEndsAt: string;
  payment: {
    mode: V2PaymentMode | string;
    amountPaise: number;
    currency: string;
  };
}

export interface V2FreeConfirmationRequestDto {
  holdId: string;
  restaurantId: string;
  partySize: number;
}

export interface V2FreeConfirmationResponseDto {
  reservationId: string;
  bookingReference: string;
  status: V2ReservationStatus | string;
  tableId: string;
  claimId: string;
  confirmedAt: string;
  startsAt: string;
  endsAt: string;
  paymentMode: V2PaymentMode | string;
}

export interface V2LatePaymentReconciliationRequestDto {
  paymentId: string;
  bookingId: string;
  tableId: string;
  amountPaise: number;
}

export interface V2LatePaymentReconciliationResponseDto {
  reconciliationId: string;
  action: 'REFUND_DISPATCHED' | 'PROCEED_CONFIRMATION' | 'MANUAL_ESCALATION';
  bAllocatedKept: boolean;
  refundInitiated: boolean;
  refundAmountPaise: number;
  message: string;
}

export interface V2CompatibilityMapResponseDto {
  routeAliases: Array<{
    method: string;
    canonicalRoute: string;
    legacyAlias: string;
    status: 'ACTIVE' | 'DEPRECATED';
  }>;
  schemaAuthority: {
    singleMigrationAuthority: string;
    migrationDirectory: string;
    prohibitedPatterns: string[];
  };
  claimModelMapping: {
    legacyEntity: string;
    v2Entity: string;
    states: string[];
    turnoverBufferRule: string;
  };
}

export interface V2StateMatrixResponseDto {
  claimStates: string[];
  holdStates: string[];
  reservationStates: string[];
  paymentStates: string[];
  reconciliationRules: string[];
}

export interface V2ConcurrencyProofRequestDto {
  tableId?: string;
  restaurantId?: string;
  concurrencyCount?: number;
}

export interface V2ConcurrencyProofResponseDto {
  totalRequests: number;
  winners: number;
  conflicts: number;
  winnerHoldId: string;
  exclusionEnforced: boolean;
  conflictCode: string;
  status: 'PASSED' | 'FAILED';
}

export interface V2SourceProvenanceResponseDto {
  textSources: Array<{
    name: string;
    sha256: string;
    status: 'VERIFIED';
  }>;
  diagrams: Array<{
    id: string;
    title: string;
    sha256: string;
    status: 'VERIFIED';
  }>;
  verifiedAt: string;
}

// EPIC-022 Phone OTP, Sessions and Manager Permission Upgrade DTOs
export interface RequestOtpRequestDto {
  phone: string;
}

export interface RequestOtpResponseDto {
  challengeId: string;
  phone: string;
  expiresInSeconds: number;
  message: string;
}

export interface VerifyOtpRequestDto {
  challengeId?: string;
  phone: string;
  otp: string;
}

export interface AuthSessionUserDto {
  id: string;
  phone: string;
  role: string;
  fullName?: string;
  email?: string;
}

export interface AuthSessionDto {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthSessionUserDto;
}

export interface RefreshTokenRequestDto {
  refreshToken: string;
}

export interface LogoutRequestDto {
  sessionId?: string;
  refreshToken?: string;
}

export interface LogoutResponseDto {
  success: boolean;
  message: string;
  revokedAt: string;
}

export interface RestaurantStaffDto {
  id: string;
  restaurantId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    fullName?: string;
    email?: string;
    phone?: string;
  };
}

export interface CreateRestaurantStaffDto {
  userId: string;
  role: 'MANAGER' | 'HOST' | 'STAFF';
}

export interface UpdateRestaurantStaffDto {
  role?: 'MANAGER' | 'HOST' | 'STAFF';
  status?: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  reason?: string;
}

export interface PlatformOnboardRestaurantDto {
  name: string;
  slug?: string;
  description?: string;
  timezone?: string;
  policy_mode?: string;
  deposit_amount_minor?: number;
  deposit_currency?: string;
  owner_id?: string;
  owner_email?: string;
  owner_phone?: string;
  owner_name?: string;
  reason: string;
}

export interface PlatformOnboardRestaurantResponseDto {
  restaurant: any;
  owner: any;
  staffMembership: any;
  audited: boolean;
}

export interface RoleActionMatrixDto {
  role: string;
  allowedActions: string[];
  deniedActions: string[];
}


// ============================================================================
// EPIC-023 Automatic Table Recommendation Upgrade DTOs
// ============================================================================

export interface RecommendationComponentScoreDto {
  raw: number;
  weight: number;
  weighted: number;
}

export interface RecommendationScoreBreakdownDto {
  capacity_fit: RecommendationComponentScoreDto;
  preference_match: RecommendationComponentScoreDto;
  location_suitability: RecommendationComponentScoreDto;
  operational_efficiency: RecommendationComponentScoreDto;
}

export interface RecommendedCandidateDto {
  table_id: string;
  table_number: string;
  floor_id: string;
  floor_name?: string;
  zone: string;
  capacity: number;
  min_capacity: number;
  score: number;
  rank: number;
  score_breakdown: RecommendationScoreBreakdownDto;
  explanation: string;
}

export interface TableRecommendationRequestDto {
  restaurant_id: string;
  party_size: number;
  requested_start: string;
  seating_preference?: string;
  dietary_requirements?: string[];
  special_requests?: string;
  max_candidates?: number;
}

export interface TableRecommendationResponseDto {
  restaurant_id: string;
  party_size: number;
  requested_start: string;
  dining_period: {
    start: string;
    end: string;
  };
  total_eligible_tables: number;
  recommendations: RecommendedCandidateDto[];
  recommended_table_id: string | null;
  recommendation_only: boolean;
  timestamp: string;
}

export interface AutoHoldRequestDto {
  restaurant_id: string;
  party_size: number;
  requested_start: string;
  seating_preference?: string;
  dietary_requirements?: string[];
  special_requests?: string;
  retry_cap?: number;
  auto_recommend?: boolean;
  table_id?: string;
}

export interface AutoHoldResponseDto {
  hold_id: string;
  booking_id: string;
  restaurant_id: string;
  table_id: string;
  table_number: string;
  party_size: number;
  dining_period: {
    start: string;
    end: string;
  };
  expires_at: string;
  server_time: string;
  status: string;
  deposit: DepositSummaryDto;
  selection_mode: 'AUTOMATIC' | 'MANUAL';
  retries_attempted: number;
  recommended_rank_chosen: number;
  message: string;
}

// ============================================================================
// EPIC-024 Socket.IO, BullMQ and Database Event Recovery Upgrade DTOs
// ============================================================================

export interface SocketAuthorizeRequestDto {
  room: string;
  socket_id?: string;
}

export interface SocketAuthorizeResponseDto {
  authorized: boolean;
  room: string;
  room_type: 'restaurant' | 'booking';
  entity_id: string;
  audience: 'STAFF' | 'CUSTOMER' | 'PUBLIC_AVAILABILITY';
  expires_at: string;
  room_token: string;
  message: string;
}

export interface SocketEventEnvelopeDto<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  entityId: string;
  version: number;
  sequenceNumber: number;
  occurredAt: string;
  payload: T;
}

export interface EventReplayRequestDto {
  entity_id: string;
  since_sequence?: number;
  since_version?: number;
  limit?: number;
}

export interface EventReplayResponseDto {
  entity_id: string;
  mode: 'REPLAY' | 'SNAPSHOT_REQUIRED';
  current_version: number;
  current_sequence: number;
  events: SocketEventEnvelopeDto<any>[];
  resync_required: boolean;
  snapshot_url?: string;
  min_retained_sequence: number;
  message: string;
}

export interface BullJobDto {
  job_id: string;
  queue_name: string;
  entity_id: string;
  job_type: string;
  version: number;
  payload: Record<string, any>;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error?: string;
  dead_letter_reason?: string;
  recovery_owner?: string;
  scheduled_for: string;
  completed_at?: string;
}

export interface RedisRebuildRequestDto {
  queue_names?: string[];
  dry_run?: boolean;
}

export interface RedisRebuildResponseDto {
  reconstructed_jobs: {
    hold_expiry: number;
    payment_reconciliation: number;
    outbox_dispatch: number;
    total: number;
  };
  queue_state: 'ONLINE' | 'DEGRADED';
  rebuilt_from: 'POSTGRESQL_AUTHORITATIVE';
  timestamp: string;
}

export interface DeadLetterListResponseDto {
  total: number;
  jobs: BullJobDto[];
  recovery_owner: string;
}

export interface RealtimeMetricsResponseDto {
  ws_connected_clients: number;
  active_room_subscriptions: number;
  p95_delivery_latency_ms: number;
  db_contention_events: number;
  redis_queue_state: 'ONLINE' | 'DEGRADED';
  reconstructed_jobs_total: number;
  timestamp: string;
}
