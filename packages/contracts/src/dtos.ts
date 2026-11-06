/**
 * Shared Request and Response DTO interfaces for Dine API.
 */

import { BookingStatus, AllocationStatus, PolicyMode } from './enums';

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
