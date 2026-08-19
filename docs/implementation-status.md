# Implementation status

## Implemented

- Professional repository/tooling baseline, ordered SQL migrations, structured errors, and
  capability documentation.
- PostgreSQL contract for identity/delegation, providers/verification, intake/eligibility,
  allocation/directory replay, scheduling/matters, external payment references, ledger,
  redemptions, conduct, grievances, institutional grants, and append-only audit.
- Database-backed opaque session resolution; development header authentication remains isolated
  from production.
- Same-transaction actor checks and audit writes for implemented mutations, including active
  operator-delegation validation.
- Provider ownership checks, time-limited institutional consent, and roster-specific institutional
  grants.
- Persisted directory filter/snapshot replay and locked roster allocation with tier, status,
  capacity, conflict, service, and freshness gates.
- Booking exclusion constraint and allocation lifecycle release on decline/cancel/closure.
- Security-definer ledger append that atomically writes the event, balance, chain head, and audit;
  the runtime role cannot directly insert events or mutate balances.
- Separate migration-owner and application-runtime database identities with startup and deployment
  verification of membership, ownership, and critical privileges.
- Fail-closed case-status, credential, public-statistics, online-payment, and offline-ack behavior
  when required contracts or policies are absent.
- Strict runtime citizen-response schemas plus a static guardrail over those schemas and the
  citizen route modules; unknown response fields are rejected before serialization.
- Strict runtime provider and institutional response schemas with explicit database-row mapping.
- Grievance transitions enforced in both the domain model and PostgreSQL: `OPEN -> TRIAGED`, then
  one of the three blueprint terminal outcomes.
- Database-gated tests for concurrent allocation/booking, audited ledger reconciliation,
  compensating entries, runtime-role denial, and append-only triggers.

## In progress

- Real PostgreSQL migration verification and the required concurrency suites.
- Credential tier persistence, current-authority revalidation worker, and manual-review workflow.
- Complete booking availability/hold-expiry and both-party closure policy.
- Live adapter implementations after authorized partner contracts are supplied.
- End-to-end acceptance coverage for the complete section 14 matrix.

## Intentionally not fabricated

- The five provider-type values and role-specific credential-leg policy.
- Taxonomy, Section 12 category list, district fee floors, freshness windows, credit weights, and
  translations.
- Live DigiLocker, Bar Council, AIBE, eCourts API, PSP, messaging, LLM, or institutional contracts.
- Paid-flow override policy, evidence-signing authority, retention periods, or grievance thresholds.
- Provider lifecycle values, directory-visible provider statuses, and institutional consent/grant
  provisioning workflow.
- Offline-acknowledgement identifier/evidence semantics and the payment state graph.

These gaps are deployment blockers or fail-closed capability states, not hidden defaults.

## Verification note

Local verification intentionally excludes real-PostgreSQL execution because the implementation
session was instructed not to use Docker and no external `DATABASE_URL` was supplied. The database
tests are executable after migrations and runtime-login grants are applied. GitHub workflow
automation is intentionally absent by project request; verification is command-driven.
