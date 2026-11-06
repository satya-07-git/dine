-- ============================================================================
-- Migration: 20261106000011_payment_review_reconciliation_and_refunds.sql
-- Description: EPIC-011 Payment review, reconciliation, late-capture recovery,
--              idempotent refunds, and support escalation incident tracking.
-- ============================================================================

-- 1. Extend payment_attempts with bounded review & reconciliation metadata
ALTER TABLE payment_attempts
ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'NONE'
    CHECK (reconciliation_status IN ('NONE', 'PENDING_RECHECK', 'RECONCILED', 'MANUAL_ESCALATION')),
ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS review_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_attempts_reconciliation 
    ON payment_attempts (status, reconciliation_status, review_expires_at);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_booking_id 
    ON payment_attempts (booking_id);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_gateway_order 
    ON payment_attempts (gateway_order_id);

-- 2. Enhance refunds table with booking link, idempotency, and audit metadata
ALTER TABLE refunds
ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR',
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS initiated_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_refunds_booking_id 
    ON refunds (booking_id);

CREATE INDEX IF NOT EXISTS idx_refunds_payment_attempt_id 
    ON refunds (payment_attempt_id);

CREATE INDEX IF NOT EXISTS idx_refunds_idempotency_key 
    ON refunds (idempotency_key);

-- 3. Payment Incidents Table for review timeout, late capture, and failed refund visibility (T04)
CREATE TABLE IF NOT EXISTS payment_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    payment_attempt_id UUID REFERENCES payment_attempts(id) ON DELETE SET NULL,
    refund_id UUID REFERENCES refunds(id) ON DELETE SET NULL,
    incident_type TEXT NOT NULL CHECK (
        incident_type IN (
            'LATE_CAPTURE_REFUND_REQUIRED',
            'RECONCILIATION_TIMEOUT',
            'GATEWAY_ERROR',
            'DOUBLE_PAYMENT_SUSPECTED',
            'REFUND_FAILED'
        )
    ),
    severity TEXT NOT NULL DEFAULT 'HIGH' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED')),
    reason TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_incidents_status_severity 
    ON payment_incidents (status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_incidents_booking 
    ON payment_incidents (booking_id);

CREATE INDEX IF NOT EXISTS idx_payment_incidents_attempt 
    ON payment_incidents (payment_attempt_id);

-- 4. Row Level Security (RLS) Configuration
ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_incidents ENABLE ROW LEVEL SECURITY;

-- Customer can read payment attempts for their own bookings
DROP POLICY IF EXISTS payment_attempts_customer_read ON payment_attempts;
CREATE POLICY payment_attempts_customer_read ON payment_attempts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id = payment_attempts.booking_id
              AND b.user_id = auth.uid()
        )
    );

-- Restaurant staff can read payment attempts for bookings in their restaurant
DROP POLICY IF EXISTS payment_attempts_staff_read ON payment_attempts;
CREATE POLICY payment_attempts_staff_read ON payment_attempts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings b
            JOIN restaurant_memberships rm ON rm.restaurant_id = b.restaurant_id
            WHERE b.id = payment_attempts.booking_id
              AND rm.user_id = auth.uid()
              AND rm.status = 'ACTIVE'
        )
    );

-- Customer can read refunds for their own bookings
DROP POLICY IF EXISTS refunds_customer_read ON refunds;
CREATE POLICY refunds_customer_read ON refunds
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.id = refunds.booking_id
              AND b.user_id = auth.uid()
        )
    );

-- Staff can read refunds for bookings in their restaurant
DROP POLICY IF EXISTS refunds_staff_read ON refunds;
CREATE POLICY refunds_staff_read ON refunds
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings b
            JOIN restaurant_memberships rm ON rm.restaurant_id = b.restaurant_id
            WHERE b.id = refunds.booking_id
              AND rm.user_id = auth.uid()
              AND rm.status = 'ACTIVE'
        )
    );

-- Support/Staff incident read policy
DROP POLICY IF EXISTS payment_incidents_staff_read ON payment_incidents;
CREATE POLICY payment_incidents_staff_read ON payment_incidents
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bookings b
            JOIN restaurant_memberships rm ON rm.restaurant_id = b.restaurant_id
            WHERE b.id = payment_incidents.booking_id
              AND rm.user_id = auth.uid()
              AND rm.status = 'ACTIVE'
              AND rm.role IN ('OWNER', 'MANAGER')
        )
    );
