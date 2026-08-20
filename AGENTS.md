# Repository working agreement

## Start here

Before changing the backend, read:

- `README.md`
- `docs/HANDOFF.md`
- `docs/architecture.md`
- `docs/implementation-status.md`
- `docs/blueprint-traceability.md`
- `docs/testing.md`

The implementation follows `Backend Architecture v2.1`. Do not invent policy values, provider
types, government integrations, partner contracts, or successful external outcomes that are not
provided by the product team.

## Non-negotiable boundaries

- Keep unavailable integrations fail-closed and report their mode honestly.
- Production must reject mock integrations.
- Preserve separate migration-owner and least-privilege runtime PostgreSQL identities.
- Every implemented mutation and its audit event must be atomic.
- Do not add provider rankings, quality scores, recommendations, paid placement, public ratings,
  client-funds wallets, platform custody, or generic escrow.
- Do not persist intake/case narratives, advice, correspondence, evidence, or case documents.
- Never expose credits, conduct signals, or grievance data in citizen DTOs.
- Do not enable live OTP, credential-authority, PSP, messaging, LLM, or institutional adapters
  without an authorized contract and testable implementation.
- Do not add GitHub Actions unless the repository owner explicitly requests it.

## Development workflow

- Work from `dev` and use a focused feature branch for each milestone.
- Preserve unrelated and user-owned files. In particular, do not commit `plan.txt`.
- Prefer a small stack of milestone commits over a commit for every minor edit.
- Keep code, migrations, deployment configuration, tests, and documentation aligned.
- Use raw PostgreSQL where the design depends on transactions, grants, GiST constraints,
  `SKIP LOCKED`, advisory locks, or security-definer functions.
- Do not use Docker unless the repository owner changes the current instruction.

Before handing off a milestone, run:

```text
npm ci
npm run verify
```

Database changes additionally require the real-PostgreSQL release sequence documented in
`docs/testing.md`. Do not claim database verification passed when the PostgreSQL-gated suites were
skipped.

## Current objective

Continue from `docs/HANDOFF.md`. The immediate milestone is a secure Render-native deployment
boundary, followed by real PostgreSQL migration/concurrency verification. External product
capabilities remain separate milestones and must not be simulated to make deployment look
complete.
