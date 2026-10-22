# QualityOps — Manufacturing Quality & Process Analytics Platform

**Phase 1: Architecture & Repository Foundation**  
**Status:** Implemented & Verified Baseline  
**Date:** October 2026  
**Owner:** Project owner / developer

---

## 1. Product Purpose

QualityOps is an engineering platform designed for manufacturing quality tracking, defect management, and process analytics.

> **Phase 1 Scope Guard Notice:**  
> This phase establishes only the clean, reproducible repository foundation, workspace configurations, shared contracts, technical smoke tests, and Dockerized database infrastructure. **Manufacturing business features (products, production batches, inspections, defect records, CAPA, KPI analytics dashboards, and authentication) are deliberately deferred to subsequent phases.**

---

## 2. Architecture Baseline

The repository is structured as an npm workspace monorepo:

- **Web Client (`apps/web`):** React 19 + TypeScript + Vite 6
- **Backend API (`apps/api`):** Node.js 24 LTS + Express + TypeScript (modular monolith)
- **Shared Contracts (`packages/contracts`):** TypeScript types & Zod validation schemas
- **Database (`database`):** PostgreSQL 18 via Docker Compose (`compose.yaml`); migrations will live under `database/migrations`
- **Quality Gates:** Strict TypeScript, Prettier, ESLint flat config, Vitest, and GitHub Actions CI

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
Set a local development password for `POSTGRES_PASSWORD` in `.env`. **Never commit `.env` files.**

### Step 2: Start PostgreSQL Database

```bash
docker compose up -d postgres
```

This spins up PostgreSQL 18 with a persistent volume (`qualityops_postgres_data`), bound to `127.0.0.1:5432`, with an automated health check (`pg_isready`).

### Step 3: Install Dependencies

Install dependencies from the committed lockfile:

```bash
npm ci
```

### Step 4: Run Development Services

Start both Web and API concurrently:

```bash
npm run dev
```

- **Web App:** Available at [http://localhost:5173](http://localhost:5173)
- **API Server:** Available at [http://localhost:4000](http://localhost:4000)
- **API Health Check:** `GET http://localhost:4000/api/v1/health`

---

## 5. Repository Scripts

All quality commands can be executed from the root workspace:

| Command                | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `npm run dev`          | Starts API (`apps/api`) and Web (`apps/web`) concurrently                |
| `npm run lint`         | Runs ESLint check across all packages and workspaces                     |
| `npm run format:check` | Checks code formatting with Prettier                                     |
| `npm run format`       | Formats all files with Prettier                                          |
| `npm run typecheck`    | Runs strict TypeScript compiler check (`tsc --noEmit`) across workspaces |
| `npm test`             | Executes unit and smoke tests with Vitest across all workspaces          |
| `npm run build`        | Builds production artifacts for contracts, API, and web                  |

---

## 6. Architecture & Engineering Documentation

- [System Architecture](file:///docs/architecture/system-architecture.md)
- [Architecture Decision Records (ADRs)](file:///docs/architecture/architecture-decision-records.md)
- [Repository Structure & Ownership](file:///docs/architecture/repository-structure.md)
- [Development Workflow & Definition of Done](file:///docs/engineering/development-workflow.md)
- [Environment & Secrets Policy](file:///docs/engineering/environment-and-secrets.md)
- [Phase 1 Acceptance Checklist](file:///docs/phase-1/acceptance-checklist.md)
