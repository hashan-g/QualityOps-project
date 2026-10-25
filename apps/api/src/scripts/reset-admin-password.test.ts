import { describe, expect, it } from 'vitest';
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
    it('rejects password reset for non-existent user', async () => {
      await expect(
        resetAdminPassword({
          username: 'non_existent_admin_user_99999',
          newPassword: 'ValidPassword123!',
          confirmPassword: 'ValidPassword123!',
          silent: true,
        }),
      ).rejects.toThrow(/not found/);
    });

    it('successfully resets existing admin password without modifying other account data', async () => {
      const testPassword = 'NewAdminPassword456!';

      const result = await resetAdminPassword({
        username: 'admin',
        newPassword: testPassword,
        confirmPassword: testPassword,
        silent: true,
      });

      expect(result.success).toBe(true);
      expect(result.user.username).toBe('admin');
      expect(result.user.email).toBe('admin@qualityops.local');

      // Verify the new password in DB with PasswordService
      const userRes = await pool.query<{
        password_hash: string;
        email: string;
        full_name: string;
        is_active: boolean;
      }>('SELECT password_hash, email, full_name, is_active FROM users WHERE username = $1;', [
        'admin',
      ]);

      expect(userRes.rows.length).toBe(1);
      const user = userRes.rows[0]!;

      // Password hash verifies with new password
      const isValid = await PasswordService.verifyPassword(user.password_hash, testPassword);
      expect(isValid).toBe(true);

      // Verify old password does NOT work
      const isOldValid = await PasswordService.verifyPassword(
        user.password_hash,
        'WrongOldPassword123',
      );
      expect(isOldValid).toBe(false);

      // Verify other fields remain intact
      expect(user.email).toBe('admin@qualityops.local');
      expect(user.full_name).toBe('System Administrator');
      expect(user.is_active).toBe(true);
    });
  });
});
