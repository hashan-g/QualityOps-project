import { afterEach, describe, expect, it } from 'vitest';
import { Readable, Writable } from 'node:stream';
import { resetAdminPassword, promptPassword } from './reset-admin-password.js';
import { pool } from '../infrastructure/database/pool.js';
import { PasswordService } from '../infrastructure/security/password.service.js';

describe('Admin Password Reset CLI — Unit & Integration Tests', () => {
  describe('promptPassword (non-TTY fallback)', () => {
    it('reads password from stream input', async () => {
      const input = new Readable({
        read() {
          this.push('MySecretPass123\n');
          this.push(null);
        },
      });
      let outputText = '';
      const output = new Writable({
        write(chunk, _encoding, callback) {
          outputText += chunk.toString();
          callback();
        },
      });

      const pass = await promptPassword('Enter pass: ', input, output);
      expect(pass).toBe('MySecretPass123');
      expect(outputText).toContain('Enter pass: ');
    });
  });

  describe('validation rules', () => {
    it('rejects password shorter than 8 characters', async () => {
      await expect(
        resetAdminPassword({
          username: 'admin',
          newPassword: 'short',
          confirmPassword: 'short',
          silent: true,
        }),
      ).rejects.toThrow(/at least 8 characters/);
    });

    it('rejects mismatched password and confirmation', async () => {
      await expect(
        resetAdminPassword({
          username: 'admin',
          newPassword: 'ValidPassword123!',
          confirmPassword: 'DifferentPassword123!',
          silent: true,
        }),
      ).rejects.toThrow(/do not match/);
    });

    it('rejects missing password in non-interactive mode', async () => {
      const savedEnv = process.env.NEW_ADMIN_PASSWORD;
      delete process.env.NEW_ADMIN_PASSWORD;
      delete process.env.ADMIN_PASSWORD;
      try {
        await expect(
          resetAdminPassword({
            username: 'admin',
            silent: true,
          }),
        ).rejects.toThrow(/NEW_ADMIN_PASSWORD.*required in non-interactive/);
      } finally {
        if (savedEnv) process.env.NEW_ADMIN_PASSWORD = savedEnv;
      }
    });
  });

  describe('database integration', () => {
    const createdUsernames: string[] = [];

    async function createTestUserFixture(params: {
      username: string;
      email: string;
      password: string;
      fullName: string;
      roleName: 'ADMIN' | 'QUALITY_MANAGER' | 'OPERATOR' | 'AUDITOR';
    }): Promise<{ id: string; username: string; email: string }> {
      const hash = await PasswordService.hashPassword(params.password);
      const userRes = await pool.query<{ id: string }>(
        `INSERT INTO users (username, email, password_hash, full_name, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id;`,
        [params.username, params.email, hash, params.fullName],
      );
      const userId = userRes.rows[0]!.id;
      createdUsernames.push(params.username);

      const roleRes = await pool.query<{ id: string }>(`SELECT id FROM roles WHERE name = $1;`, [
        params.roleName,
      ]);
      if (roleRes.rows.length === 0) {
        throw new Error(`Role ${params.roleName} not found in database`);
      }
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
        [userId, roleRes.rows[0]!.id],
      );

      return { id: userId, username: params.username, email: params.email };
    }

    afterEach(async () => {
      if (createdUsernames.length > 0) {
        const toDelete = [...createdUsernames];
        createdUsernames.length = 0;
        await pool.query('DELETE FROM users WHERE username = ANY($1);', [toDelete]);
      }
    });

    it('rejects password reset for non-existent user', async () => {
      const nonExistent = `non_existent_admin_${Date.now()}`;
      await expect(
        resetAdminPassword({
          username: nonExistent,
          newPassword: 'ValidPassword123!',
          confirmPassword: 'ValidPassword123!',
          silent: true,
        }),
      ).rejects.toThrow(/not found/);
    });

    it('rejects password reset for account lacking the ADMIN role', async () => {
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const operatorUser = await createTestUserFixture({
        username: `test_op_${suffix}`,
        email: `test_op_${suffix}@qualityops.test`,
        password: 'OperatorPassword123!',
        fullName: 'Test Operator User',
        roleName: 'OPERATOR',
      });

      await expect(
        resetAdminPassword({
          username: operatorUser.username,
          newPassword: 'NewValidPassword123!',
          confirmPassword: 'NewValidPassword123!',
          silent: true,
        }),
      ).rejects.toThrow(/does not have the ADMIN role/);
    });

    it('successfully resets existing admin password without modifying other account data or unrelated accounts', async () => {
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const adminUsername = `test_admin_${suffix}`;
      const adminEmail = `test_admin_${suffix}@qualityops.test`;
      const initialAdminPassword = 'InitialAdminPassword123!';

      const unrelatedUsername = `test_unrelated_${suffix}`;
      const unrelatedEmail = `test_unrelated_${suffix}@qualityops.test`;
      const unrelatedPassword = 'UnrelatedUserPassword123!';

      // 1. Create target administrator fixture
      await createTestUserFixture({
        username: adminUsername,
        email: adminEmail,
        password: initialAdminPassword,
        fullName: 'Fixture Test Administrator',
        roleName: 'ADMIN',
      });

      // 2. Create unrelated user fixture to verify data isolation and non-tampering
      await createTestUserFixture({
        username: unrelatedUsername,
        email: unrelatedEmail,
        password: unrelatedPassword,
        fullName: 'Unrelated Active Operator',
        roleName: 'OPERATOR',
      });

      // Fetch initial state of unrelated user
      const initialUnrelatedRes = await pool.query<{
        password_hash: string;
        email: string;
        full_name: string;
        is_active: boolean;
      }>('SELECT password_hash, email, full_name, is_active FROM users WHERE username = $1;', [
        unrelatedUsername,
      ]);
      const initialUnrelatedUser = initialUnrelatedRes.rows[0]!;

      // 3. Perform password reset on target administrator
      const newAdminPassword = 'BrandNewAdminPassword456!';
      const result = await resetAdminPassword({
        username: adminUsername,
        newPassword: newAdminPassword,
        confirmPassword: newAdminPassword,
        silent: true,
      });

      expect(result.success).toBe(true);
      expect(result.user.username).toBe(adminUsername);
      expect(result.user.email).toBe(adminEmail);

      // 4. Verify target admin updated in DB
      const adminRes = await pool.query<{
        password_hash: string;
        email: string;
        full_name: string;
        is_active: boolean;
      }>('SELECT password_hash, email, full_name, is_active FROM users WHERE username = $1;', [
        adminUsername,
      ]);
      expect(adminRes.rows.length).toBe(1);
      const updatedAdmin = adminRes.rows[0]!;

      // New password verifies successfully
      const isNewValid = await PasswordService.verifyPassword(
        updatedAdmin.password_hash,
        newAdminPassword,
      );
      expect(isNewValid).toBe(true);

      // Old password no longer verifies
      const isOldValid = await PasswordService.verifyPassword(
        updatedAdmin.password_hash,
        initialAdminPassword,
      );
      expect(isOldValid).toBe(false);

      // Admin metadata remains untouched
      expect(updatedAdmin.email).toBe(adminEmail);
      expect(updatedAdmin.full_name).toBe('Fixture Test Administrator');
      expect(updatedAdmin.is_active).toBe(true);

      // 5. Explicitly verify unrelated account data remains completely untouched
      const currentUnrelatedRes = await pool.query<{
        password_hash: string;
        email: string;
        full_name: string;
        is_active: boolean;
      }>('SELECT password_hash, email, full_name, is_active FROM users WHERE username = $1;', [
        unrelatedUsername,
      ]);
      expect(currentUnrelatedRes.rows.length).toBe(1);
      const currentUnrelatedUser = currentUnrelatedRes.rows[0]!;

      // Unrelated hash matches initial hash exactly
      expect(currentUnrelatedUser.password_hash).toBe(initialUnrelatedUser.password_hash);

      // Unrelated user still verifies with their own password
      const isUnrelatedValid = await PasswordService.verifyPassword(
        currentUnrelatedUser.password_hash,
        unrelatedPassword,
      );
      expect(isUnrelatedValid).toBe(true);

      // Unrelated user does NOT verify with the admin's new password
      const isUnrelatedAdminPass = await PasswordService.verifyPassword(
        currentUnrelatedUser.password_hash,
        newAdminPassword,
      );
      expect(isUnrelatedAdminPass).toBe(false);

      // Unrelated metadata remains identical
      expect(currentUnrelatedUser.email).toBe(initialUnrelatedUser.email);
      expect(currentUnrelatedUser.full_name).toBe(initialUnrelatedUser.full_name);
      expect(currentUnrelatedUser.is_active).toBe(initialUnrelatedUser.is_active);
    });

    it('successfully resets existing admin password when targeted by email address', async () => {
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const adminUsername = `test_admin_by_email_${suffix}`;
      const adminEmail = `test_admin_email_${suffix}@qualityops.test`;
      const initialPassword = 'InitialEmailAdminPass123!';
      const newPassword = 'ResetByEmailPassword789!';

      await createTestUserFixture({
        username: adminUsername,
        email: adminEmail,
        password: initialPassword,
        fullName: 'Email Target Administrator',
        roleName: 'ADMIN',
      });

      const result = await resetAdminPassword({
        username: adminEmail,
        newPassword: newPassword,
        confirmPassword: newPassword,
        silent: true,
      });

      expect(result.success).toBe(true);
      expect(result.user.username).toBe(adminUsername);
      expect(result.user.email).toBe(adminEmail);

      const adminRes = await pool.query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = $1;',
        [result.user.id],
      );
      expect(adminRes.rows.length).toBe(1);

      const isValid = await PasswordService.verifyPassword(
        adminRes.rows[0]!.password_hash,
        newPassword,
      );
      expect(isValid).toBe(true);
    });
  });
});
