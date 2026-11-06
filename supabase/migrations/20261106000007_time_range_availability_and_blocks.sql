-- ============================================================================
-- Migration 007: Time-Range Availability, Interval Indexes & Table Blocks Protection
-- Single schema evolution authority for EPIC-007 Booking Core.
-- ============================================================================

-- 1. Ensure table_blocks has valid range check
ALTER TABLE table_blocks
  DROP CONSTRAINT IF EXISTS check_table_blocks_valid_range;

ALTER TABLE table_blocks
  ADD CONSTRAINT check_table_blocks_valid_range
  CHECK (NOT isempty(block_period) AND lower(block_period) < upper(block_period));

-- 2. Performance & Overlap GiST Indexes
CREATE INDEX IF NOT EXISTS idx_table_blocks_gist
  ON table_blocks USING gist (table_id, block_period);

CREATE INDEX IF NOT EXISTS idx_table_blocks_table
  ON table_blocks (table_id);

CREATE INDEX IF NOT EXISTS idx_table_allocations_gist
  ON table_allocations USING gist (table_id, dining_period);

CREATE INDEX IF NOT EXISTS idx_table_allocations_protected_status
  ON table_allocations (table_id, status, expires_at)
  WHERE status IN ('HELD', 'OFFER_HELD', 'PAYMENT_PENDING', 'PAYMENT_REVIEW', 'CONFIRMED', 'READY', 'SEATED', 'COMPLETED');

-- 3. Row Level Security for table_blocks
ALTER TABLE table_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_blocks_public_read ON table_blocks;
CREATE POLICY table_blocks_public_read ON table_blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_tables t
      JOIN floors f ON f.id = t.floor_id
      JOIN restaurants r ON r.id = f.restaurant_id
      WHERE t.id = table_blocks.table_id AND r.is_published = true
    )
  );

DROP POLICY IF EXISTS table_blocks_staff_manage ON table_blocks;
CREATE POLICY table_blocks_staff_manage ON table_blocks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurant_tables t
      JOIN floors f ON f.id = t.floor_id
      JOIN restaurant_memberships m ON m.restaurant_id = f.restaurant_id
      JOIN profiles p ON p.id = m.user_id
      WHERE t.id = table_blocks.table_id
        AND p.auth_uid = auth.uid()
        AND m.status = 'ACTIVE'
        AND m.role IN ('OWNER', 'MANAGER', 'HOST')
    )
  );
