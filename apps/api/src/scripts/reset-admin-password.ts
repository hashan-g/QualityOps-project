import readline from 'node:readline/promises';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import { config, loadedEnvFiles, sanitizeDatabaseUrl } from '../config.js';
import { pool } from '../infrastructure/database/pool.js';
import { PasswordService } from '../infrastructure/security/password.service.js';
import { isDirectExecution } from './bootstrap-admin.js';

export interface ResetPasswordOptions {
  username?: string;
  newPassword?: string;
  confirmPassword?: string;
  silent?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Prompts for password input on stdin, masking characters with '*' when on an interactive TTY.
 * Falls back to readline.question in non-TTY environments.
 */
export async function promptPassword(
  promptText: string,
  input: NodeJS.ReadableStream = defaultInput,
  output: NodeJS.WritableStream = defaultOutput,
): Promise<string> {
  const readStream = input as NodeJS.ReadStream;
  const isTTY = Boolean(readStream.isTTY && typeof readStream.setRawMode === 'function');

  if (!isTTY) {
    const rl = readline.createInterface({ input, output });
    try {
      const res = await rl.question(promptText);
      return res.trim();
    } finally {
      rl.close();
    }
  }

  return new Promise<string>((resolve) => {
    output.write(promptText);
    const wasRaw = readStream.isRaw;
    readStream.setRawMode(true);
    readStream.resume();
    readStream.setEncoding('utf8');

    let password = '';
    const onData = (data: Buffer | string) => {
      const chars = data.toString();
      for (const char of chars) {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          readStream.setRawMode(wasRaw);
          readStream.pause();
          readStream.removeListener('data', onData);
          output.write('\n');
          resolve(password);
          return;
        } else if (char === '\u0003') {
          // Ctrl+C
          readStream.setRawMode(wasRaw);
          readStream.pause();
          readStream.removeListener('data', onData);
          output.write('\n');
          process.exit(130);
        } else if (char === '\u0008' || char === '\x7f') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            output.write('\b \b');
          }
        } else {
          password += char;
          output.write('*');
        }
      }
    };

    readStream.on('data', onData);
  });
}

/**
 * Safely resets the password of an existing administrator account.
 *
 * Supported environment variables (for non-interactive execution):
 *   ADMIN_USERNAME        Target administrator username or email (default: admin)
 *   NEW_ADMIN_PASSWORD    New password (minimum 8 characters)
 *   CONFIRM_ADMIN_PASSWORD Optional password confirmation
 *
 * Enforces:
 *   1. Explicit user selection (must be an existing account with the ADMIN role).
 *   2. Minimum 8 characters length and confirmation match.
 *   3. Argon2id password hashing (plaintext passwords are never stored or logged).
 *   4. Parameterized SQL inside a PostgreSQL transaction.
 *   5. Revocation of existing refresh sessions to force re-authentication.
 */
export async function resetAdminPassword(options?: ResetPasswordOptions): Promise<{
  success: boolean;
  user: { id: string; username: string; email: string };
}> {
  const inStream = options?.input ?? defaultInput;
  const outStream = options?.output ?? defaultOutput;
  const isInteractive = Boolean((inStream as NodeJS.ReadStream).isTTY);

  let rl: readline.Interface | null = null;

  const log = (msg: string) => {
    if (!options?.silent) {
      console.log(msg);
    }
  };

  log('[QualityOps Password Reset] Initializing administrator password reset CLI...');
  if (loadedEnvFiles.length > 0) {
    log(`[QualityOps Password Reset] Configuration loaded from: ${loadedEnvFiles.join(', ')}`);
  } else {
    log('[QualityOps Password Reset] Configuration loaded from process environment');
  }
  log(`[QualityOps Password Reset] Database target: ${sanitizeDatabaseUrl(config.DATABASE_URL)}`);

  try {
    // 1. Resolve Target Username / Email
    let username = options?.username || process.env.ADMIN_USERNAME;
    if (!username && isInteractive) {
      rl = rl ?? readline.createInterface({ input: inStream, output: outStream });
      const answer = await rl.question('Enter administrator username or email to reset [admin]: ');
      username = answer.trim() || 'admin';
    } else if (!username) {
      username = 'admin';
    }

    // 2. Resolve New Password
    let newPassword =
      options?.newPassword || process.env.NEW_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    let confirmPassword = options?.confirmPassword || process.env.CONFIRM_ADMIN_PASSWORD;

    if (!newPassword) {
      if (!isInteractive) {
        throw new Error(
          'NEW_ADMIN_PASSWORD (or ADMIN_PASSWORD) is required in non-interactive environments.\n\n' +
            'Supported environment variables:\n' +
            '  ADMIN_USERNAME          Target admin username or email (default: admin)\n' +
            '  NEW_ADMIN_PASSWORD      New password (minimum 8 characters)\n' +
            '  CONFIRM_ADMIN_PASSWORD  Confirmation password (optional in env if matching)',
        );
      }

      newPassword = await promptPassword(
        'Enter new administrator password (min 8 characters): ',
        inStream,
        outStream,
      );
      confirmPassword = await promptPassword(
        'Confirm new administrator password: ',
        inStream,
        outStream,
      );
    }

    if (!newPassword || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long.');
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      throw new Error('New password and confirmation password do not match.');
    }

    // 3. Connect to Database
    let client;
    try {
      client = await pool.connect();
    } catch (connErr) {
      throw new Error(
        `Failed to connect to PostgreSQL database at ${sanitizeDatabaseUrl(config.DATABASE_URL)}: ${
          connErr instanceof Error ? connErr.message : String(connErr)
        }`,
      );
    }

    try {
      await client.query('BEGIN;');

      // 4. Verify existing admin account
      const userRes = await client.query<{
        id: string;
        username: string;
        email: string;
        full_name: string;
        is_active: boolean;
        role: string | null;
      }>(
        `SELECT u.id, u.username, u.email, u.full_name, u.is_active, r.name as role
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         WHERE (u.username = $1 OR u.email = $1);`,
        [username],
      );

      if (userRes.rows.length === 0) {
        throw new Error(
          `Administrator account "${username}" was not found. No user exists with that username or email.`,
        );
      }

      const adminUserRow = userRes.rows.find((r) => r.role === 'ADMIN');
      if (!adminUserRow) {
        throw new Error(
          `User "${username}" exists but does not have the ADMIN role. Password reset via this CLI is strictly restricted to administrator accounts.`,
        );
      }

      const userId = adminUserRow.id;

      // 5. Hash new password with Argon2id
      const passwordHash = await PasswordService.hashPassword(newPassword);

      // 6. Update password_hash exclusively (preserving all other user data and roles)
      await client.query(
        `UPDATE users
         SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2;`,
        [passwordHash, userId],
      );

      // 7. Revoke active refresh sessions to enforce re-authentication
      await client.query(
        `UPDATE refresh_sessions
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND revoked_at IS NULL;`,
        [userId],
      );

      await client.query('COMMIT;');

      log('');
      log('============================================================');
      log('QualityOps Administrator Password Reset Successfully');
      log('============================================================');
      log(`Username:  ${adminUserRow.username}`);
      log(`Email:     ${adminUserRow.email}`);
      log(`Full Name: ${adminUserRow.full_name}`);
      log(`Role:      ADMIN`);
      log(`Status:    ${adminUserRow.is_active ? 'Active' : 'Inactive'}`);
      log(`Updated:   ${new Date().toISOString()}`);
      log('============================================================');
      log('Existing user records and permissions were preserved.');
      log('Active refresh sessions were revoked to enforce re-login.');

      return {
        success: true,
        user: {
          id: userId,
          username: adminUserRow.username,
          email: adminUserRow.email,
        },
      };
    } catch (dbErr) {
      await client.query('ROLLBACK;');
      throw dbErr;
    } finally {
      client.release();
    }
  } finally {
    if (rl) {
      rl.close();
    }
  }
}

// Execute directly if run as a CLI entrypoint
if (isDirectExecution(import.meta.url, process.argv[1])) {
  resetAdminPassword()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err: unknown) => {
      console.error(
        '\n[QualityOps Password Reset Error]',
        err instanceof Error ? err.message : String(err),
      );
      try {
        await pool.end();
      } catch {
        // Ignore pool shutdown error on exit
      }
      process.exit(1);
    });
}
