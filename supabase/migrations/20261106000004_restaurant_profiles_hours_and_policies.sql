-- Migration: 20261106000004_restaurant_profiles_hours_and_policies.sql
-- Description: Restaurant profiles, operating hours, cuisines, policy history, closures, and RLS policies
-- Fulfills: EPIC-004 (Restaurant profiles, hours and policies)

-- ============================================================================
-- 1. Cuisines & Restaurant Cuisine Associations
-- ============================================================================
CREATE TABLE IF NOT EXISTS cuisines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_cuisines (
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    cuisine_id UUID NOT NULL REFERENCES cuisines(id) ON DELETE CASCADE,
    PRIMARY KEY (restaurant_id, cuisine_id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_cuisines_restaurant ON restaurant_cuisines(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_cuisines_cuisine ON restaurant_cuisines(cuisine_id);

-- ============================================================================
-- 2. Restaurant Schema Enhancements (Policies, Lead Times, Geometry)
-- ============================================================================
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS policy_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS deposit_currency VARCHAR(3) NOT NULL DEFAULT 'INR';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS min_party_size INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS max_party_size INTEGER NOT NULL DEFAULT 20;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lead_time_min_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lead_time_max_days INTEGER NOT NULL DEFAULT 60;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- PostGIS geography column (safe fallback if postgis extension is absent)
DO $$
BEGIN
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS location geography(Point, 4326);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Skipping geography location column creation (PostGIS not enabled)';
END
$$;

-- Add check constraints on restaurants if not already present
DO $$
BEGIN
    ALTER TABLE restaurants ADD CONSTRAINT chk_restaurants_party_size CHECK (max_party_size >= min_party_size AND min_party_size > 0);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE restaurants ADD CONSTRAINT chk_restaurants_lead_times CHECK (lead_time_min_minutes >= 0 AND lead_time_max_days > 0);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$$;

-- ============================================================================
-- 3. Restaurant Policy Version History (Immutable Audit of Policy Changes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS restaurant_policy_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    policy_mode TEXT NOT NULL CHECK (policy_mode IN ('FREE_RESERVATION', 'DEPOSIT_REQUIRED')),
    deposit_amount_minor INTEGER NOT NULL CHECK (deposit_amount_minor >= 0),
    deposit_currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    default_duration_min INTEGER NOT NULL CHECK (default_duration_min > 0),
    turnover_buffer_min INTEGER NOT NULL CHECK (turnover_buffer_min >= 0),
    min_party_size INTEGER NOT NULL CHECK (min_party_size > 0),
    max_party_size INTEGER NOT NULL CHECK (max_party_size >= min_party_size),
    lead_time_min_minutes INTEGER NOT NULL CHECK (lead_time_min_minutes >= 0),
    lead_time_max_days INTEGER NOT NULL CHECK (lead_time_max_days > 0),
    changed_by UUID REFERENCES profiles(id),
    change_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_policy_version UNIQUE (restaurant_id, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_history_restaurant ON restaurant_policy_history(restaurant_id, version DESC);

-- ============================================================================
-- 4. Special Closures Enhancement (Check start before end)
-- ============================================================================
DO $$
BEGIN
    ALTER TABLE special_closures ADD CONSTRAINT chk_special_closure_times CHECK (end_time > start_time);
EXCEPTION WHEN duplicate_object THEN
    NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_special_closures_restaurant_times ON special_closures(restaurant_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_opening_hours_restaurant_day ON opening_hours(restaurant_id, day_of_week);

-- ============================================================================
-- 5. Row Level Security (RLS) Policies for EPIC-004 Tables
-- ============================================================================

-- 5.1 Cuisines: Public read
ALTER TABLE cuisines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cuisines_public_read ON cuisines;
CREATE POLICY cuisines_public_read ON cuisines FOR SELECT USING (true);

-- 5.2 Restaurant Cuisines: Public read
ALTER TABLE restaurant_cuisines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS restaurant_cuisines_public_read ON restaurant_cuisines;
CREATE POLICY restaurant_cuisines_public_read ON restaurant_cuisines FOR SELECT USING (true);

-- 5.3 Opening Hours: Public read, staff manage
ALTER TABLE opening_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opening_hours_public_read ON opening_hours;
CREATE POLICY opening_hours_public_read ON opening_hours FOR SELECT USING (true);

DROP POLICY IF EXISTS opening_hours_staff_manage ON opening_hours;
CREATE POLICY opening_hours_staff_manage ON opening_hours
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = opening_hours.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role IN ('OWNER', 'MANAGER')
              AND m.status = 'ACTIVE'
        )
    );

-- 5.4 Special Closures: Public read, authorized scheduling staff manage
ALTER TABLE special_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS special_closures_public_read ON special_closures;
CREATE POLICY special_closures_public_read ON special_closures FOR SELECT USING (true);

DROP POLICY IF EXISTS special_closures_staff_manage ON special_closures;
CREATE POLICY special_closures_staff_manage ON special_closures
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = special_closures.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role IN ('OWNER', 'MANAGER')
              AND m.status = 'ACTIVE'
        )
    );

-- 5.5 Policy History: Owner read only
ALTER TABLE restaurant_policy_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS policy_history_owner_read ON restaurant_policy_history;
CREATE POLICY policy_history_owner_read ON restaurant_policy_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = restaurant_policy_history.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role = 'OWNER'
              AND m.status = 'ACTIVE'
        )
    );
