-- Migration 019: Backend verification, staging and release gates
-- Delivery Stage: H · Release (EPIC-019)
--
-- Tables created:
-- 1. staging_verification_runs: Automated multi-session concurrency, idempotency, recovery, and security runs.
-- 2. release_gate_evaluations: Milestone and commercial release gates (GATE-001 through GATE-007, POL-007, POL-014..POL-021).
--
-- Security & Operational Integrity:
-- - RLS enabled on all release verification tables.
-- - Staff and Platform Support operational access policies.
-- - Staging go/no-go audit evidence preservation before commercial deployment.

-- 1. staging_verification_runs Table
CREATE TABLE IF NOT EXISTS staging_verification_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_tag VARCHAR(100) NOT NULL,
    environment VARCHAR(50) NOT NULL DEFAULT 'staging' CHECK (environment IN ('staging', 'synthetic_local', 'pre_release')),
    suite_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED')),
    total_checks INTEGER NOT NULL DEFAULT 0,
    passed_checks INTEGER NOT NULL DEFAULT 0,
    failed_checks INTEGER NOT NULL DEFAULT 0,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    executed_by VARCHAR(100) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. release_gate_evaluations Table
CREATE TABLE IF NOT EXISTS release_gate_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gate_id VARCHAR(50) NOT NULL,
    gate_name VARCHAR(200) NOT NULL,
    owning_epic VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PASSED' CHECK (status IN ('PASSED', 'FAILED', 'BLOCKED', 'CONDITIONAL')),
    decision VARCHAR(50) NOT NULL DEFAULT 'GO' CHECK (decision IN ('GO', 'NO_GO', 'CONDITIONAL_GO')),
    blocking_reason TEXT,
    evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    accountable_owner VARCHAR(100) NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Operational Verification Indexes
CREATE INDEX IF NOT EXISTS idx_staging_verification_runs_status
    ON staging_verification_runs (status, run_tag, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_gate_evaluations_gate_status
    ON release_gate_evaluations (gate_id, status);

-- Enable Row Level Security (RLS)
ALTER TABLE staging_verification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_gate_evaluations ENABLE ROW LEVEL SECURITY;

-- Operational RLS Policies (Staff & Platform Support Read)
DROP POLICY IF EXISTS staging_verification_runs_staff_read ON staging_verification_runs;
CREATE POLICY staging_verification_runs_staff_read ON staging_verification_runs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.user_id = auth.uid()
        )
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS release_gate_evaluations_staff_read ON release_gate_evaluations;
CREATE POLICY release_gate_evaluations_staff_read ON release_gate_evaluations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.user_id = auth.uid()
        )
        OR auth.role() = 'service_role'
    );
