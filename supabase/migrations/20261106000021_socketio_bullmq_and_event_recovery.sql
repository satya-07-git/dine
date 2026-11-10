-- ============================================================================
-- Migration: 20261106000021_socketio_bullmq_and_event_recovery.sql
-- Description: EPIC-024 Socket.IO, BullMQ and database event recovery upgrade.
--              Defines sequenced reservation events history, database replay
--              retention cursors, and durable BullMQ worker job tracking.
-- ============================================================================

-- 1. Sequenced Reservation Events History Table
CREATE TABLE IF NOT EXISTS reservation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  sequence_number INTEGER NOT NULL DEFAULT 1,
  event_type VARCHAR(100) NOT NULL,
  from_state VARCHAR(50),
  to_state VARCHAR(50),
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Sequencing Indexes
CREATE INDEX IF NOT EXISTS idx_reservation_events_booking_seq
  ON reservation_events (booking_id, sequence_number ASC);

CREATE INDEX IF NOT EXISTS idx_reservation_events_booking_ver
  ON reservation_events (booking_id, version ASC);

CREATE INDEX IF NOT EXISTS idx_reservation_events_restaurant_created
  ON reservation_events (restaurant_id, created_at DESC);

-- Append-Only Enforcement for Audit & Historical Integrity
CREATE OR REPLACE FUNCTION trg_reservation_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'RESERVATION_EVENTS_IMMUTABLE: Updates and deletes are prohibited on sequenced history';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_reservation_events_append_only ON reservation_events;
CREATE TRIGGER trg_enforce_reservation_events_append_only
  BEFORE UPDATE OR DELETE ON reservation_events
  FOR EACH ROW
  EXECUTE FUNCTION trg_reservation_events_immutable();

-- 2. Database Event Recovery Retention Cursors Table
CREATE TABLE IF NOT EXISTS event_recovery_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('BOOKING', 'RESTAURANT', 'TABLE')),
  entity_id UUID NOT NULL,
  min_retained_sequence INTEGER NOT NULL DEFAULT 1,
  max_retained_sequence INTEGER NOT NULL DEFAULT 1,
  min_retained_version INTEGER NOT NULL DEFAULT 1,
  max_retained_version INTEGER NOT NULL DEFAULT 1,
  retention_window_seconds INTEGER NOT NULL DEFAULT 86400,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_event_recovery_cursors_lookup
  ON event_recovery_cursors (entity_type, entity_id);

-- 3. Durable BullMQ Worker Jobs Table
CREATE TABLE IF NOT EXISTS bullmq_queue_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(100) NOT NULL,
  job_id VARCHAR(255) NOT NULL UNIQUE,
  entity_id UUID NOT NULL,
  job_type VARCHAR(100) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  dead_letter_reason TEXT,
  recovery_owner VARCHAR(100) DEFAULT 'PLATFORM_OPERATIONS',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bullmq_queue_claim
  ON bullmq_queue_jobs (queue_name, status, scheduled_for ASC);

CREATE INDEX IF NOT EXISTS idx_bullmq_queue_entity
  ON bullmq_queue_jobs (entity_id, queue_name);

-- 4. Row Level Security Policies
ALTER TABLE reservation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_recovery_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE bullmq_queue_jobs ENABLE ROW LEVEL SECURITY;

-- Customer read own reservation events
DROP POLICY IF EXISTS reservation_events_customer_read ON reservation_events;
CREATE POLICY reservation_events_customer_read ON reservation_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      JOIN profiles p ON p.id = b.user_id
      WHERE b.id = reservation_events.booking_id
        AND p.auth_uid = auth.uid()
    )
  );

-- Staff read restaurant reservation events
DROP POLICY IF EXISTS reservation_events_staff_read ON reservation_events;
CREATE POLICY reservation_events_staff_read ON reservation_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.restaurant_id = reservation_events.restaurant_id
        AND p.auth_uid = auth.uid()
        AND m.status = 'ACTIVE'
    )
    OR auth.role() = 'service_role'
  );

-- Recovery cursors read for authenticated customers & staff
DROP POLICY IF EXISTS event_recovery_cursors_read ON event_recovery_cursors;
CREATE POLICY event_recovery_cursors_read ON event_recovery_cursors
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Operational BullMQ jobs read for staff & service role
DROP POLICY IF EXISTS bullmq_queue_jobs_read ON bullmq_queue_jobs;
CREATE POLICY bullmq_queue_jobs_read ON bullmq_queue_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_memberships m
      WHERE m.user_id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );
