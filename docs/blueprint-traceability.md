# Blueprint traceability

This file maps implementation areas to Backend Architecture v2.1. It is not a replacement for the
source blueprint.

| Blueprint phase | Implementation area | Required exit behavior |
| --- | --- | --- |
| 0 | app/shared/audit, migrations, CI | Structured errors; mutation and audit are atomic |
| 1 | identity, provider | Consented operator delegation is recorded and revocable |
| 2 | credential + adapters | `FULLY_VERIFIED` requires a current live authority result |
| 3 | intake, taxonomy, eligibility | Section 12 self-declaration routes away from paid flow |
| 4 | allocation | Persisted directory replay; fair locked roster allocation |
| 5 | scheduling | Overlapping active booking is rejected by PostgreSQL |
| 6 | ledger, redemption | Chain verifies and event sum reconciles to balance |
| 7 | settlement + payment adapter | Only verified provider evidence changes payment state |
| 8 | conduct, grievance, institutional API | Evidence trail and statutory referral states |

## CI guardrails

- Strict citizen-facing DTOs and the CI source guard reject score/rank/rating/recommendation and
  any credit/conduct/grievance data.
- Schema tests reject privileged-content and client-wallet storage.
- Contract tests prove `MOCK`, `OFF`, and `UNAVAILABLE` outcomes cannot become official success.
- Real-PostgreSQL concurrency tests for rotation, booking, ledger, and webhook idempotency remain a
  release gate; they are not represented as complete by the current local suite.
