-- Up Migration

-- 1. In-App Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  channel VARCHAR(20) NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'EMAIL')),
  entity_type VARCHAR(50) CHECK (entity_type IN ('OPERATIONAL_ALERT', 'REPORT_RUN', 'SCHEDULED_REPORT', 'CAPA_CASE', 'QUALITY_INSPECTION')),
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_entity ON notifications (entity_type, entity_id);

-- 2. Durable Email Deliveries Table
CREATE TABLE email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(255) NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  artifact_id UUID,
  report_run_id UUID REFERENCES report_runs(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(255) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_email_deliveries_pending ON email_deliveries (status, next_attempt_at) WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX idx_email_deliveries_recipient ON email_deliveries (recipient_email);
CREATE INDEX idx_email_deliveries_report_run ON email_deliveries (report_run_id);
CREATE INDEX idx_email_deliveries_notification ON email_deliveries (notification_id);

-- 3. Backward-compatible recipients column for scheduled reports
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS recipients JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Down Migration
ALTER TABLE scheduled_reports DROP COLUMN IF EXISTS recipients;
DROP TABLE IF EXISTS email_deliveries CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
