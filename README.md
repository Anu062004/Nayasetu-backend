# Legal Service Rails Backend

Product-name-neutral backend implementation of `Backend Architecture v2.1`. The repository
implements the credential, access/allocation, incentive, payment-orchestration, and
accountability rails without provider ranking, public ratings, privileged-content storage, or
platform custody of client funds.

## Status

Implementation is in progress from a clean repository. The architecture blueprint is the product
source of truth. Missing policy datasets and partner contracts are represented as explicit,
validated configuration gaps; they are not filled with synthetic production facts.

## Architecture

- TypeScript modular monolith with separate API and worker entrypoints.
- Fastify HTTP boundary and raw PostgreSQL transactions.
- SQL-first migrations for `SKIP LOCKED`, GiST exclusion constraints, grants, and append-only
  ledgers.
- External integrations behind capability-mode adapters.
- Citizen, provider, institutional, and admin response schemas are isolated.

See [docs/architecture.md](docs/architecture.md), [docs/blueprint-traceability.md](docs/blueprint-traceability.md),
and [docs/decisions/0001-initial-architecture.md](docs/decisions/0001-initial-architecture.md).

## Local setup

1. Copy `.env.example` to `.env` and replace development credentials.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Install dependencies: `npm install`.
4. Apply migrations: `npm run db:migrate`.
5. Start the API: `npm run dev`.

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
`DEMO_ONLY` metadata and cannot produce `FULLY_VERIFIED` by itself.

## Verification

Run `npm run verify`. Database integration and concurrency tests require `DATABASE_URL` and a real
PostgreSQL instance. The acceptance suite mirrors the explicit correctness tests in section 14 of
the blueprint.

## Non-negotiable boundaries

- No numeric provider quality score, ranked recommendation, paid placement, or public rating.
- No citizen-facing credit, conduct, or grievance data.
- No case narrative, documents, evidence, advice, or correspondence in the matter store.
- No raw intake narrative after request completion.
- No client-funds wallet, generic escrow, or platform custody.
- No mock, `OFF`, or `UNAVAILABLE` adapter outcome becomes a successful official verification.
