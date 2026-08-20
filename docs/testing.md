# Verification workflow

GitHub Actions is intentionally not configured. Verification is run explicitly from the repository
so local and deployment environments use the same commands.

## Fast local verification

```text
npm ci
npm run verify
```

This runs TypeScript checks, Biome, the citizen DTO boundary check, database-independent tests, and
the production build. PostgreSQL suites report as skipped when their required migration-owner or
runtime database URLs are absent. Unit and
HTTP contract coverage also verifies that an adapter-less build accepts and advertises only
`PAYMENTS_MODE=OFF`; `LIVE` and `SANDBOX` fail during configuration loading.

## PostgreSQL verification

Use a disposable PostgreSQL database. `MIGRATION_DATABASE_URL` must be authorized to install
extensions and create roles. `DATABASE_URL` must use the generated non-owner `legal_service_app`
login, and `RUNTIME_DATABASE_PASSWORD` supplies its password. Docker is not required.

```text
npm run db:migrate
npm run db:validate-credential-constraints
npm run db:apply-runtime-role
npm run db:verify
npm test
```

The database suites exercise:

- the active-booking GiST exclusion race;
- booking state, finite-slot, participant-identity, and metadata-only matter constraints;
- runtime denial of booking creation/identity mutation and matter update, deletion, or truncation;
- 50 concurrent capacity-one roster claims;
- ledger hash-chain and balance reconciliation;
- compensating negative ledger events;
- audit creation inside the trusted ledger writer;
- denial of direct runtime-role ledger mutation;
- audited payment-quote creation through the trusted writer, including denial for closed,
  legal-aid, pro-bono, and wrong-provider cases;
- denial of direct runtime quote insertion and all runtime payment-state mutations;
- owner-level append-only triggers;
- runtime login identity/ownership checks; and
- grievance initial-state and transition enforcement;
- concurrent credential-expiry claims and atomic downgrade audits; and
- append-only verification checks.

On a legacy database, first run the credential worker with the configured automation identity until
all unbounded full tiers have been auditably degraded. The owner-only validation command then
validates the full-tier expiry constraint; `db:verify` fails while it remains unvalidated.

## Remaining database release gates

- PSP intent creation plus webhook signature/idempotency concurrency, after the PSP contract,
  adapter, and payment state map are supplied;
- complete booking hold-expiry behavior, after the policy is supplied; and
- live current-authority renewal/reverification, after an authorized adapter and reviewed policy
  are supplied.
