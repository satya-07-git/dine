-- ============================================================================
-- Migration: 20261106000014_owner_operations_checkin_and_walkins.sql
-- Description: EPIC-014 Owner operations, QR check-in, repeat-safe arrival,
--              walk-ins through the reservation core, and lateness grace period.
-- ============================================================================

-- 1. Extend bookings table for walk-ins, guest contact, and service milestones (T01, T03, T05)
ALTER TABLE bookings
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMPTZ;

-- Operational indices for staff search & date filtering
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_walk_in
  ON bookings (restaurant_id, is_walk_in, requested_start);

CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_date
  ON bookings (restaurant_id, requested_start);

-- 2. Create booking_check_in_tokens table for signed QR arrival tokens (T02)
CREATE TABLE IF NOT EXISTS booking_check_in_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_check_in_tokens_booking
  ON booking_check_in_tokens (booking_id);

CREATE INDEX IF NOT EXISTS idx_check_in_tokens_restaurant
  ON booking_check_in_tokens (restaurant_id, expires_at);

-- 3. Row Level Security for booking_check_in_tokens
ALTER TABLE booking_check_in_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS check_in_tokens_staff_manage ON booking_check_in_tokens;
CREATE POLICY check_in_tokens_staff_manage ON booking_check_in_tokens
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.restaurant_id = booking_check_in_tokens.restaurant_id
        AND p.auth_uid = auth.uid()
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'MANAGER', 'HOST')
    )
  );

DROP POLICY IF EXISTS check_in_tokens_customer_read ON booking_check_in_tokens;
CREATE POLICY check_in_tokens_customer_read ON booking_check_in_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN profiles p ON p.id = b.user_id
      WHERE b.id = booking_check_in_tokens.booking_id
        AND p.auth_uid = auth.uid()
    )
  );
