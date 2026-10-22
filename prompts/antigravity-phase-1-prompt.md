# Google Antigravity Prompt — QualityOps Phase 1 Only

You are acting as a senior software architect and implementation engineer. Work only on **QualityOps Phase 1: Architecture & Repository Foundation**. Read the repository's `README.md` and the documents under `docs/architecture/`, `docs/engineering/`, and `docs/phase-1/` before making changes.

## Goal

Create a minimal, clean, reproducible repository foundation for the QualityOps Manufacturing Quality & Process Analytics Platform. The approved baseline is:

- React + TypeScript + Vite in `apps/web`
- Node.js 24 LTS + Express + TypeScript in `apps/api`
- `packages/contracts` for shared TypeScript/Zod contracts only
- PostgreSQL 18 via Docker Compose for local development
- SQL migrations later under `database/migrations`
- basic npm workspace scripts for dev, lint, formatting check, type-check, test and build
- GitHub Actions CI for the applicable quality gates
- no separate Python analytics service yet; that decision is deferred until the analytics phase

## Hard scope boundaries

Do NOT implement products, production batches, inspections, defect records, CAPA, dashboards, authentication, user management, business KPIs, analytics, notifications, or any other manufacturing business feature. Do not create fake fully working modules or placeholder APIs that claim those features exist. The only API route expected in this phase is a minimal health endpoint (for example `GET /api/v1/health`). The web page may be a neutral, clearly labeled foundation screen.

Do NOT add ExploreCeylon or attribute it to the project owner. It is not the user's project.

## Required tasks

1. Inspect the current folder first. If a repository already exists, preserve user work and report any conflicts before overwriting files.
2. Establish the proposed repository structure. Do not create empty directories/files for all future features just to fill the tree.
3. Set up an npm workspace at the root for `apps/web`, `apps/api`, and `packages/contracts`.
4. Use current stable releases compatible with Node.js 24 LTS. The React/Vite/PostgreSQL baseline is in the architecture document. Check compatibility before selecting versions, and commit the lockfile. Do not install prereleases or blindly use `latest`.
5. Configure strict TypeScript, ESLint, Prettier and practical root scripts.
6. Create a minimal React/Vite frontend that starts and shows “QualityOps foundation” without pretending business functions exist.
7. Create a minimal Express/TypeScript API with one health endpoint and structured, safe error handling appropriate for a starter. Do not claim database readiness unless the endpoint actually checks a database connection.
8. Create the contracts package with one small example schema used only to prove that the package builds/imports; do not define premature business domain entities.
9. Add `compose.yaml` for a local PostgreSQL service with named persistent volume, health check, localhost-only port binding, and credentials read from `.env`.
10. Add `.env.example`, `.gitignore`, `.editorconfig`, `.nvmrc`, and a concise local-development README. Never create or commit a real `.env` file.
11. Add a GitHub Actions workflow to install from lockfile and run formatting check, lint, type-check, tests and build.
12. Add at least one real API health smoke test and any minimum tests needed to validate the foundation.
13. Update the Phase 1 acceptance checklist with evidence/results, not guesses.

## Engineering requirements

- Keep configuration in a validated configuration module, but do not add unused secrets or auth settings prematurely.
- Avoid `any`, unexplained `@ts-ignore`, disabled lint rules, skipped tests, empty catch blocks, swallowed errors, and unhandled promise rejections.
- No SQL concatenation; no database schema tables in this phase.
- Do not invent production readiness, test coverage percentages or performance claims.
- Keep dependencies minimal and explain why any new dependency is needed.
- Make the simplest implementation that meets this phase's acceptance criteria.

## Work method

Before editing, provide a short plan and list potential conflicts. Then implement the tasks in small increments. After editing, run the commands for lint, format check, type-check, tests and build. Fix failures you introduced. Do not claim a command passed unless you actually ran it. Inspect the final diff.

## Required final response

Report:

1. files created/changed;
2. package/runtime versions actually selected;
3. commands actually run and their actual results;
4. how to start the frontend, API and PostgreSQL locally;
5. acceptance checklist status with any unchecked items;
6. known limitations;
7. confirmation that no business features were implemented.

Stop after Phase 1. Do not begin Phase 2 or design production database tables until requested.
