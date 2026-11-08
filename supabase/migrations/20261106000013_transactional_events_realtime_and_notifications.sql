-- ============================================================================
-- Migration: 20261106000013_transactional_events_realtime_and_notifications.sql
-- Description: EPIC-013 Transactional events, private realtime broadcast, durable
--              outbox worker with claim/retry/dead-letter, delivery deduplication,
--              and private topic authorization.
-- ============================================================================

-- 1. Extend outbox_events with worker claim, retry backoff, dead-letter, and routing (T01, T02)
ALTER TABLE outbox_events
  DROP CONSTRAINT IF EXISTS outbox_events_status_check;

ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER'));

ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- High-performance worker claim index (supports SELECT ... FOR UPDATE SKIP LOCKED)
CREATE INDEX IF NOT EXISTS idx_outbox_events_worker_claim
  ON outbox_events (status, next_retry_at, created_at ASC);

-- Chronological aggregate history index
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate_seq
  ON outbox_events (aggregate_type, aggregate_id, sequence_number ASC);

-- 2. Extend notification_deliveries with deduplication key, retry attempts, and payload (T04)
ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill idempotency_key for existing delivery records if any
UPDATE notification_deliveries
SET idempotency_key = outbox_event_id::text || ':' || recipient_id::text || ':' || channel
WHERE idempotency_key IS NULL;

-- Unique delivery deduplication index: (outbox_event_id, recipient_id, channel)
-- Guarantees: Worker restart/duplicate delivery does NOT repeat a logical notification action
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_deliveries_dedup
  ON notification_deliveries (outbox_event_id, recipient_id, channel);

-- Recipient delivery history index
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recipient
  ON notification_deliveries (recipient_id, status, created_at DESC);

-- 3. Private Realtime Topic Authorizations Table (T03)
CREATE TABLE IF NOT EXISTS realtime_topic_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic VARCHAR(255) NOT NULL,
  topic_type VARCHAR(50) NOT NULL CHECK (topic_type IN ('USER', 'RESTAURANT', 'BOOKING')),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_realtime_topic_auth_token
  ON realtime_topic_authorizations (token, expires_at);

CREATE INDEX IF NOT EXISTS idx_realtime_topic_auth_user
  ON realtime_topic_authorizations (user_id, topic);

-- 4. Row Level Security Policies
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_events_staff_read ON outbox_events;
CREATE POLICY outbox_events_staff_read ON outbox_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.restaurant_id = outbox_events.restaurant_id
        AND p.auth_uid = auth.uid()
        AND m.status = 'ACTIVE'
    )
  );

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_deliveries_recipient_read ON notification_deliveries;
CREATE POLICY notification_deliveries_recipient_read ON notification_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = notification_deliveries.recipient_id
        AND p.auth_uid = auth.uid()
    )
  );

ALTER TABLE realtime_topic_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS realtime_topic_auth_user_read ON realtime_topic_authorizations;
CREATE POLICY realtime_topic_auth_user_read ON realtime_topic_authorizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = realtime_topic_authorizations.user_id
        AND p.auth_uid = auth.uid()
    )
  );
