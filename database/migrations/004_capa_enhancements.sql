-- Up Migration
-- Add priority and verification_notes columns to capa_cases for risk triage and verification documentation
ALTER TABLE capa_cases ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));
ALTER TABLE capa_cases ADD COLUMN IF NOT EXISTS verification_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_capa_cases_priority ON capa_cases(priority);

-- Down Migration
DROP INDEX IF EXISTS idx_capa_cases_priority;
ALTER TABLE capa_cases DROP COLUMN IF EXISTS verification_notes;
ALTER TABLE capa_cases DROP COLUMN IF EXISTS priority;
