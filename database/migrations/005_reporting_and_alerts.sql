-- Up Migration

-- 1. Scheduled Reports Table
CREATE TABLE scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('production-performance', 'inspection-summary', 'defect-analysis', 'capa-status', 'spc-summary')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  format VARCHAR(10) NOT NULL DEFAULT 'PDF' CHECK (format IN ('CSV', 'XLSX', 'PDF')),
  cadence VARCHAR(20) NOT NULL CHECK (cadence IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scheduled_reports_due ON scheduled_reports (next_run_at, is_enabled);
CREATE INDEX idx_scheduled_reports_creator ON scheduled_reports (created_by);
CREATE INDEX idx_scheduled_reports_type ON scheduled_reports (report_type);

-- 2. Report Execution Runs Table
CREATE TABLE report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id UUID REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL,
  format VARCHAR(10) NOT NULL CHECK (format IN ('CSV', 'XLSX', 'PDF')),
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  artifact_id UUID,
  artifact_path VARCHAR(255),
  file_size_bytes INT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_report_runs_schedule_id ON report_runs (scheduled_report_id);
CREATE INDEX idx_report_runs_artifact_id ON report_runs (artifact_id);
CREATE INDEX idx_report_runs_status ON report_runs (status);
CREATE INDEX idx_report_runs_created_at ON report_runs (created_at DESC);

-- 3. Operational Alerts Table
CREATE TABLE operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('HIGH_INSPECTION_FAILURE_RATE', 'OVERDUE_CAPA', 'SPC_OUT_OF_CONTROL')),
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  fingerprint VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  context_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index ensures idempotent deduplication: no duplicate open/acknowledged alerts for identical fingerprint
CREATE UNIQUE INDEX uq_operational_alerts_active_fingerprint ON operational_alerts (fingerprint) WHERE status IN ('OPEN', 'ACKNOWLEDGED');

CREATE INDEX idx_operational_alerts_status ON operational_alerts (status);
CREATE INDEX idx_operational_alerts_rule ON operational_alerts (rule_type);
CREATE INDEX idx_operational_alerts_severity ON operational_alerts (severity);
CREATE INDEX idx_operational_alerts_entity ON operational_alerts (entity_type, entity_id);
CREATE INDEX idx_operational_alerts_created_at ON operational_alerts (created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS operational_alerts CASCADE;
DROP TABLE IF EXISTS report_runs CASCADE;
DROP TABLE IF EXISTS scheduled_reports CASCADE;
