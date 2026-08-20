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
hold expiry, availability generation, rescheduling, or post-acceptance cancellation until policy
is supplied.

The scheduling safety boundary treats the absence of availability and both-party closure policy as
an unavailable capability. It does not accept a caller-selected interval merely because the overlap
constraint can store it, and it does not let one party close a matter. Existing held bookings may
be accepted or declined by their provider; a held booking may be cancelled by an owning party,
ending its allocation and releasing rotational capacity once. Cancellation after acceptance,
rescheduling, hold expiry, and closure confirmation remain deferred policy decisions.

The ledger hash needs a canonical byte representation that the blueprint does not specify. Initial
code uses versioned, length-prefixed UTF-8 fields, a 32-byte zero genesis value, UTC timestamps,
and SHA-256. A security-definer database writer performs the chain insert, balance update, and
audit atomically. This encoding must remain stable once production data exists.

Directory replay is defined by the persisted `directory_surface`. The initial computation uses the
request ID as seed and a snapshotted exposure counter, then re-serves the persisted surface. This
avoids mutable counters changing an already-issued result.

Policy data absent from the blueprint—provider type enumeration, role-specific credential legs,
taxonomy, Section 12 categories, district fee floors, freshness windows, service-credit weights,
SLA thresholds, provider lifecycle values, and translations—lives behind versioned configuration
or fail-closed deployment records with no fabricated production entries.

Opaque session tokens are stored only as keyed SHA-256 HMAC digests. Header authentication remains
development-only, and production startup requires session mode. A live OTP adapter is still needed
to issue end-user sessions.

Database deployment uses separate identities. `MIGRATION_DATABASE_URL` is the schema owner;
`DATABASE_URL` is the non-owner `legal_service_app` login inheriting the NOLOGIN
`legal_service_runtime` role. API and worker startup reject an unexpected login, missing
membership, or ownership of protected tables.

Institutional provider access requires a time-limited consent record bound to institution,
provider, scope, and consent reference. Institutional roster access additionally requires a
time-limited roster-specific grant. Provisioning those records is deferred because the blueprint
does not define an issuance workflow.

The allocation lifecycle adds explicit `ASSIGNED`, `DECLINED`, `CANCELLED`, and `COMPLETED` states
so a declined rotation can release capacity and re-enter allocation. `ROTATION_DECLINE` is stored
as an objective conduct signal because the prose mandates a decline signal even though the listed
signal enum omits its name; it has no citizen-visible or numeric-score interpretation.

Credential policy is an explicit owner-managed, versioned database registry keyed by provider type;
the runtime can read but not modify it, and the repository ships no provider types, credential
legs, authority mappings, or freshness values. A decision stores the validated registry snapshot
and is computed only from persisted checks in one active review case. `FULLY_VERIFIED` expires at
the earliest applicable evidence bound. Expired tiers persistently degrade to
`DOCUMENT_VERIFIED`.

Credential upload rejects before filesystem persistence until an approved synchronous processor or
encrypted temporary review store is configured; deleting the only evidence is not represented as
a queued manual review. Any future processor must use owner-only temporary files and guaranteed
deletion. The manual review command remains an internal application contract because the blueprint
does not define its admin HTTP route.

Automated credential expiry uses an explicitly provisioned user with an `ADMIN` role grant as its
service identity because the audit actor model contains only blueprint roles and requires a real
foreign-key principal. No default account is created, and the worker remains disabled without the
configured identifier.

## Deferred decisions

- Real authority, requester, PSP, messaging, LLM, and institutional partner contracts.
- Credential reviewer provisioning, approved upload-processing/storage policy, and admin HTTP
  contract.
- Section 12 paid-flow override authority and reason policy.
- Booking hold expiry and complete transition policy.
- Matter closure confirmation workflow.
- Redemption spending semantics and evidence signing authority.
- Retention and notification-delivery policy.
- Offline-acknowledgement identifier/evidence semantics; the endpoint fails closed until supplied.
- PSP selection, intent and webhook contracts, signature verification, idempotency, and payment
  state mapping. Until these are supplied, payment mode remains `OFF` and quotes are evidence only.
- Consent and roster-grant provisioning authority and retention.
