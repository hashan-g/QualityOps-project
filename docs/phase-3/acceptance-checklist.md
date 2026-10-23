# QualityOps Phase 3 Acceptance Checklist — Authentication & RBAC

Mark each item only after inspecting actual evidence.

## Schema and migrations

- [x] Existing Phase 2 migration is unchanged (`001_initial_schema.sql` preserved).
- [x] Any auth schema change is a new reversible migration (`database/migrations/002_auth_sessions.sql`).
- [x] Users, roles, and user-role relations match the actual database schema (`users`, `roles`, `user_roles`).
- [x] Password hashes only; no plaintext passwords (Argon2id hashing via `PasswordService`).
- [x] Sessions/refresh tokens, if used, are stored/revoked safely (`refresh_sessions` stores SHA-256 token hash only; token reuse detection implemented).
- [x] Migration up/down tested against PostgreSQL 18 (Tested in `schema-constraints.test.ts`).

## Authentication

- [x] Login accepts valid active users (`POST /api/v1/auth/login` verified with access token & refresh cookie).
- [x] Invalid credentials return a generic failure response (`Invalid username or password` with dummy hash timing attack mitigation).
- [x] Disabled users cannot authenticate (`is_active = false` returns generic 401).
- [x] Logout invalidates relevant session/refresh credential (`POST /api/v1/auth/logout` revokes session and clears cookie).
- [x] Current-user endpoint returns safe user data and roles only (`GET /api/v1/auth/me` never returns password hash or secrets).
- [x] Expired/invalid credentials return 401 (JWT verification and expired refresh session tests pass).
- [x] Rate limiting and safe error behavior are present (`loginRateLimiter` and `refreshRateLimiter` via `express-rate-limit`).

## Authorization

- [x] Authorization is enforced by API middleware (`authenticate` and `requireRole` middleware).
- [x] Unauthenticated protected request returns 401 (Tested across `/auth/me` and `/users`).
- [x] Authenticated but forbidden request returns 403 (Non-ADMIN tokens return 403 on `/users`).
- [x] User management and role assignment are ADMIN-only (Enforced at `/api/v1/users`).
- [x] Self-role-escalation is prevented (Non-admin cannot assign roles; admin cannot strip ADMIN role from self).
- [x] Role assignment only accepts valid existing roles (Validated against database roles table).

## Frontend

- [x] Login form validates inputs and displays safe errors (Accessible `LoginForm` with ARIA labels and alerts).
- [x] Auth state matches server/session strategy (`AuthContext` holds access token strictly in-memory; refresh via HttpOnly cookie).
- [x] Protected behavior works without inventing business dashboards (Lightweight auth shell and admin provisioning panel).
- [x] Logout clears client authentication state (`logout()` clears in-memory state and calls backend).
- [x] Keyboard navigation and accessible labels are present (Semantic HTML, form labels, keyboard submit).

## Automated verification

- [x] `npm ci` passes (Clean dependency install from lockfile).
- [x] `npm run format:check` passes (All files conform to Prettier).
- [x] `npm run lint` passes (0 ESLint errors or warnings).
- [x] `npm run typecheck` passes (Strict typecheck across contracts, API, and web).
- [x] `npm test` passes (76/76 unit and integration tests passing).
- [x] `npm run build` passes (Contracts, API, and Vite bundles built successfully).
- [x] GitHub Actions PostgreSQL 18 integration tests execute and pass; they cannot silently skip in CI (`CI=true` guard throws uncaught exception if DB inaccessible).
- [x] New and existing CI checks are preserved.

## Documentation and scope

- [x] Auth/session architecture documented (`docs/security/authentication-and-authorization.md`).
- [x] Environment variables documented with placeholders only (`.env.example` and docs).
- [x] Safe first-admin bootstrap documented (`db:bootstrap-admin` CLI command).
- [x] API endpoints and role/permission matrix documented (`docs/security/authentication-and-authorization.md`).
- [x] No public self-registration added.
- [x] No production, inspection, defect, CAPA, or analytics features implemented.
- [x] Full diff reviewed and Git status checked.

## Acceptance decision

- [x] PASS — all required items verified with evidence.
- [ ] BLOCKED — list environment or external blockers.
- [ ] FAIL — list failed checks and remediation.
