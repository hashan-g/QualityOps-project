import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { TokenService } from './token.service.js';
import { config } from '../../config.js';

describe('TokenService (JWT & Refresh Token Cryptography)', () => {
  it('signs and verifies a valid access token with pinned HS256 algorithm', () => {
    const payload = {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      username: 'john_doe',
      roles: ['OPERATOR' as const],
    };

    const { token, expiresInSeconds } = TokenService.signAccessToken(payload);
    expect(typeof token).toBe('string');
    expect(expiresInSeconds).toBe(15 * 60);

    const verified = TokenService.verifyAccessToken(token);
    expect(verified.sub).toBe(payload.userId);
    expect(verified.username).toBe(payload.username);
    expect(verified.roles).toEqual(payload.roles);
    expect(verified.iss).toBe('qualityops-api');
    expect(verified.aud).toBe('qualityops-web');
  });

  it('rejects an access token tampered with a different secret', () => {
    const fakeToken = jwt.sign(
      { sub: 'user-1', username: 'fake', roles: ['ADMIN'] },
      'wrong-secret-that-does-not-match-config',
      {
        algorithm: 'HS256',
        issuer: 'qualityops-api',
        audience: 'qualityops-web',
      },
    );

    expect(() => TokenService.verifyAccessToken(fakeToken)).toThrow();
  });

  it('rejects an expired access token', () => {
    const expiredToken = jwt.sign(
      { sub: 'user-1', username: 'expired', roles: ['VIEWER'] },
      config.JWT_ACCESS_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '-10s',
        issuer: 'qualityops-api',
        audience: 'qualityops-web',
      },
    );

    expect(() => TokenService.verifyAccessToken(expiredToken)).toThrow(/jwt expired/);
  });

  it('rejects an insecure "none" algorithm token', () => {
    // Attempt algorithm confusion attack using none
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: 'user-1', iss: 'qualityops-api', aud: 'qualityops-web' }),
    ).toString('base64url');
    const unsignedToken = `${header}.${body}.`;

    expect(() => TokenService.verifyAccessToken(unsignedToken)).toThrow();
  });

  it('generates random refresh tokens and produces deterministic SHA-256 hashes', () => {
    const rawToken1 = TokenService.generateRefreshToken();
    const rawToken2 = TokenService.generateRefreshToken();

    expect(rawToken1).not.toBe(rawToken2);
    expect(rawToken1.length).toBe(64); // 32 bytes in hex = 64 characters

    const hash1 = TokenService.hashRefreshToken(rawToken1);
    const hash2 = TokenService.hashRefreshToken(rawToken1);
    const hash3 = TokenService.hashRefreshToken(rawToken2);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(64);
  });
});
