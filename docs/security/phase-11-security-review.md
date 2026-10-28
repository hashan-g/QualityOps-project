# QualityOps Phase 11: Security Review & Hardening Report

## Executive Summary

Phase 11 focused exclusively on **Testing, Security Hardening & Reliability** across the QualityOps monorepo. In alignment with OWASP ASVS 5.0.0, OWASP Top 10 (2025), OWASP API Security Top 10, and Node.js Secure Coding Guidelines, the codebase was systematically audited, hardened, and verified without adding new business modules or altering production baseline schemas (migrations 001–005).

All 22 security controls (`SEC-001` through `SEC-022`) were implemented or validated with dedicated automated regression suites, bringing total monorepo test coverage to **371 tests passing with zero failures**.

---

## 1. Confirmed Vulnerabilities / Defects Resolved

During the threat modeling and audit review, seven concrete security and reliability defects were identified and remediated:

| #     | Component                    | Defect Description                                                                                                                       | Security Impact                                                                                                    | Remediation Applied                                                                                                                                                                                |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Python Analytics Service     | `CORSMiddleware` configured with `allow_origins=["*"]` and `allow_credentials=True`.                                                     | Invalid per CORS specification and permits cross-origin script access to internal analytical computations.         | Restricted CORS to internal API hosts (`http://127.0.0.1:4000`, `http://localhost:4000`), disabled `allow_credentials`, and restricted HTTP methods to `GET`, `POST`, `OPTIONS`.                   |
| **2** | XLSX Report Exporter         | Text cells containing formula triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) were written without string escaping.                            | Spreadsheet Formula Injection / CSV Injection when downloaded reports are opened in Excel or LibreOffice.          | Added `sanitizeXlsxValue` to prepend `'` to formula triggers while preserving native number and boolean types.                                                                                     |
| **3** | API Process Shutdown         | `SIGTERM`/`SIGINT` graceful shutdown called `server.close()` without a hard watchdog timer.                                              | In-flight or hanging keep-alive HTTP sockets could prevent the container or process from terminating indefinitely. | Added a 10-second unref'd watchdog timer (`setTimeout(..., 10000)`) forcing `process.exit(1)`, plus `unhandledRejection` and `uncaughtException` process traps.                                    |
| **4** | CI Workflow Permissions      | `.github/workflows/ci.yml` lacked top-level least-privilege token permissions.                                                           | Default GitHub Actions token privileges can permit unexpected read/write access.                                   | Explicitly added top-level `permissions: contents: read` to `.github/workflows/ci.yml`.                                                                                                            |
| **5** | Cookie Mutation Origin Check | Cookie-based refresh and logout allowed requests with empty `Origin` headers.                                                            | Cross-Site Request Forgery (CSRF) or origin-spoofing risk on cookie-bearing authentication endpoints.              | Hardened `validateOrigin` to strictly require `Origin` matching `config.CORS_ORIGIN` whenever a refresh token cookie is present.                                                                   |
| **6** | Audit & Log Redaction        | `AuditService` recorded raw `beforeState` and `afterState` entities, potentially storing sensitive credentials in database audit tables. | Exposure of passwords, hashes, tokens, or connection strings in queryable audit logs.                              | Implemented recursive `redactSensitiveData` utility and integrated it into `AuditService.record` to sanitize state payloads prior to insertion.                                                    |
| **7** | Production Secrets Gate      | Default development secrets (`dev-qualityops-jwt-access-secret...`) were accepted in production mode.                                    | Deployment with known default secrets could allow trivial token forgery.                                           | Added strict `refine()` rules in `EnvironmentSchema` requiring $\ge 32$-character non-default keys for `JWT_ACCESS_SECRET`, `COOKIE_SECRET`, and non-default database credentials in `production`. |

---

## 2. Controls Implemented and Verified (SEC-001 — SEC-022)

The 22 security controls specified in the Phase 11 Test Matrix were verified via automated unit and integration tests:

1. **SEC-001 (Access Token Validation):** Rejects missing, malformed, expired, and tampered JWT access tokens with 401 Unauthorized.
2. **SEC-002 (Refresh Token Rotation & Replay Protection):** Rotates refresh token on use. Replay of an already revoked token triggers instant revocation of all active sessions for that user.
3. **SEC-003 (Deactivated User Immediate Revocation):** Access tokens belonging to deactivated users (`is_active = false`) are rejected with 401 on every request via database verification in `auth.middleware`.
4. **SEC-004 & SEC-005 (RBAC & Function-Level Authorization):** Role matrix enforced server-side. Non-admins cannot invoke user administration (`/api/v1/users`). Viewers/Operators cannot execute write mutations.
5. **SEC-006 (Cross-Record & IDOR Validation):** Path parameters and parent entity relationships (e.g. CAPA actions belonging to parent CAPA cases) are strictly validated.
6. **SEC-007 (Mass Assignment Prevention):** Request payloads pass through strict Zod schemas; arbitrary privileged fields (`isAdmin`, `roles`, `password_hash`) are rejected or stripped.
7. **SEC-008 (SQL Injection Neutralization):** All SQL queries are strictly parameterized using PostgreSQL placeholders (`$1, $2, ...`). Query parameters containing SQL injection payloads are treated as literal strings.
8. **SEC-009 (Query Bounds & Pagination Enforcement):** Limits, offsets, and date ranges are capped by Zod schemas, preventing unbounded memory consumption.
9. **SEC-010 (Safe Error Envelopes in Production):** In `production`, internal server errors are masked to `An unexpected error occurred`, suppressing stack traces, SQL syntax, and internal file paths.
10. **SEC-011 (CSV Formula Injection Protection):** Formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) are escaped with a leading `'` and quoted per RFC 4180.
11. **SEC-012 (XLSX Formula Injection Protection):** Text cells beginning with formula triggers are escaped with `'` in the generated binary workbook.
12. **SEC-013 (Artifact Path Traversal Defense):** Artifact identifiers are validated as strict UUIDv4, and resolved paths are checked via `path.relative` against directory escape (`../`).
13. **SEC-014 (Origin Validation on Cookie Requests):** Refresh and logout endpoints verify that incoming cookie requests originate strictly from the configured CORS origin.
14. **SEC-015 (Rate Limiting):** Brute-force protections enforce request limits on `/api/v1/auth/login` and `/api/v1/auth/refresh`.
15. **SEC-016 (Python Analytics Resilience):** Fast HTTP timeout (5000ms via `AbortSignal.timeout`) ensures that if the Python service hangs or fails, the API returns a safe `503 Service Unavailable` without crashing.
16. **SEC-017 (Degenerate SPC Data Handling):** Insufficient subgroups (< 20) return `status: INSUFFICIENT_DATA` rather than fabricated or misleading control limits.
17. **SEC-018 (Atomic Schedule Locking):** Report worker claims due schedules using `SELECT ... FOR UPDATE SKIP LOCKED`, preventing race conditions across concurrent worker instances.
18. **SEC-019 (Operational Alert Deduplication):** Alert insertion uses a partial unique index on active fingerprints (`status IN ('OPEN', 'ACKNOWLEDGED')`) with `ON CONFLICT DO NOTHING`.
19. **SEC-020 (Sensitive Data Redaction):** Structured logging and audit recording scrub passwords, hashes, tokens, database URLs with passwords, and authorization headers.
20. **SEC-021 (Defensive HTTP Security Headers):** Zero-dependency middleware sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, and disables `X-Powered-By`.
21. **SEC-022 (Request ID Sanitization & Malformed Payloads):** Malformed JSON returns a structured 400 Bad Request error. Invalid or malicious `x-request-id` headers are discarded and replaced with a clean UUID.

---

## 3. Potential Risks and Defense-in-Depth Considerations

While core application controls are enforced, the following operational and infrastructure considerations should be managed in production:

- **Shared Artifact Storage:** Report files are saved to the local host filesystem. In multi-container deployments, this directory should be mounted on a shared volume or backed by an S3-compatible object store.
- **TLS Termination:** HTTPS and `Strict-Transport-Security` headers are configured for production, requiring reverse proxy / ingress TLS termination (e.g. Nginx, Cloudflare, Traefik, AWS ALB).
- **PostgreSQL Connection Security:** Production deployments should enforce `sslmode=verify-full` in `DATABASE_URL` to ensure database in-transit encryption.

---

## 4. Items Not Tested / Out of Scope

The following items are outside the scope of Phase 11 application hardening and require independent operational infrastructure testing:

- External network-level distributed denial of service (DDoS) mitigation.
- Cloud IAM roles, AWS/GCP VPC security groups, and container host OS-level kernel patching.
- Hardware security module (HSM) or cloud KMS integration for secret management.
- Live email provider delivery (documented as deferred until an active SMTP/SES transport is configured).
- Third-party registry audit (`npm audit` / `pip-audit`) was constrained in the offline sandbox environment due to outbound TLS egress limitations.
