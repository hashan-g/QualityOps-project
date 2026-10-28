# QualityOps Operational Readiness & Incident Runbook — Phase 11

## 1. System Overview & Health Endpoints

QualityOps exposes two dedicated health probe endpoints at `/api/v1/health` for orchestrators (Kubernetes, Docker Swarm, Nomad) and cloud load balancers:

- **Liveness Probe: `GET /api/v1/health`**
  - **Purpose:** Answers whether the Node.js process is responsive and able to process HTTP traffic.
  - **Response (200 OK):**
    ```json
    {
      "status": "ok",
      "timestamp": "2026-10-28T10:00:00.000Z",
      "uptime": 124.5,
      "environment": "production",
      "version": "0.1.0"
    }
    ```
  - **Security Guarantee:** Never exposes internal server paths, system memory details, or environment variables.

- **Readiness Probe: `GET /api/v1/health/ready`**
  - **Purpose:** Answers whether the API is capable of serving production traffic by actively verifying critical backend dependencies (PostgreSQL database pool).
  - **Response (200 OK):**
    ```json
    {
      "status": "ready",
      "database": { "status": "up" },
      "timestamp": "2026-10-28T10:00:00.000Z",
      "version": "0.1.0"
    }
    ```
  - **Degraded Response (503 Service Unavailable):**
    ```json
    {
      "status": "degraded",
      "database": { "status": "down" },
      "timestamp": "2026-10-28T10:00:00.000Z",
      "version": "0.1.0"
    }
    ```
  - **Security Guarantee:** Exposes only high-level status (`up` / `down`). Database connection strings, credentials, hostnames, and internal exception stack traces are strictly omitted.

---

## 2. Process Lifecycle & Graceful Shutdown

The API server (`apps/api/src/server.ts`) handles `SIGTERM` and `SIGINT` signals with a 10-second bounded grace period:

1. **Stop Accepting Inbound Traffic:** Calls `server.close()`, allowing currently active in-flight requests to complete while rejecting new socket connections.
2. **Database Connection Drain:** Calls `closePool()` to drain and cleanly close all idle and active PostgreSQL client connections.
3. **Hard Timeout Watchdog:** Sets a 10-second unref'd watchdog timer (`setTimeout(..., 10000)`). If hanging requests or slow socket drains fail to complete within 10 seconds, the process calls `process.exit(1)` to prevent infinite zombie hanging.
4. **Unhandled Rejection & Exception Handlers:** Process-level error traps capture unhandled promise rejections and uncaught exceptions, triggering clean shutdown and non-zero termination.

---

## 3. Worker Concurrency & Idempotency Guarantees

### Scheduled Report Execution (`apps/api/src/scripts/run-scheduled-reports.ts`)

- **Row-Level Atomic Locking:** Schedule claiming uses PostgreSQL transactional locks with `FOR UPDATE SKIP LOCKED`. If multiple worker containers run simultaneously, each due schedule is acquired by exactly one worker.
- **Accurate Failure Bookkeeping:** If report generation fails, `report_runs.status` is set to `FAILED` with a diagnostic error message. Succeeded runs record the opaque `artifact_id`, file size, and file path.

### Operational Alert Evaluation (`apps/api/src/scripts/evaluate-alerts.ts`)

- **Fingerprint Deduplication:** Alerts are generated with deterministic fingerprints (e.g. `CRITICAL_DEFECT:{batchId}:{defectTypeId}`).
- **Partial Unique Index Protection:** The table `operational_alerts` enforces a partial unique index on `fingerprint` where `status IN ('OPEN', 'ACKNOWLEDGED')`. Inserting duplicate active alerts performs `ON CONFLICT (fingerprint) DO NOTHING`, ensuring duplicate alerts are never generated for the same active condition.

---

## 4. Structured Logging & Sensitive Data Redaction

All API requests pass through `requestIdMiddleware` which assigns or sanitizes the `x-request-id` header (bounded to alphanumeric, hyphen, underscore up to 64 characters; invalid inputs are replaced with a clean UUIDv4).

### Redaction Service (`redactSensitiveData`)

The recursive data sanitizer masks the following sensitive fields before logging or persisting in audit records:

- `password`, `password_hash`, `newPassword` $\to$ `[REDACTED]`
- `accessToken`, `refreshToken`, `token_hash` $\to$ `[REDACTED]`
- `authorization` header $\to$ `[REDACTED]` or `Bearer [REDACTED]`
- `databaseUrl` $\to$ Stripped password (e.g. `postgresql://user@host:port/db`)
- Cookies $\to$ `[REDACTED]`

---

## 5. Incident Response & Operational Runbooks

### Runbook 1: Rotating JWT Access & Cookie Secrets

When rotating `JWT_ACCESS_SECRET` or `COOKIE_SECRET`:

1. Generate new cryptographically secure 64-character hex strings:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Update the environment variables in the secret store (e.g. HashiCorp Vault, AWS Secrets Manager, GitHub Secrets).
3. **Impact:** Existing access tokens signed with the previous secret will immediately fail validation with `401 Unauthorized`. Active users will transparently obtain new access tokens via their refresh tokens on the next request to `/api/v1/auth/refresh`.
4. If `COOKIE_SECRET` is rotated, signed cookies will fail signature checks and require user re-login.

### Runbook 2: Revoking Suspected Compromised User Sessions

If a user account or session is suspected of compromise:

1. **Immediate Revocation via Database:**
   Revoke all active refresh sessions for the target user ID:
   ```sql
   UPDATE refresh_sessions
   SET revoked_at = NOW()
   WHERE user_id = '<target-user-uuid>' AND revoked_at IS NULL;
   ```
2. **Deactivate User Account:**
   Immediately prevent any still-valid JWT access tokens from being accepted by `auth.middleware`:
   ```sql
   UPDATE users
   SET is_active = false, updated_at = NOW()
   WHERE id = '<target-user-uuid>';
   ```
   _Note: Because `auth.middleware` queries `is_active` on every request, deactivation takes effect instantaneously across all cluster instances without waiting for JWT expiration._

### Runbook 3: Diagnosing PostgreSQL Readiness & Migrations

1. Verify database liveness from the host or container:
   ```bash
   pg_isready -h localhost -p 5432 -U qualityops_dev -d qualityops
   ```
2. Check migration status:
   ```bash
   npm run db:migrate:status
   ```
3. Run pending migrations:
   ```bash
   npm run db:migrate
   ```

### Runbook 4: Re-running Scheduled Report & Alert Workers

1. Execute the report worker on demand:
   ```bash
   npm run reports:run-scheduled
   ```
2. Execute the alert evaluation worker on demand:
   ```bash
   npm run alerts:evaluate
   ```
3. Both workers are fully idempotent; re-running them will safely claim due tasks or evaluate active rules without creating duplicate alerts or running already completed reports.

### Runbook 5: Diagnosing Python Analytics Timeouts & Failures

1. Check analytics engine liveness:
   ```bash
   curl -I http://127.0.0.1:8000/health
   ```
   Expected response: `HTTP/1.1 200 OK` with `{"status":"ok","service":"qualityops-analytics"}`.
2. If the analytics engine is stopped or unreachable:
   - Node API requests to `/api/v1/analytics/spc/p-chart` abort after 5000ms (`ANALYTICS_SERVICE_TIMEOUT_MS`).
   - The API returns HTTP `503 Service Unavailable` with error code `SERVICE_UNAVAILABLE`.
   - Start or restart the service:
     ```bash
     python -m uvicorn app.main:app --app-dir services/analytics --host 127.0.0.1 --port 8000
     ```

### Runbook 6: PostgreSQL Backup & Restore Drill

To perform and verify a consistent logical database backup:

1. **Create Backup:**
   ```bash
   pg_dump -U qualityops_dev -Fc -f qualityops_backup_$(date +%Y%m%d_%H%M%S).dump qualityops
   ```
2. **Drill: Test Restore to Validation Database:**
   ```bash
   createdb -U qualityops_dev qualityops_restore_drill
   pg_restore -U qualityops_dev -d qualityops_restore_drill qualityops_backup_*.dump
   ```
3. **Verify Restored Schema and Row Counts:**
   ```sql
   \c qualityops_restore_drill
   SELECT count(*) FROM users;
   SELECT count(*) FROM production_batches;
   SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
   ```
4. **Clean up Drill Database:**
   ```bash
   dropdb -U qualityops_dev qualityops_restore_drill
   ```

### Runbook 7: Release Rollback & Migration Downgrade

1. Roll back the application container to the previous stable image tag.
2. Only if the release migration contains a breaking schema change that is incompatible with the previous version, execute a single-step reversible rollback:
   ```bash
   npm run db:migrate:down
   ```
   _Caution: Migrations 001 through 005 are production-baseline schemas. Never run `down` on baseline production tables without a verified backup._

---

## 6. Deployment Caveats & Infrastructure Notice

- **Report Storage Isolation:** Report artifacts (PDF, CSV, XLSX) are currently saved to the local directory defined by `REPORT_STORAGE_DIR`. For multi-instance high-availability deployments, this path must be backed by a shared network volume (NFS/EFS) or an object-store adapter (S3/GCS) with least-privilege IAM policies.
- **Export Filesystem Permissions:** Storage folders are created with restricted local directory permissions and validated strictly via `path.relative` against directory traversal (`../`).
