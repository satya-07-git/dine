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
