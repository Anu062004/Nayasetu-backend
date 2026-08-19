# ADR 0001: Initial backend architecture

- Status: Accepted for initial implementation
- Source: Backend Architecture v2.1

## Decision

Use a product-name-neutral TypeScript modular monolith with Fastify, raw `pg` transactions, and
ordered SQL migrations. Run API and worker as separate processes from the same package. Keep every
external system behind a capability-mode port.

## Reasons

The blueprint depends on PostgreSQL-specific transaction behavior: `FOR UPDATE SKIP LOCKED`, GiST
range exclusion, serializable ledger writes, append-only grants, and mutation/audit atomicity. Raw
SQL keeps those guarantees reviewable. A single deployment boundary avoids introducing unstated
distributed-consistency behavior.

## Explicit implementation decisions required by omitted schema details

The blueprint references booking but omits its table. The implementation adds a `booking` table
with a `tstzrange` slot solely to realize the specified exclusion constraint. It does not define
hold expiry or additional business transitions until policy is supplied.

The ledger hash needs a canonical byte representation that the blueprint does not specify. Initial
code versions the canonical encoding and its first-event sentinel before any production event is
written. This decision must remain stable once production data exists.

Directory replay is defined by the persisted `directory_surface`. The initial computation uses the
request ID as seed and a snapshotted exposure counter, then re-serves the persisted surface. This
avoids mutable counters changing an already-issued result.

Policy data absent from the blueprint—provider type enumeration, role-specific credential legs,
taxonomy, Section 12 categories, district fee floors, freshness windows, service-credit weights,
SLA thresholds, and translations—lives behind versioned configuration schemas with no fabricated
production entries.

## Deferred decisions

- Real authority, requester, PSP, messaging, LLM, and institutional partner contracts.
- Section 12 paid-flow override authority and reason policy.
- Booking hold expiry and complete transition policy.
- Matter closure confirmation workflow.
- Rotation-decline signal type: the prose requires a signal but the enumerated signal set omits a
  decline event; allocation audit is recorded until the policy/schema is clarified.
- Redemption spending semantics and evidence signing authority.
- Retention, aggregate-stat suppression, institutional consent, and notification-delivery policy.
