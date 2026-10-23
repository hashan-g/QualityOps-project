import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { PasswordService } from '../infrastructure/security/password.service.js';
import { TokenService } from '../infrastructure/security/token.service.js';

describe('Auth Router (/api/v1/auth)', () => {
  const app = createApp();

  const mockUserRecord = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'test_admin',
    email: 'admin@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Test Administrator',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['ADMIN' as const],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/auth/login', () => {
    it('successfully logs in with valid credentials and returns safe user representation', async () => {
      vi.spyOn(authRepository, 'findByUsernameOrEmail').mockResolvedValue(mockUserRecord);
      vi.spyOn(PasswordService, 'verifyPassword').mockResolvedValue(true);
      vi.spyOn(authRepository, 'createRefreshSession').mockResolvedValue({
        id: 'session-1',
        user_id: mockUserRecord.id,
        token_hash: 'hash',
        expires_at: new Date(),
        revoked_at: null,
        created_at: new Date(),
        last_used_at: null,
        user_agent: null,
        ip_address: null,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'test_admin', password: 'ValidPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('test_admin');
      expect(response.body.user.roles).toEqual(['ADMIN']);

      // Never leak password_hash or internal secrets
      expect(response.body.user).not.toHaveProperty('password_hash');
      expect(response.body.user).not.toHaveProperty('password');
      expect(JSON.stringify(response.body)).not.toContain('$argon2id$');

      // Refresh token cookie is set with HttpOnly
      const cookieHeader = response.headers['set-cookie'];
      expect(cookieHeader).toBeDefined();
      expect(Array.isArray(cookieHeader)).toBe(true);
      const refreshCookie = cookieHeader?.[0] ?? '';
      expect(refreshCookie).toContain('refreshToken=');
      expect(refreshCookie.toLowerCase()).toContain('httponly');
    });

    it('returns generic 401 when password does not match', async () => {
      vi.spyOn(authRepository, 'findByUsernameOrEmail').mockResolvedValue(mockUserRecord);
      vi.spyOn(PasswordService, 'verifyPassword').mockResolvedValue(false);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'test_admin', password: 'WrongPassword!' });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid username or password');
    });

    it('returns the same generic 401 when user does not exist', async () => {
      vi.spyOn(authRepository, 'findByUsernameOrEmail').mockResolvedValue(null);
      const dummySpy = vi.spyOn(PasswordService, 'dummyVerify').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'non_existent_user', password: 'AnyPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid username or password');
      expect(dummySpy).toHaveBeenCalled();
    });

    it('returns generic 401 when account is deactivated (is_active = false)', async () => {
      vi.spyOn(authRepository, 'findByUsernameOrEmail').mockResolvedValue({
        ...mockUserRecord,
        is_active: false,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'test_admin', password: 'ValidPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid username or password');
    });

    it('rejects invalid inputs with 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: '', password: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('successfully refreshes access token and rotates refresh session', async () => {
      vi.spyOn(authRepository, 'findRefreshSessionByHash').mockResolvedValue({
        id: 'session-1',
        user_id: mockUserRecord.id,
        token_hash: 'somehash',
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
        created_at: new Date(),
        last_used_at: null,
        user_agent: null,
        ip_address: null,
      });
      vi.spyOn(authRepository, 'findById').mockResolvedValue(mockUserRecord);
      vi.spyOn(authRepository, 'revokeRefreshSession').mockResolvedValue();
      vi.spyOn(authRepository, 'createRefreshSession').mockResolvedValue({
        id: 'session-2',
        user_id: mockUserRecord.id,
        token_hash: 'newhash',
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
        created_at: new Date(),
        last_used_at: null,
        user_agent: null,
        ip_address: null,
      });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'dummy_refresh_token_hex_value' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.user.username).toBe('test_admin');
    });

    it('detects revoked token reuse and revokes all user sessions', async () => {
      vi.spyOn(authRepository, 'findRefreshSessionByHash').mockResolvedValue({
        id: 'session-revoked',
        user_id: mockUserRecord.id,
        token_hash: 'somehash',
        expires_at: new Date(Date.now() + 100000),
        revoked_at: new Date(Date.now() - 5000), // Already revoked!
        created_at: new Date(),
        last_used_at: null,
        user_agent: null,
        ip_address: null,
      });
      const revokeAllSpy = vi.spyOn(authRepository, 'revokeAllUserSessions').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'stolen_refresh_token' });

      expect(response.status).toBe(401);
      expect(revokeAllSpy).toHaveBeenCalledWith(mockUserRecord.id);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('revokes session, clears refresh cookie, and returns 200', async () => {
      const revokeSpy = vi.spyOn(authRepository, 'revokeRefreshSessionByHash').mockResolvedValue();

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'some_active_refresh_token' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(revokeSpy).toHaveBeenCalled();
    });

    it('is safe to call repeatedly (idempotent)', async () => {
      const response = await request(app).post('/api/v1/auth/logout').send({});
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns the current authenticated user when a valid access token is provided', async () => {
      const { token } = TokenService.signAccessToken({
        userId: mockUserRecord.id,
        username: mockUserRecord.username,
        roles: mockUserRecord.roles,
      });

      vi.spyOn(authRepository, 'findById').mockResolvedValue(mockUserRecord);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(mockUserRecord.id);
      expect(response.body.user.username).toBe(mockUserRecord.username);
      expect(response.body.user.roles).toEqual(['ADMIN']);
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('returns 401 when authorization header is missing', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when token is invalid or expired', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.value');

      expect(response.status).toBe(401);
    });

    it('returns 401 if user was deactivated after token was issued', async () => {
      const { token } = TokenService.signAccessToken({
        userId: mockUserRecord.id,
        username: mockUserRecord.username,
        roles: mockUserRecord.roles,
      });

      // User deactivated in database
      vi.spyOn(authRepository, 'findById').mockResolvedValue({
        ...mockUserRecord,
        is_active: false,
      });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('deactivated');
    });
  });
});
