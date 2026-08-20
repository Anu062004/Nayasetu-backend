# Legal Service Rails Backend

Product-name-neutral backend implementation of `Backend Architecture v2.1`. The repository
implements the credential, access/allocation, incentive, payment-orchestration, and
accountability rails without provider ranking, public ratings, privileged-content storage, or
platform custody of client funds.

## Status

The repository now contains the Phase 0 data/runtime foundation and fail-closed HTTP surfaces for
all endpoints listed in the blueprint. It is not production-ready: live OTP, credential-authority,
payment, and other partner adapters have not been supplied. Missing policy datasets and partner
contracts are explicit validated gaps, not synthetic production facts.

Credential tiers are computed from persisted checks under an explicit versioned provider-type
policy. Full verification has a stored expiry and is automatically degraded by the worker when it
expires. The repository ships an empty policy list and no authority identities.

## Architecture

- TypeScript modular monolith with separate API and worker entrypoints.
- Fastify HTTP boundary and raw PostgreSQL transactions.
- SQL-first migrations for `SKIP LOCKED`, GiST exclusion constraints, grants, and append-only
  ledgers.
- External integrations behind capability-mode adapters.
- Citizen, provider, institutional, and admin response schemas are isolated.

See [docs/architecture.md](docs/architecture.md),
[docs/blueprint-traceability.md](docs/blueprint-traceability.md),
[docs/testing.md](docs/testing.md), and
[docs/decisions/0001-initial-architecture.md](docs/decisions/0001-initial-architecture.md).

## Local setup

1. Copy `.env.example` to `.env` and replace both owner and runtime credentials.
2. Start a PostgreSQL instance. `MIGRATION_DATABASE_URL` must use the schema owner;
   `DATABASE_URL` must use the distinct non-owner application login. Docker Compose is optional;
   it is not required by the application.
3. Install dependencies: `npm install`.
4. Apply migrations: `npm run db:migrate`.
5. Validate credential constraints: `npm run db:validate-credential-constraints`.
6. Create/grant the runtime login: `npm run db:apply-runtime-role`.
7. Verify the database boundary: `npm run db:verify`.
8. Start the API: `npm run dev`.

The owner-managed credential policy registry is empty until reviewed provider-type policies are
provisioned; the runtime login cannot modify it. To run automatic expiry degradation, provision a
user with an `ADMIN` / `credentials:revalidate` role grant, set its UUID in
`CREDENTIAL_REVALIDATION_ACTOR_ID`, and start
`npm run dev:worker`. The worker performs no live authority renewal; it only removes expired
full-verification state. Reads map expired stored full tiers down to document-verified immediately,
even if the worker is not running.

Health endpoints:

- `GET /health/live` - process liveness.
- `GET /health/ready` - database readiness and non-secret capability modes.

## Capability modes

| Capability | Default | Implemented behavior |
| --- | --- | --- |
| DigiLocker requester | `OFF` | Explicitly unavailable; no live requester is assumed |
| State Bar/current authority | `OFF` | Explicitly unavailable until an authorized adapter is configured |
| AIBE/CoP | `OFF` | Explicitly unavailable until an authorized/public path is configured |
| Case status | `LINK_ONLY` | Returns the official external continuation, never scraped status |
| Payments | `OFF` | No online payment transition; offline acknowledgement remains distinct |
| IVR / WhatsApp | `OFF` | Web/API flows remain available |
| Institutional exports | `LOCAL` | Evidence artifact only; never an official institutional decision |

Production startup fails if any adapter is configured as `MOCK`. A mock result is always
`DEMO_ONLY` metadata and contributes to no persisted tier. Credential upload fails closed unless an
approved processor or protected temporary review store is configured.

## Authentication modes

- `SESSION` resolves an opaque bearer token from `auth_session`; only a keyed digest is stored.
- `HEADER` is a development/test mode and is rejected in production.
- `OFF` leaves product endpoints unauthenticated and therefore inaccessible.

Production requires `SESSION` and a strong `SESSION_TOKEN_PEPPER`. OTP endpoints remain
fail-closed until an authorized OTP adapter is implemented, so that adapter is a deployment
blocker for end-user login.

## Verification

Run `npm run verify`. Database integration checks require `DATABASE_URL`,
`MIGRATION_DATABASE_URL`, and a real PostgreSQL instance. Prepare that database with
`npm run db:migrate`, validate the credential boundary with
`npm run db:validate-credential-constraints`, and apply the least-privilege role with
`npm run db:apply-runtime-role`. Then run `npm run db:verify` and `npm test`. No Docker-based
verification is required. See [docs/testing.md](docs/testing.md) for current coverage and remaining
release gates.

## Non-negotiable boundaries

- No numeric provider quality score, ranked recommendation, paid placement, or public rating.
- No citizen-facing credit, conduct, or grievance data.
- No case narrative, documents, evidence, advice, or correspondence in the matter store.
- No raw intake narrative after request completion.
- No client-funds wallet, generic escrow, or platform custody.
- No mock, `OFF`, or `UNAVAILABLE` adapter outcome becomes a successful official verification.
- The API/worker database login is a non-owner member of `legal_service_runtime`; production
  startup fails when the configured identity does not match that boundary.
