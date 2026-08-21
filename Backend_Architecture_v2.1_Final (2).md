# **Backend Architecture v2.1** 

## **Supply-Side Rails for Legal Service Delivery** 

**Status:** Finalization candidate for implementation handoff **Working name: TBD before submission.** Do not use NyayaSetu: the Department of Justice now operates a public-facing Nyaya Setu AI legal assistant, unveiled on 31 Mar 2026 at the DISHA programme. Keep repository/package names neutral until the product name is locked. 

## **0. Design thesis** 

v1.0 built a lawyer marketplace: search, rank, book, rate. That answers PS challenge #4 and collides with Rule 36 of the BCI Rules. 

v2.1 preserves the three-rail thesis from v2.0 and hardens external integrations, payment boundaries, incentive semantics, and implementation fallbacks: 

1. **A credential rail** — portable, issuer-verified professional identity for five provider types. 

2. **An incentive rail** — a service-credit ledger that converts pro bono and underservedarea work into institutional recognition and panel eligibility. 

3. **An accountability rail** — conduct signals and a grievance pipeline wired to statutory disciplinary bodies, with zero public rating of individuals. 

Everything else in the system exists to feed those three. 

### **v2.1 hardening decisions** 

- **Name:** NyayaSetu is retired as the submission name; repository code stays productname-neutral until naming is finalized. 

- **External integrations:** DigiLocker, Bar Council/AIBE, eCourts, messaging, and institutional exports are adapter-based and capability-flagged. 

- **Payments:** the platform orchestrates an authorized payment provider; it does not selfcustody funds or implement its own escrow. 

- **Incentives:** credits create evidence/records for institutional use; they never buy directory position, allocation priority, payment priority, or an official credential the platform is not empowered to grant. 

- **Ledger:** hash-chain writes are transactional and append-only; no cross-row generatedcolumn claim. 

- **Demo honesty:** mocks are allowed for unavailable integrations but are structurally labelled and can never produce a production-grade official verification outcome. 

|**What is deliberately deleted from v1.0**<br>Deleted|Reason|
|---|---|
|Weighted ranking engine (§9.3)|Algorithmic channelling of clients toward<br>specific lawyers|
|Star ratings / reputation score|Third-party rating of advocates|
|Win-ratio rewards|Unmeasurable; incentivises refusing hard<br>and poor clients|
|Public portfolio, case victories, blog|Named in BCI’s 2025 directives|
|Case narrative storage, engagement updates|Privilege exposure; status can be referenced<br>by CNR and obtained through a case-status<br>adapter or external eCourts user flow where<br>available|
|Client rating|Deters the population the PS targets|



### **What is carried forward** 

Role-based verification conditions, the three-tier trust model, temporary-file/no-retention processing, deterministic-over-LLM discipline, append-only audit. These were the strong parts of v1.0. 

## **1. System context** 

Citizen (app / IVR) --------------------+ CSC / VLE (assisted mode) --------------+ Provider -------------------------------+--> PLATFORM BACKEND 

DLSA / BCI (institutional) -------------+      | +-- Credential rail +-- Allocation / access rail +-- Incentive rail +-- Accountability rail | 

External integrations <------------------------+ 

- Credential sources (DigiLocker when available) 

- State Bar Council / AIBE 

- Notary and mediation registries 

- Case-status adapter / eCourts fallback 

- Tele-Law / Nyaya Bandhu referral 

- DLSA / HC pro bono panel export 

- Licensed payment provider / gateway 

- SMS / IVR / WhatsApp 

Three human actor classes, not two: the **assisted-mode operator** (CSC/VLE) is a first-class actor who acts on behalf of a citizen who has no smartphone. v1.0 had no concept of this and it is the whole of PS challenge #5. 

## **2. Module map** 

api/ public/          citizen + assisted-mode surface provider/        provider surface institutional/   DLSA, bar council, DoJ surface (scoped, read-mostly) admin/ 

modules/ identity/          auth, roles, delegated (operator-on-behalf) sessions credential/        verification cases, adapters, tier decisions taxonomy/          legal-need taxonomy, means-test rules intake/            need capture, classification, PII minimisation eligibility/       Section 12 LSA routing decision allocation/        directory mode + rotation mode scheduling/        availability, slots, atomic reservation matter/            metadata-only engagement record ledger/            service credit accounting (append-only) redemption/        certificates, panel eligibility packets settlement/        quotes, payment-provider orchestration, offline recording conduct/           reliability signals, grievance, disciplinary referral interop/           outbound referrals, case-status adapter notify/ audit/ 

adapters/ credential-sources/  bar-council/  aibe/  notary-registry/ case-status/  telelaw/  nyayabandhu/  payments/  messaging/  llm/ 

## **3. Storage decision: Postgres, not MongoDB** 

I’d move off Mongo, and the reason is specific rather than aesthetic. Two subsystems here need guarantees Mongo makes awkward: 

**The rotation queue.** Assigning the next provider in a duty roster under concurrency is exactly: 

**SELECT** provider_id **FROM** roster_membership 

**WHERE** roster_id = $1 **AND** status = 'AVAILABLE' **AND** active_matters < capacity 

**ORDER BY** active_matters **ASC** , last_assigned_at **ASC FOR UPDATE SKIP LOCKED LIMIT** 1; 

SKIP LOCKED is the primitive. Without it you hand-roll optimistic retry loops. 

**The ledger.** Credits must be append-only and tamper-evident, balances must never drift from events, and an institutional consumer (DLSA) may treat the export as a factual record. Use serializable transactions plus an application/database-function hash-chain writer. Do **not** use a generated column for the chain: a generated column cannot reference the previous row. 

Slot booking also becomes trivial: 

**ALTER TABLE** booking **ADD CONSTRAINT** no_double_book EXCLUDE **USING** gist (provider_id **WITH** =, slot **WITH** &&) **WHERE** (status **IN** ('HELD','CONFIRMED','SCHEDULED')); 

That single constraint replaces §11.2 of v1.0 entirely. 

If the team refuses to move, Mongo 4.4+ transactions plus a unique index on (providerId, slotStart, activeFlag) will work — but you’ll write the ledger integrity and the queue fairness by hand. 

## **4. Core schema** 

_-- ---------- identity ----------_ 

user_account( **id** , phone_hash, email, status, created_at) role_grant(user_id, **role** , **scope** , granted_at) _-- CITIZEN|PROVIDER|OPERATOR| INSTITUTION|ADMIN_ 

operator_delegation( **id** , operator_user_id, citizen_user_id, 

_-- assisted mode audit_ 

_-- ---------- credential ----------_ 

provider( **id** , user_id, provider_type, display_name, district, state, languages[], service_modes[], status, tier, tier_decided_at) provider_service(provider_id, taxonomy_code, fee_min, fee_max, pro_bono_available) 

verification_case( **id** , provider_id, status, tier_outcome, 

submitted_at, decided_at, decided_by) verification_check(case_id, check_type, source_id, result, matched_fields[], source_ref, checked_at) 

_-- check_type: IDENTITY | DEGREE | ENROLMENT | PRACTICE_CERT | APPOINTMENT | CURRENCY_ 

_-- result:     PASS | MISMATCH | NOT_FOUND | CONFLICT | UNAVAILABLE_ 

_-- ---------- intake & routing ----------_ 

need_request( **id** , citizen_user_id, operator_delegation_id **NULL** , taxonomy_code, district, language, mode_pref, fee_ceiling, urgency, channel, created_at) 

- _-- narrative text is NEVER a column here_ 

eligibility_decision(need_request_id, section12_category **NULL** , self_declared, route, decided_at) 

_-- route: PAID | LEGAL_AID_REFERRAL | PRO_BONO_ROTATION_ 

_-- ---------- allocation ----------_ 

roster( **id** , district, taxonomy_code, provider_type, **mode** ) _-- mode: ROTATION_ roster_membership(roster_id, provider_id, status, capacity, active_matters, last_assigned_at, joined_at) allocation( **id** , need_request_id, provider_id, **mode** , roster_id **NULL** , seed **NULL** , position **NULL** , decided_at, decided_by) 

_-- mode: CITIZEN_CHOICE | ROTATION_ 

directory_surface(need_request_id, provider_id, position, seed) 

- _-- what was shown, in what order, why: full replay for audit_ 

- _-- ---------- matter (metadata only) ----------_ 

matter( **id** , allocation_id, provider_id, citizen_user_id, status, 

opened_at, closed_at, close_reason, cnr_number **NULL** ) 

_-- no documents, no notes, no narrative. cnr_number is an external case-status pointer; no API availability is assumed._ 

_-- ---------- payment orchestration (no platform custody) ----------_ 

payment_quote( **id** , matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at, created_at) 

payment_intent( **id** , matter_id, payment_provider, provider_intent_ref, amount, status, created_at, updated_at) 

payment_webhook_event( **id** , payment_provider, external_event_id, signature_valid, payload_hash, received_at, processed_at) settlement_record( **id** , payment_intent_id, external_settlement_ref, status, settled_at, failure_code **NULL** ) 

_-- money movement occurs at the authorized PSP; these tables store references/state only._ 

_-- ---------- ledger ----------_ 

credit_event( **id** BIGSERIAL, provider_id, event_type, units, weight_version, credits, matter_id **NULL** , evidence_ref, occurred_at, prev_hash, **hash** ) _-- hash chain, append-only, no UPDATE grant_ credit_balance(provider_id, total_credits, period_credits, last_event_id) redemption( **id** , provider_id, kind, credits_spent, artefact_ref, issued_at) 

_-- ---------- accountability ----------_ 

conduct_signal(provider_id, matter_id, signal_type, value, recorded_at) _-- FIRST_RESPONSE_MINUTES | NO_SHOW | FEE_DISCLOSED_UPFRONT -- | QUOTE_HONOURED | UNILATERAL_WITHDRAWAL_ 

grievance( **id** , complainant_user_id, subject_provider_id, **category** , status, opened_at, resolved_at) disciplinary_referral(grievance_id, bar_council_code, referred_at, external_ref, outcome) 

audit_event( **id** , actor_type, actor_id, action, entity_type, entity_id, before_summary, after_summary, reason_code, request_id, **at** ) 

Note what has no table: rating, score, rank, portfolio, case document, engagement update, win record, client-funds wallet. Payment tables hold external provider references and state only. 

## **5. Credential subsystem** 

### **5.1 Evidence sources, in priority order** 

|Leg|Primarysource|Fallback|
|---|---|---|
|Identity|Issuer-attested government<br>ID through an approved<br>requester integration when<br>available|OTP-verified phone + name<br>consistency; manual review<br>where identity proof is<br>required|
|Law degree|Issuer-attested university<br>document through an<br>approved requester<br>integration when available|Uploaded certificate →<br>temporary processing →<br>delete after decision|
|Enrolment|Current State Bar Council /<br>authoritative roll lookup<br>when technically and<br>institutionally available|Enrolment certificate →<br>temporary processing +<br>historical/secondary record<br>match + review|
|Right to practise|AIBE / Certificate of Practice<br>source when accessible<br>through an authorized or<br>public verification path|Document evidence + review;<br>never infer from enrolment-<br>number format|
|Currency|Current authoritative Bar<br>Council status check within<br>freshness window|Review queue; source<br>unavailability caps tier|
|Notary|Notary appointment register,<br>validity window|Appointment certificate →<br>temp processing|
|Mediator|Court-annexed centre /<br>MCPC empanelment list|Training certificate → temp<br>processing|



**Issuer-attested credentials are the preferred path, not a guaranteed dependency.** DigiLocker can be used only when the platform is onboarded as an approved requester and the relevant issuer/document type is actually available. When that capability is absent, the same CredentialSource contract falls back to authority lookup, temporary upload, or manual review. The MVP must therefore be runnable with a mix of LIVE, MOCK, and OFF adapters without changing business rules. 

### **5.2 Tier rules** 

SELF_DECLARED     profile complete; no issuer-attested credential DOCUMENT_VERIFIED issuer-attested OR validated document evidence for the role's required legs; identity consistent FULLY_VERIFIED    DOCUMENT_VERIFIED + currency confirmed against the authoritative register within the freshness window 

Two hard rules, both testable: - A format/pattern check on an enrolment number **never** contributes to a tier. It is a validation, not a verification. (v1.0’s Excalidraw source awarded FULLY_VERIFIED on “cross-checked against state Bar pattern” — a regex.) - The LLM can produce REVIEW_REQUIRED. It cannot produce FULLY_VERIFIED. 

Tiers expire. tier_decided_at + freshness_window drives a provider.reverification.due job. A stale FULLY_VERIFIED degrades to DOCUMENT_VERIFIED automatically rather than silently persisting. 

### **5.3 Adapter contract** 

**interface** CredentialSource { sourceId: string; legs: CheckType[]; supports(t: ProviderType): boolean; check(input: CredentialQuery): Promise<{ result: 'PASS'|'MISMATCH'|'NOT_FOUND'|'CONFLICT'|'UNAVAILABLE'; matchedFields: string[]; sourceRef?: string; validUntil?: string; checkedAt: string; }>; } 

UNAVAILABLE must never silently become PASS. Source downtime caps the achievable tier; it does not grant one. 

### **5.4 Credential capability policy** 

Every external credential adapter advertises one of three runtime modes: 

LIVE  -> real authorized/public source; result may contribute to a tier MOCK  -> synthetic fixture for SIH/demo; result is labelled DEMO_ONLY and cannot by itself produce FULLY_VERIFIED 

OFF   -> capability unavailable; UI/API exposes the limitation and the workflow falls back to another permitted source or review 

A FULLY_VERIFIED outcome therefore requires at least one LIVE current-authority check for the role-specific currency/enrolment leg. Mocked issuer data can demonstrate the flow but never masquerades as a government verification. 

## **6. Allocation subsystem — the Rule 36 core** 

No scoring. Two modes, both deterministic, both replayable. 

### **Mode A — Citizen-Choice Directory** 

Used for paid engagements where the citizen has agency. 

1. **Hard filters only.** Provider type, taxonomy code, district, language, service mode, fee ceiling, minimum tier. Boolean set membership — no weights, no partial credit. 

2. **Fair ordering.** Result order is a seeded rotation, seed = need_request.id. No provider holds a persistent top position across requests. A surfaced_count fairness counter breaks ties toward the least-shown eligible provider. 

3. **No comparative language anywhere in the response DTO.** No matchScore, no reasons: ["BEST_MATCH"], no “recommended”. The response explains the _filter_ , not the _lawyer_ : 

{ "requestId": "req_...", "filterSummary": { "category": "TENANCY_DEPOSIT", "district": "PATNA", "language": "hi", "feeCeiling": 2000 }, "matchCount": 14, "providers": [ { "providerId": "...", "displayName": "...", "tier": "FULLY_VERIFIED", "feeRange": [800,1500], "languages": ["hi","en"], "nextSlot": "..." } ], "ordering": "ROTATED", "seed": "req_..." } 

4. **The citizen selects.** The platform never selects. 

directory_surface persists exactly what was shown and in what order, so any allegation of preferential placement is answerable with a replay rather than an assurance. 

### **Mode B — Rotational Panel Allocation** 

Used for pro bono, legal-aid-tier, and assisted-mode requests. Modelled on how DLSA panels already assign counsel — duty rotation, not client choice, not merit. 

next(roster) = eligible members ORDER BY active_matters ASC, last_assigned_at ASC FOR UPDATE SKIP LOCKED LIMIT 1 

Eligibility gate: tier floor, capacity not exceeded, no conflict flag, roster status AVAILABLE. Decline is allowed with a reason code, re-enters rotation, and records a conduct_signal. Repeated declines reduce roster priority — that is duty accounting, not client-facing reputation. 

### **Why this survives scrutiny** 

|Concern|Control|
|---|---|
|Algorithmic channelling toward specific<br>lawyers|No score exists; ordering is seeded rotation,<br>replayable fromseed|
|Paid placement|No field, no table, no code path prices<br>position|
|Third-party rating|No rating table; conduct signals are<br>institution-facing only|
|Platform “recommending”|Mode A returns a filtered set; the citizen<br>chooses. Mode B is duty rotation|
|AI influencing who gets work|LLM output feedstaxonomy_codeonly, and<br>is validated against a closed enum before use|



**The AI boundary, stated for judges:** AI reads what the citizen’s problem _is_ . It never touches _who they get_ . 

## **7. Incentive subsystem — the actual PS answer** 

### **7.1 Earn events** 

|Event|Unit|Notes|
|---|---|---|
|PRO_BONO_MATTER_CLOS|matter|Requires closure confirmed|
|ED||by both parties|
|LEGAL_AID_TIER_MATTER|matter|Section 12–eligible citizen|
|_CLOSED||served|
|ASPIRATIONAL_BLOCK_SE|matter|Geographic multiplier for|
|RVICE||underserved blocks|



|Event|Unit|Notes|
|---|---|---|
|ROTATION_DUTY_COMPLE|matter|Accepted and completed a|
|TED||rotation assignment|
|FIRST_RESPONSE_SLA_ME|matter|Responded within window|
|T|||
|CLE_MODULE_COMPLETE|module|Continuing legal education|
|D|||
|LOK_ADALAT_SETTLEMEN|matter|Rewards resolution, not|
|T||litigation|



Weights live in weight_version config, are published, and are versioned — a credit earned under v1 weights stays valid when v2 ships. 

### **7.2 Integrity** 

credit_event. **hash** = sha256(prev_hash || **id** || provider_id || event_type || credits || occurred_at) 

Append-only is enforced at the grant level (INSERT only, no UPDATE/DELETE for the app role). Corrections are compensating negative entries, never edits. credit_balance is maintained in the same serializable transaction as the event insert, so a balance can never disagree with its history. 

The writer locks the provider’s ledger head, reads prev_hash, computes the new hash in the trusted service or a database function, inserts the event, and updates the materialized balance in one transaction. The chain is **not** a PostgreSQL generated column because generated expressions cannot reference another row. 

No blockchain. The trust boundary is a government platform with an auditable database; a hash chain gives tamper-evidence at a thousandth of the cost. 

### **7.3 Redemption — what credits actually buy** 

|Redemption|What it is|
|---|---|
|SERVICE_RECORD_EXPORT|Signed export of verified service events for<br>the provider’s own records|
|PANEL_APPLICATION_EVIDENCE_PACKET|Evidence packet formatted to support a DLSA<br>/ High Court panel application; the platform<br>does**not**decide eligibility|
|RECOGNITION_ELIGIBILITY_PACKET|Service-threshold evidence that an<br>authorized institution may use to issue<br>recognition; the platform does not self-issue<br>official recognition|
|CLE_ACTIVITY_RECORD|Verifiable record of completed learning<br>activity; it becomes official CLE credit only if<br>the competent institution recognizes it|



### **7.4 The guardrail that keeps this lawful** 

**Credits are never citizen-facing.** No leaderboard, no public badge, no “gold advocate”, nothing in a citizen-visible DTO. Credits are visible to the provider (their own record) and to institutional consumers (DLSA, bar council, DoJ) via the institutional API. 

The distinction is the whole design: a **service record** submitted to a statutory body is not advertising. A **badge shown to prospective clients** is. Same data, and only one of them is legal. 

Credits are non-purchasable and non-transferable — there is no code path that mints a credit from a payment. Credits also **never change citizen-facing directory order, roster eligibility rules, or payment-settlement speed.** 

### **7.5 Non-credit incentives worth more than credits** 

For a junior district-court advocate, the strongest incentive is not a certificate: 

- **Payment protection through an authorized payment provider.** Where a licensed provider offers marketplace/hold-and-release functionality, the platform orchestrates it through the provider API; the platform itself does not custody client funds. 

- **Zero platform commission.** State the number: 0%. Third-party payment-processing charges may still apply and must be disclosed separately. 

- **Fee transparency enforced upfront.** Quote before work, quote honoured, disputes go to grievance rather than hidden fee changes. 

- **Low-friction onboarding.** Issuer-attested credentials can make verification fast when integrations are enabled; the fallback path remains authority lookup + temporary document processing + review. 

## **7.6 Payment boundary — orchestration, not custody** 

The platform is **not** a payment system operator and does not maintain an internal client-funds balance. All online money movement is delegated to an authorized payment provider. The backend’s responsibilities are limited to: 

1. creating a provider-side payment intent/order; 

2. storing the external reference and disclosed fee breakdown; 

3. verifying webhook signatures and idempotency; 

4. reconciling provider-side payment/settlement status; 

5. recording offline-payment acknowledgements separately; and 

6. requesting provider-supported cancellation/hold/refund actions where applicable. 

Citizen -> Authorized PSP -> professional / provider settlement 

^                    | 

|                    v signed webhook       status/reference 

\____________________/ platform backend 

There is no platform-controlled wallet and no generic escrow abstraction. If the selected PSP offers a regulated hold/split/marketplace-settlement product, that capability stays behind the PaymentProvider adapter and is never described as the platform holding money. 

## **8. Access subsystem — PS challenge #5** 

### **8.1 Channels** 

|Channel|Mechanism|
|---|---|
|App / web|OTP-first. Google OAuth optional, never<br>required|
|**Assisted mode**|CSC/VLE operator creates a delegated session<br>with recorded consent|
|IVR / toll-free|Voice intake, DTMF fallback, operator<br>handoff|
|WhatsApp|Text + voice note intake|



**Delegated sessions** are the piece v1.0 lacks entirely. An operator acting for a citizen is not the citizen: operator_delegation records who acted, for whom, under what consent, over what window. Every write in that window carries both principals into audit_event. Assisted access without this is an impersonation hole. 

### **8.2 Eligibility router** 

Before any paid flow, eligibility/ runs the Section 12 LSA Act 1987 check: 

if self_declared_section12_category: 

route = LEGAL_AID_REFERRAL   -> refer to DLSA / Nyaya Bandhu, do not charge elif fee_ceiling below district floor for category: 

route = PRO_BONO_ROTATION    -> Mode B against pro-bono roster else: 

route = PAID                 -> Mode A directory 

The platform **refers** ; it does not adjudicate eligibility — that is DLSA’s statutory function. Selfdeclaration is sufficient to route, and the referral carries the declaration for the authority to verify. 

This is the single most important flow in the system and it is the one that turns “marketplace” into “access to justice”. A citizen entitled to free representation must not be able to accidentally pay for it. 

### **8.3 Language** 

Intake classification runs on 22 scheduled languages via the LLM adapter; taxonomy codes, notifications, and IVR prompts are pre-translated static content, not model output. Never let a model generate the legal category _name_ a citizen reads. 

## **9. Accountability subsystem** 

### **9.1 Conduct signals, not ratings** 

conduct_signal records objective, platform-observable facts: response time, no-show, fee disclosed before work, quote honoured, unilateral withdrawal. Not opinions. 

Consumption rules: - **Never** shown to citizens on a provider profile. - Feed rotation priority (duty accounting). - Trigger grievance review at threshold. - Exposed in aggregate to institutional consumers. 

### **9.2 Grievance → statutory referral** 

OPEN -> TRIAGED -> {PLATFORM_RESOLVED | REFERRED_TO_BAR_COUNCIL | REFERRED_TO_DLSA} 

Professional misconduct is a State Bar Council matter under s.35 of the Advocates Act. The platform’s job is to package a referral with a clean evidence trail and track outcome — not to adjudicate, and certainly not to publish a verdict as a star rating. Interim measures the platform _can_ take under documented policy: suspend rotation eligibility, pause directory visibility, and request a hold/cancellation through the authorized payment provider where that provider supports it. The platform never freezes funds it does not lawfully custody. 

### **9.3 Transparency without individual scoring** 

Public dashboards report at aggregate level: matters served per district, pro bono hours contributed statewide, median response time by category, grievance resolution rates. This satisfies PS challenge #2 without rating a single named advocate. 

## **10. Privilege boundary** 

The platform stores **metadata about an engagement, never its content.** 

|Stored|Not stored|
|---|---|
|Who, when, category code, status, fee, CNR|Case narrative, documents, evidence, advice,|
|pointer|correspondence|



Rationale: attorney-client communications are protected under s.132 of the Bharatiya Sakshya Adhiniyam. Routing privileged content through a third-party platform creates an exposure the MVP does not need. A CNR may be stored as a pointer; case status is obtained only through an 

authorized/available case-status integration or by directing the user to the official eCourts flow. The backend must not depend on scraping or an undocumented API. 

**Intake narrative handling:** raw text goes to the classifier and is discarded on the same request. A pre-model redaction pass strips phone numbers, Aadhaar-shaped strings, account numbers, and names where detectable. need_request has no narrative column, so there is no place for it to accidentally land. 

### **10.1 Case-status adapter policy** 

CaseStatusSource is capability-dependent: 

**interface** CaseStatusSource { mode: 'LIVE'|'LINK_ONLY'|'OFF'; getByCnr(cnr: string): Promise<CaseStatusResult>; } 

- LIVE: used only when the team has an authorized/documented integration. 

- LINK_ONLY: returns the official eCourts destination/instructions for the citizen to continue there. 

- OFF: case-status enrichment is unavailable. 

- Scraping, CAPTCHA bypass, and undocumented private endpoints are not implementation options. 

## **11. API surface** 

POST   /v1/auth/otp/request | /verify POST   /v1/auth/delegation                 operator opens assisted session DELETE /v1/auth/delegation/:id 

POST   /v1/providers                       create profile POST   /v1/providers/:id/credentials/issuer-fetch  initiate configured requester/issuer fetch POST   /v1/providers/:id/credentials/upload        fallback, multipart, ephemeral GET    /v1/providers/:id/verification 

POST   /v1/needs                           intake -> classification -> eligibility GET    /v1/needs/:id/directory             Mode A: filtered, rotated set POST   /v1/needs/:id/select                citizen chooses a provider POST   /v1/needs/:id/rotate                Mode B: rotation assignment GET    /v1/needs/:id/referral              legal-aid referral artefact 

GET    /v1/providers/:id/slots POST   /v1/bookings | /:id/accept | /:id/decline | /:id/cancel 

POST   /v1/matters/:id/close 

GET    /v1/matters/:id/status              case-status adapter; returns LINK_REQUIRED if no authorized integration 

GET    /v1/me/credits                      provider's own ledger POST   /v1/me/redemptions GET    /v1/me/service-record                signed service-record export GET    /v1/me/panel-evidence                panel-application evidence packet 

POST   /v1/payments/quotes 

POST   /v1/payments/intents                 create intent/order with authorized PSP GET    /v1/payments/:id 

POST   /v1/payments/webhooks/:provider      verify provider signature before state transition 

POST   /v1/payments/:id/offline-ack 

POST   /v1/grievances GET    /v1/institutional/providers/:id/record    scoped, consented GET    /v1/institutional/rosters/:id 

GET    /v1/public/stats                          aggregate only 

Response DTOs are allowlisted. A lint rule in CI fails the build on score, rank, rating, recommended, topMatch, creditBalance, or conductScore in any citizen-facing DTO. Institutional/provider-only DTOs are separately namespaced and schema-tested. 

## **12. Build order** 

|Phase|Deliverable|Exit test|
|---|---|---|
|0|Repo, Postgres, migrations,<br>error model, audit, CI|Structured errors, audit<br>writes on every mutation|
|1|Identity + delegation +<br>provider profiles|Operator can open a<br>consented session and act|
|2|Credential rail (one<br>live/current authority<br>adapter + requester<br>integration if available +<br>mock adapters)|Advocate reaches<br>FULLY_VERIFIED only with a<br>current authoritative match;<br>source outage cannot<br>upgrade tier|
|3|Intake + eligibility router|Section 12 citizen is referred,<br>never charged|
|4|Allocation Mode A + Mode B|Directory ordering replays<br>from seed; rotation is fair<br>under 50 concurrent requests|
|5|Scheduling + booking|Exclusion constraint holds;|



|Phase|Deliverable|Exit test|
|---|---|---|
|||no double-book under load|
|6|Ledger + redemption|Hash chain verifies; balance<br>reconciles from events; panel<br>packet exports|
|7|Payment-provider<br>orchestration|Only a verified PSP<br>webhook/server-side status<br>check can move payment<br>state; platform never self-<br>custodies funds|
|8|Conduct + grievance +<br>institutional API|Referral packet generated<br>with full evidence trail|



**Demo narrative:** an advocate verifies through the configured credential path (live issuer/authority integration where available, otherwise a clearly-labelled demo adapter plus one live/current authority check) → a citizen in a rural block uses app/IVR-assisted intake → a VLE opens a delegated session → the eligibility router detects a Section 12 category and routes to legal-aid/pro-bono handling instead of a paid booking → rotation assigns the next advocate on duty → matter closes → the ledger credits pro bono + underserved-area service → the advocate exports a signed service record / panel-application evidence packet. No step claims that the platform itself grants official panel eligibility. 

That story answers all five PS challenges in one flow, and not one frame of it shows a ranked list of lawyers. 

## **13. External dependency matrix and feature flags** 

The architecture must boot and pass core tests even when non-essential government/partner integrations are unavailable. Each adapter is configured explicitly; there is no silent mock in production. 

|Capability|MVP mode|Production target|Failure behaviour|
|---|---|---|---|
|State Bar/current<br>authority check|LIVEfor at least one<br>supported<br>jurisdiction|Multiple current-<br>authority adapters|Cap tier / review<br>queue|
|DigiLocker requester<br>fetch|LIVEif onboarding is<br>approved, otherwise<br>MOCKorOFF|Approved requester<br>integration with<br>supported issuers|Offer fallback<br>credential path|
|AIBE/CoP lookup|LIVEonly where an<br>authorized/public<br>path exists|Authorized<br>verification source|Cap relevant<br>verification leg|
|eCourts case status|LINK_ONLYunless<br>documented|Authorized case-<br>status integration|Return official<br>external|



|Capability|MVP mode|Production target|Failure behaviour|
|---|---|---|---|
||integration exists||continuation|
|Payment provider|SandboxLIVE|Authorized PSP<br>production account|Booking can remain<br>unpaid / offline path|
|IVR / WhatsApp|MOCKor sandbox as<br>available|Approved<br>messaging/voice<br>provider|Web/app assisted<br>mode remains usable|
|Institutional exports|Local signed artefact|DLSA/BCI/DoJ<br>integration where<br>agreed|Export remains<br>evidence, not official<br>status|



Recommended flags: 

CREDENTIAL_DIGILOCKER_MODE=LIVE|MOCK|OFF CREDENTIAL_BAR_MODE=LIVE|MOCK|OFF CREDENTIAL_AIBE_MODE=LIVE|MOCK|OFF CASE_STATUS_MODE=LIVE|LINK_ONLY|OFF PAYMENTS_MODE=LIVE|SANDBOX|OFF IVR_MODE=LIVE|MOCK|OFF WHATSAPP_MODE=LIVE|MOCK|OFF INSTITUTIONAL_EXPORT_MODE=LOCAL|LIVE|OFF 

**Handoff rule:** the README and deployment manifest must state which capabilities are LIVE, MOCK, LINK_ONLY, or OFF. A demo must never visually represent a mock source as a government-confirmed result. 

## **14. Acceptance tests that define correctness** 

- No code path assigns a numeric quality score to a provider. 

- Directory ordering for a given need_request.id is reproducible from the stored seed. 

- A provider cannot improve directory position through any payment, and no endpoint accepts one. 

- Service credits cannot improve citizen-facing directory position, rotational allocation priority, or payment-settlement speed. 

- PANEL_APPLICATION_EVIDENCE_PACKET, RECOGNITION_ELIGIBILITY_PACKET, and CLE_ACTIVITY_RECORD are evidence artefacts; none is represented as an official institutional decision unless a live authorized institution issues that decision. 

- Rotation assignment under 50 concurrent requests distributes evenly and assigns each provider at most once. 

- UNAVAILABLE from a credential source never yields FULLY_VERIFIED. 

- A regex/format match alone never contributes to any tier. 

- LLM output cannot set a verification tier or influence allocation order. 

- A Section 12–eligible citizen cannot complete a paid booking without an explicit override. 

- need_request contains no free-text narrative after the request completes. 

- Credit balance recomputed from credit_event matches credit_balance exactly. 

- No credit_event row can be updated or deleted by the application role. 

- A citizen-facing DTO containing any credit, conduct, or grievance field fails CI. 

- Two concurrent bookings for one slot: one succeeds, one gets 409. 

- A forged frontend callback cannot transition a payment to PAID or SETTLED; only a verified payment-provider webhook or server-side provider status check can do so. 

- The platform has no wallet/balance table representing client funds and no code path that self-custodies money. 

- If a case-status integration is unavailable, the API returns an explicit fallback (LINK_REQUIRED / UNAVAILABLE) rather than scraping or inventing status. 

- External adapters marked OFF or UNAVAILABLE never silently fall back to a successful business decision. 

## **Appendix A. Reference anchors for v2.1 hardening** 

These references are **architecture constraints and dependency anchors** , not a substitute for legal review or partner onboarding. 

- **Bar Council of India — BCI Rules / professional standards:** Rule 36 prohibits advocates from soliciting work or advertising. This is the basis for removing public ratings, ranked recommendations, paid placement, and promotional win/portfolio features. 

https://www.barcouncilofindia.org/info/bci-rules 

- **Advocates Act, 1961 — Section 35:** professional misconduct complaints against advocates on a State roll are handled through the State Bar Council disciplinary mechanism. 

https://www.indiacode.nic.in/show-data? 

   - actid=AC_CEN_3_46_00001_196125_1517807320172&orderno=42&sectionId=14672&sectio nno=35 

- **Bharatiya Sakshya Adhiniyam, 2023 — Section 132:** professional communications between advocate and client receive statutory protection, supporting the metadata-only privilege boundary. 

   - https://www.indiacode.nic.in/show-data?actid=AC_CEN_5_23_00049_202347_1719292804654&orderno=132 

- **DigiLocker — Requesters:** requester organizations must register and integrate to request/receive documents; therefore DigiLocker is capability-dependent rather than assumed. 

https://www.digilocker.gov.in/web/partners/requesters 

- **eCourts Services:** public CNR-based case-status access exists; v2.1 deliberately does not assume a generally available developer API and supports LINK_ONLY. https://services.ecourts.gov.in/App/apphelp.html 

- **Reserve Bank of India — Payment and Settlement Systems Act FAQ:** operating a payment system generally requires RBI authorization; therefore the platform delegates fund movement to an authorized payment provider rather than self-custodying client funds. 

https://www.rbi.org.in/commonman/english/scripts/FAQs.aspx?Id=420 

- **PostgreSQL — Generated Columns:** generated expressions cannot reference anything other than the current row, so the ledger hash chain must be written transactionally rather than as a cross-row generated column. 

   - https://www.postgresql.org/docs/current/ddl-generated-columns.html 

- **PostgreSQL — FOR UPDATE ... SKIP LOCKED:** appropriate for avoiding contention among consumers of queue-like tables, supporting duty-roster allocation. https://www.postgresql.org/docs/current/sql-select.html 

- **PostgreSQL — Range exclusion constraints:** supports non-overlapping range constraints, used here to prevent double-booking. https://www.postgresql.org/docs/current/rangetypes.html 

- **Press Information Bureau — Nyaya Setu:** the Department of Justice’s Nyaya Setu AI Chatbot was unveiled on 31 Mar 2026, which is why the submission name must change. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2247310 

