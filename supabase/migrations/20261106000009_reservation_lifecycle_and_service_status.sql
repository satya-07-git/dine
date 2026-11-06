-- ============================================================================
-- Migration 008: Reservation Lifecycle, Guarded Service Transitions & Sequenced Status History
-- Authoritative schema evolution for EPIC-009 Booking Core.
-- ============================================================================

-- 1. Extend bookings table with optimistic version and service lifecycle timestamps
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Performance index for customer queries (GET /bookings)
CREATE INDEX IF NOT EXISTS idx_bookings_user_status
  ON bookings (user_id, status, requested_start DESC);

-- Performance index for staff operations (GET /owner/restaurants/:id/bookings)
CREATE INDEX IF NOT EXISTS idx_bookings_restaurant_status
  ON bookings (restaurant_id, status, requested_start);

-- 2. Extend booking_status_events table with sequenced history and audit tracking
ALTER TABLE booking_status_events
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index for ordered history queries
CREATE INDEX IF NOT EXISTS idx_booking_status_events_seq
  ON booking_status_events (booking_id, sequence_number ASC);

-- 3. Row Level Security for booking_status_events
ALTER TABLE booking_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_status_events_customer_read ON booking_status_events;
CREATE POLICY booking_status_events_customer_read ON booking_status_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN profiles p ON p.id = b.user_id
      WHERE b.id = booking_status_events.booking_id
        AND p.auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS booking_status_events_staff_read ON booking_status_events;
CREATE POLICY booking_status_events_staff_read ON booking_status_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN restaurant_memberships m ON m.restaurant_id = b.restaurant_id
      JOIN profiles p ON p.id = m.user_id
      WHERE b.id = booking_status_events.booking_id
        AND p.auth_uid = auth.uid()
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'MANAGER', 'HOST')
    )
  );
