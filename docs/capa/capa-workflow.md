# QualityOps CAPA Workflow — Closed-Loop Quality Resolution (Phase 8)

## 1. Overview & Purpose

Corrective and Preventive Action (CAPA) establishes a closed-loop engineering process that connects identified nonconformances (e.g., stage-gate inspection failures, recurring defect trends, internal audit findings) to root-cause investigations, assigned remediations, independent effectiveness verification, and auditable closure.

Rather than functioning as an unstructured task list, the QualityOps CAPA subsystem enforces state machine constraints, action isolation, separation of duties between implementers and verifiers, and atomic database audit logging.

---

## 2. Formal Workflow Lifecycle

The CAPA lifecycle follows five distinct operational stages:

```
[ OPEN ]  ──(Action Planning & Assignment)──>  [ IN_PROGRESS ]
   │                                                 │
   │                                           (All Actions Completed)
   │                                                 │
   ▼                                                 ▼
[ CANCELLED ]                                  [ UNDER_REVIEW ]
                                                     │
                                       (Independent QA Verification)
                                           ├── FAIL ──> [ IN_PROGRESS ]
                                           └── PASS ──> [ Verified ]
                                                           │
                                                (Final Closure Review)
                                                           │
                                                           ▼
                                                       [ CLOSED ]
```

### Stage 1: Registration (`OPEN`)

- **Trigger**: Created by `ADMIN`, `QUALITY_MANAGER`, or `SUPERVISOR`.
- **Context Linking**: Optional but standard linkage to an originating `defect_records` finding or `production_batches` batch.
- **Priority Tiers**: Categorized by resolution urgency:
  - `CRITICAL`: Immediate containment required; severe quality/safety nonconformance.
  - `HIGH`: Major defect pattern or process deviation.
  - `MEDIUM`: Standard nonconformance (default).
  - `LOW`: Minor process variance or preventive suggestion.
- **Identification**: Automatically receives an immutable case number `CAPA-YYYY-NNNN`.

### Stage 2: Investigation & Action Planning (`IN_PROGRESS`)

- **Root Cause Analysis**: Investigation notes (such as 5-Why or Ishikawa findings) are recorded into `root_cause`.
- **Action Item Creation**: One or more targeted actions are defined under three categories:
  - `IMMEDIATE_CONTAINMENT`: Quarantine, inventory hold, or immediate line adjustment.
  - `CORRECTIVE`: Remediation addressing the direct failure cause.
  - `PREVENTIVE`: Systemic or tooling enhancements preventing nonconformance recurrence.
- **Assignment & SLA**: Each action receives an assigned user and a target `due_date`.

### Stage 3: Execution & Completion (`IN_PROGRESS` -> `UNDER_REVIEW`)

- **Action Execution**: Assigned action owners carry out the planned tasks.
- **Completion Authorization**:
  - The assigned owner (even if an `OPERATOR` or `INSPECTOR`) can complete their own assigned action.
  - Elevated roles (`ADMIN`, `QUALITY_MANAGER`, `SUPERVISOR`) can complete any action.
  - Non-managers cannot complete actions assigned to another person.
- **Evidence Requirement**: Completion requires non-empty completion notes documenting the action taken and evidence.
- **Automatic State Advancement**: When the final incomplete action on a case is completed, the case automatically transitions to `UNDER_REVIEW`.

### Stage 4: Independent Verification (`UNDER_REVIEW`)

- **Preconditions**:
  1. The case must have at least one registered action.
  2. All actions must be completed (`COMPLETED` or `VERIFIED`).
  3. **Independent Verifier Rule**: An action owner who implemented any action on the case **cannot verify the case**, enforcing an uncompromised separation of duties between action implementation and verification. Only an independent Quality Manager or an Administrator can verify.
- **Verification Outcomes**:
  - `PASS`: Verifier identity (`verified_by`), timestamp (`verified_at`), and notes are recorded. Status moves to `UNDER_REVIEW` (ready for closure).
  - `FAIL`: Case transitions back to `IN_PROGRESS` for corrective iteration; `verified_by` and `verified_at` remain unset.

### Stage 5: Auditable Closure (`CLOSED`)

- **Preconditions**:
  1. All actions must be completed.
  2. The case must have an authorized passing verification (`verified_by` and `verified_at` are present).
  3. Mandatory closure notes must be provided.
- **Post-Closure Invariant**: A closed case cannot be mutated or reopened without authorized administrator intervention. Direct PATCH requests attempting `status: "CLOSED"` are rejected; closure must follow the formal `/close` workflow.

---

## 3. Database Check Constraints & Invariants

| Invariant / Constraint      | Database Enforcement                                                          | Behavioral Guarantee                                                                        |
| :-------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| `chk_capa_closed_verified`  | `status <> 'CLOSED' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)` | Database rejects any direct row update to `CLOSED` unless verification metadata is present. |
| `chk_capa_action_completed` | `status <> 'COMPLETED' OR (completed_at IS NOT NULL)`                         | An action cannot enter `COMPLETED` without recording the exact completion instant.          |
| `chk_capa_cases_priority`   | `priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')`                           | Enforces standardized priority taxonomy.                                                    |
| Action Isolation            | Application SQL: `WHERE id = $1 AND capa_case_id = $2`                        | Prevents modifying an action through an unassociated parent case URL.                       |
| Non-Destructive Storage     | Absence of DELETE routes (HTTP 404)                                           | Quality records are permanent and auditable; never purged.                                  |

---

## 4. Role Authorization Matrix

| Action                         | `ADMIN` | `QUALITY_MANAGER` | `SUPERVISOR` | `INSPECTOR` | `OPERATOR` | `VIEWER` |
| :----------------------------- | :-----: | :---------------: | :----------: | :---------: | :--------: | :------: |
| View cases & details           |   Yes   |        Yes        |     Yes      |     Yes     |    Yes     |   Yes    |
| Create CAPA cases              |   Yes   |        Yes        |     Yes      |     No      |     No     |    No    |
| Update CAPA cases              |   Yes   |        Yes        |     Yes      |     No      |     No     |    No    |
| Create & update actions        |   Yes   |        Yes        |     Yes      |     No      |     No     |    No    |
| Complete own assigned action   |   Yes   |        Yes        |     Yes      |     Yes     |    Yes     |    No    |
| Complete others' actions       |   Yes   |        Yes        |     Yes      |     No      |     No     |    No    |
| Verify CAPA case (independent) |   Yes   |       Yes*        |      No      |     No      |     No     |    No    |
| Close CAPA case                |   Yes   |        Yes        |      No      |     No      |     No     |    No    |

_\*Subject to the Independent Verifier Rule: cannot verify if assigned as an action owner on that case._
