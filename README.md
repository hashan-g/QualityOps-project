# QualityOps — Manufacturing Quality & Process Analytics Platform

**Phase 3: Authentication & Role-Based Access Control (RBAC)**  
**Status:** Implemented & Verified Baseline  
**Date:** October 2026  
**Owner:** Project owner / developer

---

## 1. Product Purpose

QualityOps is an engineering platform designed for manufacturing quality tracking, defect management, and process analytics.

> **Phase 3 Scope Guard Notice:**  
> This phase establishes secure authentication (Argon2id password hashing, short-lived JWT access tokens, rotating HttpOnly refresh sessions), server-side role-based access control (RBAC), admin user provisioning, and an initial administrator bootstrap utility. **Manufacturing domain features (products catalog, production batches, quality inspections, defect records, CAPA workflows) and business dashboards remain out-of-scope until subsequent phases.**

---

## 2. Architecture Baseline

The repository is structured as an npm workspace monorepo:

- **Web Client (`apps/web`):** React 19 + TypeScript + Vite 6 (In-memory access token state, accessible login shell & admin provisioning panel)
- **Backend API (`apps/api`):** Node.js 24 LTS + Express + TypeScript + `pg` connection pool + Argon2id + JWT + Rate Limiting
- **Shared Contracts (`packages/contracts`):** TypeScript types & Zod validation schemas for API inputs, responses, and canonical roles
- **Database (`database`):** PostgreSQL 18 via Docker Compose (`compose.yaml`); versioned SQL migrations under `database/migrations` via `node-pg-migrate`
- **Quality Gates:** Strict TypeScript (`exactOptionalPropertyTypes`), Prettier, ESLint flat config, Vitest, Supertest, and GitHub Actions CI

---

## 3. Prerequisites

- **Node.js:** `v24.x` LTS (enforced via `.nvmrc`)
- **npm:** `v11.x` (bundled with Node 24)
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

Apply versioned schema migrations (creates core tables, `refresh_sessions`, and seeds the 6 canonical roles):

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
```

### Step 5: Run Development Services

Start both Web and API concurrently:

```bash
npm run dev
```

- **Web App:** Available at [http://localhost:5173](http://localhost:5173)
- **API Server:** Available at [http://localhost:4000](http://localhost:4000)
- **API Health Probes:**
  - `GET http://localhost:4000/api/v1/health` (Liveness)
  - `GET http://localhost:4000/api/v1/health/ready` (Readiness)
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

---

## 5. Repository Scripts

All quality commands can be executed from the root workspace:

| Command                      | Purpose                                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                | Starts API (`apps/api`) and Web (`apps/web`) concurrently                |
| `npm run lint`               | Runs ESLint check across all packages and workspaces                     |
| `npm run format:check`       | Checks code formatting with Prettier                                     |
| `npm run format`             | Formats all files with Prettier                                          |
| `npm run typecheck`          | Runs strict TypeScript compiler check (`tsc --noEmit`) across workspaces |
| `npm test`                   | Executes unit and smoke tests with Vitest across all workspaces          |
| `npm run build`              | Builds production artifacts for contracts, API, and web                  |
| `npm run db:migrate`         | Applies pending database migrations (`node-pg-migrate up`)               |
| `npm run db:migrate:status`  | Inspects pending migrations (`node-pg-migrate up --dry-run`)             |
| `npm run db:migrate:down`    | Rolls back the most recent migration (`node-pg-migrate down 1`)          |
| `npm run db:migrate:create`  | Creates a new SQL migration file                                         |
| `npm run db:bootstrap-admin` | Safely creates or verifies initial administrator account                 |

---

## 6. Architecture & Security Documentation

- [System Architecture](file:///docs/architecture/system-architecture.md)
- [Architecture Decision Records (ADRs)](file:///docs/architecture/architecture-decision-records.md)
- [Authentication & Authorization Specification](file:///docs/security/authentication-and-authorization.md)
- [Database Schema Design & KPI Definitions](file:///docs/database/schema-design.md)
- [Entity Relationship Diagram (ERD)](file:///docs/database/erd.mmd)
- [Data Dictionary](file:///docs/database/data-dictionary.md)
- [Database Migrations Guide](file:///docs/database/migrations.md)
- [Phase 1 Acceptance Checklist](file:///docs/phase-1/acceptance-checklist.md)
- [Phase 2 Acceptance Checklist](file:///docs/phase-2/acceptance-checklist.md)
- [Phase 3 Acceptance Checklist](file:///docs/phase-3/acceptance-checklist.md)
