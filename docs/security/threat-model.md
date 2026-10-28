# QualityOps Initial Threat Model — Phase 11

## System context

QualityOps includes a React browser client, a TypeScript/Express REST API, PostgreSQL 18, a stateless Python/FastAPI analytics service, local report artifact storage, and scheduled-report/alert workers. Authentication uses short-lived access JWTs and rotating refresh sessions, with role-based access control.

## Assets to protect

- User passwords/hashes, access tokens, refresh tokens, cookie values, signing secrets, DB credentials.
- User identities and role assignments.
- Production batches, quantities, downtime records, inspections, defects, CAPA records and audit history.
- Report definitions, generated CSV/XLSX/PDF artifacts and scheduled report outputs.
- Alert state and worker execution history.
- Integrity of quality metrics and statistical conclusions.

## Trust boundaries

1. Browser to REST API: treat every request field, query parameter, ID, cookie, and header as untrusted.
2. API to PostgreSQL: enforce authorization before query execution; use parameterized SQL and DB constraints.
3. API to Python analytics: validate payloads and responses, enforce timeouts, and never give the analytics service database credentials.
4. API to report storage: never use a request-supplied filesystem path; authorization must precede artifact download.
5. GitHub Actions to repository/dependencies: protect secrets and minimize workflow permissions.

## Threat scenarios and target controls

| Scenario                                        | Impact                                          | Controls to inspect/test                                                                       |
| ----------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stolen or replayed refresh token                | Account takeover                                | Rotation, hashed token storage, replay detection, revocation, secure cookies, audit/monitoring |
| Role/function authorization bypass              | Unauthorized modification                       | Server-side RBAC, deny-by-default, per-route and cross-role integration tests                  |
| IDOR across records                             | Exposure/modification of another record         | Object-level checks and cross-parent ID tests                                                  |
| SQL injection or untrusted sort expression      | Data exposure/corruption                        | Parameterized SQL and allowlisted sort/filter fields                                           |
| CSV/XLSX formula injection                      | Code/formula execution when opened              | Output neutralization and export tests                                                         |
| Report path traversal or artifact guessing      | Unauthorized file disclosure                    | Opaque IDs, canonical path checks, authorization, non-public storage                           |
| Secret leakage in logs/errors                   | Credential exposure                             | Redaction, safe error envelopes, log tests, no secret values in CI output                      |
| Analytics-service failure or malformed response | Incorrect/unavailable statistical result        | Timeouts, response validation, safe 503, no fabricated control limits                          |
| Concurrent worker duplicates                    | Duplicate reports/alerts or inconsistent status | Atomic schedule claims, unique active fingerprints, idempotency tests                          |
| Unbounded expensive requests                    | Resource exhaustion                             | Pagination/date caps, body limits, timeouts, relevant rate limits                              |
| Dependency compromise or known CVE              | Supply-chain compromise                         | Lockfiles, audit scans, reviewed upgrades, least-privilege CI                                  |
| Destructive action or weak audit trail          | Loss of historical evidence                     | Non-destructive records, transactional audit logging, restricted mutation rights               |

## Risk scoring

Use the repository's existing risk format if present. Otherwise score likelihood and impact as Low/Medium/High/Critical and prioritize high-impact remote unauthenticated issues first. Do not label a potential issue as a confirmed vulnerability until reproduced or otherwise evidenced.

## Explicit boundaries

This threat model is a code-review and automated-test aid. It does not replace external penetration testing, deployment/infrastructure review, legal/regulatory assessment, backup restore drills, or an independent security audit.
