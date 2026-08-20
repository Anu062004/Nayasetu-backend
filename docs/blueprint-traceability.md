# Blueprint traceability

This file maps implementation areas to Backend Architecture v2.1. It is not a replacement for the
source blueprint.

| Blueprint phase | Implementation area | Required exit behavior |
| --- | --- | --- |
| 0 | app/shared/audit, migrations, verification scripts | Structured errors; mutation and audit are atomic |
| 1 | identity, provider | Consented operator delegation is recorded and revocable |
| 2 | credential policy, decision service, expiry worker + adapters | `FULLY_VERIFIED` requires a current live authority result; stale tiers persistently degrade |
| 3 | intake, taxonomy, eligibility | Section 12 self-declaration routes away from paid flow |
| 4 | allocation | Persisted directory replay; fair locked roster allocation |
| 5 | scheduling state machine, identity constraints, and exclusion rail | Overlapping active booking is rejected by PostgreSQL; missing availability/closure policy fails closed |
| 6 | ledger, redemption | Chain verifies and event sum reconciles to balance |
| 7 | settlement + payment adapter | Only verified provider evidence changes payment state |
| 8 | conduct, grievance, institutional API | Evidence trail and statutory referral states |

## Automated guardrails

- Strict citizen-facing DTOs and the source guard reject score/rank/rating/recommendation and
  any credit/conduct/grievance data.
- Schema tests reject privileged-content and client-wallet storage.
- Contract tests prove `MOCK`, `OFF`, and `UNAVAILABLE` outcomes cannot become official success.
- Credential tests prove format/LLM/conflicting/stale evidence cannot confer a tier, policy
  decisions persist an expiry, and concurrent expiry workers degrade once with an audit.
- Real-PostgreSQL tests cover rotation, booking, ledger reconciliation, and ledger permissions.
  Payment-webhook idempotency remains a release gate pending a supplied PSP contract.
