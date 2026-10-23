import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { authRepository } from '../modules/auth/auth.repository.js';
import { userRepository } from '../modules/users/user.repository.js';
import { TokenService } from '../infrastructure/security/token.service.js';

describe('Users Router (/api/v1/users) — RBAC & User Administration', () => {
  const app = createApp();

  const adminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'super_admin',
    email: 'admin@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Super Admin',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['ADMIN' as const],
  };

  const operatorUser = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'regular_operator',
    email: 'operator@qualityops.local',
    password_hash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
    full_name: 'Regular Operator',
    is_active: true,
    created_at: new Date('2026-10-24T00:00:00Z'),
    updated_at: new Date('2026-10-24T00:00:00Z'),
    roles: ['OPERATOR' as const],
  };

  const adminToken = TokenService.signAccessToken({
    userId: adminUser.id,
    username: adminUser.username,
    roles: adminUser.roles,
  }).token;

  const operatorToken = TokenService.signAccessToken({
    userId: operatorUser.id,
    username: operatorUser.username,
    roles: operatorUser.roles,
  }).token;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authorization Gate on User Administration', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const response = await request(app).get('/api/v1/users');
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when authenticated user lacks the ADMIN role', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);

      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('Insufficient permissions');
    });

    it('allows access when authenticated user has the ADMIN role', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(userRepository, 'listUsers').mockResolvedValue({
        users: [adminUser, operatorUser],
        total: 2,
      });

      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.users).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.page).toBe(1);
    });
  });

  describe('POST /api/v1/users (User Provisioning)', () => {
    it('non-admin is forbidden from provisioning users', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(operatorUser);

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          username: 'new_inspector',
          email: 'inspector@qualityops.local',
          password: 'Password123!',
          fullName: 'New Inspector',
          roles: ['INSPECTOR'],
        });

      expect(response.status).toBe(403);
    });

    it('admin successfully provisions a user with hashed password and valid role', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(authRepository, 'findByUsernameOrEmail').mockResolvedValue(null);
      vi.spyOn(userRepository, 'getAvailableRoles').mockResolvedValue([
        { id: '1', name: 'ADMIN' },
        { id: '2', name: 'INSPECTOR' },
      ]);

      const createdUser = {
        id: '33333333-3333-3333-3333-333333333333',
        username: 'new_inspector',
        email: 'inspector@qualityops.local',
        password_hash: '$argon2id$v=19$m=65536,t=3,p=4$createdhash',
        full_name: 'New Inspector',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        roles: ['INSPECTOR' as const],
      };

      vi.spyOn(userRepository, 'createUser').mockResolvedValue(createdUser);

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'new_inspector',
          email: 'inspector@qualityops.local',
          password: 'Password123!',
          fullName: 'New Inspector',
          roles: ['INSPECTOR'],
        });

      expect(response.status).toBe(201);
      expect(response.body.user.username).toBe('new_inspector');
      expect(response.body.user.roles).toEqual(['INSPECTOR']);
      expect(response.body.user).not.toHaveProperty('password_hash');
    });

    it('rejects passwords shorter than 8 characters', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'valid_user',
          email: 'user@test.local',
          password: '123',
          fullName: 'Valid User',
          roles: ['VIEWER'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects duplicate usernames with 409 Conflict', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(authRepository, 'findByUsernameOrEmail').mockResolvedValue(operatorUser);

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'regular_operator',
          email: 'different@test.local',
          password: 'Password123!',
          fullName: 'Duplicate Attempt',
          roles: ['OPERATOR'],
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });

  describe('PATCH /api/v1/users/:id (Profile & Status Updates)', () => {
    it('prevents an administrator from deactivating their own account (self-lockout protection)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const response = await request(app)
        .patch(`/api/v1/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('cannot deactivate their own account');
    });
  });

  describe('PUT /api/v1/users/:id/roles (Role Assignment)', () => {
    it('prevents an administrator from stripping ADMIN role from themselves (self-demotion protection)', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);

      const response = await request(app)
        .put(`/api/v1/users/${adminUser.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roles: ['VIEWER'] });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('cannot remove their own ADMIN role');
    });

    it('rejects role assignment if role does not exist in the database', async () => {
      vi.spyOn(authRepository, 'findById').mockResolvedValue(adminUser);
      vi.spyOn(userRepository, 'getAvailableRoles').mockResolvedValue([
        { id: '1', name: 'ADMIN' },
        // SUPERVISOR missing from database roles table
      ]);

      const response = await request(app)
        .put(`/api/v1/users/${operatorUser.id}/roles`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roles: ['SUPERVISOR'] });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('does not exist in the database');
    });
  });
});
