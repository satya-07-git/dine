-- Migration 020: Phone OTP authentication, revocable sessions and manager permission upgrade
-- Delivery Stage: V2 Required Upgrades (EPIC-022)
--
-- Tables created / managed:
-- 1. auth_otp_challenges: Cryptographically hashed, salted phone OTP challenges with rate limits and attempt budgets.
-- 2. auth_sessions: Revocable user sessions with refresh token rotation and reuse detection.
-- 3. restaurant_staff: Scoped staff memberships with OWNER, MANAGER, HOST, and STAFF roles, and revocation states.
--
-- Security & Invariants:
-- - OTP values are hashed with per-challenge salt; raw values are NEVER persisted or logged.
-- - Session revocation immediately invalidates access token and refreshes.
-- - Tenant isolation: restaurant_staff enforces restaurant-bounded role authorization.
-- - Manager permissions: Managers can configure venue policies, floor plans, hours, and manage staff.

-- 1. auth_otp_challenges Table
CREATE TABLE IF NOT EXISTS auth_otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'EXPIRED', 'MAX_ATTEMPTS_EXCEEDED')),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. auth_sessions Table
CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(128) NOT NULL,
    refresh_token_hash VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(255),
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. restaurant_staff Table
CREATE TABLE IF NOT EXISTS restaurant_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'HOST', 'STAFF')),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_staff UNIQUE (restaurant_id, user_id)
);

-- Indexes for performance and lookup speed
CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_phone
    ON auth_otp_challenges (phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_status
    ON auth_otp_challenges (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_status
    ON auth_sessions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_refresh_token_hash
    ON auth_sessions (refresh_token_hash);

CREATE INDEX IF NOT EXISTS idx_restaurant_staff_restaurant_role
    ON restaurant_staff (restaurant_id, role, status);

CREATE INDEX IF NOT EXISTS idx_restaurant_staff_user
    ON restaurant_staff (user_id);

-- Backfill restaurant_staff from existing restaurant_memberships if present
INSERT INTO restaurant_staff (id, restaurant_id, user_id, role, status)
SELECT id, restaurant_id, user_id, role, status
FROM restaurant_memberships
ON CONFLICT (restaurant_id, user_id) DO NOTHING;

-- Row Level Security (RLS)
ALTER TABLE auth_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_staff ENABLE ROW LEVEL SECURITY;

-- auth_sessions RLS: user can view own sessions
DROP POLICY IF EXISTS sessions_self_access ON auth_sessions;
CREATE POLICY sessions_self_access ON auth_sessions
    FOR ALL
    USING (
        user_id = auth.uid()
    );

-- restaurant_staff RLS: self read, manager/owner management
DROP POLICY IF EXISTS staff_self_read ON restaurant_staff;
CREATE POLICY staff_self_read ON restaurant_staff
    FOR SELECT
    USING (
        user_id = auth.uid()
    );

DROP POLICY IF EXISTS staff_manager_manage ON restaurant_staff;
CREATE POLICY staff_manager_manage ON restaurant_staff
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_staff s
            WHERE s.restaurant_id = restaurant_staff.restaurant_id
              AND s.user_id = auth.uid()
              AND s.role IN ('OWNER', 'MANAGER')
              AND s.status = 'ACTIVE'
        )
    );
