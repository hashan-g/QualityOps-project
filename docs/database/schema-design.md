# QualityOps — Database Schema Design

**Document Version:** 2.0 (Phase 2 Baseline)  
**Target Engine:** PostgreSQL 18.x  
**Primary Key Convention:** UUID v4 (`gen_random_uuid()`)  
**Timestamp Standard:** UTC (`timestamptz`)

---

## 1. Architectural Overview & Domain Boundaries

QualityOps provides a unified relational model for manufacturing quality tracking, traceability, defect classification, and process analytics. In Phase 2, the relational schema establishes the data persistence boundary for the platform.

```
       [ Identity / Roles ]
        users <-> user_roles <-> roles
                     |
       [ Master Data ]
        products, production_lines, machines, shifts, defect_types
                     |
       [ Operational Execution ]
        production_batches (canonical execution record)
          |              |
          |              +--> downtime_records
          v
        quality_inspections (sample-based inspection records)
          |
          v
        defect_records (distinct occurrences & affected units)
          |
       [ Closed-Loop Quality ]
        capa_cases <-> capa_actions
          |
       [ System Auditability ]
        audit_logs
```

---

## 2. Terminology & Canonical Model Reconciliation

To prevent ambiguity between Phase 0 draft concepts and production engineering implementation:

1. **`production_batches` is Canonical (replaces `production_records`):**
   - Each manufacturing run corresponds to a distinct physical batch represented in `production_batches`.
   - Every batch tracks planned, produced, accepted, scrap, and rework quantities.

2. **Production Quantity vs. Current Disposition Buckets:**
   - `produced_quantity`: Total units produced for the batch.
   - `accepted_quantity`: Units accepted as good conforming output.
   - `scrap_quantity`: Units permanently rejected and scrapped.
   - `rework_pending_quantity`: Units awaiting rework or re-evaluation.
   - **Invariant:** `accepted_quantity + scrap_quantity + rework_pending_quantity <= produced_quantity`.
   - **Completion Reconciliation:** When `status = 'COMPLETED'`, `accepted_quantity + scrap_quantity + rework_pending_quantity = produced_quantity`.
   - **Rework Processing:** When reworked units are re-inspected and approved, they transition from `rework_pending_quantity` to `accepted_quantity` (or `scrap_quantity`), avoiding double-counting produced units.

3. **Inspection Sample Counts vs. Full Production Output:**
   - `quality_inspections` records describe a representative _sample_ (`sample_size`), not total batch output.
   - `passed_units + failed_units = sample_size` for a completed inspection.
   - Sample pass/fail rates must never be described as the batch yield.

4. **Defect Occurrences vs. Defective Units:**
   - `occurrence_count`: The number of times a specific defect occurred.
   - `affected_unit_count`: The number of distinct physical units exhibiting that defect type.
   - `affected_unit_count <= occurrence_count` (one unit can exhibit multiple instances of the same defect).
   - **Non-Additive Warning:** Summing `affected_unit_count` across different defect categories does **not** yield total unique defective units, because a single unit may have multiple distinct defects simultaneously.

5. **Deferred Features:**
   - `notifications`: Intentionally deferred until notification business workflows are implemented in a future phase.

---

## 3. Relational Schema Specification

### 3.1 Identity & Access Foundation (Schema Only)

#### `users`

Represents platform actors (operators, inspectors, supervisors, quality managers, admins).

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `username`: VARCHAR(50) NOT NULL UNIQUE
- `email`: VARCHAR(255) NOT NULL UNIQUE
- `password_hash`: VARCHAR(255) NOT NULL (Argon2id/bcrypt hash for future auth)
- `full_name`: VARCHAR(100) NOT NULL
- `is_active`: BOOLEAN NOT NULL DEFAULT true
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

#### `roles`

System access roles.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `name`: VARCHAR(50) NOT NULL UNIQUE (`ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER`)
- `description`: TEXT
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

#### `user_roles`

Many-to-many relationship linking users to assigned roles.

- `user_id`: UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
- `role_id`: UUID NOT NULL REFERENCES `roles(id)` ON DELETE CASCADE
- `assigned_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- PRIMARY KEY (`user_id`, `role_id`)

---

### 3.2 Master Data Entities

#### `products`

Manufacturing catalog items/parts.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `code`: VARCHAR(50) NOT NULL UNIQUE (SKU / Part Number)
- `name`: VARCHAR(150) NOT NULL
- `description`: TEXT
- `target_cycle_time_seconds`: NUMERIC(10,2) CHECK (`target_cycle_time_seconds IS NULL OR target_cycle_time_seconds > 0`)
- `is_active`: BOOLEAN NOT NULL DEFAULT true
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

#### `production_lines`

Physical manufacturing lines.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `code`: VARCHAR(50) NOT NULL UNIQUE (e.g., `LINE-01`)
- `name`: VARCHAR(100) NOT NULL
- `location`: VARCHAR(100)
- `is_active`: BOOLEAN NOT NULL DEFAULT true
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

#### `machines`

Equipment units located on production lines.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `code`: VARCHAR(50) NOT NULL UNIQUE (e.g., `MCH-01`)
- `name`: VARCHAR(100) NOT NULL
- `production_line_id`: UUID NOT NULL REFERENCES `production_lines(id)` ON DELETE RESTRICT
- `status`: VARCHAR(30) NOT NULL DEFAULT 'IDLE' CHECK (`status IN ('IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE')`)
- `is_active`: BOOLEAN NOT NULL DEFAULT true
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

#### `shifts`

Operating shifts.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `code`: VARCHAR(50) NOT NULL UNIQUE (e.g., `SHIFT-MORNING`)
- `name`: VARCHAR(100) NOT NULL
- `start_time`: TIME NOT NULL
- `end_time`: TIME NOT NULL
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

#### `defect_types`

Standardized defect taxonomy.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `code`: VARCHAR(50) NOT NULL UNIQUE (e.g., `DEF-CRACK`, `DEF-DIMENSION`)
- `name`: VARCHAR(100) NOT NULL
- `category`: VARCHAR(50) NOT NULL (`DIMENSIONAL`, `VISUAL`, `FUNCTIONAL`, `MATERIAL`)
- `severity`: VARCHAR(20) NOT NULL DEFAULT 'MINOR' CHECK (`severity IN ('MINOR', 'MAJOR', 'CRITICAL')`)
- `is_active`: BOOLEAN NOT NULL DEFAULT true
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

---

### 3.3 Production and Quality Execution

#### `production_batches`

Authoritative production runs.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `batch_number`: VARCHAR(100) NOT NULL UNIQUE
- `product_id`: UUID NOT NULL REFERENCES `products(id)` ON DELETE RESTRICT
- `production_line_id`: UUID NOT NULL REFERENCES `production_lines(id)` ON DELETE RESTRICT
- `shift_id`: UUID NOT NULL REFERENCES `shifts(id)` ON DELETE RESTRICT
- `machine_id`: UUID REFERENCES `machines(id)` ON DELETE SET NULL
- `created_by`: UUID REFERENCES `users(id)` ON DELETE SET NULL
- `status`: VARCHAR(30) NOT NULL DEFAULT 'PLANNED' CHECK (`status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD')`)
- `planned_quantity`: INT NOT NULL CHECK (`planned_quantity > 0`)
- `produced_quantity`: INT NOT NULL DEFAULT 0 CHECK (`produced_quantity >= 0`)
- `accepted_quantity`: INT NOT NULL DEFAULT 0 CHECK (`accepted_quantity >= 0`)
- `scrap_quantity`: INT NOT NULL DEFAULT 0 CHECK (`scrap_quantity >= 0`)
- `rework_pending_quantity`: INT NOT NULL DEFAULT 0 CHECK (`rework_pending_quantity >= 0`)
- `started_at`: TIMESTAMPTZ
- `completed_at`: TIMESTAMPTZ
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- **Constraints:**
  - `chk_batch_completed_after_started`: `completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at`
  - `chk_batch_disposition_sum`: `accepted_quantity + scrap_quantity + rework_pending_quantity <= produced_quantity`
  - `chk_batch_completed_reconciled`: `status <> 'COMPLETED' OR (accepted_quantity + scrap_quantity + rework_pending_quantity = produced_quantity)`

#### `quality_inspections`

Quality inspection checks conducted on batch samples.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `inspection_number`: VARCHAR(100) NOT NULL UNIQUE
- `batch_id`: UUID NOT NULL REFERENCES `production_batches(id)` ON DELETE CASCADE
- `inspector_id`: UUID NOT NULL REFERENCES `users(id)` ON DELETE RESTRICT
- `stage`: VARCHAR(50) NOT NULL (`IN_PROCESS`, `FINAL`, `RECEIVING`)
- `attempt_number`: INT NOT NULL DEFAULT 1 CHECK (`attempt_number >= 1`)
- `status`: VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (`status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')`)
- `result`: VARCHAR(20) CHECK (`result IS NULL OR result IN ('PASS', 'FAIL', 'CONDITIONAL')`)
- `sample_size`: INT NOT NULL CHECK (`sample_size > 0`)
- `passed_units`: INT NOT NULL DEFAULT 0 CHECK (`passed_units >= 0`)
- `failed_units`: INT NOT NULL DEFAULT 0 CHECK (`failed_units >= 0`)
- `inspected_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `notes`: TEXT
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- **Constraints:**
  - `uq_inspection_batch_stage_attempt`: `UNIQUE (batch_id, stage, attempt_number)`
  - `chk_inspection_units_sum`: `passed_units + failed_units <= sample_size`
  - `chk_inspection_completed_reconciled`: `status <> 'COMPLETED' OR (passed_units + failed_units = sample_size)`
  - `chk_inspection_completed_result`: `status <> 'COMPLETED' OR result IS NOT NULL`

#### `defect_records`

Specific defect occurrences captured during an inspection.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `inspection_id`: UUID NOT NULL REFERENCES `quality_inspections(id)` ON DELETE CASCADE
- `defect_type_id`: UUID NOT NULL REFERENCES `defect_types(id)` ON DELETE RESTRICT
- `occurrence_count`: INT NOT NULL CHECK (`occurrence_count >= 1`)
- `affected_unit_count`: INT NOT NULL CHECK (`affected_unit_count >= 1`)
- `notes`: TEXT
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- **Constraints:**
  - `uq_defect_record_inspection_type`: `UNIQUE (inspection_id, defect_type_id)`
  - `chk_defect_affected_le_occurrence`: `affected_unit_count <= occurrence_count`

#### `downtime_records`

Operational stoppage events on lines or machines.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `production_line_id`: UUID NOT NULL REFERENCES `production_lines(id)` ON DELETE RESTRICT
- `machine_id`: UUID REFERENCES `machines(id)` ON DELETE SET NULL
- `batch_id`: UUID REFERENCES `production_batches(id)` ON DELETE SET NULL
- `reason`: VARCHAR(100) NOT NULL
- `category`: VARCHAR(50) NOT NULL DEFAULT 'UNPLANNED' CHECK (`category IN ('PLANNED', 'UNPLANNED')`)
- `started_at`: TIMESTAMPTZ NOT NULL
- `ended_at`: TIMESTAMPTZ
- `duration_seconds`: INT GENERATED ALWAYS AS (
  CASE WHEN ended_at IS NOT NULL THEN CAST(EXTRACT(EPOCH FROM (ended_at - started_at)) AS INT) ELSE NULL END
  ) STORED
- `recorded_by`: UUID REFERENCES `users(id)` ON DELETE SET NULL
- `notes`: TEXT
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- **Constraints:**
  - `chk_downtime_ended_after_started`: `ended_at IS NULL OR ended_at > started_at`

---

### 3.4 Corrective Actions and Auditability

#### `capa_cases`

Corrective and Preventive Action cases.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `case_number`: VARCHAR(100) NOT NULL UNIQUE
- `title`: VARCHAR(200) NOT NULL
- `description`: TEXT NOT NULL
- `source`: VARCHAR(50) NOT NULL CHECK (`source IN ('INSPECTION_FAILURE', 'INTERNAL_AUDIT', 'CUSTOMER_COMPLAINT', 'RECURRING_DEFECT', 'PROCESS_DEVIATION')`)
- `batch_id`: UUID REFERENCES `production_batches(id)` ON DELETE SET NULL
- `defect_record_id`: UUID REFERENCES `defect_records(id)` ON DELETE SET NULL
- `status`: VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (`status IN ('OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'CLOSED', 'CANCELLED')`)
- `assigned_to`: UUID REFERENCES `users(id)` ON DELETE SET NULL
- `created_by`: UUID NOT NULL REFERENCES `users(id)` ON DELETE RESTRICT
- `due_date`: DATE
- `root_cause`: TEXT
- `verified_by`: UUID REFERENCES `users(id)` ON DELETE RESTRICT
- `verified_at`: TIMESTAMPTZ
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- **Constraints:**
  - `chk_capa_closed_verified`: `status <> 'CLOSED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)`

#### `capa_actions`

Individual corrective or preventive action tasks assigned within a CAPA case.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `capa_case_id`: UUID NOT NULL REFERENCES `capa_cases(id)` ON DELETE CASCADE
- `action_type`: VARCHAR(30) NOT NULL CHECK (`action_type IN ('CORRECTIVE', 'PREVENTIVE', 'IMMEDIATE_CONTAINMENT')`)
- `description`: TEXT NOT NULL
- `assigned_to`: UUID REFERENCES `users(id)` ON DELETE SET NULL
- `status`: VARCHAR(30) NOT NULL DEFAULT 'PENDING' CHECK (`status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED')`)
- `due_date`: DATE
- `completed_at`: TIMESTAMPTZ
- `completion_notes`: TEXT
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- `updated_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
- **Constraints:**
  - `chk_capa_action_completed`: `status NOT IN ('COMPLETED', 'VERIFIED') OR completed_at IS NOT NULL`

#### `audit_logs`

Immutable system audit trails.

- `id`: UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `actor_id`: UUID REFERENCES `users(id)` ON DELETE SET NULL
- `action`: VARCHAR(50) NOT NULL (`INSERT`, `UPDATE`, `DELETE`, `STATUS_CHANGE`)
- `entity_type`: VARCHAR(50) NOT NULL (`production_batches`, `quality_inspections`, `capa_cases`, etc.)
- `entity_id`: UUID NOT NULL
- `request_id`: VARCHAR(100)
- `before_state`: JSONB
- `after_state`: JSONB
- `ip_address`: VARCHAR(45)
- `created_at`: TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP

---

## 4. Indexing Strategy

Indexes are created on foreign keys and frequent query filter/join patterns:

- Foreign keys: `user_roles(role_id)`, `machines(production_line_id)`, `production_batches(product_id, production_line_id, shift_id)`, `quality_inspections(batch_id, inspector_id)`, `defect_records(inspection_id, defect_type_id)`, `downtime_records(production_line_id, machine_id)`, `capa_actions(capa_case_id)`.
- Temporal ranges: `production_batches(started_at)`, `quality_inspections(inspected_at)`, `downtime_records(started_at)`, `audit_logs(created_at)`.
- Workflow status filters: `production_batches(status)`, `quality_inspections(status)`, `capa_cases(status, due_date)`, `capa_cases(assigned_to, status)`.

---

## 5. KPI Dictionary & Mathematical Semantics

| KPI Name                          | Formula                                               | Denominator                                            | Source Table                         | Notes & Limitations                                                       |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------- |
| **Inspection Failure Rate**       | `(failed_units / sample_size) * 100`                  | Sample Size (`sample_size`)                            | `quality_inspections`                | Measures sample failure rate. **Never** label as whole-batch defect rate. |
| **First-Pass Inspection Yield**   | `(passed_units / sample_size) * 100`                  | Sample Size (`sample_size` where `attempt_number = 1`) | `quality_inspections`                | Only includes first inspection attempts for the batch stage.              |
| **Batch Acceptance Rate (Yield)** | `(accepted_quantity / produced_quantity) * 100`       | Total Produced Units (`produced_quantity`)             | `production_batches`                 | Authoritative batch production yield.                                     |
| **Batch Scrap Rate**              | `(scrap_quantity / produced_quantity) * 100`          | Total Produced Units (`produced_quantity`)             | `production_batches`                 | Authoritative scrap rate of manufactured output.                          |
| **Batch Rework Rate**             | `(rework_pending_quantity / produced_quantity) * 100` | Total Produced Units (`produced_quantity`)             | `production_batches`                 | Percentage of produced output currently pending rework.                   |
| **Defect Severity Distribution**  | Count of defects grouped by `severity`                | Total Recorded Defects (`COUNT(*)`)                    | `defect_records` JOIN `defect_types` | Reflects defect classification mix, not unit percentages.                 |
| **Downtime Duration**             | `SUM(duration_seconds) / 60` (minutes)                | Operating Time                                         | `downtime_records`                   | Evaluates total lost operating minutes.                                   |
