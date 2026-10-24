-- Up Migration
-- Add is_active column and index to shifts table for consistent soft-deactivation across all master-data entities
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_shifts_is_active ON shifts(is_active);

-- Down Migration
DROP INDEX IF EXISTS idx_shifts_is_active;
ALTER TABLE shifts DROP COLUMN IF EXISTS is_active;
