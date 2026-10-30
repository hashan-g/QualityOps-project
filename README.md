# QualityOps — Manufacturing Quality & Process Analytics Platform

**Phase 12: Notification Engine, Configured Email Delivery & Operational Dispatch**  
**Status:** Implemented & Verified Baseline  
**Date:** October 2026  
**Owner:** Project owner / developer

---

## 1. Product Purpose

QualityOps is an engineering platform designed for manufacturing quality tracking, defect management, process analytics, closed-loop corrective action, statistical process monitoring (SPC), standardized reporting, secure exports, operational alert surveillance, and multi-channel notification dispatch.

> **Phase 12 Scope Guard Notice:**  
> This phase establishes in-app notifications, durable email delivery tracking, asynchronous worker dispatch (`FOR UPDATE SKIP LOCKED`), configurable SMTP transport with strict production validation, operational alerts and scheduled report routing to authorized roles, and an authenticated in-app Notification Center. Outbound webhooks and SMS delivery remain out of scope until dedicated providers and signing mechanisms are introduced.

---

## 2. Architecture Baseline

The repository is structured as an npm workspace monorepo with an auxiliary Python analytics microservice:

- **Web Client (`apps/web`):** React 19 + TypeScript + Vite 6 (In-memory access token state, Notification Center & Bell widget with live unread badge, Reports & Safe Exports view with on-screen preview, CSV/XLSX/PDF triggers, recipient configuration, and schedule management, Operational Alerts view with severity triage, KPI summary, evaluation trigger, and mandatory resolution modal, SPC Monitoring view with variable stepped limits, CAPA management view, defect findings repository with Pareto and descriptive analytics, quality inspections view, production batches view, downtime tracking, and master-data management shell)
- **Backend API (`apps/api`):** Node.js 24 LTS + Express + TypeScript + `pg` connection pool + Argon2id + JWT + Reporting Engine (CSV RFC 4180 / ExcelJS / PDFKit), Scheduled Report Runner, Operational Alerts Evaluator with idempotent partial unique constraints, SPC Analytics module with timeout handling and 503 fallback, CAPA Management, Defect Management, Descriptive Analytics, Quality Inspections, Production Management, Downtime & Master Data modules + Audit Logging service
- **Analytics Microservice (`services/analytics`):** Python 3.12+ + FastAPI + Pydantic v2 + Uvicorn (Stateless, isolated calculations, zero direct database access, variable p-chart control limits, strict 20-subgroup guardrail, degenerate baseline detection, unrounded 3-sigma signal detection)
- **Shared Contracts (`packages/contracts`):** TypeScript types & Zod validation schemas for Report queries, summaries, rows, export options, Scheduled Reports, Report Runs, Operational Alerts, evaluation results, SPC p-charts, CAPA cases, actions, defect findings, and master data
- **Database (`database`):** PostgreSQL 18 via Docker Compose (`compose.yaml`); versioned SQL migrations under `database/migrations` via `node-pg-migrate`
- **Quality Gates:** Strict TypeScript (`exactOptionalPropertyTypes`), Prettier, ESLint flat config, Vitest, Pytest, Supertest, and GitHub Actions CI

---

## 3. Prerequisites

- **Node.js:** `v24.x` LTS (enforced via `.nvmrc`)
- **npm:** `v11.x` (bundled with Node 24)
- **Python:** `v3.12+` with `pip` (for `services/analytics`)
- **Docker & Docker Compose:** Docker Desktop with Compose support (for PostgreSQL 18)

---

## 4. Local Quickstart

### Step 1: Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

_(On Windows PowerShell: `Copy-Item .env.example .env`)_  
Set local development passwords and authentication secrets (`JWT_ACCESS_SECRET`, `COOKIE_SECRET`) in `.env`. **Never commit `.env` files.**

### Step 2: Start PostgreSQL Database

```bash
docker compose up -d postgres
```

This spins up PostgreSQL 18 with a persistent volume (`qualityops_postgres_data`), bound to `127.0.0.1:5432`, with an automated health check (`pg_isready`).

### Step 3: Run Database Migrations

Apply versioned schema migrations:

```bash
npm run db:migrate
```

To check migration status:

```bash
npm run db:migrate:status
```

### Step 4: Bootstrap Initial Administrator

To safely create the initial administrator without hardcoding credentials:

```bash
# Non-interactive mode (e.g. CI or deployment pipeline):
ADMIN_USERNAME="admin" \
ADMIN_EMAIL="admin@qualityops.local" \
ADMIN_PASSWORD="YourSecurePassword123!" \
npm run db:bootstrap-admin

# Interactive mode (prompts securely for password):
npm run db:bootstrap-admin

# Reset administrator password (prompts securely with hidden password input):
npm run db:reset-admin-password
```

### Step 5: Run Development Services

Start Web, API, and Analytics microservice concurrently:

```bash
npm run dev
```

- **Web App:** Available at [http://localhost:5173](http://localhost:5173)
- **API Server:** Available at [http://localhost:4000](http://localhost:4000)
- **Analytics Microservice:** Available at [http://localhost:8000](http://localhost:8000)
- **API Health Probes:**
  - `GET http://localhost:4000/api/v1/health` (Liveness)
  - `GET http://localhost:4000/api/v1/health/ready` (Readiness)
  - `GET http://localhost:8000/health` (Analytics service liveness)
- **Authentication Endpoints:**
  - `POST http://localhost:4000/api/v1/auth/login` (Login)
  - `POST http://localhost:4000/api/v1/auth/refresh` (Session rotation)
  - `POST http://localhost:4000/api/v1/auth/logout` (Logout)
  - `GET http://localhost:4000/api/v1/auth/me` (Current user profile)
- **User Management Endpoints (ADMIN only):**
  - `GET http://localhost:4000/api/v1/users` (List users)
  - `POST http://localhost:4000/api/v1/users` (Provision user)
  - `GET http://localhost:4000/api/v1/users/:id` (Get user)
  - `PATCH http://localhost:4000/api/v1/users/:id` (Update user)
  - `PUT http://localhost:4000/api/v1/users/:id/roles` (Assign roles)
- **Master Data Management Endpoints (Write: ADMIN & QUALITY_MANAGER; Read: All Canonical Roles):**
  - `/api/v1/master-data/products` (CRUD & deactivation for products)
  - `/api/v1/master-data/production-lines` (CRUD & deactivation for lines)
  - `/api/v1/master-data/machines` (CRUD, status, & line-association for machines)
  - `/api/v1/master-data/shifts` (CRUD & 24h clock for operating shifts)
  - `/api/v1/master-data/defect-types` (CRUD, category, & severity classifications)
- **Production Management Endpoints (Write: ADMIN, SUPERVISOR, OPERATOR; Elevated transitions: ADMIN, SUPERVISOR; Read: All Roles):**
  - `/api/v1/production/batches` (List, filter, create, update quantities, lifecycle transitions)
  - `/api/v1/production/batches/:id` (Batch detail view)
  - `/api/v1/production/batches/:id/status` (Dedicated lifecycle status transitions)
  - `/api/v1/production/downtime` (List, filter, and record equipment/line downtime events)
  - `/api/v1/production/downtime/:id` (Downtime detail view)
  - `/api/v1/production/downtime/:id/close` (Close event and compute duration)
- **Quality Inspection Endpoints (Create: ADMIN, QUALITY_MANAGER, INSPECTOR; Correct: ADMIN, QUALITY_MANAGER; Read: All Roles):**
  - `/api/v1/quality/inspections` (List, filter, pagination, and record inspection events)
  - `/api/v1/quality/inspections/:id` (Detail view with joined batch, product, and inspector context)
  - `PATCH /api/v1/quality/inspections/:id` (Audited supervisor/manager corrections)
  - _Note: DELETE is strictly forbidden; historical quality inspections are non-destructive and immutable._
- **Defect Management & Analytics Endpoints (Create: ADMIN, QUALITY_MANAGER, INSPECTOR; Correct: ADMIN, QUALITY_MANAGER; Read: All Roles):**
  - `/api/v1/quality/defects/analytics` (Descriptive analytics, dimension breakdowns, trend, and Pareto distribution)
  - `/api/v1/quality/defects` (List, filter, and record defect findings against inspections)
  - `/api/v1/quality/defects/:id` (Detail view with defect classification, inspection, and batch context)
  - `PATCH /api/v1/quality/defects/:id` (Audited supervisor/manager corrections with mandatory reason)
  - _Note: DELETE is strictly forbidden; historical defect records are non-destructive and immutable._
- **CAPA Management Endpoints (Case Create/Update: ADMIN, QUALITY_MANAGER, SUPERVISOR; Action Completion: Assigned Owner or Manager; Verification & Closure: ADMIN, QUALITY_MANAGER; Read: All Roles):**
  - `GET /api/v1/quality/capa` (List, filter, search, and paginate CAPA cases)
  - `POST /api/v1/quality/capa` (Create new CAPA case linked to finding or batch)
  - `GET /api/v1/quality/capa/:id` (Case detail with source context and nested actions)
  - `PATCH /api/v1/quality/capa/:id` (Update root cause, priority, assignee, or lifecycle state)
  - `POST /api/v1/quality/capa/:id/actions` (Add corrective, preventive, or containment action)
  - `PATCH /api/v1/quality/capa/:id/actions/:actionId` (Update action plan or due date)
  - `POST /api/v1/quality/capa/:id/actions/:actionId/complete` (Record completion notes and evidence; auto-advances parent case to UNDER_REVIEW when all actions complete)
  - `POST /api/v1/quality/capa/:id/verify` (Formal QA verification with independent verifier rule)
  - `POST /api/v1/quality/capa/:id/close` (Controlled closure requiring 100% action completion and passing verification)
  - _Note: DELETE is strictly forbidden; historical CAPA records are non-destructive and permanent._
- **Statistical Process Monitoring (SPC) Endpoints (Read: All Canonical Roles):**
  - `GET /api/v1/analytics/quality/spc/p-chart` (Attribute p-chart monitoring for variable subgroup sizes, pooled $\bar{p}$, 20-subgroup threshold, degenerate baseline detection, and unrounded 3-sigma signal detection)
  - `POST http://localhost:8000/calculate/p-chart` (Python microservice stateless calculation engine)
- **Reporting & Export Endpoints (Read & Export: All Canonical Roles; Schedule Manage: ADMIN & QUALITY_MANAGER):**
  - `GET /api/v1/reports` (Catalogue of reports, filters, supported formats, and metrics)
  - `GET /api/v1/reports/:reportType` (On-screen aggregated report dataset: `production-performance`, `inspection-summary`, `defect-analysis`, `capa-status`, `spc-summary`)
  - `GET /api/v1/reports/:reportType/export?format=csv|xlsx|pdf` (Secure streaming/file exports with formula-injection neutralization, styled sheets, and vector PDFs)
  - `GET /api/v1/reports/schedules` (List configured recurring report schedules)
  - `POST /api/v1/reports/schedules` (Configure new recurring report schedule)
  - `PATCH /api/v1/reports/schedules/:id` (Update cadence, format, filters, or enable/disable schedule)
  - `GET /api/v1/reports/schedules/:id/runs` (Audit and execution history for a schedule)
  - `GET /api/v1/reports/artifacts/:artifactId` (Download generated export artifact by opaque UUID with path traversal prevention)
- **Operational Alerts Endpoints (View: All Canonical Roles; Evaluate: ADMIN, QUALITY_MANAGER; Triage/Resolve: ADMIN, QUALITY_MANAGER, OPERATOR):**
  - `GET /api/v1/alerts` (List alerts with status, severity, ruleType, date filters, and pagination)
  - `GET /api/v1/alerts/:id` (Alert detail view with underlying entity, metric values, and resolution log)
  - `POST /api/v1/alerts/evaluate` (Manual trigger for alert rules evaluation across inspections, CAPAs, and SPC signals)
  - `POST /api/v1/alerts/:id/acknowledge` (Transition alert from OPEN to ACKNOWLEDGED with actor audit)
  - `POST /api/v1/alerts/:id/resolve` (Transition alert to RESOLVED with mandatory documented notes)
- **Notification Engine Endpoints (Authenticated Users):**
  - `GET /api/v1/notifications` (List current user's in-app notifications with unread count, filters, and pagination)
  - `PATCH /api/v1/notifications/:id/read` (Mark single in-app notification as read with strict ownership check)
  - `POST /api/v1/notifications/mark-all-read` (Mark all current user's notifications as read)

---

## 5. Repository Scripts

All quality commands can be executed from the root workspace:

| Command                           | Purpose                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                     | Starts API, Web, and Analytics microservice concurrently                 |
| `npm run dev:analytics`           | Starts Python FastAPI analytics service with Uvicorn reload              |
| `npm run lint`                    | Runs ESLint check across all packages and workspaces                     |
| `npm run format:check`            | Checks code formatting with Prettier                                     |
| `npm run format`                  | Formats all files with Prettier                                          |
| `npm run typecheck`               | Runs strict TypeScript compiler check (`tsc --noEmit`) across workspaces |
| `npm test`                        | Executes Python pytest and TypeScript Vitest tests across workspaces     |
| `npm run test:analytics`          | Runs Python pytest test suite in `services/analytics`                    |
| `npm run build`                   | Builds production artifacts for contracts, API, and web                  |
| `npm run db:migrate`              | Applies pending database migrations (`node-pg-migrate up`)               |
| `npm run db:migrate:status`       | Inspects pending migrations (`node-pg-migrate up --dry-run`)             |
| `npm run db:migrate:down`         | Rolls back the most recent migration (`node-pg-migrate down 1`)          |
| `npm run db:migrate:create`       | Creates a new SQL migration file                                         |
| `npm run db:bootstrap-admin`      | Safely creates or verifies initial administrator account                 |
| `npm run db:reset-admin-password` | Safely resets password for an existing administrator account             |
| `npm run reports:run-scheduled`   | Executes due recurring scheduled reports with atomic row locking         |
| `npm run alerts:evaluate`         | Evaluates operational alert rules and records deduplicated anomalies     |
| `npm run notifications:deliver`   | Processes pending outbound email deliveries with retries and row locking |

---

## 6. Architecture & Security Documentation

- [System Architecture](file:///docs/architecture/system-architecture.md)
- [Architecture Decision Records (ADRs)](file:///docs/architecture/architecture-decision-records.md)
- [Authentication & Authorization Specification](file:///docs/security/authentication-and-authorization.md)
- [Master Data API Specification](file:///docs/api/master-data.md)
- [Production Management API Specification](file:///docs/api/production-management.md)
- [Quality Inspections API Specification](file:///docs/api/quality-inspections.md)
- [Quality Inspection Workflow](file:///docs/inspections/inspection-workflow.md)
- [Quality Inspection Data Rules](file:///docs/inspections/inspection-data-rules.md)
- [Defect Management & Analytics API Specification](file:///docs/api/defect-management-analytics.md)
- [Defect Data Rules & Accounting Semantics](file:///docs/quality/defect-data-rules.md)
- [CAPA Management API Specification](file:///docs/api/capa-management.md)
- [CAPA Workflow & Verification Rules](file:///docs/capa/capa-workflow.md)
- [Database Schema Design & KPI Definitions](file:///docs/database/schema-design.md)
- [Entity Relationship Diagram (ERD)](file:///docs/database/erd.mmd)
- [Data Dictionary](file:///docs/database/data-dictionary.md)
- [Database Migrations Guide](file:///docs/database/migrations.md)
- [Statistical Process Monitoring & p-Chart Architecture](file:///docs/analytics/statistical-process-monitoring.md)
- [QualityOps Metric Definitions](file:///docs/analytics/metric-definitions.md)
- [Phase 9 SPC Analytics API Specification](file:///docs/api/phase-9-analytics-contract.md)
- [Phase 10 Report & Export Workflow](file:///docs/reports/report-export-workflow.md)
- [Phase 10 Operational Alert Rules](file:///docs/alerts/operational-alert-rules.md)
- [Phase 10 Reporting & Alerts API Contract](file:///docs/api/phase-10-reporting-alerts-contract.md)
- [Phase 11 Security Review & Hardening Report](file:///docs/security/phase-11-security-review.md)
- [Phase 12 Notifications & Email Delivery Contract](file:///docs/api/notifications-contract.md)
- [Phase 1 Acceptance Checklist](file:///docs/phase-1/acceptance-checklist.md)
- [Phase 2 Acceptance Checklist](file:///docs/phase-2/acceptance-checklist.md)
- [Phase 3 Acceptance Checklist](file:///docs/phase-3/acceptance-checklist.md)
- [Phase 4 Acceptance Checklist](file:///docs/phase-4/acceptance-checklist.md)
- [Phase 5 Acceptance Checklist](file:///docs/phase-5/acceptance-checklist.md)
- [Phase 6 Acceptance Checklist](file:///docs/phase-6/acceptance-checklist.md)
- [Phase 7 Acceptance Checklist](file:///docs/phase-7/acceptance-checklist.md)
- [Phase 8 Acceptance Checklist](file:///docs/phase-8/acceptance-checklist.md)
- [Phase 9 Acceptance Checklist](file:///docs/phase-9/acceptance-checklist.md)
- [Phase 10 Acceptance Checklist](file:///docs/phase-10/acceptance-checklist.md)
- [Phase 11 Acceptance Checklist](file:///docs/phase-11/acceptance-checklist.md)
- [Phase 12 Acceptance Checklist](file:///docs/phase-12/acceptance-checklist.md)
