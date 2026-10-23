import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvironmentSchema = z
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
      .default(
        'postgresql://qualityops_dev:replace_with_a_local_only_password@127.0.0.1:5432/qualityops',
      ),
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
      }
      return true;
    },
    {
      message: 'In production, JWT_ACCESS_SECRET must be set and at least 32 characters long',
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
