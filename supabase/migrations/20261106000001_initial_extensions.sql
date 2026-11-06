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
