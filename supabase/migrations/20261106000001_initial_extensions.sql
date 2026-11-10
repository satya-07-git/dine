-- Migration: 20261106000001_initial_extensions.sql
-- Description: Enable required extensions for Dine backend platform
-- Extensions: uuid-ossp, pgcrypto, btree_gist (mandatory for hold overlap constraint), postgis (geospatial discovery)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
-- Attempt postgis if available in environment, fallback gracefully if extension image not present
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "postgis";
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'postgis extension not available in this environment, skipping...';
END
$$;

-- Local Supabase auth compatibility schema and functions for local PostgreSQL
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon');
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
