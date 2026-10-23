# QualityOps — Authentication & Authorization Specification

**Document Version:** 3.0 (Phase 3 Baseline)  
**Security Standard:** OWASP Application Security Verification Standard (ASVS) Level 2 Aligned  
**Cryptographic Primitives:** Argon2id, HMAC-SHA256 (JWT), SHA-256 (Refresh Session Hashes)

---

## 1. Architectural Overview & Threat Mitigations

QualityOps implements a defense-in-depth security model designed specifically for a single-page application (SPA) communicating with an Express REST API.

```
+-----------------------------------------------------------------------------------+
| Browser Client (apps/web)                                                         |
|                                                                                   |
|  [ In-Memory React State ]                          [ HttpOnly Cookie Jar ]       |
|  - Access Token (15m JWT)                           - Refresh Token (7d random)   |
|  - Active User Profile                              - SameSite=Lax/Strict         |
|  * NEVER in localStorage/sessionStorage             - Secure in production        |
+-----------------------------------------------------------------------------------+
           |                                                      |
           | Authorization: Bearer <JWT>                          | Cookie: refreshToken=...
           v                                                      v
+-----------------------------------------------------------------------------------+
| API Gateway & Middleware (apps/api)                                               |
|                                                                                   |
|  1. Rate Limiting (express-rate-limit on /login, /refresh)                        |
|  2. CSRF & Origin Verification (Origin header matched against CORS_ORIGIN)        |
|  3. JWT Verification (Pinned HS256, Issuer: qualityops-api, Aud: qualityops-web)  |
|  4. Live Account Deactivation Check (Instant revocation on user disable)          |
|  5. RBAC Authorization Gate (requireRole([ ... ]))                                |
+-----------------------------------------------------------------------------------+
           |
           v
+-----------------------------------------------------------------------------------+
| PostgreSQL 18 Relational Foundation (database/migrations)                         |
|                                                                                   |
|  - users (Argon2id password hashes only, no plaintext)                            |
|  - roles & user_roles (Canonical RBAC mapping)                                    |
|  - refresh_sessions (SHA-256 token hash only; token reuse detection & revocation) |
+-----------------------------------------------------------------------------------+
```

---

## 2. Password Hashing (Argon2id)

Passwords are never stored or logged in plaintext. Hashes are generated using **Argon2id** (the hybrid version of Argon2 resistant to both side-channel and GPU/ASIC attacks) conforming to OWASP guidelines:

- **Algorithm:** Argon2id (`$argon2id$v=19$m=65536,t=3,p=4$...`)
- **Memory Cost ($m$):** 64 MiB (65,536 KiB)
- **Time Cost ($t$):** 3 iterations
- **Parallelism ($p$):** 4 threads

### User Enumeration Timing Attack Mitigation

When a login request specifies a non-existent username, the server runs a simulated Argon2id verification (`PasswordService.dummyVerify()`) against a constant pre-computed hash before returning the generic error. This equalizes processing time and prevents attackers from determining whether an account exists by analyzing response latency.

---

## 3. Token Strategy & Session Lifecycle

### 3.1 Short-Lived Access Tokens (JWT)

- **Format:** JSON Web Token (JWT) signed via `HS256`.
- **Lifetime:** 15 minutes (`15m`).
- **Algorithm Pinning:** Both generation and verification explicitly specify `algorithms: ['HS256']` to prevent algorithm confusion attacks (such as `none` or RSA/HMAC confusion).
- **Claims:**
  - `sub`: User UUID
  - `username`: Unique username string
  - `roles`: Array of canonical roles assigned to the user
  - `iss`: `qualityops-api`
  - `aud`: `qualityops-web`
  - `exp`: Epoch expiration timestamp
- **Storage:** Held strictly in-memory in the React client (`AuthContext`). It is **never** written to `localStorage` or `sessionStorage`, eliminating exposure to XSS credential extraction.

### 3.2 Rotating Refresh Tokens & Session Records

- **Token Generation:** 256 bits (32 bytes) of cryptographic randomness formatted as hexadecimal string.
- **Persistence:** The raw refresh token is **never** stored in the database. Only its deterministic **SHA-256 hash** is stored in `refresh_sessions.token_hash`.
- **Cookie Policy:**
  - `HttpOnly`: Inaccessible to JavaScript (prevents theft via XSS).
  - `SameSite`: `Strict` in production (`Lax` in development).
  - `Secure`: Transmitted only over HTTPS in production.
  - `Path`: Restricted strictly to `/api/v1/auth`.
  - `Max-Age`: 7 days.
- **Automatic Token Reuse Detection:**
  When a refresh request is submitted with a token whose session is already marked `revoked_at IS NOT NULL`, the system detects an unauthorized reuse attempt (such as an intercepted or replayed token). As a defense-in-depth measure, **all active refresh sessions for that user account are immediately revoked**, requiring the legitimate user to re-authenticate.
- **Session Rotation:** On every successful call to `/api/v1/auth/refresh`, the previous refresh session is revoked (`revoked_at = CURRENT_TIMESTAMP`) and a new refresh token is generated and persisted.

---

## 4. Role-Based Access Control (RBAC)

### 4.1 Canonical Roles

QualityOps defines six canonical roles seeded in migration `002_auth_sessions.sql`:

| Role Name         | Scope & Authority                                                                             |
| :---------------- | :-------------------------------------------------------------------------------------------- |
| `ADMIN`           | Full administrative control: user provisioning, role assignments, system configurations.      |
| `QUALITY_MANAGER` | Governance over inspection protocols, defect standards, non-conformance, and CAPA resolution. |
| `SUPERVISOR`      | Production line oversight, batch scheduling, shift management, and downtime approvals.        |
| `INSPECTOR`       | Execution of sample-based quality inspections and recording defect occurrences.               |
| `OPERATOR`        | Production batch execution data entry, machine counters, and downtime recording.              |
| `VIEWER`          | Read-only operational visibility into quality status and batch traceability.                  |

### 4.2 Authorization Matrix (Phase 3 Scope)

| Endpoint                  | Method |     Required Roles     | Description                                                      |
| :------------------------ | :----: | :--------------------: | :--------------------------------------------------------------- |
| `/api/v1/health`          |  GET   |         Public         | Service liveness probe.                                          |
| `/api/v1/health/ready`    |  GET   |         Public         | Database readiness probe.                                        |
| `/api/v1/auth/login`      |  POST  |         Public         | Authenticates credentials, issues access token & refresh cookie. |
| `/api/v1/auth/refresh`    |  POST  |  Public (Cookie/Body)  | Rotates refresh token, issues fresh access token.                |
| `/api/v1/auth/logout`     |  POST  |  Public (Cookie/Body)  | Revokes active refresh session and clears cookie.                |
| `/api/v1/auth/me`         |  GET   | Any Authenticated User | Returns the current user's profile and active roles.             |
| `/api/v1/users`           |  GET   |        `ADMIN`         | Lists users with pagination and search filters.                  |
| `/api/v1/users`           |  POST  |        `ADMIN`         | Provisions a new user account with initial role assignment.      |
| `/api/v1/users/:id`       |  GET   |        `ADMIN`         | Fetches user details by UUID.                                    |
| `/api/v1/users/:id`       | PATCH  |        `ADMIN`         | Updates user full name, email, password, or active status.       |
| `/api/v1/users/:id/roles` |  PUT   |        `ADMIN`         | Replaces assigned roles for a user.                              |

### 4.3 Self-Lockout & Self-Demotion Guards

1. **Self-Deactivation Guard:** An administrator cannot deactivate their own account (`isActive: false` on self returns `400 Bad Request`).
2. **Self-Demotion Guard:** An administrator cannot remove the `ADMIN` role from themselves (`PUT /users/:id/roles` omitting `ADMIN` returns `400 Bad Request`).

---

## 5. First-Admin Bootstrap Workflow

In production or fresh environments, the application does **not** create a hardcoded default admin account on startup.

To bootstrap the initial administrator safely:

```bash
# Non-interactive / CI / Deployment pipeline:
ADMIN_USERNAME="admin" \
ADMIN_EMAIL="admin@qualityops.local" \
ADMIN_FULL_NAME="System Administrator" \
ADMIN_PASSWORD="SecureAdministratorPassword123!" \
npm run db:bootstrap-admin

# Interactive CLI mode (will prompt for password securely):
npm run db:bootstrap-admin
```

**Guarantees:**

- Passwords are never hardcoded in source files.
- The command is idempotent: if the user already exists, it ensures the `ADMIN` role is assigned without overwriting passwords.
- Neither the plaintext password nor the hash is ever printed to stdout/stderr.

---

## 6. Environment Variables Reference

| Variable Name                | Default (Dev / Test)                                | Production Requirement                                                              |
| :--------------------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------------- |
| `JWT_ACCESS_SECRET`          | `dev-qualityops-jwt-access-secret-32-chars-minimum` | **Mandatory:** Cryptographically random string $\ge 32$ chars. Verified at startup. |
| `JWT_ACCESS_EXPIRES_IN`      | `15m`                                               | Token lifetime (e.g., `15m`).                                                       |
| `REFRESH_TOKEN_EXPIRES_DAYS` | `7`                                                 | Refresh session retention in days.                                                  |
| `COOKIE_SECRET`              | `dev-qualityops-cookie-secret-32-chars-minimum`     | Secret for cookie parsing / signing.                                                |
| `DATABASE_URL`               | `postgresql://...`                                  | Connection string to PostgreSQL 18.                                                 |
| `CORS_ORIGIN`                | `http://localhost:5173`                             | Allowed origin for API requests and CSRF origin checks.                             |
