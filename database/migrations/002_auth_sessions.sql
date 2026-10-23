-- Up Migration
-- 1. Seed canonical system roles idempotently
INSERT INTO roles (name, description) VALUES
  ('ADMIN', 'Full system and user administration permissions'),
  ('QUALITY_MANAGER', 'Manages quality standards, inspection policies, and CAPA resolution'),
  ('SUPERVISOR', 'Oversees production floor shifts, batches, and operations'),
  ('INSPECTOR', 'Performs and records quality inspections and defect logs'),
  ('OPERATOR', 'Records machine production and downtime operational events'),
  ('VIEWER', 'Read-only access to operational quality records and status')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 2. Create refresh_sessions table for secure token rotation and session tracking
CREATE TABLE refresh_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address VARCHAR(45),
  CONSTRAINT chk_refresh_sessions_revoked_after_created CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX idx_refresh_sessions_user_id ON refresh_sessions(user_id);
CREATE INDEX idx_refresh_sessions_token_hash ON refresh_sessions(token_hash);
CREATE INDEX idx_refresh_sessions_expires_at ON refresh_sessions(expires_at);
CREATE INDEX idx_refresh_sessions_revoked_at ON refresh_sessions(revoked_at);

-- Down Migration
DROP TABLE IF EXISTS refresh_sessions CASCADE;
DELETE FROM roles WHERE name IN ('ADMIN', 'QUALITY_MANAGER', 'SUPERVISOR', 'INSPECTOR', 'OPERATOR', 'VIEWER');
