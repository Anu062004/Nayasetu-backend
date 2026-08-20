# ADR 0002: Payment capability honesty before a PSP adapter

- Status: Accepted
- Source: Backend Architecture v2.1, phase 7

## Context

The HTTP surface can persist an owning-provider quote for an authorized paid matter, but the
repository contains no PSP adapter. No provider contract, intent protocol, webhook signature
scheme, idempotency key, or payment state map has been supplied. Advertising `LIVE` or `SANDBOX`
would therefore claim a capability the process cannot execute.

## Decision

This build accepts only `PAYMENTS_MODE=OFF`, in development, test, and production. Configuration
loading rejects `LIVE` and `SANDBOX`, and readiness rechecks the resolved mode before publishing
capabilities. The quote endpoint remains available as an evidence record with an explicit fee
breakdown and zero platform commission. A quote does not create a payment intent, call a PSP,
verify settlement, or change payment state.

Payment-intent creation and webhook ingestion remain fail closed. The offline-acknowledgement path
also remains unavailable until its identity and evidence policy is supplied.

## Consequences

- Deployments cannot opt into a non-existent integration through environment configuration.
- Readiness cannot report online payments as available for this build.
- A future PSP integration must add its own reviewed contract, adapter, signature verification,
  idempotency behavior, payment state mapping, and tests before expanding the accepted mode set.
- No PSP vendor or cryptographic protocol is selected by this decision.
