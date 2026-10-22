# QualityOps Engineering Workflow

## 1. Development method

Use **short, iterative, test-driven where practical increments** inspired by Agile/Scrum, with a lightweight Kanban board for a solo developer. This is not a claim that the project needs a formal Scrum team. Plan one small demonstrable increment at a time.

Every feature follows:

1. Read the relevant Phase 0 requirement and acceptance criteria.
2. Write/confirm user story and edge cases.
3. Decide API contract and data changes before UI implementation.
4. Implement the smallest vertical slice.
5. Add tests alongside the implementation.
6. Run formatting, linting, type-check, tests and build.
7. Review security/data-integrity impact.
8. Update docs and screenshots if useful.
9. Commit with a clear message.
10. Do not start the next feature while the current slice is broken.

## 2. AI-assisted development with Google Antigravity

- Work from the repository root so the agent sees the approved docs.
- Give one bounded task per prompt; do not say “build the whole platform”.
- Tell the agent which files it may create/change and which features are out of scope.
- Ask it to explain the proposed plan before any destructive command or dependency choice.
- Require it to run available checks and report the actual command results.
- Review the diff, not just the summary.
- Reject made-up functionality, hard-coded demo metrics, hidden test skips, and placeholder implementations described as complete.
- Do not accept package upgrades without checking compatibility and updating the lockfile.
- Never paste production secrets, personal data or credentials into prompts.

## 3. Git strategy

- `main`: stable, buildable baseline.
- `feature/<short-description>`: one task per branch where practical.
- `fix/<short-description>`: defect fixes.
- Avoid long-lived `development` branches for a solo portfolio project unless there is a concrete need.
- Make small commits after a working, tested increment.
- Never commit `.env`, credentials, local database dumps, or generated build artifacts.

Suggested commits:

- `chore: establish monorepo workspace and tooling`
- `chore: add postgres compose service`
- `docs: record phase one architecture decisions`
- `test: add api health endpoint smoke test`

## 4. Root scripts expected after scaffold

Provide consistent root scripts that delegate to workspaces:

- `npm run dev` — run web and API concurrently.
- `npm run lint` — lint all workspaces.
- `npm run format:check` — check Prettier formatting.
- `npm run typecheck` — TypeScript checks for relevant workspaces.
- `npm test` — run available unit/smoke tests.
- `npm run build` — production build for all workspaces.

Scripts may be composed with npm workspaces or a small concurrently tool; keep it simple and verify each command actually works.

## 5. Definition of Ready

A task is ready when:

- It maps to a requirement or an explicitly approved technical-enabler task.
- Its scope and non-goals are clear.
- Acceptance criteria are testable.
- Data/API implications are understood.
- Dependencies are available or identified.

## 6. Definition of Done

A task is done only when:

- Code is implemented, not merely stubbed.
- Success, empty, and error behavior is addressed where relevant.
- Relevant tests exist and pass.
- Lint, format check, type-check and build pass.
- Validation and authorization are enforced server-side where applicable.
- Docs and API contracts are updated.
- No secret is committed.
- The diff has been reviewed.
- Known limitations are stated honestly.

## 7. AI output review checklist

Before accepting an Antigravity change, inspect:

- [ ] What files changed and why?
- [ ] Any unrequested features or dependencies?
- [ ] Any hard-coded credentials or local paths?
- [ ] Any TypeScript `any`, disabled lint rules, skipped tests or `@ts-ignore` added without justification?
- [ ] Error handling and input validation?
- [ ] SQL parameterization and transaction needs?
- [ ] Accessibility and responsive layout for UI work?
- [ ] Are scripts documented and runnable?
- [ ] Did the agent report only checks it actually ran?
