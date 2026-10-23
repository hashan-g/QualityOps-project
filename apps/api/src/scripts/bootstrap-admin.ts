import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { pool } from '../infrastructure/database/pool.js';
import { PasswordService } from '../infrastructure/security/password.service.js';

/**
 * CLI script to safely bootstrap the initial administrator account.
 *
 * Credentials can be supplied via environment variables:
 *   ADMIN_USERNAME (default: admin)
 *   ADMIN_EMAIL (default: admin@qualityops.local)
 *   ADMIN_FULL_NAME (default: System Administrator)
 *   ADMIN_PASSWORD
 *
 * If ADMIN_PASSWORD is not provided, the script prompts for it interactively.
 * NEVER hardcodes a default password or logs plaintext passwords or hashes.
 */
export async function bootstrapAdmin(): Promise<void> {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const email = process.env.ADMIN_EMAIL || 'admin@qualityops.local';
  const fullName = process.env.ADMIN_FULL_NAME || 'System Administrator';
  let password = process.env.ADMIN_PASSWORD;

  if (!password) {
    if (!process.stdin.isTTY) {
      console.error(
        '[Bootstrap Error] ADMIN_PASSWORD environment variable is required in non-interactive environments.',
      );
      process.exit(1);
    }

    const rl = readline.createInterface({ input, output });
    try {
      password = await rl.question('Enter administrator password (min 8 characters): ');
    } finally {
      rl.close();
    }
  }

  if (!password || password.length < 8) {
    console.error('[Bootstrap Error] Password must be at least 8 characters long.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN;');

    // 1. Ensure ADMIN role exists
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

    // 2. Check if user already exists
    const userRes = await client.query<{ id: string; username: string }>(
      'SELECT id, username FROM users WHERE username = $1 OR email = $2;',
      [username, email],
    );

    let userId: string;
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0]!.id;
      console.log(`[Bootstrap] User "${username}" already exists. Ensuring ADMIN role assignment.`);
    } else {
      const passwordHash = await PasswordService.hashPassword(password);
      const newUserRes = await client.query<{ id: string }>(
        `INSERT INTO users (username, email, password_hash, full_name, is_active)
         VALUES ($1, $2, $3, $4, true)
         RETURNING id;`,
        [username, email, passwordHash, fullName],
      );
      userId = newUserRes.rows[0]!.id;
      console.log(`[Bootstrap] Created administrator user "${username}".`);
    }

    // 3. Idempotently assign ADMIN role
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING;`,
      [userId, adminRoleId],
    );

    await client.query('COMMIT;');
    console.log(`[Bootstrap] Successfully verified administrator "${username}" with ADMIN role.`);
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error(
      '[Bootstrap Error] Failed to bootstrap administrator:',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Execute directly if run as a CLI entrypoint
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  bootstrapAdmin().catch(() => process.exit(1));
}
