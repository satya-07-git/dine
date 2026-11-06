-- ============================================================================
-- Migration 010: Payment Orders, Verified Webhook Inbox & Monotonic State Tracking
-- Authoritative schema evolution for EPIC-010 Payments Stage E.
-- ============================================================================

-- 1. Ensure payment_attempts table exists with constraints and tracking columns
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  gateway VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY',
  gateway_order_id VARCHAR(100) NOT NULL UNIQUE,
  amount_minor INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance and lookup indexes for payment attempts
CREATE INDEX IF NOT EXISTS idx_payment_attempts_booking
  ON payment_attempts (booking_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_gateway_order
  ON payment_attempts (gateway_order_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_status
  ON payment_attempts (status);

-- 2. Ensure payment_events table exists for durable webhook deduplication
CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gateway_event_id VARCHAR(100) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes for webhook inbox lookups and event auditing
CREATE INDEX IF NOT EXISTS idx_payment_events_gateway_event
  ON payment_events (gateway_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_event_type
  ON payment_events (event_type, processed_at);

-- 3. Row Level Security for payment_attempts
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_attempts_customer_read ON payment_attempts;
CREATE POLICY payment_attempts_customer_read ON payment_attempts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN profiles p ON p.id = b.user_id
      WHERE b.id = payment_attempts.booking_id
        AND p.auth_uid = auth.uid()
    )
  );

DROP POLICY IF EXISTS payment_attempts_staff_read ON payment_attempts;
CREATE POLICY payment_attempts_staff_read ON payment_attempts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN restaurant_memberships m ON m.restaurant_id = b.restaurant_id
      JOIN profiles p ON p.id = m.user_id
      WHERE b.id = payment_attempts.booking_id
        AND p.auth_uid = auth.uid()
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'MANAGER', 'HOST')
    )
  );

-- 4. Row Level Security for payment_events
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_events_service_only ON payment_events;
CREATE POLICY payment_events_service_only ON payment_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
