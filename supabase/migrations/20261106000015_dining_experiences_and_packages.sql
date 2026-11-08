-- ============================================================================
-- Migration: 20261106000015_dining_experiences_and_packages.sql
-- Description: EPIC-015 Dining experiences, package contracts, bounded booking
--              rules, eligibility limits, duration/deposit calculation, and RLS.
-- ============================================================================

-- 1. Create packages table for dining experiences and celebration packages (T01, T03)
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    description TEXT,
    price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    duration_min INTEGER NOT NULL DEFAULT 90 CHECK (duration_min >= 30 AND duration_min <= 360),
    min_party_size INTEGER NOT NULL DEFAULT 1 CHECK (min_party_size > 0),
    max_party_size INTEGER NOT NULL DEFAULT 20 CHECK (max_party_size >= min_party_size),
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    terms_and_conditions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_package_slug UNIQUE (restaurant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_packages_restaurant_published
  ON packages (restaurant_id, is_published);

-- 2. Extend bookings table with package reference and snapshot (T02, T04)
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_bookings_package_id
  ON bookings (package_id);

-- 3. Row Level Security for packages
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packages_public_read ON packages;
CREATE POLICY packages_public_read ON packages
  FOR SELECT
  USING (is_published = TRUE);

DROP POLICY IF EXISTS packages_staff_manage ON packages;
CREATE POLICY packages_staff_manage ON packages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_memberships m
      JOIN profiles p ON p.id = m.user_id
      WHERE m.restaurant_id = packages.restaurant_id
        AND p.auth_uid = auth.uid()
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'MANAGER')
    )
  );
