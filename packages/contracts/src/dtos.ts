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

export interface RestaurantResponseDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  timezone: string;
  policy_mode: PolicyMode;
  deposit_amount_minor: number;
  default_duration_min: number;
  turnover_buffer_min: number;
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
