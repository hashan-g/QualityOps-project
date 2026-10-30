import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Searches upwards from process.cwd() and import.meta.url to locate .env files.
 * Loading deepest files first allows workspace-specific .env files (e.g. apps/api/.env)
 * to override monorepo root .env files, while ensuring root .env is discovered regardless
 * of which workspace or directory the process is launched from.
 *
 * @param customStartDirs Optional custom directory roots to search upward from (useful for isolated testing).
 * @param stopDir Optional directory boundary above which upward searching will not continue.
 */
export function resolveEnvFiles(customStartDirs?: string[], stopDir?: string): string[] {
  const loadedFiles: string[] = [];
  const candidateFiles: string[] = [];

  const startDirs = customStartDirs ?? [
    process.cwd(),
    path.dirname(fileURLToPath(import.meta.url)),
  ];

  const resolvedStopDir = stopDir ? path.resolve(stopDir) : undefined;

  for (const startDir of startDirs) {
    let current = path.resolve(startDir);
    while (current && current !== path.dirname(current)) {
      const envPath = path.join(current, '.env');
      if (fs.existsSync(envPath) && !candidateFiles.includes(envPath)) {
        candidateFiles.push(envPath);
      }
      if (resolvedStopDir && path.resolve(current) === resolvedStopDir) {
        break;
      }
      current = path.dirname(current);
    }
  }

  // Sort candidate files: deepest (e.g. apps/api/.env) first, closest to root last.
  // Since dotenv does not overwrite existing process.env values by default,
  // loading deepest first gives workspace-specific .env precedence over parent .env.
  candidateFiles.sort((a, b) => b.length - a.length);

  for (const envFile of candidateFiles) {
    const result = dotenv.config({ path: envFile });
    if (!result.error) {
      loadedFiles.push(envFile);
    }
  }

  return loadedFiles;
}

export const loadedEnvFiles = resolveEnvFiles();

/**
 * Strips password and sensitive query parameters from a database connection string,
 * returning safe connection coordinates (protocol, user, host, port, database).
 */
export function sanitizeDatabaseUrl(connString: string): string {
  try {
    const parsed = new URL(connString);
    const port = parsed.port ? `:${parsed.port}` : '';
    const user = parsed.username ? `${parsed.username}@` : '';
    return `${parsed.protocol}//${user}${parsed.hostname}${port}${parsed.pathname}`;
  } catch {
    return 'invalid-database-url';
  }
}

export const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z
      .string()
      .default('4000')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('API_PORT must be a positive integer');
        }
        return parsed;
      }),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    DATABASE_URL: z
      .string()
      .optional()
      .transform((val) => {
        if (val && val.trim().length > 0) return val;
        const user = process.env.POSTGRES_USER;
        const password = process.env.POSTGRES_PASSWORD;
        const host = process.env.POSTGRES_HOST || '127.0.0.1';
        const port = process.env.POSTGRES_PORT || '5432';
        const db = process.env.POSTGRES_DB || 'qualityops';
        if (user && password) {
          return `postgresql://${user}:${password}@${host}:${port}/${db}`;
        }
        return 'postgresql://qualityops_dev:replace_with_a_local_only_password@127.0.0.1:5432/qualityops';
      }),
    DB_POOL_MAX: z
      .string()
      .default('10')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('DB_POOL_MAX must be a positive integer');
        }
        return parsed;
      }),
    DB_POOL_IDLE_TIMEOUT_MS: z
      .string()
      .default('30000')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 0) {
          throw new Error('DB_POOL_IDLE_TIMEOUT_MS must be a non-negative integer');
        }
        return parsed;
      }),
    DB_POOL_CONNECTION_TIMEOUT_MS: z
      .string()
      .default('5000')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 0) {
          throw new Error('DB_POOL_CONNECTION_TIMEOUT_MS must be a non-negative integer');
        }
        return parsed;
      }),
    JWT_ACCESS_SECRET: z.string().default('dev-qualityops-jwt-access-secret-32-chars-minimum'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRES_DAYS: z
      .string()
      .default('7')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('REFRESH_TOKEN_EXPIRES_DAYS must be a positive integer');
        }
        return parsed;
      }),
    COOKIE_SECRET: z.string().default('dev-qualityops-cookie-secret-32-chars-minimum'),
    ANALYTICS_SERVICE_URL: z.string().default('http://127.0.0.1:8000'),
    ANALYTICS_SERVICE_TIMEOUT_MS: z
      .string()
      .default('5000')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('ANALYTICS_SERVICE_TIMEOUT_MS must be a positive integer');
        }
        return parsed;
      }),
    REPORT_STORAGE_DIR: z.string().default('local-data/reports'),
    ALERT_INSPECTION_FAILURE_THRESHOLD: z
      .string()
      .default('0.15')
      .transform((val) => {
        const parsed = parseFloat(val);
        if (isNaN(parsed) || parsed <= 0 || parsed > 1) {
          throw new Error('ALERT_INSPECTION_FAILURE_THRESHOLD must be a float between 0 and 1');
        }
        return parsed;
      }),
    ALERT_EVALUATION_LOOKBACK_DAYS: z
      .string()
      .default('30')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('ALERT_EVALUATION_LOOKBACK_DAYS must be a positive integer');
        }
        return parsed;
      }),
    EMAIL_ENABLED: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
    EMAIL_MOCK_DELIVERY: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z
      .string()
      .default('587')
      .refine(
        (val) => {
          const parsed = parseInt(val, 10);
          return !isNaN(parsed) && parsed > 0 && parsed <= 65535;
        },
        { message: 'SMTP_PORT must be an integer between 1 and 65535' },
      )
      .transform((val) => parseInt(val, 10)),
    SMTP_SECURE: z
      .string()
      .default('false')
      .transform((val) => val === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_CONNECTION_TIMEOUT_MS: z
      .string()
      .default('5000')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('SMTP_CONNECTION_TIMEOUT_MS must be a positive integer');
        }
        return parsed;
      }),
    EMAIL_FROM: z.string().default('QualityOps Notifications <notifications@qualityops.local>'),
    EMAIL_MAX_ATTACHMENT_SIZE_BYTES: z
      .string()
      .default('10485760')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('EMAIL_MAX_ATTACHMENT_SIZE_BYTES must be a positive integer');
        }
        return parsed;
      }),
    EMAIL_MAX_RETRY_ATTEMPTS: z
      .string()
      .default('3')
      .transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed <= 0) {
          throw new Error('EMAIL_MAX_RETRY_ATTEMPTS must be a positive integer');
        }
        return parsed;
      }),
  })
  .refine(
    (data) => {
      if (data.NODE_ENV === 'production') {
        if (
          data.JWT_ACCESS_SECRET === 'dev-qualityops-jwt-access-secret-32-chars-minimum' ||
          data.JWT_ACCESS_SECRET.length < 32
        ) {
          return false;
        }
        if (
          data.COOKIE_SECRET === 'dev-qualityops-cookie-secret-32-chars-minimum' ||
          data.COOKIE_SECRET.length < 32
        ) {
          return false;
        }
        if (data.DATABASE_URL.includes('replace_with_a_local_only_password')) {
          return false;
        }
        if (data.EMAIL_ENABLED) {
          if (data.EMAIL_MOCK_DELIVERY) {
            return false;
          }
          if (
            !data.SMTP_HOST ||
            data.SMTP_HOST === 'localhost' ||
            data.SMTP_HOST === '127.0.0.1' ||
            data.SMTP_HOST.trim().length === 0
          ) {
            return false;
          }
          if (!data.EMAIL_FROM || data.EMAIL_FROM.trim().length === 0) {
            return false;
          }
        }
      }
      return true;
    },
    {
      message:
        'In production, JWT_ACCESS_SECRET and COOKIE_SECRET must be set and at least 32 characters long, DATABASE_URL must not contain default placeholder credentials, and if EMAIL_ENABLED is true, real non-localhost SMTP_HOST and EMAIL_FROM must be configured with mock delivery disabled',
      path: ['JWT_ACCESS_SECRET'],
    },
  );

const parsed = EnvironmentSchema.safeParse(process.env);

if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuration validation failed:\n${errors}`);
}

export const config = parsed.data;
export type Config = typeof config;
