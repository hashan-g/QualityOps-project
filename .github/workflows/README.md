# CI Workflows

The automated quality gate is defined in `ci.yml`.

It triggers on pushes and pull requests to `main` and verifies:

1. Clean dependency installation from lockfile via `npm ci` on Node.js 24 LTS
2. Code formatting verification via `npm run format:check`
3. ESLint checks across workspaces via `npm run lint`
4. Strict TypeScript type-checking via `npm run typecheck`
5. Test suite execution via `npm test`
6. Production builds across all workspaces via `npm run build`
