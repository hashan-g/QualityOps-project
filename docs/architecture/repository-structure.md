# Repository Structure and Ownership

```text
qualityops/
├── apps/
│   ├── web/                       # React + TypeScript + Vite
│   └── api/                       # Node + Express + TypeScript
├── packages/
│   └── contracts/                 # Shared Zod schemas and API types only
├── database/
│   ├── migrations/                # Versioned SQL migration files
│   ├── seeds/                     # Reproducible development/demo seeds
│   └── README.md
├── docs/
│   ├── architecture/
│   ├── engineering/
│   ├── requirements/
│   ├── phase-1/
│   └── product/
├── infra/
│   └── docker/                    # Supporting container configs if needed
├── scripts/                       # Small repository automation helpers
├── .github/
│   └── workflows/                 # CI workflows
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .env.example
├── compose.yaml                   # Local PostgreSQL only in Phase 1
├── package.json                   # npm workspaces + root quality scripts
├── package-lock.json
└── README.md
```

## Folder ownership rules

- `apps/web`: presentation, routes, forms, charts, typed API client. No direct DB access.
- `apps/api`: authoritative business logic and database access.
- `packages/contracts`: shared Zod schemas/types; no business-service implementations.
- `database/migrations`: ordered, reviewable schema changes.
- `database/seeds`: repeatable demo data only; label all synthetic data.
- `docs`: product and engineering decisions; update when decisions change.
- `infra`: local/deployment configuration, never secrets.
- `.env.example`: names and safe placeholders, never real passwords, tokens or credentials.

## API module structure when domain features begin

```text
apps/api/src/
├── app.ts
├── server.ts
├── config/
├── middleware/
├── common/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── master-data/
│   ├── production/
│   ├── inspections/
│   ├── defects/
│   ├── capa/
│   └── analytics/
└── infrastructure/
    └── database/
```

Do not create empty files for every future module in Phase 1. Add a module when its phase starts, with a small, consistent structure.

## Web app structure when features begin

```text
apps/web/src/
├── app/              # app shell, router, providers
├── components/       # reusable UI components
├── features/         # module-specific screens/components
├── lib/              # API client, utilities
├── hooks/
└── styles/
```

## File naming conventions

- React components: `PascalCase.tsx`.
- Non-component TypeScript modules: `kebab-case.ts` or a consistent feature-local convention.
- SQL migrations: ordered names such as `001_create_initial_reference_tables.sql`.
- Environment variables: `UPPER_SNAKE_CASE`.
- API endpoints: plural resource names, lowercase and hyphenated only where needed.
