# Backend architecture

## Shape

The backend is a modular monolith. API and worker processes share domain/application modules and a
single PostgreSQL transaction boundary. This directly supports the blueprint's atomic audit,
rotation, booking, ledger, and webhook requirements without distributed transactions.

```text
src/
  bin/                 API and worker entrypoints
  app/                 composition, config, lifecycle
  interfaces/http/     actor context, errors, and role-separated routes
  modules/             blueprint business modules
  adapters/            external capability implementations
  shared/              database, transactions, IDs, security
db/
  migrations/          ordered SQL migrations
  roles/               deployment-time least-privilege grants
config/                 versioned policy datasets (empty until supplied)
tests/                  unit, integration, acceptance, concurrency, contract
```

Domain rules do not import Fastify or concrete adapters. Database transactions are supplied to use
cases so a mutation and its audit record commit or roll back together. Public module barrels and
live adapter implementations will be added as those application contracts stabilize.

## HTTP surfaces

- `public`: citizen and assisted-mode operations, plus aggregate public statistics.
- `provider`: credential, availability, matter, credit, and evidence-artifact operations.
- `institutional`: scoped, consented records and rosters.
- `admin`: review and operational workflows; no citizen-facing reuse of internal DTOs.

Routes map database rows to allowlisted response objects. Citizen/provider/institutional schema
namespaces are separate, and successful responses pass through strict runtime schemas.

## Data boundaries

PostgreSQL is authoritative. The schema intentionally has no rating, rank, portfolio, case-content,
or client-wallet table. `need_request` has no narrative column and `matter` stores metadata only.
External documents are processed ephemerally and only verification facts/references may persist.
Credential decisions store their versioned policy snapshot and expiry. Checks and decided cases
are immutable; the worker claims expired full tiers with `SKIP LOCKED`, degrades them, and records
the audit in the same transaction.

The schema owner is used only through `MIGRATION_DATABASE_URL`. API and worker processes use the
distinct `legal_service_app` login through `DATABASE_URL`; startup verifies that it inherits the
`legal_service_runtime` grants and owns none of the protected ledger, audit, or migration tables.
The shared runtime login cannot cryptographically bind a supplied application actor UUID to a
database session. Security-definer credential functions therefore re-check the referenced ADMIN
grant and scope, while audit attribution still trusts the authenticated application boundary. A
separate reviewer-service database identity is a deferred hardening option, not an assumed
blueprint component.

## External capabilities

Adapters publish explicit runtime modes. `OFF` and `UNAVAILABLE` are typed outcomes. `MOCK` is
allowed outside production only and always carries a demo-only label. Production startup rejects
mock modes. Partner endpoints and credentials are not embedded in the repository.
The owner-managed credential policy registry is empty by default and read-only to the application
runtime. Missing provider-type legs, approved upload processing, or authority adapters produce an
explicit unavailable outcome rather than a synthetic decision.
