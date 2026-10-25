import { describe, expect, it } from 'vitest';
import { sanitizeDatabaseUrl, resolveEnvFiles, config, loadedEnvFiles } from './config.js';

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

  describe('resolveEnvFiles', () => {
    it('discovers at least one .env file in parent directories', () => {
      const discovered = resolveEnvFiles();
      expect(Array.isArray(discovered)).toBe(true);
      // In this repository, the root .env exists
      expect(discovered.length).toBeGreaterThanOrEqual(1);
      expect(discovered.some((file) => file.endsWith('.env'))).toBe(true);
    });

    it('exports loadedEnvFiles as array of string paths', () => {
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
    });
  });
});
