# QualityOps Security Hardening Plan — Phase 11

## Goal

Reduce demonstrable application and operational risk in the integrated QualityOps platform without adding business features. Use targeted fixes backed by tests. This plan is a working checklist, not a claim of formal security certification.

## Priority 0 — Critical exposure checks

1. **Secrets and configuration** — ensure production startup rejects missing or known-unsafe JWT/cookie secrets; inspect repository history/status without printing secret contents; preserve `.env.example` placeholders.
2. **Authentication and session lifecycle** — token validation, refresh rotation/reuse detection, logout revocation, inactive account handling, generic login errors, rate limits, cookie flags, origin checks.
3. **Authorization / IDOR** — enforce authorization on every protected route and related object; test role matrices and attempts to substitute IDs across batches, inspections, defects, CAPA, reports, schedules, and alerts.
4. **Data exposure** — ensure APIs exclude password hashes/tokens and do not surface stack traces, SQL errors, database URLs, private paths, or report content in error messages/logs.
5. **Export artifacts** — validate authorization, opaque artifact identifiers, path traversal resistance, CSV formula neutralization, safe XLSX string cells, storage isolation, and download headers.

## Priority 1 — Injection and resource controls

- Parameterized SQL; allowlisted sort expressions; strict schema validation and pagination/date-range caps.
- Request body size limits and appropriate timeouts.
- Rate limiting on authentication and expensive/reporting operations.
- Analytics request timeout and safe service-unavailable response.
- Ensure browser-supplied values cannot override server-calculated fields or protected metadata.

## Priority 2 — Reliability and operability

- Structured logs with request IDs and redaction of credentials, cookies, authorization headers, personal data, database connection strings, and tokens.
- Correct health/readiness checks, graceful shutdown, pool cleanup, bounded retries, worker error tracking, schedule claim locks, and active-alert deduplication.
- Document backups, restore drills, secret rotation, incident handling, and recovery/rollback steps.

## Dependency and CI hygiene

- Inspect package managers and lockfiles before running audits.
- Run available npm/Python dependency audits; report vulnerabilities by package, severity, direct/transitive status, and remediation recommendation.
- Do not automatically force major upgrades or suppress audits. Confirm compatibility and re-run regression tests after any upgrade.
- Review workflow permissions, external action versions, Node/Python versions, and whether CI security scans are deterministic.
- Keep PostgreSQL integration tests required in CI; no silent skips.

## Reference checklist sources

- OWASP ASVS 5.0.0: https://asvs.owasp.org/
- OWASP Top 10 2025: https://owasp.org/www-project-top-ten/
- OWASP API Security: https://owasp.org/www-project-api-security/
- Node.js Security Best Practices: https://nodejs.org/en/learn/getting-started/security-best-practices

Reference these to guide review. Record what was actually checked, what failed, and what remains out of scope. Do not state that following this checklist certifies QualityOps as compliant.
