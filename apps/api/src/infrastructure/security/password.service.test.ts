import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService (Argon2id)', () => {
  it('hashes a plaintext password into a valid Argon2id string', async () => {
    const password = 'SuperSecretPassword123!';
    const hash = await PasswordService.hashPassword(password);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    // Plaintext password is never in the hash string
    expect(hash).not.toContain(password);
  });

  it('correctly verifies a matching password', async () => {
    const password = 'CorrectPassword456$';
    const hash = await PasswordService.hashPassword(password);

    const isValid = await PasswordService.verifyPassword(hash, password);
    expect(isValid).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const password = 'RealPassword789*';
    const hash = await PasswordService.hashPassword(password);

    const isValid = await PasswordService.verifyPassword(hash, 'WrongPassword999');
    expect(isValid).toBe(false);
  });

  it('returns false safely on a malformed hash', async () => {
    const isValid = await PasswordService.verifyPassword('not-a-valid-argon2-hash', 'password');
    expect(isValid).toBe(false);
  });

  it('executes dummy verify without throwing to mitigate timing attacks', async () => {
    await expect(PasswordService.dummyVerify()).resolves.toBeUndefined();
  });
});
