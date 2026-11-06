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
