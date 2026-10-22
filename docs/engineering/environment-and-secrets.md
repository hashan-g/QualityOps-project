# Local Environment and Secrets Policy

## Baseline

- Use Node.js 24 LTS and the npm version bundled with that installed runtime, subject to compatibility checks at scaffold time.
- Use a currently supported PostgreSQL 18.x patch release.
- Use Docker Desktop with Docker Compose for the local database, or a native PostgreSQL installation if Docker is unavailable.
- Keep the exact dependency graph in the committed `package-lock.json`.

## Initial setup

1. Install the required Node.js LTS and Docker Desktop.
2. Copy `.env.example` to `.env`.
3. Change the sample local-only database password before starting the database.
4. Start PostgreSQL with `docker compose up -d postgres`.
5. Install Node dependencies with `npm ci` after the lockfile has been created and committed; use `npm install` only while establishing/changing dependencies.
6. Start the web app and API using documented root scripts.
7. Confirm the API health endpoint is available and the database container reports healthy.

## Secrets rules

- `.env` must be ignored by Git.
- `.env.example` documents only variable names and safe local placeholders.
- Never commit real API keys, production passwords, signing keys, tokens, private certificates, database dumps containing real data, or `.env` files.
- No default development credentials may be reused in production.
- Production secrets belong in the hosting provider's secret manager/environment settings.
- Validate required environment variables at application startup and fail clearly if missing.

## Suggested environment variables

The scaffold may define only variables it actually consumes. Candidate names:

```dotenv
NODE_ENV=development
API_PORT=4000
WEB_PORT=5173
DATABASE_URL=postgresql://qualityops_dev:REPLACE_WITH_LOCAL_PASSWORD@localhost:5432/qualityops
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=info
```

Do not add token secrets until the authentication phase specifies the token/session design.
