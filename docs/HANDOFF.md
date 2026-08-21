# Backend handoff

## Snapshot

The backend implementation is approximately 70% complete. Core architecture and security
foundations are approximately 85% complete, but the complete end-user product is not yet ready for
production traffic. These percentages are planning estimates, not acceptance-test results.

The last completed product milestone before this handoff is commit `27bb4cc` (`feat: seal payment
evidence boundary`) on `dev`. This handoff document is intentionally committed separately so a new
Codex or engineer can recover the project context from the repository alone.

## Implemented

- TypeScript/Fastify modular monolith with API and worker entrypoints.
- PostgreSQL migrations `001` through `006` and a distinct least-privilege application login.
- Database-backed opaque sessions and delegated-actor foundations.
- Credential-policy validation, computed tier decisions, append-only checks, expiry, and
  concurrency-safe degradation.
- Intake, eligibility routing, replayable citizen directory, and locked roster allocation.
- Scheduling database safety: finite half-open slots, overlap exclusion, participant identity,
  constrained transitions, and fail-closed policy gaps.
- Append-only credit ledger, balance reconciliation boundary, evidence redemptions, and audit.
- Grievance state constraints and scoped institutional response boundaries.
- Paid-matter quote evidence with zero platform commission and a trusted audited database writer.
- Strict citizen/provider/institutional response schemas and citizen DTO leakage checks.
- Explicit capability modes; missing external integrations do not silently succeed.
- Google OAuth identity adapter (`AUTH_GOOGLE_MODE`): authorization-code flow with signed
  state, verified-email-only account bootstrap, database-backed citizen sessions, and audit.
  `OFF` by default; production rejects `MOCK`. OTP delivery remains unavailable.

## Deliberately unavailable

- Production OTP delivery and end-user session bootstrap.
- Live Bar/AIBE/current-authority credential checks and renewal.
- Credential upload processing or an approved encrypted temporary review store.
- Booking availability, hold expiry, post-acceptance cancellation, and both-party matter closure.
- PSP intents, webhook verification/idempotency, reconciliation, refunds, and settlement state
  mapping.
- Live messaging, LLM, eCourts API, and institutional authority integrations.
- Product-owned provider types, taxonomy, Section 12 categories, fee floors, translations,
  credential policies, and credit-weight datasets.

These are real product/partner decisions. Keep their paths unavailable until authorized inputs are
supplied; do not fill them with plausible-looking defaults.

## Immediate next milestone: Render release boundary

Complete a native Render deployment for the fail-closed core without Docker:

1. Add and validate `render.yaml` for an API service, worker, and same-region managed PostgreSQL.
2. Pin an upper-bounded Node runtime compatible with the lockfile and build.
3. Preserve separate migration-owner and `legal_service_app` credentials. The running API/worker
   must not retain owner credentials.
4. Use the direct Render Postgres connection, not transaction-mode PgBouncer, because this backend
   uses advisory locks and transaction-sensitive database behavior.
5. Apply migrations, credential-constraint validation, runtime grants, and database verification
   before starting the new release.
6. Configure `/health/live` and `/health/ready`, graceful shutdown, database timeouts, structured
   logs, trusted-proxy handling, and secret-safe errors.
7. Add a command-driven production preflight/release gate and a Render operator runbook.
8. Keep all unsupported integrations `OFF` or explicitly unavailable.

Render deployment readiness is not the same as product completion. A healthy deployment may expose
the implemented fail-closed API while OTP, scheduling, payment, and authority-dependent features
remain unavailable.

## Required real-PostgreSQL gate

No Docker was used, and no external PostgreSQL URL was available during the completed milestones.
Before calling the release verified, use a disposable real PostgreSQL database and run:

```text
npm ci
npm run verify
npm run db:migrate
npm run db:validate-credential-constraints
npm run db:apply-runtime-role
npm run db:verify
npm test
```

Confirm that PostgreSQL-gated integration and concurrency suites execute rather than report as
skipped. This includes the 50-way roster allocation, overlapping booking, runtime privileges,
ledger reconciliation, credential degradation, grievance transitions, and payment-boundary tests.

## Recommended milestone order after Render

1. Provision reviewed product policy/configuration datasets.
2. Implement an authorized OTP adapter and production login/session flow.
3. Complete booking availability, hold, cancellation, and both-party closure semantics.
4. Implement authorized credential-authority adapters and renewal.
5. Implement the selected PSP contract and its signed webhook/state machine.
6. Add remaining partner adapters and static translated content.
7. Complete every executable acceptance test mapped in `docs/blueprint-traceability.md`.

## Git and local-worktree warning

At handoff time, the remote branch contains the stable completed milestones. The previous local
workspace also contained an unfinished Render-hardening draft in:

- `scripts/migrate.ts`
- `src/app/build-app.ts`
- `src/app/config.ts`
- `src/shared/database.ts`
- `src/app/process-lifecycle.ts`

Those files were not part of the completed product milestone and require review and verification
before inclusion. A fresh clone will not contain that draft. Do not commit the user-owned
`plan.txt`.
