# QualityOps — Data Dictionary

**Document Version:** 2.0 (Phase 2 Baseline)  
**Database Engine:** PostgreSQL 18.x

---

## 1. Identity & Access

### 1.1 `users`

| Column Name     | Data Type    | Nullable | Default             | Constraints / Allowed Values | Description                                   |
| --------------- | ------------ | -------- | ------------------- | ---------------------------- | --------------------------------------------- |
| `id`            | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                  | Unique user identifier.                       |
| `username`      | VARCHAR(50)  | No       | None                | UNIQUE                       | Login username.                               |
| `email`         | VARCHAR(255) | No       | None                | UNIQUE                       | Email address for identification and contact. |
| `password_hash` | VARCHAR(255) | No       | None                | None                         | Secure password hash (Argon2id/bcrypt).       |
| `full_name`     | VARCHAR(100) | No       | None                | None                         | User's full real name.                        |
| `is_active`     | BOOLEAN      | No       | `true`              | None                         | Account active status flag.                   |
| `created_at`    | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                         | Record creation instant (UTC).                |
| `updated_at`    | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                         | Last update instant (UTC).                    |

### 1.2 `roles`

| Column Name   | Data Type   | Nullable | Default             | Constraints / Allowed Values | Description                                                                                           |
| ------------- | ----------- | -------- | ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `id`          | UUID        | No       | `gen_random_uuid()` | PRIMARY KEY                  | Unique role identifier.                                                                               |
| `name`        | VARCHAR(50) | No       | None                | UNIQUE                       | System role identifier (`ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`, `INSPECTOR`, `OPERATOR`, `VIEWER`). |
| `description` | TEXT        | Yes      | None                | None                         | Human-readable role description.                                                                      |
| `created_at`  | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                         | Record creation instant (UTC).                                                                        |
| `updated_at`  | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                         | Last update instant (UTC).                                                                            |

### 1.3 `user_roles`

| Column Name   | Data Type   | Nullable | Default             | Constraints / Allowed Values                  | Description                    |
| ------------- | ----------- | -------- | ------------------- | --------------------------------------------- | ------------------------------ |
| `user_id`     | UUID        | No       | None                | PRIMARY KEY, FK `users(id)` ON DELETE CASCADE | Associated user.               |
| `role_id`     | UUID        | No       | None                | PRIMARY KEY, FK `roles(id)` ON DELETE CASCADE | Associated role.               |
| `assigned_at` | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                                          | Role assignment instant (UTC). |

### 1.4 `refresh_sessions` (Phase 3 Baseline)

| Column Name    | Data Type   | Nullable | Default             | Constraints / Allowed Values              | Description                                                |
| -------------- | ----------- | -------- | ------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| `id`           | UUID        | No       | `gen_random_uuid()` | PRIMARY KEY                               | Unique session identifier.                                 |
| `user_id`      | UUID        | No       | None                | FK `users(id)` ON DELETE CASCADE          | Associated user account.                                   |
| `token_hash`   | VARCHAR(64) | No       | None                | UNIQUE                                    | SHA-256 hash of rotating refresh token (raw token not DB). |
| `expires_at`   | TIMESTAMPTZ | No       | None                | Index                                     | Absolute expiration timestamp of refresh session.          |
| `revoked_at`   | TIMESTAMPTZ | Yes      | None                | Index, `CHECK (revoked_at >= created_at)` | Instant when session was explicitly revoked or rotated.    |
| `created_at`   | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                                      | Record creation instant (UTC).                             |
| `last_used_at` | TIMESTAMPTZ | Yes      | None                | None                                      | Timestamp of last token rotation / session use.            |
| `user_agent`   | TEXT        | Yes      | None                | None                                      | User-Agent header string for device auditability.          |
| `ip_address`   | VARCHAR(45) | Yes      | None                | None                                      | Client IP address (IPv4/IPv6) at session creation.         |

---

## 2. Master Data

### 2.1 `products`

| Column Name                 | Data Type     | Nullable | Default             | Constraints / Allowed Values | Description                                 |
| --------------------------- | ------------- | -------- | ------------------- | ---------------------------- | ------------------------------------------- |
| `id`                        | UUID          | No       | `gen_random_uuid()` | PRIMARY KEY                  | Unique product identifier.                  |
| `code`                      | VARCHAR(50)   | No       | None                | UNIQUE                       | Catalog SKU / Part Number.                  |
| `name`                      | VARCHAR(150)  | No       | None                | None                         | Commercial product title.                   |
| `description`               | TEXT          | Yes      | None                | None                         | Technical or catalog specification details. |
| `target_cycle_time_seconds` | NUMERIC(10,2) | Yes      | None                | `CHECK (> 0)`                | Nominal unit cycle time in seconds.         |
| `is_active`                 | BOOLEAN       | No       | `true`              | None                         | Whether product is actively in production.  |
| `created_at`                | TIMESTAMPTZ   | No       | `CURRENT_TIMESTAMP` | None                         | Record creation instant (UTC).              |
| `updated_at`                | TIMESTAMPTZ   | No       | `CURRENT_TIMESTAMP` | None                         | Last update instant (UTC).                  |

### 2.2 `production_lines`

| Column Name  | Data Type    | Nullable | Default             | Constraints / Allowed Values | Description                             |
| ------------ | ------------ | -------- | ------------------- | ---------------------------- | --------------------------------------- |
| `id`         | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                  | Unique line identifier.                 |
| `code`       | VARCHAR(50)  | No       | None                | UNIQUE                       | Line code (e.g. `LINE-01`).             |
| `name`       | VARCHAR(100) | No       | None                | None                         | Human-readable name.                    |
| `location`   | VARCHAR(100) | Yes      | None                | None                         | Physical factory floor location or bay. |
| `is_active`  | BOOLEAN      | No       | `true`              | None                         | Operational status.                     |
| `created_at` | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                         | Record creation instant (UTC).          |
| `updated_at` | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                         | Last update instant (UTC).              |

### 2.3 `machines`

| Column Name          | Data Type    | Nullable | Default             | Constraints / Allowed Values                    | Description                      |
| -------------------- | ------------ | -------- | ------------------- | ----------------------------------------------- | -------------------------------- |
| `id`                 | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                                     | Unique machine identifier.       |
| `code`               | VARCHAR(50)  | No       | None                | UNIQUE                                          | Asset code (e.g. `MCH-01`).      |
| `name`               | VARCHAR(100) | No       | None                | None                                            | Machine model/name.              |
| `production_line_id` | UUID         | No       | None                | FK `production_lines(id)` ON DELETE RESTRICT    | Line the machine is assigned to. |
| `status`             | VARCHAR(30)  | No       | `'IDLE'`            | `IN ('IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE')` | Current operational state.       |
| `is_active`          | BOOLEAN      | No       | `true`              | None                                            | Machine active status.           |
| `created_at`         | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                            | Record creation instant (UTC).   |
| `updated_at`         | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                            | Last update instant (UTC).       |

### 2.4 `shifts`

| Column Name  | Data Type    | Nullable | Default             | Constraints / Allowed Values | Description                            |
| ------------ | ------------ | -------- | ------------------- | ---------------------------- | -------------------------------------- |
| `id`         | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                  | Unique shift identifier.               |
| `code`       | VARCHAR(50)  | No       | None                | UNIQUE                       | Shift code (e.g. `SHIFT-MORNING`).     |
| `name`       | VARCHAR(100) | No       | None                | None                         | Shift name.                            |
| `start_time` | TIME         | No       | None                | None                         | Scheduled start time of shift.         |
| `end_time`   | TIME         | No       | None                | None                         | Scheduled end time of shift.           |
| `is_active`  | BOOLEAN      | No       | `true`              | None                         | Operational status (Phase 4 addition). |
| `created_at` | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                         | Record creation instant (UTC).         |
| `updated_at` | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                         | Last update instant (UTC).             |

### 2.5 `defect_types`

| Column Name  | Data Type    | Nullable | Default             | Constraints / Allowed Values        | Description                                                        |
| ------------ | ------------ | -------- | ------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `id`         | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                         | Unique defect type identifier.                                     |
| `code`       | VARCHAR(50)  | No       | None                | UNIQUE                              | Standard defect code (e.g. `DEF-CRACK`).                           |
| `name`       | VARCHAR(100) | No       | None                | None                                | Defect description.                                                |
| `category`   | VARCHAR(50)  | No       | None                | None                                | Category (e.g. `DIMENSIONAL`, `VISUAL`, `FUNCTIONAL`, `MATERIAL`). |
| `severity`   | VARCHAR(20)  | No       | `'MINOR'`           | `IN ('MINOR', 'MAJOR', 'CRITICAL')` | Defect severity tier.                                              |
| `is_active`  | BOOLEAN      | No       | `true`              | None                                | Active defect status.                                              |
| `created_at` | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                | Record creation instant (UTC).                                     |
| `updated_at` | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                | Last update instant (UTC).                                         |

---

## 3. Production & Quality Execution

### 3.1 `production_batches`

| Column Name               | Data Type    | Nullable | Default             | Constraints / Allowed Values                                         | Description                                |
| ------------------------- | ------------ | -------- | ------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| `id`                      | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                                                          | Unique production batch identifier.        |
| `batch_number`            | VARCHAR(100) | No       | None                | UNIQUE                                                               | Work order / batch tracking code.          |
| `product_id`              | UUID         | No       | None                | FK `products(id)` ON DELETE RESTRICT                                 | Manufactured product reference.            |
| `production_line_id`      | UUID         | No       | None                | FK `production_lines(id)` ON DELETE RESTRICT                         | Production line where batch was run.       |
| `shift_id`                | UUID         | No       | None                | FK `shifts(id)` ON DELETE RESTRICT                                   | Shift during which batch was produced.     |
| `machine_id`              | UUID         | Yes      | None                | FK `machines(id)` ON DELETE SET NULL                                 | Primary machine utilized.                  |
| `created_by`              | UUID         | Yes      | None                | FK `users(id)` ON DELETE SET NULL                                    | Authorizing user or supervisor.            |
| `status`                  | VARCHAR(30)  | No       | `'PLANNED'`         | `IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ON_HOLD')` | Lifecycle stage of batch.                  |
| `planned_quantity`        | INT          | No       | None                | `CHECK (> 0)`                                                        | Planned production units.                  |
| `produced_quantity`       | INT          | No       | `0`                 | `CHECK (>= 0)`                                                       | Total physical units manufactured.         |
| `accepted_quantity`       | INT          | No       | `0`                 | `CHECK (>= 0)`                                                       | Conforming units accepted.                 |
| `scrap_quantity`          | INT          | No       | `0`                 | `CHECK (>= 0)`                                                       | Non-conforming units permanently scrapped. |
| `rework_pending_quantity` | INT          | No       | `0`                 | `CHECK (>= 0)`                                                       | Non-conforming units awaiting rework.      |
| `started_at`              | TIMESTAMPTZ  | Yes      | None                | None                                                                 | Batch execution start time (UTC).          |
| `completed_at`            | TIMESTAMPTZ  | Yes      | None                | `CHECK (completed_at >= started_at)`                                 | Batch execution completion time (UTC).     |
| `created_at`              | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                 | Record creation instant (UTC).             |
| `updated_at`              | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                 | Last update instant (UTC).                 |

_Table Constraints:_

- `chk_batch_disposition_sum`: `accepted_quantity + scrap_quantity + rework_pending_quantity <= produced_quantity`
- `chk_batch_completed_reconciled`: `status <> 'COMPLETED' OR (accepted_quantity + scrap_quantity + rework_pending_quantity = produced_quantity)`

### 3.2 `quality_inspections`

| Column Name         | Data Type    | Nullable | Default             | Constraints / Allowed Values                   | Description                                            |
| ------------------- | ------------ | -------- | ------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `id`                | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                                    | Unique inspection identifier.                          |
| `inspection_number` | VARCHAR(100) | No       | None                | UNIQUE                                         | Official inspection code.                              |
| `batch_id`          | UUID         | No       | None                | FK `production_batches(id)` ON DELETE CASCADE  | Associated production batch.                           |
| `inspector_id`      | UUID         | No       | None                | FK `users(id)` ON DELETE RESTRICT              | Inspector performing evaluation.                       |
| `stage`             | VARCHAR(50)  | No       | None                | None                                           | Inspection phase (`IN_PROCESS`, `FINAL`, `RECEIVING`). |
| `attempt_number`    | INT          | No       | `1`                 | `CHECK (>= 1)`                                 | Attempt index (1 for first-pass inspection).           |
| `status`            | VARCHAR(30)  | No       | `'IN_PROGRESS'`     | `IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED')` | Status of inspection process.                          |
| `result`            | VARCHAR(20)  | Yes      | None                | `IN ('PASS', 'FAIL', 'CONDITIONAL')`           | Inspection outcome verdict.                            |
| `sample_size`       | INT          | No       | None                | `CHECK (> 0)`                                  | Number of sample units inspected.                      |
| `passed_units`      | INT          | No       | `0`                 | `CHECK (>= 0)`                                 | Sample units passing inspection.                       |
| `failed_units`      | INT          | No       | `0`                 | `CHECK (>= 0)`                                 | Sample units failing inspection.                       |
| `inspected_at`      | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                           | Time inspection was executed (UTC).                    |
| `notes`             | TEXT         | Yes      | None                | None                                           | Qualitative inspector comments.                        |
| `created_at`        | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                           | Record creation instant (UTC).                         |
| `updated_at`        | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                           | Last update instant (UTC).                             |

_Table Constraints:_

- `uq_inspection_batch_stage_attempt`: `UNIQUE (batch_id, stage, attempt_number)`
- `chk_inspection_units_sum`: `passed_units + failed_units <= sample_size`
- `chk_inspection_completed_reconciled`: `status <> 'COMPLETED' OR (passed_units + failed_units = sample_size)`
- `chk_inspection_completed_result`: `status <> 'COMPLETED' OR result IS NOT NULL`

### 3.3 `defect_records`

| Column Name           | Data Type   | Nullable | Default             | Constraints / Allowed Values                   | Description                                      |
| --------------------- | ----------- | -------- | ------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `id`                  | UUID        | No       | `gen_random_uuid()` | PRIMARY KEY                                    | Unique defect entry identifier.                  |
| `inspection_id`       | UUID        | No       | None                | FK `quality_inspections(id)` ON DELETE CASCADE | Inspection where defects were identified.        |
| `defect_type_id`      | UUID        | No       | None                | FK `defect_types(id)` ON DELETE RESTRICT       | Defect classification code.                      |
| `occurrence_count`    | INT         | No       | None                | `CHECK (>= 1)`                                 | Total count of defect occurrences found.         |
| `affected_unit_count` | INT         | No       | None                | `CHECK (>= 1)`                                 | Distinct inspected units exhibiting this defect. |
| `notes`               | TEXT        | Yes      | None                | None                                           | Inspector observations.                          |
| `created_at`          | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                                           | Record creation instant (UTC).                   |
| `updated_at`          | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                                           | Last update instant (UTC).                       |

_Table Constraints:_

- `uq_defect_record_inspection_type`: `UNIQUE (inspection_id, defect_type_id)`
- `chk_defect_affected_le_occurrence`: `affected_unit_count <= occurrence_count`

### 3.4 `downtime_records`

| Column Name          | Data Type    | Nullable | Default             | Constraints / Allowed Values                   | Description                               |
| -------------------- | ------------ | -------- | ------------------- | ---------------------------------------------- | ----------------------------------------- |
| `id`                 | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                                    | Unique downtime event identifier.         |
| `production_line_id` | UUID         | No       | None                | FK `production_lines(id)` ON DELETE RESTRICT   | Affected production line.                 |
| `machine_id`         | UUID         | Yes      | None                | FK `machines(id)` ON DELETE SET NULL           | Specific equipment item causing stoppage. |
| `batch_id`           | UUID         | Yes      | None                | FK `production_batches(id)` ON DELETE SET NULL | Batch interrupted by downtime.            |
| `reason`             | VARCHAR(100) | No       | None                | None                                           | Root operational stoppage reason.         |
| `category`           | VARCHAR(50)  | No       | `'UNPLANNED'`       | `IN ('PLANNED', 'UNPLANNED')`                  | Classification of downtime.               |
| `started_at`         | TIMESTAMPTZ  | No       | None                | None                                           | Start instant of downtime (UTC).          |
| `ended_at`           | TIMESTAMPTZ  | Yes      | None                | `CHECK (ended_at > started_at)`                | Resolution instant of downtime (UTC).     |
| `duration_seconds`   | INT          | Yes      | None                | STORED GENERATED                               | Stoppage elapsed duration in seconds.     |
| `recorded_by`        | UUID         | Yes      | None                | FK `users(id)` ON DELETE SET NULL              | Operator logging downtime.                |
| `notes`              | TEXT         | Yes      | None                | None                                           | Descriptive notes.                        |
| `created_at`         | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                           | Record creation instant (UTC).            |
| `updated_at`         | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                           | Last update instant (UTC).                |

---

## 4. Corrective Actions & Auditability

### 4.1 `capa_cases`

| Column Name          | Data Type    | Nullable | Default             | Constraints / Allowed Values                                                                                 | Description                                    |
| -------------------- | ------------ | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `id`                 | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                                                                                                  | Unique CAPA case identifier.                   |
| `case_number`        | VARCHAR(100) | No       | None                | UNIQUE                                                                                                       | Formal case identifier (e.g. `CAPA-2026-001`). |
| `title`              | VARCHAR(200) | No       | None                | None                                                                                                         | Brief problem statement title.                 |
| `description`        | TEXT         | No       | None                | None                                                                                                         | Full nonconformance problem description.       |
| `source`             | VARCHAR(50)  | No       | None                | `IN ('INSPECTION_FAILURE', 'INTERNAL_AUDIT', 'CUSTOMER_COMPLAINT', 'RECURRING_DEFECT', 'PROCESS_DEVIATION')` | Trigger origin of CAPA case.                   |
| `priority`           | VARCHAR(20)  | No       | `'MEDIUM'`          | `IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`                                                                   | Case resolution priority & SLA tier.           |
| `batch_id`           | UUID         | Yes      | None                | FK `production_batches(id)` ON DELETE SET NULL                                                               | Related production batch.                      |
| `defect_record_id`   | UUID         | Yes      | None                | FK `defect_records(id)` ON DELETE SET NULL                                                                   | Specific originating defect record.            |
| `status`             | VARCHAR(30)  | No       | `'OPEN'`            | `IN ('OPEN', 'IN_PROGRESS', 'UNDER_REVIEW', 'CLOSED', 'CANCELLED')`                                          | Workflow state.                                |
| `assigned_to`        | UUID         | Yes      | None                | FK `users(id)` ON DELETE SET NULL                                                                            | Responsible quality engineer / owner.          |
| `created_by`         | UUID         | No       | None                | FK `users(id)` ON DELETE RESTRICT                                                                            | Initiating user.                               |
| `due_date`           | DATE         | Yes      | None                | None                                                                                                         | Target resolution date.                        |
| `root_cause`         | TEXT         | Yes      | None                | None                                                                                                         | 5-Why or Ishikawa root cause analysis.         |
| `verified_by`        | UUID         | Yes      | None                | FK `users(id)` ON DELETE RESTRICT                                                                            | QA authority verifying corrective action.      |
| `verified_at`        | TIMESTAMPTZ  | Yes      | None                | None                                                                                                         | Verification timestamp (UTC).                  |
| `verification_notes` | TEXT         | Yes      | None                | None                                                                                                         | Evidence and evaluation notes of verification. |
| `created_at`         | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                                                         | Record creation instant (UTC).                 |
| `updated_at`         | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                                                         | Last update instant (UTC).                     |

_Table Constraints:_

- `chk_capa_closed_verified`: `status <> 'CLOSED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)`
- `chk_capa_cases_priority`: `priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`

### 4.2 `capa_actions`

| Column Name        | Data Type   | Nullable | Default             | Constraints / Allowed Values                                          | Description                            |
| ------------------ | ----------- | -------- | ------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| `id`               | UUID        | No       | `gen_random_uuid()` | PRIMARY KEY                                                           | Unique CAPA action identifier.         |
| `capa_case_id`     | UUID        | No       | None                | FK `capa_cases(id)` ON DELETE CASCADE                                 | Associated parent CAPA case.           |
| `action_type`      | VARCHAR(30) | No       | None                | `IN ('CORRECTIVE', 'PREVENTIVE', 'IMMEDIATE_CONTAINMENT')`            | Functional action type.                |
| `description`      | TEXT        | No       | None                | None                                                                  | Action plan description.               |
| `assigned_to`      | UUID        | Yes      | None                | FK `users(id)` ON DELETE SET NULL                                     | Action assignee.                       |
| `status`           | VARCHAR(30) | No       | `'PENDING'`         | `IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'CANCELLED')` | Action execution state.                |
| `due_date`         | DATE        | Yes      | None                | None                                                                  | Target completion date.                |
| `completed_at`     | TIMESTAMPTZ | Yes      | None                | None                                                                  | Completion timestamp (UTC).            |
| `completion_notes` | TEXT        | Yes      | None                | None                                                                  | Evidence notes documenting completion. |
| `created_at`       | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                                                                  | Record creation instant (UTC).         |
| `updated_at`       | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                                                                  | Last update instant (UTC).             |

_Table Constraints:_

- `chk_capa_action_completed`: `status NOT IN ('COMPLETED', 'VERIFIED') OR completed_at IS NOT NULL`

### 4.3 `audit_logs`

| Column Name    | Data Type    | Nullable | Default             | Constraints / Allowed Values      | Description                                                |
| -------------- | ------------ | -------- | ------------------- | --------------------------------- | ---------------------------------------------------------- |
| `id`           | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                       | Unique audit entry identifier.                             |
| `actor_id`     | UUID         | Yes      | None                | FK `users(id)` ON DELETE SET NULL | User executing the change.                                 |
| `action`       | VARCHAR(50)  | No       | None                | None                              | Operation (`INSERT`, `UPDATE`, `DELETE`, `STATUS_CHANGE`). |
| `entity_type`  | VARCHAR(50)  | No       | None                | None                              | Target domain table/resource.                              |
| `entity_id`    | UUID         | No       | None                | None                              | Target entity UUID.                                        |
| `request_id`   | VARCHAR(100) | Yes      | None                | None                              | Trace correlation request ID.                              |
| `before_state` | JSONB        | Yes      | None                | None                              | JSON snapshot of entity before change.                     |
| `after_state`  | JSONB        | Yes      | None                | None                              | JSON snapshot of entity after change.                      |
| `ip_address`   | VARCHAR(45)  | Yes      | None                | None                              | Client IP address.                                         |
| `created_at`   | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                              | Audit log instant (UTC).                                   |

---

## 5. Reporting & Operational Alerts (Phase 10 Baseline)

### 5.1 `scheduled_reports`

| Column Name   | Data Type    | Nullable | Default             | Constraints / Allowed Values                                                                           | Description                                                    |
| ------------- | ------------ | -------- | ------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `id`          | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                                                                                            | Unique scheduled report identifier.                            |
| `name`        | VARCHAR(100) | No       | None                | None                                                                                                   | Human-readable schedule title.                                 |
| `report_type` | VARCHAR(50)  | No       | None                | `IN ('production-performance', 'inspection-summary', 'defect-analysis', 'capa-status', 'spc-summary')` | Domain report catalogue identifier.                            |
| `format`      | VARCHAR(10)  | No       | None                | `IN ('CSV', 'XLSX', 'PDF')`                                                                            | Target export document format.                                 |
| `filters`     | JSONB        | No       | `'{}'::jsonb`       | None                                                                                                   | Parameterized report filter criteria (products, lines, dates). |
| `cadence`     | VARCHAR(20)  | No       | None                | `IN ('DAILY', 'WEEKLY', 'MONTHLY')`                                                                    | Recurrence schedule frequency.                                 |
| `timezone`    | VARCHAR(50)  | No       | `'UTC'`             | None                                                                                                   | Recurrence timezone calculation base.                          |
| `is_enabled`  | BOOLEAN      | No       | `true`              | None                                                                                                   | Active execution flag.                                         |
| `created_by`  | UUID         | Yes      | None                | FK `users(id)` ON DELETE SET NULL                                                                      | Author of the schedule.                                        |
| `next_run_at` | TIMESTAMPTZ  | No       | None                | Index                                                                                                  | Instant when worker script may next claim this schedule.       |
| `last_run_at` | TIMESTAMPTZ  | Yes      | None                | None                                                                                                   | Instant when the schedule was last triggered.                  |
| `created_at`  | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                                                   | Record creation instant (UTC).                                 |
| `updated_at`  | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                                                   | Last update instant (UTC).                                     |

### 5.2 `report_runs`

| Column Name           | Data Type   | Nullable | Default             | Constraints / Allowed Values                                                                           | Description                                                  |
| --------------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `id`                  | UUID        | No       | `gen_random_uuid()` | PRIMARY KEY                                                                                            | Unique report execution run identifier.                      |
| `scheduled_report_id` | UUID        | Yes      | None                | FK `scheduled_reports(id)` ON DELETE SET NULL                                                          | Associated recurring schedule (NULL for ad-hoc worker runs). |
| `report_type`         | VARCHAR(50) | No       | None                | `IN ('production-performance', 'inspection-summary', 'defect-analysis', 'capa-status', 'spc-summary')` | Domain report catalogue identifier.                          |
| `format`              | VARCHAR(10) | No       | None                | `IN ('CSV', 'XLSX', 'PDF')`                                                                            | Generated export document format.                            |
| `filters`             | JSONB       | No       | `'{}'::jsonb`       | None                                                                                                   | Exact filter parameters used during report execution.        |
| `status`              | VARCHAR(20) | No       | `'QUEUED'`          | `IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')`                                                      | Lifecycle status of the generation run.                      |
| `artifact_id`         | UUID        | Yes      | None                | None                                                                                                   | Opaque UUID identifier of stored artifact file.              |
| `file_size_bytes`     | BIGINT      | Yes      | None                | None                                                                                                   | Size of exported artifact in bytes.                          |
| `error_message`       | TEXT        | Yes      | None                | None                                                                                                   | Error diagnostic if status transitioned to FAILED.           |
| `started_at`          | TIMESTAMPTZ | Yes      | None                | None                                                                                                   | Timestamp when worker process claimed and began execution.   |
| `completed_at`        | TIMESTAMPTZ | Yes      | None                | None                                                                                                   | Timestamp when artifact generation succeeded or failed.      |
| `triggered_by`        | UUID        | Yes      | None                | FK `users(id)` ON DELETE SET NULL                                                                      | User actor if triggered manually via API/CLI.                |
| `created_at`          | TIMESTAMPTZ | No       | `CURRENT_TIMESTAMP` | None                                                                                                   | Record creation instant (UTC).                               |

### 5.3 `operational_alerts`

| Column Name        | Data Type    | Nullable | Default             | Constraints / Allowed Values                                                | Description                                                      |
| ------------------ | ------------ | -------- | ------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `id`               | UUID         | No       | `gen_random_uuid()` | PRIMARY KEY                                                                 | Unique operational alert identifier.                             |
| `rule_type`        | VARCHAR(50)  | No       | None                | `IN ('HIGH_INSPECTION_FAILURE_RATE', 'OVERDUE_CAPA', 'SPC_OUT_OF_CONTROL')` | Operational rule that triggered this alert.                      |
| `severity`         | VARCHAR(20)  | No       | None                | `IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`                                  | Risk severity level.                                             |
| `status`           | VARCHAR(20)  | No       | `'OPEN'`            | `IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')`                                   | Alert remediation lifecycle state.                               |
| `title`            | VARCHAR(255) | No       | None                | None                                                                        | Summary headline of the anomaly.                                 |
| `message`          | TEXT         | No       | None                | None                                                                        | Detailed description including exact metrics and thresholds.     |
| `fingerprint`      | VARCHAR(255) | No       | None                | Partial Unique Index (`WHERE status IN ('OPEN', 'ACKNOWLEDGED')`)           | Deterministic deduplication hash.                                |
| `entity_type`      | VARCHAR(50)  | No       | None                | None                                                                        | Associated target entity type (`INSPECTION`, `CAPA_CASE`, etc.). |
| `entity_id`        | UUID         | No       | None                | None                                                                        | Associated target entity UUID.                                   |
| `context_data`     | JSONB        | No       | `'{}'::jsonb`       | None                                                                        | Snapshot of underlying values (rates, limits, dates).            |
| `acknowledged_by`  | UUID         | Yes      | None                | FK `users(id)` ON DELETE SET NULL                                           | Operator or manager who acknowledged the anomaly.                |
| `acknowledged_at`  | TIMESTAMPTZ  | Yes      | None                | None                                                                        | Timestamp of acknowledgment (UTC).                               |
| `resolved_by`      | UUID         | Yes      | None                | FK `users(id)` ON DELETE SET NULL                                           | Operator or manager who resolved the alert.                      |
| `resolved_at`      | TIMESTAMPTZ  | Yes      | None                | None                                                                        | Timestamp of resolution (UTC).                                   |
| `resolution_notes` | TEXT         | Yes      | None                | None                                                                        | Mandatory documented notes detailing the remediation actions.    |
| `created_at`       | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                        | Record creation instant (UTC).                                   |
| `updated_at`       | TIMESTAMPTZ  | No       | `CURRENT_TIMESTAMP` | None                                                                        | Last update instant (UTC).                                       |

_Table Constraints & Indexes:_

- `uq_operational_alerts_active_fingerprint`: `CREATE UNIQUE INDEX uq_operational_alerts_active_fingerprint ON operational_alerts (fingerprint) WHERE status IN ('OPEN', 'ACKNOWLEDGED')`
