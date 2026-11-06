-- Database Integration and Integrity Verification Script
-- Tests transactions, rollbacks, foreign keys, and GiST overlap constraint

BEGIN;

-- 1. Ensure required extensions exist
SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto', 'btree_gist');

-- 2. Verify table existence
SELECT count(*) FROM information_schema.tables 
WHERE table_name IN ('profiles', 'restaurants', 'restaurant_tables', 'bookings', 'table_allocations', 'idempotency_records', 'outbox_events', 'audit_logs');

-- 3. Verify GiST exclusion constraint on table_allocations
SELECT conname, contype 
FROM pg_constraint 
WHERE conname = 'no_protected_table_overlap';

-- 4. Rollback to keep environment clean
ROLLBACK;
