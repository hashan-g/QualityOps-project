import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

/**
 * Attaches industry-standard defensive HTTP security headers to every response.
 * Eliminates fingerprinting headers, prevents MIME-sniffing, disables frame embedding (clickjacking),
 * and enforces strict transport security in production environments.
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking by forbidding frame embedding
  res.setHeader('X-Frame-Options', 'DENY');

  // Referrer policy: send origin only on cross-origin requests
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict Flash / PDF cross-domain policies
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Disable browser DNS prefetching
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Strict API Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // HTTP Strict Transport Security (HSTS) in production
  if (config.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}
