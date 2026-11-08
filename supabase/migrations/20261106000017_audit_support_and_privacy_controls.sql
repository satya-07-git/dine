-- Authoritative SQL Migration: Audit, Support and Privacy Controls (EPIC-017)
-- Conforms to ADR-001, ADR-002, Blueprint §1.2, §4, §5.2, §9, §13.3, §14.2, §19.2, and POL-014/POL-015/POL-016/POL-017.

-- 1. Enhance audit_logs with actor_role, reason, and metadata
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50) DEFAULT 'USER',
ADD COLUMN IF NOT EXISTS reason TEXT,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant_id ON audit_logs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- 2. Create support_interventions table (Controlled support actions with immutable history)
CREATE TABLE IF NOT EXISTS support_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id VARCHAR(100),
    actor_id UUID NOT NULL,
    actor_role VARCHAR(50) NOT NULL DEFAULT 'SUPPORT' CHECK (actor_role IN ('SUPPORT', 'PLATFORM_ADMIN', 'SUPER_ADMIN')),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    intervention_type VARCHAR(50) NOT NULL CHECK (
        intervention_type IN (
            'MANUAL_STATUS_CORRECTION',
            'COMPENSATION_CREDIT',
            'EMERGENCY_RELEASE',
            'DISPUTE_INVESTIGATION',
            'POLICY_OVERRIDE'
        )
    ),
    reason TEXT NOT NULL,
    prior_state JSONB NOT NULL,
    new_state JSONB NOT NULL,
    request_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_interventions_booking ON support_interventions(booking_id);
CREATE INDEX IF NOT EXISTS idx_support_interventions_actor ON support_interventions(actor_id);
CREATE INDEX IF NOT EXISTS idx_support_interventions_restaurant ON support_interventions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_support_interventions_created ON support_interventions(created_at);

-- 3. Create privacy_erasure_requests table (GDPR/privacy right-to-be-forgotten vs financial retention)
CREATE TABLE IF NOT EXISTS privacy_erasure_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (
        status IN (
            'COMPLETED',
            'ANONYMIZED_WITH_RETAINED_EVIDENCE',
            'BLOCKED_ACTIVE_DISPUTE'
        )
    ),
    has_financial_records BOOLEAN NOT NULL DEFAULT FALSE,
    retained_records_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    anonymized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_erasure_user_id ON privacy_erasure_requests(user_id);

-- 4. Append-Only Enforcement Triggers (Immutability guarantee)
CREATE OR REPLACE FUNCTION trg_enforce_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit and event records are append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_append_only();

DROP TRIGGER IF EXISTS trg_booking_status_events_append_only ON booking_status_events;
CREATE TRIGGER trg_booking_status_events_append_only
BEFORE UPDATE OR DELETE ON booking_status_events
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_append_only();

DROP TRIGGER IF EXISTS trg_payment_events_append_only ON payment_events;
CREATE TRIGGER trg_payment_events_append_only
BEFORE UPDATE OR DELETE ON payment_events
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_append_only();

DROP TRIGGER IF EXISTS trg_support_interventions_append_only ON support_interventions;
CREATE TRIGGER trg_support_interventions_append_only
BEFORE UPDATE OR DELETE ON support_interventions
FOR EACH ROW
EXECUTE FUNCTION trg_enforce_append_only();

-- 5. Enable Row Level Security (RLS)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_erasure_requests ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Restaurant staff can only read audit logs for their specific restaurant
CREATE POLICY audit_logs_staff_select ON audit_logs
    FOR SELECT USING (
        restaurant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM restaurant_memberships
            WHERE restaurant_memberships.restaurant_id = audit_logs.restaurant_id
              AND restaurant_memberships.user_id = auth.uid()
              AND restaurant_memberships.role IN ('OWNER', 'MANAGER')
              AND restaurant_memberships.status = 'ACTIVE'
        )
    );

-- Restaurant staff can view support interventions for their restaurant
CREATE POLICY support_interventions_staff_select ON support_interventions
    FOR SELECT USING (
        restaurant_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM restaurant_memberships
            WHERE restaurant_memberships.restaurant_id = support_interventions.restaurant_id
              AND restaurant_memberships.user_id = auth.uid()
              AND restaurant_memberships.role IN ('OWNER', 'MANAGER')
              AND restaurant_memberships.status = 'ACTIVE'
        )
    );

-- Privacy erasure status readable by the subject user
CREATE POLICY privacy_erasure_user_select ON privacy_erasure_requests
    FOR SELECT USING (auth.uid() = user_id);
