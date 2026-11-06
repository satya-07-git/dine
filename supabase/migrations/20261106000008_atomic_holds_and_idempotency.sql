-- ============================================================================
-- Migration 008: Atomic Holds, Range Constraints, Idempotency & Safe Expiry
-- Single schema evolution authority for EPIC-008 Booking Core.
-- ============================================================================

-- 1. Ensure table_allocations dining_period range check
ALTER TABLE table_allocations
  DROP CONSTRAINT IF EXISTS check_table_allocations_valid_range;

ALTER TABLE table_allocations
  ADD CONSTRAINT check_table_allocations_valid_range
  CHECK (NOT isempty(dining_period) AND lower(dining_period) < upper(dining_period));

-- 2. Ensure bookings dining_period range check
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS check_bookings_valid_range;

ALTER TABLE bookings
  ADD CONSTRAINT check_bookings_valid_range
  CHECK (NOT isempty(dining_period) AND lower(dining_period) < upper(dining_period));

-- 3. Additional performance and lookup indexes for atomic holds & idempotency
CREATE INDEX IF NOT EXISTS idx_table_allocations_booking
  ON table_allocations (booking_id);

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup
  ON idempotency_records (user_id, endpoint, expires_at);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created
  ON outbox_events (status, created_at);

CREATE INDEX IF NOT EXISTS idx_table_allocations_table_status_expires
  ON table_allocations (table_id, status, expires_at);

-- 4. Row Level Security for idempotency_records
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_user_access ON idempotency_records;
CREATE POLICY idempotency_user_access ON idempotency_records
  FOR ALL
  USING (user_id = auth.uid());

-- 5. Row Level Security for table_allocations customer read access
DROP POLICY IF EXISTS allocations_customer_read ON table_allocations;
CREATE POLICY allocations_customer_read ON table_allocations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.id = table_allocations.booking_id
        AND b.user_id = auth.uid()
    )
  );
