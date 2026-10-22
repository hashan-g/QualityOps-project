# Database folder

Phase 1 creates database infrastructure only. Do not create manufacturing business tables until Phase 2.

- `migrations/`: ordered SQL schema changes; every schema change must be committed.
- `seeds/`: reproducible, synthetic development data. Label synthetic data explicitly.
- Do not commit database dumps or real company/customer data.
- Prefer constraints and normalized relationships for core operational records; add indexes based on query patterns and explain plans rather than guessing.
