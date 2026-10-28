import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  sanitizeDatabaseUrl,
  resolveEnvFiles,
  config,
  loadedEnvFiles,
  EnvironmentSchema,
} from './config.js';

describe('Configuration & Environment Resolution Tests', () => {
  describe('sanitizeDatabaseUrl', () => {
    it('strips plain password while preserving protocol, username, host, port, and database', () => {
      const sanitized = sanitizeDatabaseUrl(
        'postgresql://qualityops_dev:SuperSecretPassword123@localhost:5432/qualityops',
      );
      expect(sanitized).toBe('postgresql://qualityops_dev@localhost:5432/qualityops');
      expect(sanitized).not.toContain('SuperSecretPassword123');
    });

    it('strips password with complex special characters safely', () => {
      const sanitized = sanitizeDatabaseUrl(
        'postgresql://qualityops_dev:p%40ss%23word%21@127.0.0.1:5433/qualityops',
      );
      expect(sanitized).toBe('postgresql://qualityops_dev@127.0.0.1:5433/qualityops');
      expect(sanitized).not.toContain('p%40ss');
    });

    it('handles connection strings without explicit port', () => {
      const sanitized = sanitizeDatabaseUrl(
        'postgres://dbuser:mypassword@db.example.internal/proddb',
      );
      expect(sanitized).toBe('postgres://dbuser@db.example.internal/proddb');
      expect(sanitized).not.toContain('mypassword');
    });

    it('returns fallback string for non-parseable URLs without throwing', () => {
      const sanitized = sanitizeDatabaseUrl('not a valid url :: // ;;');
      expect(sanitized).toBe('invalid-database-url');
    });
  });

  describe('resolveEnvFiles (isolated directory fixtures)', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qualityops-config-test-'));
    });

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('discovers .env files in parent directories and orders deepest first', () => {
      const rootDir = path.join(tempDir, 'repo');
      const apiDir = path.join(rootDir, 'apps', 'api');
      const srcDir = path.join(apiDir, 'src');

      fs.mkdirSync(srcDir, { recursive: true });

      const rootEnv = path.join(rootDir, '.env');
      const apiEnv = path.join(apiDir, '.env');

      fs.writeFileSync(rootEnv, 'FIXTURE_PARENT_VAR=root_val\n');
      fs.writeFileSync(apiEnv, 'FIXTURE_CHILD_VAR=api_val\n');

      const discovered = resolveEnvFiles([srcDir], rootDir);

      expect(discovered).toHaveLength(2);
      // Deepest (apps/api/.env) must be first so it takes precedence over parent (.env)
      expect(discovered[0]).toBe(apiEnv);
      expect(discovered[1]).toBe(rootEnv);
      expect(discovered.every((f) => f.endsWith('.env'))).toBe(true);
    });

    it('returns empty array when no .env files exist in directory tree', () => {
      const emptyDir = path.join(tempDir, 'empty', 'nested');
      fs.mkdirSync(emptyDir, { recursive: true });

      const discovered = resolveEnvFiles([emptyDir], tempDir);
      expect(discovered).toEqual([]);
    });

    it('discovers single .env file when only one exists in ancestry', () => {
      const rootDir = path.join(tempDir, 'single');
      const nestedDir = path.join(rootDir, 'level1', 'level2');
      fs.mkdirSync(nestedDir, { recursive: true });

      const rootEnv = path.join(rootDir, '.env');
      fs.writeFileSync(rootEnv, 'FIXTURE_SINGLE_VAR=val\n');

      const discovered = resolveEnvFiles([nestedDir], rootDir);
      expect(discovered).toHaveLength(1);
      expect(discovered[0]).toBe(rootEnv);
    });
  });

  describe('loadedEnvFiles export', () => {
    it('exports loadedEnvFiles as array of string paths ending with .env', () => {
      expect(Array.isArray(loadedEnvFiles)).toBe(true);
      for (const filePath of loadedEnvFiles) {
        expect(typeof filePath).toBe('string');
        expect(filePath.endsWith('.env')).toBe(true);
      }
    });
  });

  describe('config properties', () => {
    it('loads active configuration adhering to schema', () => {
      expect(config.NODE_ENV).toBeDefined();
      expect(typeof config.API_PORT).toBe('number');
      expect(typeof config.DB_POOL_MAX).toBe('number');
      expect(typeof config.DATABASE_URL).toBe('string');
      expect(config.DATABASE_URL).toContain('postgresql://');
      expect(typeof config.REPORT_STORAGE_DIR).toBe('string');
      expect(typeof config.ALERT_INSPECTION_FAILURE_THRESHOLD).toBe('number');
      expect(typeof config.ALERT_EVALUATION_LOOKBACK_DAYS).toBe('number');
    });
  });

  describe('EnvironmentSchema production hardening', () => {
    const validProdEnv = {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      COOKIE_SECRET: 'b'.repeat(32),
      DATABASE_URL:
        'postgresql://prod_user:RealSecurePassword123@prod-db.internal:5432/qualityops_prod',
    };

    it('accepts valid production secrets exceeding 32 characters with non-placeholder database', () => {
      const parsed = EnvironmentSchema.safeParse(validProdEnv);
      expect(parsed.success).toBe(true);
    });

    it('rejects default dev JWT_ACCESS_SECRET in production mode', () => {
      const parsed = EnvironmentSchema.safeParse({
        ...validProdEnv,
        JWT_ACCESS_SECRET: 'dev-qualityops-jwt-access-secret-32-chars-minimum',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects short JWT_ACCESS_SECRET (< 32 chars) in production mode', () => {
      const parsed = EnvironmentSchema.safeParse({
        ...validProdEnv,
        JWT_ACCESS_SECRET: 'short-secret-under-32-chars',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects default dev COOKIE_SECRET in production mode', () => {
      const parsed = EnvironmentSchema.safeParse({
        ...validProdEnv,
        COOKIE_SECRET: 'dev-qualityops-cookie-secret-32-chars-minimum',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects short COOKIE_SECRET (< 32 chars) in production mode', () => {
      const parsed = EnvironmentSchema.safeParse({
        ...validProdEnv,
        COOKIE_SECRET: 'short-cookie-secret',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects placeholder database password in production mode', () => {
      const parsed = EnvironmentSchema.safeParse({
        ...validProdEnv,
        DATABASE_URL:
          'postgresql://qualityops_dev:replace_with_a_local_only_password@127.0.0.1:5432/qualityops',
      });
      expect(parsed.success).toBe(false);
    });

    it('allows default dev secrets in development and test environments', () => {
      const parsedDev = EnvironmentSchema.safeParse({
        NODE_ENV: 'development',
      });
      expect(parsedDev.success).toBe(true);

      const parsedTest = EnvironmentSchema.safeParse({
        NODE_ENV: 'test',
      });
      expect(parsedTest.success).toBe(true);
    });
  });
});
