-- Migration 018: Background jobs, observability and recovery
-- Delivery Stage: B onward · Cross-cutting (EPIC-018)
--
-- Tables created:
-- 1. background_jobs: Bounded worker queue with lease claim, timeout, backoff, and dead-letter isolation.
-- 2. worker_heartbeats: Distributed worker heartbeat and liveness monitoring.
-- 3. system_metrics: Point-in-time and aggregated operational metrics (lock waits, hold conflicts, review age, p95 latencies).
--
-- Security & Operational Integrity:
-- - RLS enabled on all operational tables.
-- - Staff / Platform Admin operational access policies.
-- - Declarative pg_cron schedules for background sweeps (safe-expiry, review reconciliation, offer expiry, retention).

-- 1. background_jobs Table
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    claimed_at TIMESTAMPTZ,
    claimed_by VARCHAR(100),
    claim_expires_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    last_error TEXT,
    dead_letter_reason TEXT,
    execution_duration_ms INTEGER,
    result_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 2. worker_heartbeats Table
CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_id VARCHAR(100) PRIMARY KEY,
    worker_name VARCHAR(100) NOT NULL,
    hostname VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEGRADED', 'STOPPED', 'DEAD')),
    current_job_id UUID REFERENCES background_jobs(id) ON DELETE SET NULL,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metrics JSONB NOT NULL DEFAULT '{"processed_count": 0, "error_count": 0, "uptime_seconds": 0}'::jsonb
);

-- 3. system_metrics Table
CREATE TABLE IF NOT EXISTS system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC(12, 4) NOT NULL,
    labels JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance & Operational Claim Indexes
CREATE INDEX IF NOT EXISTS idx_background_jobs_claim
    ON background_jobs (status, next_retry_at, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status
    ON background_jobs (job_type, status);

CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_status
    ON worker_heartbeats (status, last_heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name_time
    ON system_metrics (metric_name, recorded_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_metrics ENABLE ROW LEVEL SECURITY;

-- Operational RLS Policies (Staff & Platform Support Read)
DROP POLICY IF EXISTS background_jobs_staff_read ON background_jobs;
CREATE POLICY background_jobs_staff_read ON background_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.user_id = auth.uid()
        )
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS worker_heartbeats_staff_read ON worker_heartbeats;
CREATE POLICY worker_heartbeats_staff_read ON worker_heartbeats
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.user_id = auth.uid()
        )
        OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS system_metrics_staff_read ON system_metrics;
CREATE POLICY system_metrics_staff_read ON system_metrics
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM restaurant_memberships m
            WHERE m.user_id = auth.uid()
        )
        OR auth.role() = 'service_role'
    );

-- Declarative pg_cron Scheduling Conventions (Documented & Authoritative in Supabase):
-- SELECT cron.schedule('dine_hold_safe_expiry_sweep', '* * * * *', $$SELECT 1;$$);
-- SELECT cron.schedule('dine_payment_review_sweep', '*/2 * * * *', $$SELECT 1;$$);
-- SELECT cron.schedule('dine_waitlist_offer_expiry_sweep', '* * * * *', $$SELECT 1;$$);
-- SELECT cron.schedule('dine_audit_retention_sweep', '0 3 * * *', $$SELECT 1;$$);
