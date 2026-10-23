import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import type { CanonicalRole } from '@qualityops/contracts';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  roles: CanonicalRole[];
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export class TokenService {
  private static readonly ISSUER = 'qualityops-api';
  private static readonly AUDIENCE = 'qualityops-web';
  private static readonly ALGORITHM = 'HS256';

  /**
   * Signs a short-lived access JWT (default 15m).
   */
  public static signAccessToken(payload: {
    userId: string;
    username: string;
    roles: CanonicalRole[];
  }): { token: string; expiresInSeconds: number } {
    // 15 minutes = 900 seconds
    const expiresInSeconds = 15 * 60;

    const token = jwt.sign(
      {
        sub: payload.userId,
        username: payload.username,
        roles: payload.roles,
      },
      config.JWT_ACCESS_SECRET,
      {
        algorithm: TokenService.ALGORITHM,
        expiresIn: expiresInSeconds,
        issuer: TokenService.ISSUER,
        audience: TokenService.AUDIENCE,
      },
    );

    return { token, expiresInSeconds };
  }

  /**
   * Verifies an access token and returns its decoded payload.
   * Explicitly restricts algorithms to HS256 to prevent algorithm confusion attacks.
   */
  public static verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
      algorithms: [TokenService.ALGORITHM],
      issuer: TokenService.ISSUER,
      audience: TokenService.AUDIENCE,
    });

    return decoded as AccessTokenPayload;
  }

  /**
   * Generates a 256-bit cryptographically secure random token string for refresh sessions.
   */
  public static generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates a deterministic SHA-256 hash of a refresh token to store in the database.
   * The raw refresh token is NEVER persisted in the database.
   */
  public static hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
