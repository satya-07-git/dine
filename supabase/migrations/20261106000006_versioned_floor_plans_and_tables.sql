-- ============================================================================
-- Migration: 20261106000006_versioned_floor_plans_and_tables.sql
-- Description: EPIC-006 Versioned floor plans and stable table inventory
--              Adds optimistic version tracking, geometry bounds checks,
--              capacity integrity constraints, and tenant RLS policies.
-- ============================================================================

-- 1. Floors: add optimistic version tracking and timestamp
ALTER TABLE floors 
    ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Floor Plan Versions: add snapshot, created_by, and unique constraint
ALTER TABLE floor_plan_versions
    ADD COLUMN IF NOT EXISTS layout_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_floor_version'
    ) THEN
        ALTER TABLE floor_plan_versions 
            ADD CONSTRAINT uq_floor_version UNIQUE (floor_id, version_number);
    END IF;
END $$;

-- 3. Restaurant Tables: check constraints for capacity and geometry bounds
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_table_min_covers'
    ) THEN
        ALTER TABLE restaurant_tables 
            ADD CONSTRAINT check_table_min_covers CHECK (min_covers > 0 AND min_covers <= capacity);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_table_geometry'
    ) THEN
        ALTER TABLE restaurant_tables 
            ADD CONSTRAINT check_table_geometry CHECK (x >= 0.0 AND y >= 0.0 AND w > 0.0 AND h > 0.0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_table_bounds'
    ) THEN
        ALTER TABLE restaurant_tables 
            ADD CONSTRAINT check_table_bounds CHECK (x + w <= 1000.0 AND y + h <= 1000.0);
    END IF;
END $$;

-- 4. Fast Lookup & Tenant Indexes
CREATE INDEX IF NOT EXISTS idx_floors_restaurant ON floors (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_versions_floor ON floor_plan_versions (floor_id, version_number);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_floor_active ON restaurant_tables (floor_id, is_active);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE floor_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies: Public Read for Published Restaurants
DROP POLICY IF EXISTS floors_public_read ON floors;
CREATE POLICY floors_public_read ON floors
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurants r
            WHERE r.id = floors.restaurant_id
              AND r.is_published = true
        )
    );

DROP POLICY IF EXISTS floor_versions_public_read ON floor_plan_versions;
CREATE POLICY floor_versions_public_read ON floor_plan_versions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM floors f
            JOIN restaurants r ON r.id = f.restaurant_id
            WHERE f.id = floor_plan_versions.floor_id
              AND r.is_published = true
        )
    );

DROP POLICY IF EXISTS tables_public_read ON restaurant_tables;
CREATE POLICY tables_public_read ON restaurant_tables
    FOR SELECT
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM floors f
            JOIN restaurants r ON r.id = f.restaurant_id
            WHERE f.id = restaurant_tables.floor_id
              AND r.is_published = true
        )
    );

-- 7. RLS Policies: Staff / Owner Read & Write Scoped by Restaurant Membership
DROP POLICY IF EXISTS floors_staff_all ON floors;
CREATE POLICY floors_staff_all ON floors
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = floors.restaurant_id
              AND m.user_id = auth.uid()
              AND m.status = 'ACTIVE'
              AND m.role IN ('OWNER', 'MANAGER')
        )
    );

DROP POLICY IF EXISTS floor_versions_staff_all ON floor_plan_versions;
CREATE POLICY floor_versions_staff_all ON floor_plan_versions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM floors f
            JOIN restaurant_memberships m ON m.restaurant_id = f.restaurant_id
            WHERE f.id = floor_plan_versions.floor_id
              AND m.user_id = auth.uid()
              AND m.status = 'ACTIVE'
              AND m.role IN ('OWNER', 'MANAGER')
        )
    );

DROP POLICY IF EXISTS tables_staff_all ON restaurant_tables;
CREATE POLICY tables_staff_all ON restaurant_tables
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM floors f
            JOIN restaurant_memberships m ON m.restaurant_id = f.restaurant_id
            WHERE f.id = restaurant_tables.floor_id
              AND m.user_id = auth.uid()
              AND m.status = 'ACTIVE'
              AND m.role IN ('OWNER', 'MANAGER')
        )
    );
