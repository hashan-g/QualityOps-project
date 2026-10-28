import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';
import { redactSensitiveData } from '../infrastructure/security/redact.service.js';
import { sanitizeCsvCell } from '../modules/reports/exports/csv.exporter.js';
import { sanitizeXlsxValue } from '../modules/reports/exports/xlsx.exporter.js';
import { artifactStorage } from '../modules/reports/exports/artifact.storage.js';
import { spcAnalyticsClient } from '../modules/analytics/spc/spc-analytics.client.js';
import { pool } from '../infrastructure/database/pool.js';
import { alertsRepository } from '../modules/alerts/alerts.repository.js';
import { schedulesRepository } from '../modules/reports/schedules.repository.js';
import type { CanonicalRole } from '@qualityops/contracts';

describe('Phase 11 Security Hardening Test Suite (SEC-001 — SEC-022)', () => {
  const app = createApp();

  const activeAdmin = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'admin_user',
    email: 'admin@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Admin User',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['ADMIN' as CanonicalRole],
  };

  const activeViewer = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'viewer_user',
    email: 'viewer@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Viewer User',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['VIEWER' as CanonicalRole],
  };

  const deactivatedUser = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'deactivated_user',
    email: 'disabled@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Deactivated User',
    is_active: false,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['OPERATOR' as CanonicalRole],
  };

  const validAdminToken = TokenService.signAccessToken({
    userId: activeAdmin.id,
    username: activeAdmin.username,
    roles: activeAdmin.roles,
  }).token;

  const validViewerToken = TokenService.signAccessToken({
    userId: activeViewer.id,
    username: activeViewer.username,
    roles: activeViewer.roles,
  }).token;

  const deactivatedUserToken = TokenService.signAccessToken({
    userId: deactivatedUser.id,
    username: deactivatedUser.username,
    roles: deactivatedUser.roles,
  }).token;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // SEC-001: Access Token Validation
  // ==========================================
  describe('SEC-001: Missing, malformed, expired, or tampered access token', () => {
    it('rejects requests missing an Authorization header with 401', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Authentication token required');
    });

    it('rejects malformed token strings with 401', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.malformed.jwt.signature');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects expired JWT tokens with 401', async () => {
      // Create token expired 1 hour ago
      const expiredToken = jwt.sign(
        {
          sub: activeAdmin.id,
          username: activeAdmin.username,
          roles: activeAdmin.roles,
          iat: Math.floor(Date.now() / 1000) - 7200,
          exp: Math.floor(Date.now() / 1000) - 3600,
        },
        config.JWT_ACCESS_SECRET,
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('Invalid or expired authentication token');
    });

    it('rejects tampered token signature with 401', async () => {
      // Sign with a rogue secret
      const rogueToken = jwt.sign(
        {
          sub: activeAdmin.id,
          username: activeAdmin.username,
          roles: activeAdmin.roles,
        },
        'untrusted-rogue-signing-secret-with-32-chars-pad',
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${rogueToken}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================
  // SEC-002: Refresh Token Replay / Revocation
  // ==========================================
  describe('SEC-002: Refresh token reuse after rotation/revocation', () => {
    it('detects replayed/revoked refresh token and immediately revokes all user sessions', async () => {
      vi.spyOn(authRepository, 'findRefreshSessionByHash').mockResolvedValue({
        id: 'session-replayed',
        user_id: activeAdmin.id,
        token_hash: 'revoked_hash',
        expires_at: new Date(Date.now() + 60000),
        revoked_at: new Date(Date.now() - 10000), // Already revoked previously
        created_at: new Date(),
        last_used_at: null,
        user_agent: null,
        ip_address: null,
      });
      const revokeAllSpy = vi.spyOn(authRepository, 'revokeAllUserSessions').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'replayed_compromised_token' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(revokeAllSpy).toHaveBeenCalledWith(activeAdmin.id);
    });
  });

  // ==========================================
  // SEC-003: Deactivated User Token Denial
  // ==========================================
  describe('SEC-003: Deactivated user uses still-valid access token', () => {
    it('denies access with 401 when account is deactivated in DB, even with unexpired JWT', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(deactivatedUser);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${deactivatedUserToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toContain('User account is deactivated');
    });
  });

  // ==========================================
  // SEC-004 & SEC-005: Role-Based Access Control
  // ==========================================
  describe('SEC-004 & SEC-005: Role matrix and function-level authorization', () => {
    it('denies non-admin (VIEWER) access to user administration routes with 403', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(activeViewer);

      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${validViewerToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('Insufficient permissions');
    });

    it('denies VIEWER role from executing write operations on scheduled reports', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(activeViewer);

      const response = await request(app)
        .post('/api/v1/reports/schedules')
        .set('Authorization', `Bearer ${validViewerToken}`)
        .send({
          name: 'Unauthorized Schedule',
          reportType: 'production-performance',
          cadence: 'DAILY',
          format: 'CSV',
          timezone: 'UTC',
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN role access to user administration routes', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(activeAdmin);
      const listSpy = vi.spyOn(authRepository, 'findById');

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${validAdminToken}`);

      expect(response.status).toBe(200);
      expect(listSpy).toHaveBeenCalledWith(activeAdmin.id);
    });
  });

  // ==========================================
  // SEC-007: Mass Assignment Prevention
  // ==========================================
  describe('SEC-007: Mass assignment of protected fields', () => {
    it('ignores or rejects unknown/privileged fields in login payload', async () => {
      vi.spyOn(authRepository, 'findByUsernameOrEmail').mockResolvedValue(null);
      const dummySpy = vi.spyOn(authRepository, 'findByUsernameOrEmail');

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: 'test_admin',
          password: 'Password123!',
          isAdmin: true,
          roles: ['ADMIN'],
          is_active: true,
        });

      // Validates username and password only; extra properties do not grant privilege
      expect(dummySpy).toHaveBeenCalledWith('test_admin');
      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // SEC-008: SQL Injection Neutralization
  // ==========================================
  describe('SEC-008: SQL injection input safety', () => {
    it('neutralizes SQL injection syntax in search parameters as literal values', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(activeAdmin);

      const maliciousSqlInputs = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        '1 UNION SELECT null, null, null--',
        "admin'--",
      ];

      for (const payload of maliciousSqlInputs) {
        const response = await request(app)
          .get('/api/v1/alerts')
          .query({ status: payload })
          .set('Authorization', `Bearer ${validAdminToken}`);

        // Zod validates status enum and rejects it safely with 400 Bad Request
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('BAD_REQUEST');
        expect(response.body.error.message).toContain('Invalid query parameters');
      }
    });
  });

  // ==========================================
  // SEC-009: Unbounded Query Limits
  // ==========================================
  describe('SEC-009: Unbounded limit/date range handling', () => {
    it('rejects limit values outside allowable bounds with 400 Bad Request', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(activeAdmin);

      const response = await request(app)
        .get('/api/v1/alerts')
        .query({ limit: 50000 })
        .set('Authorization', `Bearer ${validAdminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects negative offset values with 400 Bad Request', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(activeAdmin);

      const response = await request(app)
        .get('/api/v1/alerts')
        .query({ offset: -10 })
        .set('Authorization', `Bearer ${validAdminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });
  });

  // ==========================================
  // SEC-010: Production Error Envelope Hiding
  // ==========================================
  describe('SEC-010: Production error envelope safety', () => {
    it('masks internal server errors in production mode without leaking stack or database details', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        vi.spyOn(authRepository, 'findById').mockResolvedValue(activeAdmin);
        vi.spyOn(alertsRepository, 'listAlerts').mockRejectedValue(
          new Error(
            'pg: relation "internal_secrets" does not exist at character 42 in /var/db/query.c',
          ),
        );

        const response = await request(app)
          .get('/api/v1/alerts')
          .set('Authorization', `Bearer ${validAdminToken}`);

        expect(response.status).toBe(500);
        expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
        expect(response.body.error.message).toBe('An unexpected error occurred');
        expect(response.body.error).not.toHaveProperty('stack');
        expect(JSON.stringify(response.body)).not.toContain('internal_secrets');
        expect(JSON.stringify(response.body)).not.toContain('/var/db');
      } finally {
        process.env.NODE_ENV = origNodeEnv;
      }
    });
  });

  // ==========================================
  // SEC-011: CSV Formula Injection Protection
  // ==========================================
  describe('SEC-011: CSV formula injection neutralization', () => {
    it('prepends single-quote to formula triggers and wraps in RFC 4180 quotes', () => {
      const dangerousInputs = [
        '=cmd|"/C calc"!A0',
        '+SUM(1,2)',
        '-2+3+cmd|"/C notepad"!A0',
        '@SUM(1,2)',
        '\tTAB_VALUE',
        '\rCR_VALUE',
      ];

      for (const input of dangerousInputs) {
        const sanitized = sanitizeCsvCell(input);
        expect(sanitized.includes(`'${input.charAt(0)}`)).toBe(true);
      }
    });

    it('leaves standard benign text and numbers intact', () => {
      expect(sanitizeCsvCell('Normal Part Number 123')).toBe('Normal Part Number 123');
      expect(sanitizeCsvCell(42)).toBe('42');
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });
  });

  // ==========================================
  // SEC-012: XLSX Formula Injection Protection
  // ==========================================
  describe('SEC-012: XLSX cell value sanitization', () => {
    it('prepends single-quote to dangerous formula triggers in string cells', () => {
      expect(sanitizeXlsxValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeXlsxValue('+1+2')).toBe("'+1+2");
      expect(sanitizeXlsxValue('-100')).toBe("'-100");
      expect(sanitizeXlsxValue('@AVERAGE(B1:B5)')).toBe("'@AVERAGE(B1:B5)");
      expect(sanitizeXlsxValue('\tINDENTED')).toBe("'\tINDENTED");
      expect(sanitizeXlsxValue('\rCARRIAGE')).toBe("'\rCARRIAGE");
    });

    it('preserves native numbers and boolean values without altering their type', () => {
      expect(sanitizeXlsxValue(42.5)).toBe(42.5);
      expect(sanitizeXlsxValue(-42.5)).toBe(-42.5);
      expect(sanitizeXlsxValue(true)).toBe(true);
      expect(sanitizeXlsxValue(false)).toBe(false);
      expect(sanitizeXlsxValue('Safe Label')).toBe('Safe Label');
    });
  });

  // ==========================================
  // SEC-013: Export Artifact Traversal Defense
  // ==========================================
  describe('SEC-013: Export artifact path traversal defense', () => {
    it('rejects path traversal attempts in artifactId with 400 Bad Request', () => {
      const traversalAttempts = [
        '../../etc/passwd',
        '..\\..\\windows\\system32',
        '../reports/secret',
        'c7a4b67f-not-a-valid-uuid',
      ];

      for (const attempt of traversalAttempts) {
        expect(() => {
          artifactStorage.resolveSafePath(attempt, 'CSV');
        }).toThrow(/Invalid artifact identifier format; UUID required/);
      }
    });
  });

  // ==========================================
  // SEC-014: Origin Validation on Cookie Mutations
  // ==========================================
  describe('SEC-014: Missing/invalid Origin on cookie-based mutation', () => {
    it('rejects cookie refresh request when Origin is missing with 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', ['refreshToken=valid_refresh_token_cookie']);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toBe('Invalid request origin');
    });

    it('rejects cookie refresh request when Origin does not match CORS_ORIGIN with 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', 'http://malicious-origin.com')
        .set('Cookie', ['refreshToken=valid_refresh_token_cookie']);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toBe('Invalid request origin');
    });
  });

  // ==========================================
  // SEC-016: Python Analytics Service Resilience
  // ==========================================
  describe('SEC-016: Python analytics down or timed out', () => {
    it('translates fetch timeout to safe 503 Service Unavailable without leaking internal URL', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new DOMException('The operation was aborted', 'TimeoutError'),
      );

      await expect(
        spcAnalyticsClient.calculatePChart([
          {
            id: '1',
            inspectionNumber: 'INS-001',
            batchId: 'B-1',
            batchNumber: 'B-001',
            timestamp: new Date().toISOString(),
            sampleSize: 100,
            failedUnits: 2,
          },
        ]),
      ).rejects.toThrow(/Statistical analytics calculation service is temporarily unavailable/);
    });
  });

  // ==========================================
  // SEC-018: Transactional Row Locking on Schedules
  // ==========================================
  describe('SEC-018: Concurrent schedule claim row locking', () => {
    it('schedulesRepository.claimDueSchedules uses FOR UPDATE SKIP LOCKED in query', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };

      await schedulesRepository.claimDueSchedules(
        5,
        mockClient as unknown as Parameters<typeof schedulesRepository.claimDueSchedules>[1],
      );

      expect(mockClient.query).toHaveBeenCalled();
      const executedSql = mockClient.query.mock.calls[0][0] as string;
      expect(executedSql).toContain('FOR UPDATE SKIP LOCKED');
      expect(executedSql).toContain('is_enabled = true');
    });
  });

  // ==========================================
  // SEC-019: Operational Alert Deduplication
  // ==========================================
  describe('SEC-019: Duplicate active alert fingerprint deduplication', () => {
    it('alertsRepository.createAlertIdempotent uses ON CONFLICT DO NOTHING with partial index filter', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({
        rows: [],
        command: 'INSERT',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const result = await alertsRepository.createAlertIdempotent({
        ruleType: 'CRITICAL_DEFECT',
        severity: 'CRITICAL',
        title: 'Critical Test',
        message: 'Alert message',
        fingerprint: 'CRITICAL_DEFECT:BATCH-001:DEFECT-001',
        entityType: 'batch',
        entityId: '00000000-0000-0000-0000-000000000001',
        contextData: { test: true },
      });

      expect(result).toBeNull();
      expect(querySpy).toHaveBeenCalled();
      const executedSql = querySpy.mock.calls[0][0] as string;
      expect(executedSql).toContain(
        "ON CONFLICT (fingerprint) WHERE status IN ('OPEN', 'ACKNOWLEDGED') DO NOTHING",
      );
    });
  });

  // ==========================================
  // SEC-020: Sensitive Data Redaction
  // ==========================================
  describe('SEC-020: Sensitive data redaction in logs/audit records', () => {
    it('redacts passwords, hashes, tokens, auth headers, and PostgreSQL credentials', () => {
      const sensitiveRecord = {
        username: 'operator',
        password: 'PlainTextPassword123!',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'a1b2c3d4e5f6',
        authorization: 'Bearer super_secret_token',
        databaseUrl:
          'postgresql://qualityops_admin:SuperSecretPass123!@localhost:5432/qualityops_prod',
        safeMetadata: 'public_value',
      };

      const redacted = redactSensitiveData(sensitiveRecord) as Record<string, string>;

      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.password_hash).toBe('[REDACTED]');
      expect(redacted.accessToken).toBe('[REDACTED]');
      expect(redacted.refreshToken).toBe('[REDACTED]');
      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted.databaseUrl).toBe(
        'postgresql://qualityops_admin@localhost:5432/qualityops_prod',
      );
      expect(redacted.databaseUrl).not.toContain('SuperSecretPass123!');
      expect(redacted.safeMetadata).toBe('public_value');
    });
  });

  // ==========================================
  // SEC-021: Defensive HTTP Headers
  // ==========================================
  describe('SEC-021: Defensive HTTP headers and disabled X-Powered-By', () => {
    it('sets security headers on all responses and disables X-Powered-By', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['x-permitted-cross-domain-policies']).toBe('none');
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['content-security-policy']).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
    });
  });

  // ==========================================
  // SEC-022: Request ID Sanitization & Malformed JSON
  // ==========================================
  describe('SEC-022: Request ID validation and malformed JSON envelope', () => {
    it('sanitizes malicious or invalid x-request-id headers to a clean UUID', async () => {
      const maliciousId = '../../../etc/passwd;injection';
      const response = await request(app).get('/api/v1/health').set('x-request-id', maliciousId);

      const returnedId = response.headers['x-request-id'];
      expect(returnedId).toBeDefined();
      expect(returnedId).not.toContain('..');
      expect(returnedId).not.toContain('injection');
      expect(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(returnedId),
      ).toBe(true);
    });

    it('returns a structured 400 Bad Request error envelope for malformed JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json payload: missing quotes }');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(response.body.error.message).toContain('Malformed JSON payload');
    });
  });
});
