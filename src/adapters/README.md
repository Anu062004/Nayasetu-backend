# External adapter boundary

Live partner implementations are intentionally absent until authorized contracts, credentials,
signature rules, and data-retention requirements are supplied. Runtime capability modes expose
that absence explicitly; `OFF`/`UNAVAILABLE` never becomes a successful business decision, and
production rejects `MOCK`.

Planned adapter families follow the blueprint: credential sources, Bar/current authority, AIBE,
notary registry, case status, referrals, payments, messaging, and optional taxonomy-only LLM
classification. Each implementation must satisfy its module port and contract tests before its
mode can be set to `LIVE`.
