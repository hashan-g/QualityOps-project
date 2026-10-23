-- Up Migration
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Identity & Access Foundation (Schema Only)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- 2. Master Data Entities
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  target_cycle_time_seconds NUMERIC(10,2) CHECK (target_cycle_time_seconds IS NULL OR target_cycle_time_seconds > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_is_active ON products(is_active);

CREATE TABLE production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  location VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_production_lines_is_active ON production_lines(is_active);

CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  production_line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_machines_production_line_id ON machines(production_line_id);
CREATE INDEX idx_machines_status ON machines(status);

CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE defect_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'MINOR' CHECK (severity IN ('MINOR', 'MAJOR', 'CRITICAL')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_defect_types_category ON defect_types(category);
CREATE INDEX idx_defect_types_severity ON defect_types(severity);

-- 3. Production & Quality Operations
CREATE TABLE production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number VARCHAR(100) NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  production_line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE RESTRICT,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD')),
  planned_quantity INT NOT NULL CHECK (planned_quantity > 0),
  produced_quantity INT NOT NULL DEFAULT 0 CHECK (produced_quantity >= 0),
  accepted_quantity INT NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  scrap_quantity INT NOT NULL DEFAULT 0 CHECK (scrap_quantity >= 0),
  rework_pending_quantity INT NOT NULL DEFAULT 0 CHECK (rework_pending_quantity >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_batch_completed_after_started CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at),
  CONSTRAINT chk_batch_disposition_sum CHECK (accepted_quantity + scrap_quantity + rework_pending_quantity <= produced_quantity),
  CONSTRAINT chk_batch_completed_reconciled CHECK (status <> 'COMPLETED' OR (accepted_quantity + scrap_quantity + rework_pending_quantity = produced_quantity))
);

CREATE INDEX idx_production_batches_product_id ON production_batches(product_id);
CREATE INDEX idx_production_batches_line_id ON production_batches(production_line_id);
CREATE INDEX idx_production_batches_shift_id ON production_batches(shift_id);
CREATE INDEX idx_production_batches_status ON production_batches(status);
CREATE INDEX idx_production_batches_started_at ON production_batches(started_at);

CREATE TABLE quality_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_number VARCHAR(100) NOT NULL UNIQUE,
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  inspector_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stage VARCHAR(50) NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  result VARCHAR(20) CHECK (result IS NULL OR result IN ('PASS', 'FAIL', 'CONDITIONAL')),
  sample_size INT NOT NULL CHECK (sample_size > 0),
  passed_units INT NOT NULL DEFAULT 0 CHECK (passed_units >= 0),
  failed_units INT NOT NULL DEFAULT 0 CHECK (failed_units >= 0),
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_inspection_batch_stage_attempt UNIQUE (batch_id, stage, attempt_number),
  CONSTRAINT chk_inspection_units_sum CHECK (passed_units + failed_units <= sample_size),
  CONSTRAINT chk_inspection_completed_reconciled CHECK (status <> 'COMPLETED' OR (passed_units + failed_units = sample_size)),
  CONSTRAINT chk_inspection_completed_result CHECK (status <> 'COMPLETED' OR result IS NOT NULL)
);

CREATE INDEX idx_quality_inspections_batch_id ON quality_inspections(batch_id);
CREATE INDEX idx_quality_inspections_inspector_id ON quality_inspections(inspector_id);
CREATE INDEX idx_quality_inspections_inspected_at ON quality_inspections(inspected_at);
CREATE INDEX idx_quality_inspections_status ON quality_inspections(status);

CREATE TABLE defect_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES quality_inspections(id) ON DELETE CASCADE,
  defect_type_id UUID NOT NULL REFERENCES defect_types(id) ON DELETE RESTRICT,
  occurrence_count INT NOT NULL CHECK (occurrence_count >= 1),
  affected_unit_count INT NOT NULL CHECK (affected_unit_count >= 1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_defect_record_inspection_type UNIQUE (inspection_id, defect_type_id),
  CONSTRAINT chk_defect_affected_le_occurrence CHECK (affected_unit_count <= occurrence_count)
);

CREATE INDEX idx_defect_records_inspection_id ON defect_records(inspection_id);
CREATE INDEX idx_defect_records_defect_type_id ON defect_records(defect_type_id);

CREATE TABLE downtime_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE RESTRICT,
  machine_id UUID REFERENCES machines(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL,
  reason VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'UNPLANNED' CHECK (category IN ('PLANNED', 'UNPLANNED')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INT GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NOT NULL THEN CAST(EXTRACT(EPOCH FROM (ended_at - started_at)) AS INT)
      ELSE NULL
    END
  ) STORED,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_downtime_ended_after_started CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE INDEX idx_downtime_records_line_id ON downtime_records(production_line_id);
CREATE INDEX idx_downtime_records_machine_id ON downtime_records(machine_id);
CREATE INDEX idx_downtime_records_started_at ON downtime_records(started_at);

-- 4. Corrective & Preventive Actions (CAPA) and Auditing
CREATE TABLE capa_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('INSPECTION_FAILURE', 'INTERNAL_AUDIT', 'CUSTOMER_COMPLAINT', 'RECURRING_DEFECT', 'PROCESS_DEVIATION')),
  batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL,
  defect_record_id UUID REFERENCES defect_records(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'CLOSED', 'CANCELLED')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  due_date DATE,
  root_cause TEXT,
  verified_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_capa_closed_verified CHECK (status <> 'CLOSED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

CREATE INDEX idx_capa_cases_status ON capa_cases(status);
CREATE INDEX idx_capa_cases_assigned_to ON capa_cases(assigned_to);
CREATE INDEX idx_capa_cases_due_date ON capa_cases(due_date);
CREATE INDEX idx_capa_cases_batch_id ON capa_cases(batch_id);

CREATE TABLE capa_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capa_case_id UUID NOT NULL REFERENCES capa_cases(id) ON DELETE CASCADE,
  action_type VARCHAR(30) NOT NULL CHECK (action_type IN ('CORRECTIVE', 'PREVENTIVE', 'IMMEDIATE_CONTAINMENT')),
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_capa_action_completed CHECK (status NOT IN ('COMPLETED', 'VERIFIED') OR completed_at IS NOT NULL)
);

CREATE INDEX idx_capa_actions_case_id ON capa_actions(capa_case_id);
CREATE INDEX idx_capa_actions_status ON capa_actions(status);
CREATE INDEX idx_capa_actions_assigned_to ON capa_actions(assigned_to);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  request_id VARCHAR(100),
  before_state JSONB,
  after_state JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Down Migration
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS capa_actions CASCADE;
DROP TABLE IF EXISTS capa_cases CASCADE;
DROP TABLE IF EXISTS downtime_records CASCADE;
DROP TABLE IF EXISTS defect_records CASCADE;
DROP TABLE IF EXISTS quality_inspections CASCADE;
DROP TABLE IF EXISTS production_batches CASCADE;
DROP TABLE IF EXISTS defect_types CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS machines CASCADE;
DROP TABLE IF EXISTS production_lines CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
