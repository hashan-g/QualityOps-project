import argon2 from 'argon2';

/**
 * Service for secure password hashing and verification using Argon2id.
 *
 * Argon2id is the memory-hard password hashing function recommended by OWASP
 * for resisting GPU and ASIC brute-force attacks.
 */
export class PasswordService {
  /**
   * Hashes a plaintext password using Argon2id with OWASP-recommended parameters.
   */
  public static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3, // 3 iterations
      parallelism: 4, // 4 parallel threads
    });
  }

  /**
   * Verifies a plaintext password against an Argon2 hash.
   */
  public static async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Dummy verification against a constant pre-computed hash to mitigate
   * timing-attack enumeration when a requested username does not exist.
   */
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzdHJpbmc$5jE4BfG6jQc2f9Qz2G1CygJ7gA6k5F4l3k2j1h0g9f8';

  public static async dummyVerify(): Promise<void> {
    try {
      await argon2.verify(PasswordService.DUMMY_HASH, 'dummy-password');
    } catch {
      // Intentionally ignored
    }
  }
}
