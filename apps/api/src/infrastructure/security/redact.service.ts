import { sanitizeDatabaseUrl } from '../../config.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'newpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'token_hash',
  'tokenhash',
  'cookie',
  'cookies',
  'authorization',
  'secret',
  'jwt_access_secret',
  'cookie_secret',
  'smtp_pass',
  'smtppass',
  'smtp_password',
  'smtppassword',
  'pass',
]);

/**
 * Recursively redacts sensitive keys (passwords, tokens, hashes, cookies, secrets)
 * from objects and string values prior to logging or audit persistence.
 */
export function redactSensitiveData(target: unknown, depth = 0): unknown {
  if (depth > 10 || target === null || target === undefined) {
    return target;
  }

  if (typeof target === 'string') {
    // Redact database URLs containing credentials
    if (target.startsWith('postgresql://') || target.startsWith('postgres://')) {
      return sanitizeDatabaseUrl(target);
    }
    // Redact Bearer tokens
    if (target.startsWith('Bearer ')) {
      return 'Bearer [REDACTED]';
    }
    return target;
  }

  if (Array.isArray(target)) {
    return target.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof target === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(target as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(val, depth + 1);
      }
    }
    return redacted;
  }

  return target;
}
