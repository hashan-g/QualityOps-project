# QualityOps — Database Migrations Guide

**Target Engine:** PostgreSQL 18.x  
**Migration Tool:** `node-pg-migrate`  
**Location:** `database/migrations/`

---

## 1. Overview

QualityOps tracks all relational database schema modifications as version-controlled, reversible migration files.

- **No manual ad hoc database modifications** are permitted.
- All schema changes must be committed as migration scripts alongside code changes.
- Migrations are executed within a single transaction where applicable (`--single-transaction true`), ensuring atomicity.

---

## 2. Directory Structure

```
database/
├── migrations/
│   ├── 001_initial_schema.sql      # Initial DDL: tables, constraints, indexes
│   └── ...                         # Future incremental migrations
├── seeds/                          # Repeatable synthetic demo/test data
└── README.md
```

Each SQL migration file contains two clearly delimited sections:

- `-- Up Migration`: Executed when applying forward migrations (`up`).
- `-- Down Migration`: Executed when rolling back the migration (`down`).

---

## 3. Migration Commands

Root npm scripts delegate to `node-pg-migrate`:

| Command                            | Action                   | Description                                                                       |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `npm run db:migrate`               | Apply pending migrations | Runs all pending forward migrations in ordered sequence.                          |
| `npm run db:migrate:status`        | Check migration status   | Dry-run check showing which migrations are pending without applying them.         |
| `npm run db:migrate:down`          | Rollback last migration  | Reverts the most recently applied migration file.                                 |
| `npm run db:migrate:redo`          | Redo last migration      | Rolls back the latest migration and re-applies it (useful for local dev testing). |
| `npm run db:migrate:create <name>` | Create new migration     | Generates a new ordered migration file in `database/migrations/`.                 |

---

## 4. Environment Configuration

`node-pg-migrate` resolves the target database using the `DATABASE_URL` environment variable:

```dotenv
DATABASE_URL=postgresql://qualityops_dev:your_password@127.0.0.1:5432/qualityops
```

- When running locally, ensure `.env` contains the proper credentials.
- When running in automated CI pipelines (GitHub Actions), `DATABASE_URL` is injected via runner environment variables targeting the PostgreSQL service container.

---

## 5. Rollback & Safety Policy

1. **Destructive Changes:**
   - Any migration that drops columns or tables must be reviewed to ensure data backups and migration sequencing are addressed.
2. **Deterministic Sequencing:**
   - Migration file names start with an ordered number or timestamp (`001_initial_schema.sql`). `node-pg-migrate` validates ordering via `--check-order true`.
3. **Audit Table (`pgmigrations`):**
   - Applied migrations are recorded in the `pgmigrations` table in the database schema with execution timestamp.
4. **CI Quality Gate:**
   - In CI, migrations are executed against a fresh PostgreSQL 18 container before automated tests run.
