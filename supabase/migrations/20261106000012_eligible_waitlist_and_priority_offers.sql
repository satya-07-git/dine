-- ============================================================================
-- Migration: 20261106000012_eligible_waitlist_and_priority_offers.sql
-- Description: EPIC-012 Eligible waitlist, exclusive priority offers, FIFO queue,
--              safe release triggers, bounded skip reasons, and no auto-charge.
-- ============================================================================

-- 1. Extend waitlist_entries with queue identity and interval eligibility (T01)
ALTER TABLE waitlist_entries
ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS requested_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS skip_reason TEXT;

-- Enforce deterministic FIFO queue ordering and lookup
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_fifo
    ON waitlist_entries (restaurant_id, status, created_at ASC, id ASC);

-- Enforce unique active entry per user, restaurant, and requested slot (T01)
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_entries_active_unique
    ON waitlist_entries (restaurant_id, user_id, requested_start)
    WHERE status IN ('WAITING', 'OFFER_EXTENDED');

-- 2. Enhance waitlist_offers with allocation uniqueness, timing, and versioning (T02)
ALTER TABLE waitlist_offers
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS offered_start TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS offered_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Exactly ONE active exclusive offer per allocation at any time (T02)
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_offers_active_allocation
    ON waitlist_offers (allocation_id)
    WHERE status = 'OFFERED';

-- Exactly ONE active offer per waitlist entry
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_offers_active_entry
    ON waitlist_offers (waitlist_entry_id)
    WHERE status = 'OFFERED';

CREATE INDEX IF NOT EXISTS idx_waitlist_offers_expiry
    ON waitlist_offers (status, expires_at);

-- 3. Bounded Skip Reasons & Audit Tracking (T04)
CREATE TABLE IF NOT EXISTS waitlist_skip_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waitlist_entry_id UUID NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    skip_reason TEXT NOT NULL CHECK (
        skip_reason IN (
            'CAPACITY_MISMATCH',
            'PARTY_SIZE_TOO_LARGE',
            'PARTY_SIZE_TOO_SMALL',
            'INTERVAL_CONFLICT',
            'RESTAURANT_CLOSED',
            'ENTRY_ALREADY_RESOLVED'
        )
    ),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_skip_logs_entry
    ON waitlist_skip_logs (waitlist_entry_id);

CREATE INDEX IF NOT EXISTS idx_waitlist_skip_logs_restaurant
    ON waitlist_skip_logs (restaurant_id, evaluated_at);

-- 4. Row Level Security Policies
ALTER TABLE waitlist_skip_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_skip_logs_staff_access ON waitlist_skip_logs;
CREATE POLICY waitlist_skip_logs_staff_access ON waitlist_skip_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = waitlist_skip_logs.restaurant_id
              AND m.user_id = auth.uid()
              AND m.status = 'ACTIVE'
        )
    );
