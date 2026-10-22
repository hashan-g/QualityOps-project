# QualityOps Architecture Decision Records (ADRs)

ADRs capture important technical choices and their rationale. A decision may be revisited only when new evidence justifies it; record the change and its migration impact.

## ADR-001: Use a modular monolith for the first product release

- **Status:** Accepted for MVP
- **Decision:** One Node/Express API organized into explicit modules; React client and PostgreSQL remain separate components.
- **Why:** Easier local development, debugging, deployment, testing and AI-assisted implementation; avoids distributed transactions and operational overhead before the business workflow is proven.
- **Consequences:** Module boundaries and dependency direction must be enforced in code review. Extract a service only when scale, deployment independence or a concrete library requirement justifies the cost.

## ADR-002: React + TypeScript + Vite for the web client

- **Status:** Accepted
- **Decision:** Use React with TypeScript and Vite.
- **Why:** Suitable for a responsive administrative dashboard; TypeScript supports maintainability and safer refactoring.
- **Consequences:** Enable strict TypeScript; centralize API access; avoid business-critical logic being client-only.

## ADR-003: Node.js LTS + Express + TypeScript for the API

- **Status:** Accepted
- **Decision:** Use Node.js 24 LTS at the Phase 1 baseline, Express and TypeScript.
- **Why:** Matches the developer's existing JavaScript/Node background, provides one primary language across UI and API, and has a broad ecosystem.
- **Consequences:** Pin versions; keep runtime and type checking in CI; revisit runtime major versions only through a planned update.

## ADR-004: PostgreSQL with explicit SQL repositories for the MVP

- **Status:** Accepted
- **Decision:** PostgreSQL is the system of record. Use parameterized SQL through a repository layer and version-controlled migrations instead of relying on an ORM to hide core analytics queries.
- **Why:** Relational integrity and transparent SQL are valuable for manufacturing data analysis, reporting and portfolio demonstrations.
- **Consequences:** The team owns query review, transaction boundaries, migration discipline and type mapping. Avoid string-concatenated SQL.

## ADR-005: Shared API contracts with TypeScript and Zod

- **Status:** Accepted
- **Decision:** Keep reusable request/response schemas in `packages/contracts`; validate inputs at the server boundary.
- **Why:** Helps keep client and API types aligned and reduces drift.
- **Consequences:** Shared package must contain no server secrets or database access; runtime authorization/business rules stay in the API.

## ADR-006: Defer a separate Python analytics service until the analytics phase

- **Status:** Accepted with review gate
- **Decision:** Implement basic KPI queries in the API/database. Re-evaluate FastAPI/Python for advanced SPC, control charts and statistical analysis in Phase 8.
- **Why:** A separate service now adds deployment, networking, schema, logging and test overhead before the MVP exists.
- **Review trigger:** Advanced statistics would be clearer, safer or more maintainable in Python, and a versioned input/output contract can be specified.

## ADR-007: Version all schema changes as migrations

- **Status:** Accepted
- **Decision:** No undocumented manual schema changes. Commit migrations alongside code and provide reproducible local seeds.
- **Why:** Reproducibility, review, testability and future deployment safety.
- **Consequences:** Destructive migrations require explicit review and a backup/rollback plan.

## ADR-008: Keep synthetic demo data visibly labeled

- **Status:** Accepted
- **Decision:** Any generated sample records, screenshots and charts must be identified as synthetic/demo data.
- **Why:** Avoid misleading recruiters, reviewers or future users into interpreting invented quality improvements as real outcomes.
- **Consequences:** Demo seed data should include designed patterns for testing but never imply real-world validation.
