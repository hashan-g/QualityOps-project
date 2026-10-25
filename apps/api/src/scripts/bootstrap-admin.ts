import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { config, loadedEnvFiles, sanitizeDatabaseUrl } from '../config.js';
import { pool } from '../infrastructure/database/pool.js';
import { PasswordService } from '../infrastructure/security/password.service.js';

export interface BootstrapOptions {
  username?: string;
  email?: string;
  fullName?: string;
  password?: string;
  silent?: boolean;
}

/**
 * Normalizes a file path or file URL pathname for deterministic cross-platform comparison.
 * - Converts backslashes to forward slashes.
 * - Strips leading slash before Windows drive letters (e.g. `/C:/` -> `C:/`).
 * - Normalizes Windows drive letters to lowercase (e.g. `C:/` -> `c:/`).
 * - On Windows (`platform === 'win32'`), normalizes the entire path to lowercase.
 * - On POSIX systems, preserves path casing for non-Windows paths so case-sensitivity is maintained.
 */
export function normalizePathForComparison(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  // 1. Convert backslashes to forward slashes
  let normalized = filePath.replace(/\\/g, '/');

  // 2. Strip leading slash before a Windows drive letter (e.g. "/h:/" or "/C:/" -> "h:/" or "C:/")
  if (/^\/[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.slice(1);
  }

  // 3. Normalize relative prefixes like "./"
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // 4. Detect if this path has a Windows drive letter (e.g. "c:/" or "H:/")
  const isWindowsDrivePath = /^[a-zA-Z]:\//.test(normalized);

  if (isWindowsDrivePath) {
    // Windows drive letters are always case-insensitive.
    // Normalize drive letter to lowercase (e.g. "H:/" -> "h:/")
    normalized = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }

  // 5. On Windows host OS, the file system is case-insensitive, so lowercase the entire path.
  // On POSIX systems (Linux/macOS), preserve path casing for non-Windows paths.
  if (platform === 'win32') {
    return normalized.toLowerCase();
  }

  return normalized;
}

/**
 * Extracts a file path string from either a file:// URL or a standard filesystem path.
 */
export function extractFilePath(urlOrPath: string): string {
  if (urlOrPath.startsWith('file://')) {
    try {
      const parsed = new URL(urlOrPath);
      return decodeURIComponent(parsed.pathname);
    } catch {
      try {
        return fileURLToPath(urlOrPath);
      } catch {
        return urlOrPath;
      }
    }
  }
  return urlOrPath;
}

/**
 * Robust cross-platform check to determine if the script is the direct CLI entrypoint.
 * Resolves both URLs and file paths accurately on Windows and POSIX systems.
 */
export function isDirectExecution(
  metaUrl: string,
  argvPath?: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (!argvPath) return false;
  try {
    const rawCurrent = extractFilePath(metaUrl);
    const normalizedCurrent = normalizePathForComparison(rawCurrent, platform);
    const normalizedArgv = normalizePathForComparison(argvPath, platform);

    if (normalizedCurrent === normalizedArgv) {
      return true;
    }

    // Match when argvPath is a workspace or relative path (e.g. apps/api/src/scripts/bootstrap-admin.ts)
    if (normalizedCurrent.endsWith('/' + normalizedArgv) || normalizedCurrent === normalizedArgv) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,50}$/;

/**
 * CLI script to safely bootstrap or verify the initial administrator account.
 *
 * Supported environment variables:
 *   ADMIN_USERNAME   (default: admin)
 *   ADMIN_EMAIL      (default: admin@qualityops.local)
 *   ADMIN_FULL_NAME  (default: System Administrator)
 *   ADMIN_PASSWORD   (required in non-interactive mode, min 8 characters)
 *
 * If run interactively and variables are omitted, prompts the operator via stdin.
 * NEVER prints passwords, tokens, or password hashes.
 */
export async function bootstrapAdmin(options?: BootstrapOptions): Promise<{
  success: boolean;
  action: 'created' | 'verified_existing' | 'role_assigned';
  user: { id: string; username: string; email: string };
}> {
  const isInteractive = Boolean(process.stdin.isTTY);
  let rl: readline.Interface | null = null;

  const log = (msg: string) => {
    if (!options?.silent) {
      console.log(msg);
    }
  };

  log('[QualityOps Bootstrap] Initializing administrator bootstrap CLI...');
  if (loadedEnvFiles.length > 0) {
    log(`[QualityOps Bootstrap] Configuration loaded from: ${loadedEnvFiles.join(', ')}`);
  } else {
    log('[QualityOps Bootstrap] Configuration loaded from process environment');
  }
  log(`[QualityOps Bootstrap] Database target: ${sanitizeDatabaseUrl(config.DATABASE_URL)}`);

  try {
    // 1. Resolve Admin Username
    let username = options?.username || process.env.ADMIN_USERNAME;
    if (!username && isInteractive) {
      rl = rl ?? readline.createInterface({ input, output });
      const answer = await rl.question('Enter administrator username [admin]: ');
      username = answer.trim() || 'admin';
    } else if (!username) {
      username = 'admin';
    }

    if (!USERNAME_REGEX.test(username)) {
      throw new Error(
        `Invalid username "${username}". Must be 3-50 alphanumeric characters (hyphens and underscores allowed).`,
      );
    }

    // 2. Resolve Admin Email
    let email = options?.email || process.env.ADMIN_EMAIL;
    if (!email && isInteractive) {
      rl = rl ?? readline.createInterface({ input, output });
      const answer = await rl.question('Enter administrator email [admin@qualityops.local]: ');
      email = answer.trim() || 'admin@qualityops.local';
    } else if (!email) {
      email = 'admin@qualityops.local';
    }

    if (!EMAIL_REGEX.test(email)) {
      throw new Error(`Invalid email address format "${email}".`);
    }

    // 3. Resolve Admin Full Name
    let fullName = options?.fullName || process.env.ADMIN_FULL_NAME;
    if (!fullName && isInteractive) {
      rl = rl ?? readline.createInterface({ input, output });
      const answer = await rl.question('Enter administrator full name [System Administrator]: ');
      fullName = answer.trim() || 'System Administrator';
    } else if (!fullName) {
      fullName = 'System Administrator';
    }

    // 4. Resolve Admin Password
    let password = options?.password || process.env.ADMIN_PASSWORD;
    if (!password) {
      if (!isInteractive) {
        throw new Error(
          'ADMIN_PASSWORD is required in non-interactive environments.\n\n' +
            'Supported environment variables:\n' +
            '  ADMIN_USERNAME   Administrator username (default: admin)\n' +
            '  ADMIN_EMAIL      Administrator email (default: admin@qualityops.local)\n' +
            '  ADMIN_FULL_NAME  Administrator display name (default: System Administrator)\n' +
            '  ADMIN_PASSWORD   Administrator password (required, minimum 8 characters)',
        );
      }

      rl = rl ?? readline.createInterface({ input, output });
      password = await rl.question('Enter administrator password (min 8 characters): ');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long.');
    }

    // Connect to database
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

      // Ensure ADMIN role exists
      const roleRes = await client.query<{ id: string }>(
        "SELECT id FROM roles WHERE name = 'ADMIN';",
      );
      let adminRoleId = roleRes.rows[0]?.id;

      if (!adminRoleId) {
        const newRoleRes = await client.query<{ id: string }>(
          "INSERT INTO roles (name, description) VALUES ('ADMIN', 'Full system and user administration permissions') RETURNING id;",
        );
        adminRoleId = newRoleRes.rows[0]?.id;
      }

      if (!adminRoleId) {
        throw new Error('Failed to resolve or create the canonical ADMIN role.');
      }

      // Check if user already exists by username or email
      const userRes = await client.query<{
        id: string;
        username: string;
        email: string;
        is_active: boolean;
      }>('SELECT id, username, email, is_active FROM users WHERE username = $1 OR email = $2;', [
        username,
        email,
      ]);

      let userId: string;
      let action: 'created' | 'verified_existing' | 'role_assigned';

      if (userRes.rows.length > 0) {
        const existing = userRes.rows[0]!;

        // Check for cross-field conflicts
        if (existing.username === username && existing.email !== email) {
          throw new Error(
            `A user with username "${username}" already exists with a different email (${existing.email}). Specify the matching email or choose a different username.`,
          );
        }
        if (existing.username !== username && existing.email === email) {
          throw new Error(
            `A user with email "${email}" already exists with a different username (${existing.username}). Specify the matching username or choose a different email.`,
          );
        }

        userId = existing.id;

        // Check if user already has ADMIN role
        const userRoleCheck = await client.query<{ user_id: string }>(
          'SELECT user_id FROM user_roles WHERE user_id = $1 AND role_id = $2;',
          [userId, adminRoleId],
        );

        if (userRoleCheck.rows.length > 0) {
          action = 'verified_existing';
          log('');
          log('============================================================');
          log('QualityOps Administrator Account Already Exists');
          log('============================================================');
          log(`Username:  ${username}`);
          log(`Email:     ${email}`);
          log(`Role:      ADMIN (verified)`);
          log(`Status:    ${existing.is_active ? 'Active' : 'Inactive'}`);
          log('============================================================');
          log('Existing password and database records were preserved without changes.');
        } else {
          // Assign ADMIN role to existing user
          await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, role_id) DO NOTHING;`,
            [userId, adminRoleId],
          );
          if (!existing.is_active) {
            await client.query('UPDATE users SET is_active = true WHERE id = $1;', [userId]);
          }
          action = 'role_assigned';
          log('');
          log('============================================================');
          log('QualityOps Administrator Role Assigned to Existing User');
          log('============================================================');
          log(`Username:  ${username}`);
          log(`Email:     ${email}`);
          log(`Role:      ADMIN (newly assigned)`);
          log('============================================================');
        }
      } else {
        // Create new admin user
        const passwordHash = await PasswordService.hashPassword(password);
        const newUserRes = await client.query<{ id: string }>(
          `INSERT INTO users (username, email, password_hash, full_name, is_active)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id;`,
          [username, email, passwordHash, fullName],
        );
        userId = newUserRes.rows[0]!.id;

        // Assign ADMIN role
        await client.query(
          `INSERT INTO user_roles (user_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT (user_id, role_id) DO NOTHING;`,
          [userId, adminRoleId],
        );

        action = 'created';
        log('');
        log('============================================================');
        log('QualityOps Administrator Account Initialized Successfully');
        log('============================================================');
        log(`Username:  ${username}`);
        log(`Email:     ${email}`);
        log(`Full Name: ${fullName}`);
        log(`Role:      ADMIN`);
        log(`Status:    Active`);
        log('============================================================');
      }

      await client.query('COMMIT;');
      return {
        success: true,
        action,
        user: { id: userId, username, email },
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
  bootstrapAdmin()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err: unknown) => {
      console.error(
        '\n[QualityOps Bootstrap Error]',
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
