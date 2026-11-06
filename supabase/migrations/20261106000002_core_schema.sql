-- Migration: 20261106000002_core_schema.sql
-- Description: Core relational schema for Dine backend modular monolith
-- Covers: Identity, Tenancy, Restaurants, Floor Inventory, Bookings,
-- Allocations (with btree_gist overlap exclusion), Payments, Waitlist,
-- Outbox, Idempotency, and Audit Logs.

-- ============================================================================
-- 1. Identity & Profiles
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. Restaurant Profiles & Policies
-- ============================================================================
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    policy_mode TEXT NOT NULL DEFAULT 'FREE_RESERVATION' CHECK (policy_mode IN ('FREE_RESERVATION', 'DEPOSIT_REQUIRED')),
    deposit_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_minor >= 0),
    default_duration_min INTEGER NOT NULL DEFAULT 90 CHECK (default_duration_min > 0),
    turnover_buffer_min INTEGER NOT NULL DEFAULT 15 CHECK (turnover_buffer_min >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'HOST')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_membership UNIQUE (restaurant_id, user_id)
);

CREATE TABLE IF NOT EXISTS opening_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    open_time TIME NOT NULL,
    close_time TIME NOT NULL
);

CREATE TABLE IF NOT EXISTS special_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT
);

-- ============================================================================
-- 3. Floor Plan & Table Inventory
-- ============================================================================
CREATE TABLE IF NOT EXISTS floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    floor_number INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    svg_layout_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    table_number VARCHAR(20) NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    min_covers INTEGER NOT NULL DEFAULT 1 CHECK (min_covers > 0),
    zone VARCHAR(50) NOT NULL DEFAULT 'MAIN',
    x FLOAT NOT NULL DEFAULT 0.0,
    y FLOAT NOT NULL DEFAULT 0.0,
    w FLOAT NOT NULL DEFAULT 1.0,
    h FLOAT NOT NULL DEFAULT 1.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_floor_table_number UNIQUE (floor_id, table_number)
);

CREATE TABLE IF NOT EXISTS table_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    block_period TSTZRANGE NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. Booking Core & Table Allocations
-- ============================================================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id),
    party_size INTEGER NOT NULL CHECK (party_size > 0),
    requested_start TIMESTAMPTZ NOT NULL,
    dining_period TSTZRANGE NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'HOLD_ACTIVE', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED',
        'READY', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'PAYMENT_FAILED'
    )),
    policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS table_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    dining_period TSTZRANGE NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW',
        'CONFIRMED', 'READY', 'SEATED', 'COMPLETED', 'RELEASED', 'CANCELLED'
    )),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_protected_table_overlap EXCLUDE USING gist (
        table_id WITH =,
        dining_period WITH &&
    ) WHERE (status IN (
        'HELD', 'OFFER_HELD', 'PAYMENT_PENDING',
        'PAYMENT_REVIEW', 'CONFIRMED', 'READY',
        'SEATED', 'COMPLETED'
    ))
);

CREATE TABLE IF NOT EXISTS booking_status_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    actor_id UUID,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. Payment Gateway Tracking & Reconciliation
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    gateway VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY',
    gateway_order_id VARCHAR(100) NOT NULL UNIQUE,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL CHECK (status IN ('INITIATED', 'PENDING_REVIEW', 'CAPTURED', 'FAILED', 'REFUNDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_event_id VARCHAR(100) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_attempt_id UUID NOT NULL REFERENCES payment_attempts(id) ON DELETE CASCADE,
    gateway_refund_id VARCHAR(100),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    reason TEXT,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. Waitlist Queue & Priority Offers
-- ============================================================================
CREATE TABLE IF NOT EXISTS waitlist_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id),
    party_size INTEGER NOT NULL CHECK (party_size > 0),
    requested_start TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('WAITING', 'OFFER_EXTENDED', 'SEATED', 'CANCELLED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waitlist_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waitlist_entry_id UUID NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,
    allocation_id UUID REFERENCES table_allocations(id),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OFFERED', 'ACCEPTED', 'EXPIRED', 'DECLINED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 7. Cross-Cutting: Idempotency, Outbox, and Audit Logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS idempotency_records (
    scope_key VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL,
    endpoint VARCHAR(200) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    status_code INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outbox_event_id UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL,
    channel VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SENT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID,
    restaurant_id UUID,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    diff JSONB,
    request_id UUID,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. Authoritative Schema Migrations Registry
-- Used by the explicit migration runner to track applied migrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
