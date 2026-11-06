-- Migration: 20261106000003_identity_and_rls.sql
-- Description: Identity, Tenant Scoping, and Row Level Security (RLS) policies for Dine backend
-- Fulfills: EPIC-003 (Identity, memberships and tenant authorization)

-- ============================================================================
-- 1. Identity & Profiles Schema Extension
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;
CREATE INDEX IF NOT EXISTS idx_profiles_auth_uid ON profiles(auth_uid);

-- ============================================================================
-- 2. Restaurant Membership Tenant Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_memberships_user ON restaurant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_role_status ON restaurant_memberships(restaurant_id, role, status);

-- ============================================================================
-- 3. Row Level Security (RLS) on Client-Reachable Tables
-- ============================================================================

-- 3.1 Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_owner_access ON profiles;
CREATE POLICY profiles_owner_access ON profiles
    FOR ALL
    USING (
        id = auth.uid() OR auth_uid = auth.uid()
    );

-- 3.2 Restaurant Memberships RLS
ALTER TABLE restaurant_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_self_read ON restaurant_memberships;
CREATE POLICY memberships_self_read ON restaurant_memberships
    FOR SELECT
    USING (
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS memberships_owner_manage ON restaurant_memberships;
CREATE POLICY memberships_owner_manage ON restaurant_memberships
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = restaurant_memberships.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role = 'OWNER'
              AND m.status = 'ACTIVE'
        )
    );

-- 3.3 Bookings RLS
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_customer_read ON bookings;
CREATE POLICY bookings_customer_read ON bookings
    FOR SELECT
    USING (
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS bookings_staff_access ON bookings;
CREATE POLICY bookings_staff_access ON bookings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = bookings.restaurant_id
              AND m.user_id = auth.uid()
              AND m.status = 'ACTIVE'
        )
    );

-- 3.4 Table Allocations RLS
ALTER TABLE table_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allocations_staff_access ON table_allocations;
CREATE POLICY allocations_staff_access ON table_allocations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_tables t
            JOIN floors f ON f.id = t.floor_id
            JOIN restaurant_memberships m ON m.restaurant_id = f.restaurant_id
            WHERE t.id = table_allocations.table_id
              AND m.user_id = auth.uid()
              AND m.status = 'ACTIVE'
        )
    );

-- 3.5 Waitlist Entries RLS
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_customer_access ON waitlist_entries;
CREATE POLICY waitlist_customer_access ON waitlist_entries
    FOR ALL
    USING (
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS waitlist_staff_access ON waitlist_entries;
CREATE POLICY waitlist_staff_access ON waitlist_entries
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = waitlist_entries.restaurant_id
              AND m.user_id = auth.uid()
              AND m.status = 'ACTIVE'
        )
    );

-- 3.6 Waitlist Offers RLS
ALTER TABLE waitlist_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waitlist_offers_customer_access ON waitlist_offers;
CREATE POLICY waitlist_offers_customer_access ON waitlist_offers
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM waitlist_entries w
            WHERE w.id = waitlist_offers.waitlist_entry_id
              AND w.user_id = auth.uid()
        )
    );

-- 3.7 Audit Logs RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_owner_access ON audit_logs;
CREATE POLICY audit_logs_owner_access ON audit_logs
    FOR SELECT
    USING (
        restaurant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.restaurant_id = audit_logs.restaurant_id
              AND m.user_id = auth.uid()
              AND m.role = 'OWNER'
              AND m.status = 'ACTIVE'
        )
    );
