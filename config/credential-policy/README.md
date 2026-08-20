# Credential policy configuration

Provider types, required credential legs, authoritative sources, and freshness windows are not
fully defined in the blueprint. Do not infer them from identifier formats or demo fixtures.

Policies are stored in the owner-managed `credential_policy` registry. Migrations create no policy
rows, the application runtime receives read-only access, and tier finalization remains fail-closed
without one active reviewed policy for the provider type. Each policy snapshot must provide:

- `version` and `providerType`;
- declared `sources` with an evidence kind;
- `requiredDocumentLegs` and their allowed source identifiers;
- one explicit `identityConsistencyLeg` and its allowed source identifiers;
- `currentAuthorityLegs`, backed only by `AUTHORITY` sources; and
- a positive integer `currentAuthorityFreshnessMs` value.

The decision boundary converts the reviewed duration to an expiry timestamp and stores the exact
registry snapshot with the verification case. Policy provisioning uses the migration-owner
identity through a separately reviewed deployment process; no provider type or policy value is
shipped as a default.
