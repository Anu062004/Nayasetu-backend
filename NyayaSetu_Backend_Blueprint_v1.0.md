

<!-- Start of picture text -->
Google OAuth / OTP Provider<br>identity<br>mn Fi Official / Government<br>Citizen / Client Verification Sources<br>discover, match, book, track ——<br>Legal Service Provider onboard, verify, manage services structured Al tasks<br>(Advocate / Mediator/ etc.) NYAYASETU BACKEND LLM / Al API<br>NyayaSetu Admin / Reviewer Payment Gateway<br>Email / Notification Provider<br><!-- End of picture text -->



NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

# **Document Control** 

|**Item**|**Value**|
|---|---|
|Project|NyayaSetu - Trusted Legal Services Marketplace|
|Document|Backend Blueprint|
|Version|1.0|
|Primary stack|TypeScript, Node.js, Express, MongoDB Atlas|
|AI model strategy|Existing LLM/API; no custom model training required for MVP|
|Primary users|Citizen/client, legal service provider, admin/reviewer|
|Provider scope|Advocate, arbitrator, mediator, notary, document writer; extensible|
|Verifcation UX|Self-Declared / Document Verifed / Fully Verifed|
|Verifcation documents|Temporary processing; no permanent certifcate storage in MVP|
|Case-fle vault|Deferred from MVP; add secure object storage when persistent<br>case documents are introduced|
|Status|Foundation baseline - implementation-ready with explicitly listed<br>open decisions|



## **Source Baseline** 

- SIH concept: NyayaSetu is a trusted legal-services marketplace built around Verify -> Match -> Book -> Serve -> Build Reputation. 

- Existing concept defines Google OAuth + OTP authentication, MongoDB, Agent 1 for provider verification, Agent 2 for matching, booking, payments and service tracking. 

- Excalidraw extends the provider model to advocates, arbitrators, mediators, notaries and document writers, with role-specific verification conditions and three shared trust tiers. 

- This blueprint deliberately refines the backend into one primary implementation stack: TypeScript + Node.js + Express + MongoDB, while preserving the product logic. 

## **Contents** 

- 1. Architecture Principles 

- 2. Scope and Domain Model 

- 3. High-Level Backend Architecture 

- 4. Service Boundaries 

- 5. Identity, Authentication and Authorization 

- 6. Provider Onboarding and Agent 1 Verification 

   7. Government / Official Verification Data Strategy 

- 

- 8. Citizen Legal-Need Intake 

- 9. Agent 2 and Matching Engine 

- 10. Provider Search and Discovery 

- 11. Availability, Scheduling and Booking 

- 12. Engagement / Service Tracking 

- 13. Payments and Billing 

- 14. Ratings, Reputation and Portfolio 

- 15. Support and Dispute Handling 

- 16. Notifications 

- 17. Data Architecture and MongoDB Collections 

- 18. API Blueprint 

- 19. Async Jobs and Events 

- 20. AI Contracts and Guardrails 

- 21. Document and Privacy Architecture 

- 22. Security Architecture 

- 23. Observability and Audit 

Big Hero 6  |  Engineering Foundation  |  Page _2_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

- 24. Error Model and Resilience 

- 25. Performance and Scalability 

- 26. Testing Strategy 

- 27. Deployment and Environments 

- 28. Repository Structure and Engineering Standards 

- 29. MVP Build Plan 

- 30. SIH Demo Flow 

- 31. Risks, Open Decisions and Future Evolution 

- Appendix A. State Enums 

- Appendix B. Sample Payloads 

- Appendix C. Definition of Done 

Big Hero 6  |  Engineering Foundation  |  Page _3_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

# **1. Architecture Principles** 

|**Principle**|**Backend consequence**|
|---|---|
|Trust is evidence-based|AI may extract and compare information, but verifcation outcomes<br>come from evidence, deterministic rules and authoritative records<br>wherever available.|
|Privacy by data minimization|Only collect and retain information needed for the workfow. Raw legal<br>matching text and verifcation certifcates should not be stored by<br>default.|
|AI is bounded|AI handles unstructured understanding. Authentication, booking,<br>payments, permissions, verifcation tiers and ranking policy remain<br>deterministic backend logic.|
|Modular monolith frst|Use a well-separated modular Node.js backend for the<br>hackathon/MVP. Avoid microservices until scale or team boundaries<br>justify them.|
|Stable contracts|Frontend depends on versioned API schemas, not database internals.<br>AI output must also be validated against strict JSON schemas.|
|Auditable decisions|Verifcation, payments, permissions, booking changes and support<br>actions emit immutable audit events.|
|No silent certainty|If an oficial source is unavailable or a verifcation check is ambiguous,<br>surface PENDING/REVIEW rather than fabricate confdence.|
|Extensible provider model|Provider types and verifcation rules are confguration-driven so new<br>legal-service categories can be added without redesigning the<br>database.|



## **Non-Goals for MVP** 

- Training a proprietary legal LLM. 

- Providing autonomous legal advice or predicting case outcomes. 

- Using blockchain or zero-knowledge proofs merely for novelty. 

- Persisting every uploaded verification certificate. 

- Building nationwide web scrapers that bypass CAPTCHAs or website restrictions. 

- Splitting the system into many microservices before the domain stabilizes. 

# **2. Scope and Domain Model** 

## **2.1 User Roles** 

|**Role**|**Primary capabilities**|
|---|---|
|Citizen / Client|Create account; describe legal need; receive provider matches;<br>compare providers; book; pay; track engagements; submit feedback;<br>raise support ticket.|
|Legal Service Provider|Create professional profle; submit verifcation information; defne<br>service categories, fees and availability; receive bookings; manage<br>engagements; issue quotes; build reputation.|
|Admin / Reviewer|Review exceptional verifcation cases; manage<br>taxonomy/confguration; handle disputes; view audit events; moderate<br>provider content; manage system operations.|
|System / Worker|Run verifcation adapters, matching, notifcations, payment webhooks,<br>scheduled jobs and audit/event processing.|



## **2.2 Supported Provider Types** 

Big Hero 6  |  Engineering Foundation  |  Page _4_ 





|API Layer<br>—<br>Express + Typescript pe<br>eee<br>SSS<br>——<br>Seae<br>a ae Ca<br>=<br>ee<br>=<br>ee ,<br>—_—<br>moss<br>—<br>.<br>+<br>+<br>y<br>ae’<br>\<7<br>+—<br>=F<br>“TF<br>4<br>=)<br>(LegalNeed+Matching )<br>VerificationOrchestrator<br>Payments<br>&Bling<br>Notincation Service<br>( nwvesrmcuwen<br>Support & Disputes<br>Audit<br>&Secunty Events<br>Auth & Authorization<br>User/ProviderProne)<br>{Engagement<br>/ServiceTracking<br>Avaliapity&<br>Booking)<br>attsnanan<br>(oer<br>tagent<br>{<br>ee|
|---|
|<br> <br><br> <br><br><br><br><br>a<br>eae<br>Ne<br>)<br>AsyncJobs /BullMQ_<br>)<br>ti<br>ir<br>mnt<br>Email /SMSProvider<br>—-<br>uumroviser<br>)( “apidetartaty<br>) (emaiveineatonsources)<br>( reymentcateney<br>)<br>y<br>.<br>/<br>—_<br>7|





NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

|||JSON outputs.|
|---|---|---|
|Auth|Google OAuth 2.0 + OTP provider|Matches product concept; backend issues<br>NyayaSetu session/access tokens.|
|AI|LLM API behind an internal AI adapter|Provider-swappable and isolated from product<br>logic.|
|Queue|BullMQ + Redis (recommended after basic<br>MVP)|Async verifcation, notifcations, retries and<br>webhook processing.|
|Payments|Gateway adapter|Keep Razorpay/Stripe/etc. behind one<br>interface; do not couple business logic to a<br>vendor.|
|Email/SMS|Notifcation adapter|One internal message contract; provider can<br>change later.|
|Logging|Structured JSON logs|Searchable logs and correlation IDs.|



## **3.1 Modular Monolith Boundaries** 

```
HTTP API
  |
  +-- auth
  +-- users
  +-- providers
  +-- verification
  +-- taxonomy
  +-- matching
  +-- availability
  +-- bookings
  +-- engagements
  +-- payments
  +-- reviews
  +-- support
  +-- notifications
  +-- admin
  +-- audit
  +-- integrations
       +-- ai
       +-- government-sources
       +-- payments
       +-- oauth-otp
       +-- messaging
```

# **4. Service Boundaries** 

|**Module**|**Owns**|**Must not own**|
|---|---|---|
|Auth|Sessions, identity-provider linkage, roles, token<br>lifecycle.|Provider verifcation decisions or booking state.|
|Providers|Professional profle, services, fees, public profle<br>felds.|Oficial-data ingestion internals.|
|Verifcation|Verifcation cases, checks, source adapters,<br>evidence summary, trust-tier decision.|Provider quality/reputation scoring.|
|Matching|Legal-need classifcation, candidate retrieval,<br>rank calculation, match explanations.|Booking creation or payment.|
|Availability|Weekly rules, exceptions, slot computation,<br>reservation locks.|Payment state.|
|Bookings|Booking lifecycle and participant relationship.|Service notes/content beyond references.|
|Engagements|Post-booking service progress, milestones,<br>status updates.|Financial settlement ledger.|
|Payments|Quotes, payment orders, gateway/webhook|Direct modifcation of booking without domain|



Big Hero 6  |  Engineering Foundation  |  Page _6_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

||state, refunds where supported.|event.|
|---|---|---|
|Reviews|Feedback, rating eligibility, reputation<br>aggregates.|Verifcation tier.|
|Support|Tickets, dispute workfow, admin resolution.|Direct edits to payments without audited action.|
|Notifcations|Templates, delivery attempts, user preferences.|Business decisions.|
|Audit|Append-only security/business event trail.|Mutable application state.|



# **5. Identity, Authentication and Authorization** 

## **5.1 Authentication Flow** 

1.  User authenticates using Google OAuth or OTP. 

2.  Backend validates provider response / OTP result; never trust a frontend-only success flag. 

3.  Backend finds or creates the NyayaSetu user record. 

4.  Backend issues short-lived access token and refresh/session token or secure server session. 

5.  Every authenticated request resolves userId, role(s), account status and correlationId. 

6.  Sensitive actions may require recent authentication or OTP re-verification. 

## **5.2 Authorization Model** 

|**Resource**|**Citizen**|**Assigned provider**|**Other provider**|**Admin**|
|---|---|---|---|---|
|Public provider profle|Read|Read|Read|Read|
|Citizen profle|Self only|No|No|Restricted/support only|
|Verifcation<br>evidence/results|No|Own result only|No|Review permission|
|Booking|Own|Assigned|No|Support permission|
|Engagement status|Own|Assigned|No|Support permission|
|Payment metadata|Own|Assigned limited view|No|Finance/support permission|
|Audit events|No|No|No|Authorized admin only|



#### **Rule** 

Never authorize using request parameters alone. Always derive ownership/assignment from database state and apply object-level authorization before returning or mutating data. 

## **5.3 Suggested Token Claims** 

```
{
  "sub": "user_...",
  "roles": ["CITIZEN"],
  "sessionId": "sess_...",
  "authTime": 1787...,
  "exp": 1787...
}
```

# **6. Provider Onboarding and Agent 1 Verification** 

Big Hero 6  |  Engineering Foundation  |  Page _7_ 



<!-- Start of picture text -->
Provider submits profile + certificate<br>(file is temporary)<br>1. Identity / profile consistency<br>2. Document extraction + validation<br>3. Official / government record matching<br>4. Current authority check or review fallback<br>insufficient evidence documents verified \current authoritative match<br>SELF-DECLARED DOCUMENT VERIFIED FULLY VERIFIED<br>Delete temporary certificate<br>store result + source + timestamp + hash<br><!-- End of picture text -->

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

```
          -> VERIFIED_DOCUMENT
```

- <mark>`-> VERIFIED_FULL -> NEEDS_RESUBMISSION`</mark> 

```
          -> REVIEW_REQUIRED
```

```
          -> REJECTED
```

```
Any verified state -> REVERIFICATION_REQUIRED
when source data, expiry, credential status or policy changes.
```

## **6.3 User-Visible Trust Tier Rules** 

|**Tier**|**Minimum evidence**|**Public meaning**|
|---|---|---|
|SELF_DECLARED|Provider profle exists; authoritative/document<br>verifcation not completed.|Information is supplied by the provider and has<br>not been independently verifed.|
|DOCUMENT_VERIFIED|Required credential document passed<br>extraction/consistency checks; identity and<br>credential felds are coherent.|NyayaSetu verifed submitted documentation,<br>but current authoritative status may not be<br>confrmed.|
|FULLY_VERIFIED|Required document checks pass AND current<br>authoritative record is confrmed with no<br>unresolved conficts.|NyayaSetu confrmed the professional credential<br>against an authoritative/current source.|



## **6.4 Temporary Certificate Processing** 

1.  Accept upload using multipart streaming with strict size and MIME limits. 

2.  Scan for malware / reject executable or malformed files. 

3.  Write to memory or ephemeral encrypted temporary storage only for the verification operation. 

4.  Extract minimum required fields; do not pass unnecessary content to the LLM. 

5.  Run evidence checks and source lookups. 

6.  Compute SHA-256 fingerprint if the team wants evidence continuity without retaining the file. 

7.  Persist only normalized extracted fields needed for audit, check outcomes, source, timestamp, tier and optional hash. 

8.  Delete temporary file immediately after success/failure. For MVP, unresolved cases require resubmission instead of indefinite storage. 

## **6.5 Verification Decision Pseudocode** 

```
if profileRequiredFieldsMissing:
    tier = SELF_DECLARED
elif documentCheck != PASS:
    status = NEEDS_RESUBMISSION
elif authoritativeCurrentMatch == CONFIRMED:
    tier = FULLY_VERIFIED
elif documentCheck == PASS:
    tier = DOCUMENT_VERIFIED
else:
    status = REVIEW_REQUIRED
```

```
// AI confidence can trigger REVIEW; it cannot create FULLY_VERIFIED by itself.
```

# **7. Government / Official Verification Data Strategy** 

NyayaSetu should treat official data as a set of adapters, not one permanent “all Indian lawyers” table. Public bulk data can seed/reference the prototype, but current professional status should be confirmed from the strongest available authoritative source. 

|**Source class**|**How used**|**Authority level**|**Storage strategy**|
|---|---|---|---|
|Historical government/open-data<br>advocate dataset|Prototype lookup;<br>enrollment/name/date corroboration.|Secondary - may be stale.|Normalized snapshot may be stored<br>with source/version metadata.|
|State Bar Council / regulator lookup|Current enrollment verifcation where<br>a permitted public lookup/API exists.|Primary for advocate enrollment<br>status.|Prefer on-demand lookup + cached<br>result/time; do not scrape restricted<br>systems.|
|Role-specifc authority data|Notary appointments, mediator|Primary/secondary depending issuer.|Adapter-specifc result cache.|



Big Hero 6  |  Engineering Foundation  |  Page _9_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

||empanelments, arbitral panels, etc.|||
|---|---|---|---|
|eCourts/case-presence signal|Optional corroboration that an<br>enrollment identity appears in case<br>records.|Not proof of current professional<br>status.|Store only minimal signal + timestamp<br>if used.|
|Manual/admin evidence review|Fallback when sources are<br>unavailable/conficting.|Operational fallback, not a substitute<br>for authoritative confrmation.|Store decision, reviewer, reason and<br>evidence summary; avoid unnecessary<br>document retention.|



## **7.1 Verification Adapter Interface** 

```
interface VerificationSourceAdapter {
  sourceId: string;
  supports(providerType: ProviderType): boolean;
  verify(input: {
    enrollmentNumber?: string;
    name: string;
    stateCouncil?: string;
    appointmentNumber?: string;
  }): Promise<{
    status: 'MATCH'|'NOT_FOUND'|'CONFLICT'|'UNAVAILABLE';
    matchedFields: string[];
    sourceReference?: string;
    checkedAt: string;
  }>;
}
```

# **8. Citizen Legal-Need Intake** 

The citizen should be able to describe the need naturally, but the backend must convert that text into a bounded, structured matching request. Agent 2 is not the legal decision-maker and should not store the user’s narrative by default. 

## **8.1 Matching Input Contract** 

```
{
  "rawText": "My landlord has not returned my deposit...",
  "location": { "city": "Pune", "state": "Maharashtra" },
  "budget": { "max": 2000, "currency": "INR" },
  "preferredMode": "ONLINE|IN_PERSON|EITHER",
  "preferredLanguage": ["en", "hi"],
  "urgency": "LOW|NORMAL|HIGH"
}
```

## **8.2 Privacy Rules for Intake** 

- Display a warning not to enter unnecessary identity numbers, passwords, banking secrets or unrelated third-party data. 

- Apply a pre-AI minimization/redaction pass for obvious contact/identity data where possible. 

- Send only the minimum text required for classification/extraction. 

- Persist the structured matching attributes and request metrics; discard raw text after the request unless the user explicitly chooses to save it as part of a future case workspace. 

- Do not train models on user case text as part of the MVP. 

# **9. Agent 2 and Matching Engine** 

Big Hero 6  |  Engineering Foundation  |  Page _10_ 



<!-- Start of picture text -->
Citizen describes legal need<br>Privacy filter / redaction<br>(minimize PII before Al)<br>Agent 2: classify + extract structured fields<br>~<br>|<br>~<br>apse r Discard raw matching text after request<br>Validation against legal taxonomy unless user explicitly saves it<br>Candidate retrieval from MongoDB<br>Hard filters<br>category, location, availability, fee, eligibility<br>Deterministic ranking engine<br>Top providers + explanation<br>(no legal-outcome guarantee)<br><!-- End of picture text -->







<!-- Start of picture text -->
a<br>provider accepts / auto-confirm “sig<br>~----- cancel ___ “=<br>(commuconrinmen |F payment5  required cancel ____SRE~~ ~~ >| CANCELLED<br>oo<br>‘<br>offline / no advance paid cancelaon ae ,<br>service starts { moseprocre s s ) |S€rvice complete {comereo)<br><!-- End of picture text -->

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

```
]
exceptions: [
  { date: '2026-08-21', type: 'UNAVAILABLE' },
  { date: '2026-08-22', start: '12:00', end: '15:00', type: 'CUSTOM' }
]
timezone: 'Asia/Kolkata'
```

## **11.2 Double-Booking Prevention** 

- Generate slot candidates from availability rules but treat the booking collection as the final source of truth. 

- Create a unique reservation key such as providerId + startTime + statusBucket, or use a transaction/conditional insert to guarantee one active booking per slot. 

- Temporary payment holds must expire automatically so abandoned checkouts do not block a slot forever. 

- All timestamps stored in UTC; provider/user timezone used only for presentation and schedule generation. 

# **12. Engagement / Service Tracking** 

The engagement begins when a booking is accepted/scheduled and captures service progress without forcing NyayaSetu to become a full legal case-management system in the MVP. 

|**Field / capability**|**MVP design**|
|---|---|
|Engagement status|NOT_STARTED -> ACTIVE -> AWAITING_CLIENT -><br>AWAITING_PROVIDER -> COMPLETED / CANCELLED|
|Milestones|Provider-defned or system-defned lightweight progress items.|
|Updates|Short status updates visible to both parties; sensitive legal narrative<br>should be minimized.|
|Case number / court reference|Optional metadata only when user/provider chooses to add it.|
|Document vault|Not part of MVP. If persistent evidence/documents are added later,<br>introduce private object storage + KMS + case-level authorization.|
|Email progress|Notifcation service can send status-change summaries; emails should<br>not contain sensitive full document content.|



# **13. Payments and Billing** 

NyayaSetu supports both in-app payments and offline settlement. The backend must therefore distinguish a service quote from the settlement method and must never mark a payment successful based only on a frontend redirect. 

|**Concept**|**Behavior**|
|---|---|
|Quote|Provider can quote consultation/service amount, description, validity<br>and optional advance amount.|
|Payment order|Created server-side with gateway adapter; amount/currency copied<br>from approved quote.|
|Webhook|Gateway-signed webhook is the source of truth for<br>PAID/FAILED/REFUNDED transitions.|
|Ofline settlement|Booking/engagement records paymentMethod=OFFLINE and optional<br>provider/client acknowledgement; NyayaSetu does not falsely label it<br>gateway-verifed.|
|Idempotency|Payment/order creation endpoints accept idempotency keys to prevent<br>duplicate charges.|
|Ledger/audit|Store provider, booking, amount, gateway IDs, statuses, webhook<br>events and timestamps; never store raw card data.|



## **Suggested Payment States** 

```
CREATED -> PENDING -> PAID
```

Big Hero 6  |  Engineering Foundation  |  Page _13_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

```
                 -> FAILED
```

```
PAID -> REFUND_PENDING -> REFUNDED
OFFLINE_PENDING -> OFFLINE_RECORDED
```

# **14. Ratings, Reputation and Portfolio** 

Reputation should reward completed, reliable engagements rather than claimed win rates. 

|**Signal**|**Use**|
|---|---|
|Client rating|Allowed only after an eligible completed engagement; one review per<br>booking/engagement.|
|Provider feedback on client|Optional private/internal reliability signal; avoid public shaming.|
|Completion rate|Completed eligible bookings / accepted bookings over a rolling<br>window.|
|Cancellation reliability|Separate provider-caused vs client-caused cancellations.|
|Response reliability|Time to accept/respond to legitimate booking requests; cap impact to<br>prevent gaming.|
|Verifcation tier|Displayed separately and optionally used as a small rank factor.|
|Portfolio|Provider-controlled achievements/experience subject to moderation<br>and clear “self-provided” labeling unless verifed.|
|Blog/community content|Future/optional; separate content moderation subsystem if<br>implemented.|



# **15. Support and Dispute Handling** 

|**Ticket type**|**Examples**|**Backend action**|
|---|---|---|
|Booking issue|Provider did not join, schedule confict.|Freeze relevant workfow if necessary; collect<br>timeline; allow reschedule/cancel according<br>to policy.|
|Payment issue|Duplicate/failed payment, refund request.|Link gateway events; fnance/admin resolution<br>with audit trail.|
|Verifcation complaint|Incorrect profle/credential concern.|Trigger reverifcation fag; hide badge/profle if<br>policy threshold met.|
|Conduct/dispute|Harassment, service disagreement.|Restrict communication if required; preserve<br>audit metadata; escalate to authorized admin.|
|Technical issue|Login/notifcation/API failure.|Standard support triage.|



### **Support ticket states:** 

```
OPEN -> TRIAGED -> WAITING_USER / WAITING_PROVIDER -> UNDER_REVIEW -> RESOLVED -> CLOSED
```

# **16. Notifications** 

|**Event**|**Channels**|**Notes**|
|---|---|---|
|Verifcation result|In-app + email|Do not attach the submitted credential.|
|New booking request|In-app + email/SMS optional|No sensitive legal narrative in notifcation<br>body.|
|Booking confrmed/cancelled|In-app + email|Include date/time, provider/client display<br>name and safe reference ID.|



Big Hero 6  |  Engineering Foundation  |  Page _14_ 



<!-- Start of picture text -->
ranked candidate<br>availability_rules<br>provider_profilesa”<br>Coe)<br>verification_sources Poe<br>s verification_cases<br><!-- End of picture text -->

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

|legal_taxonomy|Category/subcategory/service taxonomy and<br>synonyms.|code unique; active|
|---|---|---|
|match_requests|Structured matching attributes, candidate<br>IDs/scores, privacy-safe metrics.|userId+createdAt; category|
|availability_rules|Recurring weekly provider schedule and exceptions.|providerId unique|
|bookings|Participants, service, slot, status, price/quote refs,<br>cancellation data.|providerId+startTime; userId+createdAt; status|
|engagements|Service progress, milestones, safe updates,<br>completion metadata.|bookingId unique; status|
|payment_quotes|Provider-issued quote and validity.|bookingId; providerId; status|
|payments|Gateway/ofline payment state, amounts, external<br>IDs, webhook state.|gatewayPaymentId unique sparse; bookingId|
|reviews|Eligible post-engagement ratings/feedback.|bookingId+reviewerId unique|
|support_tickets|Disputes/support cases, participants, category,<br>status, admin actions.|userId+createdAt; status|
|notifcations|Delivery jobs and results.|userId+createdAt; status|
|audit_events|Append-only security/business events.|actorId+createdAt; entityType+entityId+createdAt|
|idempotency_keys|Protect write operations/payment requests from<br>duplicates.|key+scope unique; expiresAt TTL|



## **17.2 Provider Profile Example** 

```
{
  "_id": "prov_123",
  "userId": "usr_123",
  "providerType": "ADVOCATE",
  "displayName": "...",
  "verification": {
    "tier": "FULLY_VERIFIED",
    "status": "VERIFIED_FULL",
    "verifiedAt": "...",
    "sourceSummary": ["STATE_BAR_COUNCIL"]
```

- <mark>`}, "services": [{ "category": "PROPERTY", "feeFrom": 1500 }], "locations": [{ "city": "Pune", "mode": "BOTH" }], "languages": ["en", "hi", "mr"], "reputation": { "ratingAvg": 4.7, "reviewCount": 28 }, "visibility": "PUBLIC", "status": "ACTIVE" }`</mark> 

## **17.3 Data Retention Defaults** 

|**Data**|**Default retention direction**|
|---|---|
|Verifcation certifcate fle|Do not persist in MVP; delete after processing.|
|Document hash|Optional; retain with verifcation record if useful.|
|Extracted credential felds|Retain minimum felds needed to prove/check verifcation; classify as<br>sensitive.|
|Raw matching narrative|Discard after structured extraction unless explicit user save feature<br>exists.|
|Match request structure|Retain for user history/product analytics only to the degree needed.|
|Audit/security logs|Retain according to security/compliance policy; access highly<br>restricted.|
|Payment records|Retain gateway/reference metadata according to fnancial/legal<br>requirements; never store card secrets.|



Big Hero 6  |  Engineering Foundation  |  Page _16_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

Case documents 

Not stored in MVP. 

# **18. API Blueprint** 

Base path: /api/v1. JSON only except multipart verification upload and future file endpoints. Every response includes requestId/correlationId on errors. Use consistent pagination and error envelopes. 

## **18.1 Core Endpoints** 

|**Method**|**Path**|**Purpose**|
|---|---|---|
|POST|/auth/google|Exchange/validate Google authentication and create<br>session.|
|POST|/auth/otp/request|Request OTP through confgured provider.|
|POST|/auth/otp/verify|Verify OTP and create session.|
|POST|/auth/refresh|Rotate/refresh session token.|
|GET|/me|Current user profle/roles.|
|POST|/providers|Create provider profle.|
|PATCH|/providers/:id|Update own provider profle.|
|GET|/providers/:id|Public provider profle.|
|GET|/providers|Search/flter providers.|
|POST|/providers/:id/verifcation|Start verifcation; multipart credential upload.|
|GET|/providers/:id/verifcation|Get own verifcation status/summary.|
|POST|/match|Create privacy-minimized matching request and return<br>ranked providers.|
|GET|/taxonomy|Get active legal categories/services.|
|PUT|/providers/:id/availability|Set weekly availability + exceptions.|
|GET|/providers/:id/slots|Get computed available slots.|
|POST|/bookings|Create booking request / reserve slot.|
|GET|/bookings/:id|Get authorized booking.|
|POST|/bookings/:id/accept|Provider accepts booking.|
|POST|/bookings/:id/cancel|Authorized cancellation.|
|POST|/bookings/:id/quotes|Provider issues service quote.|
|POST|/payments/orders|Create payment order from approved quote.|
|POST|/payments/webhooks/:provider|Receive signed gateway webhook.|
|POST|/payments/:id/ofline-ack|Record ofline settlement acknowledgement.|
|GET|/engagements/:id|Get engagement.|
|POST|/engagements/:id/updates|Add safe progress update.|
|POST|/engagements/:id/complete|Complete engagement.|
|POST|/reviews|Submit eligible review.|
|POST|/support/tickets|Open support/dispute ticket.|
|GET|/support/tickets/:id|Get authorized ticket.|
|GET|/notifcations|List own notifcations.|
|POST|/admin/verifcation/:id/decision|Authorized review decision.|
|GET|/admin/audit|Search authorized audit events.|



Big Hero 6  |  Engineering Foundation  |  Page _17_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

## **18.2 Error Envelope** 

```
{
  "error": {
    "code": "BOOKING_SLOT_UNAVAILABLE",
    "message": "The selected slot is no longer available.",
    "details": {},
    "requestId": "req_..."
  }
}
```

## **18.3 API Design Rules** 

- Validate all inputs at route boundary; reject unknown enum values and unexpected object fields where practical. 

- Never return database documents directly; map to response DTOs. 

- Use idempotency keys for payment/order creation and other retry-prone writes. 

- Use 409 for state conflicts, 422 for semantically invalid requests, 403 for authorization, 404 without leaking existence where necessary. 

- Version breaking contracts under /v2 instead of silently changing existing frontend assumptions. 

# **19. Async Jobs and Domain Events** 

The MVP can begin with synchronous execution for lightweight actions, but the architecture should expose jobs/events so verification lookups, notifications, webhook retries and recomputation can move off the request path without rewriting business logic. 

|**Event / Job**|**Producer**|**Consumer / action**|
|---|---|---|
|provider.verifcation.submitted|Verifcation API|Verifcation worker runs extraction, source<br>checks and decision.|
|provider.verifcation.changed|Verifcation module|Update profle summary; notify provider; audit.|
|booking.created|Bookings|Notify provider; schedule expiry if acceptance<br>required.|
|booking.confrmed|Bookings|Create engagement; send calendar-style<br>notifcation.|
|booking.cancelled|Bookings|Release slot; payment/refund workfow if needed.|
|payment.webhook.received|Payment webhook|Verify signature; idempotently update payment;<br>emit paid/failed event.|
|engagement.updated|Engagements|Notify authorized participants.|
|engagement.completed|Engagements|Unlock review eligibility; recompute reputation.|
|support.ticket.created|Support|Notify support/admin queue.|
|provider.reverifcation.due|Scheduler|Set reverifcation state and notify provider.|



# **20. AI Contracts and Guardrails** 

## **20.1 AI Adapter Boundary** 

```
interface AiService {
```

```
  extractVerificationFields(input: SanitizedDocumentInput): Promise<VerificationExtraction>;
  classifyLegalNeed(input: SanitizedLegalNeed): Promise<LegalNeedClassification>;
}
```

- Product modules must not call vendor SDKs directly. All model calls pass through the AI adapter. 

- Model outputs are untrusted input: validate schema, enums, length, confidence and taxonomy references. 

- Use low-temperature/structured JSON mode where available. 

- Do not let AI generate database filters, authorization rules or payment amounts directly. 

- No legal outcome prediction or guaranteed recommendation language. 

- Log model name/version, prompt version, latency, token counts and success/failure metrics without logging raw sensitive text. 

Big Hero 6  |  Engineering Foundation  |  Page _18_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

## **20.2 Agent 1 Guardrails** 

- AI extracts fields and flags inconsistencies; it cannot set FULLY_VERIFIED. 

- Authoritative source mismatch always overrides an AI “looks valid” result. 

- Low readability/confidence triggers resubmission or review, never a guessed field. 

## **20.3 Agent 2 Guardrails** 

- Return only taxonomy codes and matching attributes. 

- If confidence is below threshold or category is ambiguous, ask a clarification question instead of ranking unrelated providers. 

   - The final provider ordering is deterministic and reproducible from stored candidate features/weights. 

- 

# **21. Document and Privacy Architecture** 

## **21.1 MVP Decision: No Permanent Verification Certificate Storage** 

#### **Data-minimizing verification** 

For MVP, the uploaded credential exists only long enough to extract and validate required fields. After the verification attempt, the file is deleted. MongoDB stores the verification result, minimal extracted fields, source references, timestamp and optional hash - not the PDF/image itself. 

## **21.2 Why S3/Object Storage Is Not Required for This MVP** 

- If certificates are not retained and case documents are not part of MVP storage, MongoDB plus ephemeral upload processing is enough. 

- Object storage becomes necessary when the product intentionally introduces persistent client case documents, evidence, agreements or long-lived verification evidence. 

- At that stage, use private object storage, encryption/KMS, short-lived access, malware scanning and case-level authorization; keep only metadata in MongoDB. 

## **21.3 Sensitive Data Classification** 

|**Class**|**Examples**|**Controls**|
|---|---|---|
|Public|Provider display name, public categories,<br>public fee range, verifcation badge.|Normal API controls; moderation.|
|Internal|Match scores, verifcation check statuses,<br>support categories.|Authenticated internal access; least privilege.|
|Sensitive|Enrollment identifers, extracted credential<br>felds, phone/email, payment references.|Encryption in transit/at rest, restricted logs,<br>object-level authorization.|
|Highly sensitive / future case content|Evidence, legal documents, detailed case<br>narratives.|Do not store in MVP; if introduced, dedicated<br>case-vault controls and strict retention.|



# **22. Security Architecture** 

|**Control area**|**Required baseline**|
|---|---|
|Transport|HTTPS/TLS only; secure cookies/tokens; HSTS in production.|
|Secrets|Environment/secret manager; never commit API keys; rotate<br>compromised credentials.|
|Passwords|Avoid local passwords if OAuth/OTP only. If added, use a modern<br>password hash and breach-safe reset fow.|
|Authorization|RBAC + object ownership/assignment checks on every protected<br>resource.|
|Input validation|Schema validation, size limits, sanitization, safe fle MIME/type<br>handling.|



Big Hero 6  |  Engineering Foundation  |  Page _19_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

|Upload security|Allowlist fle formats, size limits, malware scanning, temporary path<br>isolation, guaranteed deletion.|
|---|---|
|Database|Private network where possible, least-privilege DB users, backups,<br>encryption at rest, feld-level encryption only where justifed.|
|Rate limiting|Auth/OTP, matching, upload, search and payment endpoints have<br>appropriate rate limits.|
|CSRF/CORS|Use secure SameSite cookies or bearer strategy consistently; explicit<br>CORS allowlist.|
|Audit|Verifcation decisions, admin actions, authentication anomalies,<br>payment transitions and access-sensitive actions logged.|
|Dependency security|Lockfles, automated vulnerability scanning, regular upgrades.|
|Webhook security|Verify payment/message provider signatures and reject<br>replay/duplicate events.|



## **22.1 Threat Scenarios to Test** 

- Provider edits request to view another provider’s verification details. 

- Citizen changes booking ID to access another citizen’s engagement. 

- Fake payment success callback from browser. 

- Malicious PDF upload, oversized file or polyglot file. 

- Prompt injection text embedded in verification document attempting to influence Agent 1. 

- Repeated OTP abuse or credential stuffing against OAuth/session endpoints. 

- Source-data mismatch intentionally overridden by fabricated AI confidence. 

- Duplicate booking requests race for the same slot. 

# **23. Observability and Audit** 

|**Signal**|**Minimum implementation**|
|---|---|
|Request logs|requestId, method, route template, status, latency, userId (when safe),<br>error code.|
|AI metrics|operation, model, promptVersion, latency, schema-valid fag,<br>token/cost metrics; no raw sensitive input in logs.|
|Verifcation metrics|source availability, match/not-found/confict rates, processing latency,<br>tier distribution.|
|Booking metrics|slot confict rate, conversion, cancellations by cause.|
|Payment metrics|order created, paid, failed, webhook retries, reconciliation<br>mismatches.|
|Notifcation metrics|queued, delivered, failed, retries.|
|Audit trail|append-only domain/security actions with actor, target, timestamp,<br>reason, old/new safe state summary.|
|Health endpoints|/health/live and /health/ready; readiness checks DB and required<br>dependencies carefully.|



# **24. Error Model and Resilience** 

|**Failure**|**Expected behavior**|
|---|---|
|LLM unavailable|Verifcation/matching returns retryable service-unavailable or queues<br>job; never invent result.|
|Oficial source unavailable|Continue document checks; set source status UNAVAILABLE; do not|



Big Hero 6  |  Engineering Foundation  |  Page _20_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

||grant Fully Verifed unless policy allows a separate authoritative path.|
|---|---|
|MongoDB transient error|Retry safe/idempotent reads; avoid blind retries on non-idempotent<br>writes.|
|Payment gateway timeout|Keep payment PENDING; reconcile via webhook/status check; do not<br>charge twice.|
|Notifcation provider failure|Business state remains committed; delivery job retries<br>asynchronously.|
|Slot race|One request succeeds atomically; loser gets 409<br>BOOKING_SLOT_UNAVAILABLE.|
|Malformed AI JSON|Retry once with repair/strict mode if safe; otherwise<br>classifcation/verifcation requires retry or clarifcation.|
|Temporary fle cleanup failure|Security alert + cleanup job; do not silently leave sensitive fles behind.|



# **25. Performance and Scalability** 

## **25.1 MVP Performance Targets** 

|**Operation**|**Target direction**|
|---|---|
|Public provider search|p95 under ~500 ms excluding external AI; indexed DB query.|
|Provider profle|p95 under ~300 ms from API/database.|
|Slot lookup|p95 under ~500 ms for normal schedule windows.|
|Booking creation|p95 under ~800 ms excluding payment.|
|Agent 2 match|Typically a few seconds due to LLM; show frontend progress state.|
|Agent 1 verifcation|Async-capable; external source latency must not block UI indefnitely.|



## **25.2 Scaling Path** 

1.  Scale Node.js instances horizontally behind a load balancer; keep APIs stateless. 

2.  Move retries/long jobs to Redis/BullMQ workers. 

3.  Use MongoDB indexes and projection-first reads; avoid unbounded arrays/documents. 

4.  Cache stable taxonomy/provider-public fragments when beneficial; never cache authorization-sensitive content carelessly. 

5.  If one module becomes independently heavy, extract it only after measuring bottlenecks (likely matching/AI workers or notifications before core CRUD). 

# **26. Testing Strategy** 

|**Layer**|**What to test**|
|---|---|
|Unit|Scoring functions, verifcation tier rules, state transitions, validators,<br>normalization, authorization helpers.|
|Repository/integration|MongoDB indexes/queries, unique slot behavior, idempotency keys,<br>transactions where used.|
|API|Authentication, object-level authorization, validation, status codes,<br>DTO contracts.|
|AI contract|Fixture inputs -> schema-valid outputs; ambiguity, prompt injection,<br>unreadable docs, taxonomy edge cases.|
|Verifcation adapter|Known match/not-found/confict/unavailable fxtures; no network<br>dependency in most CI tests.|



Big Hero 6  |  Engineering Foundation  |  Page _21_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

|Payments|Signed webhook fxtures, duplicate webhooks, order timeout, refund<br>transitions.|
|---|---|
|Security|IDOR/BOLA, rate limits, malicious fle types, oversized requests, token<br>expiry, role escalation attempts.|
|End-to-end|Provider onboarding/verifcation -> citizen match -> booking -><br>payment/ofline -> engagement -> review.|
|Load|Provider search, slot lookup and booking race conditions.|



## **26.1 Critical Acceptance Tests** 

- Agent 1 cannot output Fully Verified when the authoritative current check is missing/conflicting. 

- No verification certificate remains in persistent storage after a completed MVP verification request. 

- Agent 2 raw narrative is not persisted by default. 

- Two concurrent booking requests cannot both acquire the same provider slot. 

- A forged frontend payment-success response cannot move payment to PAID. 

- A user cannot retrieve another user’s booking by changing an ID. 

# **27. Deployment and Environments** 

## **27.1 Environment Model** 

|**Environment**|**Purpose**|**Data**|
|---|---|---|
|Local|Developer machine / Docker Compose.|Synthetic fxtures only.|
|Test/CI|Automated tests.|Ephemeral database; mocked external<br>services.|
|Staging|Integrated frontend/backend/demo rehearsal.|Non-production demo data; separate<br>OAuth/payment sandbox.|
|Production|Real users after security/compliance<br>readiness.|Production MongoDB, managed secrets,<br>monitoring, backups.|



## **27.2 Deployment Topology** 

```
Internet
  -> HTTPS / Load Balancer
      -> NyayaSetu API (stateless Node.js instances)
          -> MongoDB Atlas
          -> Redis/BullMQ (when enabled)
          -> AI API
          -> Auth/OTP provider
          -> Verification source adapters
          -> Payment gateway
          -> Email/SMS provider
```

```
Worker instances consume queue jobs separately when enabled.
```

## **27.3 Backup and Recovery** 

- Enable managed MongoDB backups before production. 

- Document restore procedure and test it periodically. 

- Backups must follow the same access controls and retention policy as live sensitive data. 

- Temporary certificate files must not accidentally enter server snapshots or persistent backup volumes. 

# **28. Repository Structure and Engineering Standards** 

```
src/
  app.ts
  server.ts
  config/
  common/
    errors/
    middleware/
```

Big Hero 6  |  Engineering Foundation  |  Page _22_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

```
    validation/
    auth/
    observability/
  modules/
    auth/
    users/
    providers/
    verification/
    taxonomy/
    matching/
    availability/
    bookings/
    engagements/
    payments/
    reviews/
    support/
    notifications/
    admin/
    audit/
  integrations/
    ai/
    verification-sources/
    payments/
    identity/
    messaging/
  jobs/
  db/
    models/
    migrations-or-seeds/
  tests/
```

## **28.1 Per-Module Pattern** 

```
verification/
  verification.routes.ts
  verification.controller.ts
  verification.service.ts
  verification.repository.ts
  verification.schemas.ts
  verification.types.ts
  verification.rules.ts
  verification.events.ts
  __tests__/
```

- Controllers translate HTTP to use cases; business rules stay in services/domain functions. 

- Repositories are the only layer that knows MongoDB query details. 

- Integrations wrap external vendors and expose provider-neutral interfaces. 

- No module reaches directly into another module’s database collection to mutate it; use service calls/events. 

## **28.2 Configuration / Environment Variables** 

|**Group**|**Examples**|
|---|---|
|Core|NODE_ENV, PORT, APP_BASE_URL, LOG_LEVEL|
|MongoDB|MONGODB_URI, MONGODB_DB|
|Auth|GOOGLE_CLIENT_ID/SECRET, OTP_PROVIDER_*, SESSION_SECRET/JWT<br>keys|
|AI|AI_PROVIDER, AI_API_KEY, AI_MODEL_VERIFICATION,<br>AI_MODEL_MATCHING|
|Queue|REDIS_URL, QUEUE_ENABLED|
|Payments|PAYMENT_PROVIDER, PAYMENT_KEY_ID, PAYMENT_SECRET,<br>WEBHOOK_SECRET|
|Messaging|EMAIL_PROVIDER_*, SMS_PROVIDER_*|
|Security|CORS_ALLOWED_ORIGINS, RATE_LIMIT_*, UPLOAD_MAX_MB,<br>TEMP_UPLOAD_DIR|
|Feature fags|ENABLE_OFFLINE_PAYMENT, ENABLE_MANUAL_REVIEW,|



Big Hero 6  |  Engineering Foundation  |  Page _23_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

ENABLE_CASE_VAULT=false 

# **29. MVP Build Plan** 

|**Phase**|**Deliverables**|**Exit criteria**|
|---|---|---|
|0. Foundation|Repo, TypeScript/Express, MongoDB connection,<br>confg, error model, logging, CI, health checks.|API deploys; tests run; structured errors/logging.|
|1. Identity + Profles|OAuth/OTP, users, citizen/provider roles,<br>provider profle CRUD, taxonomy.|User can onboard and publish safe provider<br>profle.|
|2. Verifcation / Agent 1|Temporary upload pipeline, extraction contract,<br>oficial-data adapter interface, three tiers, audit.|Advocate demo can move Self-Declared -><br>Document/Full based on evidence.|
|3. Matching / Agent 2|Legal-need extraction, taxonomy validation,<br>provider fltering and ranking.|Citizen receives explainable ranked providers;<br>raw text not stored by default.|
|4. Availability + Booking|Weekly schedule, slot generation, atomic<br>booking, lifecycle.|No double booking under concurrency test.|
|5. Engagement + Notifcations|Engagement state, updates, email/in-app<br>notifcations.|Both parties can follow service progress.|
|6. Payments|Quotes, gateway sandbox, webhook truth, ofline<br>settlement.|Paid/ofline fows work end-to-end and are<br>auditable.|
|7. Reviews + Support|Review eligibility, reputation aggregates,<br>support/dispute tickets.|Complete Verify -> Match -> Book -> Serve -><br>Reputation demo.|
|8. Hardening|Security tests, rate limits, privacy checks,<br>backup, monitoring, demo seed data.|SIH demo checklist passes.|



# **30. SIH Demo Flow** 

1.  Provider signs in and chooses Advocate. 

2.  Provider fills professional profile, services, fee range, location and weekly slots. 

3.  Provider submits enrollment certificate. Backend processes it temporarily; Agent 1 extracts name/enrollment details and compares against configured official/demo source. 

4.  Backend assigns Document Verified or Fully Verified according to rule-based evidence; certificate is deleted after processing. 

5.  Citizen signs in and describes a legal requirement in natural language. 

6.  Agent 2 converts the request into structured category/location/budget/service attributes; raw narrative is discarded after use. 

7.  Matching engine retrieves eligible providers and ranks them deterministically. 

8.  Citizen opens provider profile, sees verification tier, fee/reputation/availability and books a slot. 

9.  Provider accepts; consultation/service is tracked through an engagement. 

10.  Payment is completed through gateway sandbox or recorded as offline settlement. 

11.  Provider posts progress/completion update; citizen receives notification. 

12.  After completion, citizen leaves feedback; provider reputation updates. 

#### **Judge-facing technical message** 

NyayaSetu does not ask an LLM to decide who is a genuine lawyer or who is “best.” AI converts unstructured information into structured signals. Verification and ranking are evidence/rule-based, privacy-minimized and auditable. 

# **31. Risks, Open Decisions and Future Evolution** 

|**Area**|**Current blueprint decision**|**Future trigger / open question**|
|---|---|---|
|Current nationwide lawyer data|Use adapter architecture; historical datasets are<br>secondary; authoritative current source required<br>for Full verifcation.|Formal regulator/API partnerships or permitted<br>current APIs.|



Big Hero 6  |  Engineering Foundation  |  Page _24_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

|Manual verifcation|MVP prefers resubmission/no permanent<br>certifcate storage.|If manual review becomes essential, defne<br>encrypted short-retention evidence store.|
|---|---|---|
|Case documents|Not stored in MVP.|Introduce private object storage + KMS + case-<br>level access when case vault is product<br>requirement.|
|Video consultation|Not backend core in v1.|Integrate meeting provider or secure external link<br>when needed.|
|Zero-knowledge credentials|Not required now.|Consider only if trusted authorities issue<br>cryptographically verifable credentials/selective<br>disclosure becomes practical.|
|Microservices|Avoid for MVP.|Extract measured hotspots or independently<br>deployed domains.|
|Custom ML|No model training.|Only consider after enough consented, high-<br>quality labeled data and a measurable problem<br>justifes it.|
|Reputation model|Simple engagement/reliability metrics.|Fairness/gaming analysis before more complex<br>ranking.|
|Provider types|Confg-driven initial list.|Add role-specifc authorities/rules without<br>schema redesign.|



## **31.1 Decisions to Lock Before Production** 

- Exact authoritative verification integrations and legal basis/terms for use. 

- Exact identity/KYC requirements, if any, beyond OAuth/OTP. 

- Payment gateway and commercial settlement model. 

- Data retention schedule, privacy notice, consent model and incident-response process. 

- Whether NyayaSetu will store case documents; if yes, design and threat-model the Secure Case Vault before launch. 

- Operational policy for provider suspensions, complaints and reverification. 

# **Appendix A. State Enums** 

|**Domain**|**Recommended enum**|
|---|---|
|User status|ACTIVE, SUSPENDED, DELETED_PENDING, DELETED|
|Provider status|DRAFT, ACTIVE, HIDDEN, SUSPENDED|
|Verifcation status|DRAFT, SUBMITTED, PROCESSING, VERIFIED_DOCUMENT,<br>VERIFIED_FULL, NEEDS_RESUBMISSION, REVIEW_REQUIRED, REJECTED,<br>REVERIFICATION_REQUIRED|
|Verifcation tier|SELF_DECLARED, DOCUMENT_VERIFIED, FULLY_VERIFIED|
|Source check|MATCH, NOT_FOUND, CONFLICT, UNAVAILABLE|
|Booking|REQUESTED, CONFIRMED, PAYMENT_PENDING, SCHEDULED,<br>IN_PROGRESS, COMPLETED, CANCELLED|
|Engagement|NOT_STARTED, ACTIVE, AWAITING_CLIENT, AWAITING_PROVIDER,<br>COMPLETED, CANCELLED|
|Payment|CREATED, PENDING, PAID, FAILED, REFUND_PENDING, REFUNDED,<br>OFFLINE_PENDING, OFFLINE_RECORDED|
|Support ticket|OPEN, TRIAGED, WAITING_USER, WAITING_PROVIDER, UNDER_REVIEW,<br>RESOLVED, CLOSED|
|Notifcation|QUEUED, SENT, DELIVERED, FAILED, SKIPPED|



# **Appendix B. Sample Payloads** 

Big Hero 6  |  Engineering Foundation  |  Page _25_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

## **B.1 Verification Result** 

```
{
  "verificationId": "ver_123",
  "providerId": "prov_123",
  "status": "VERIFIED_FULL",
  "tier": "FULLY_VERIFIED",
  "checks": {
    "identityConsistency": "PASS",
    "document": "PASS",
    "officialRecord": "MATCH",
    "currentAuthority": "CONFIRMED"
  },
  "sourceSummary": [
    { "source": "STATE_BAR_COUNCIL", "checkedAt": "..." }
  ],
  "certificateStored": false,
  "verifiedAt": "..."
}
```

## **B.2 Match Response** 

```
{
  "requestId": "match_123",
  "interpretedNeed": {
    "category": "PROPERTY",
    "subCategory": "TENANT_DEPOSIT_DISPUTE",
    "city": "Pune",
    "maxFee": 2000
  },
  "providers": [
    {
      "providerId": "prov_10",
      "matchScore": 0.92,
      "reasons": [
        "SPECIALIZATION_MATCH",
        "WITHIN_BUDGET",
        "AVAILABLE_SOON",
        "FULLY_VERIFIED"
      ]
    }
  ]
}
```

## **B.3 Audit Event** 

```
{
  "eventType": "VERIFICATION_TIER_CHANGED",
  "actor": { "type": "SYSTEM", "id": "verification-worker" },
  "entity": { "type": "PROVIDER", "id": "prov_123" },
  "from": "DOCUMENT_VERIFIED",
  "to": "FULLY_VERIFIED",
  "reasonCode": "CURRENT_AUTHORITY_MATCH",
  "requestId": "req_...",
  "createdAt": "..."
}
```

# **Appendix C. Backend Definition of Done** 

☐  API contract documented and runtime-validated. 

- ☐  Authorization rules explicitly tested. 

- ☐  Sensitive fields excluded from logs and public DTOs. 

- ☐  Database indexes defined for production query path. 

- ☐  State transition is deterministic and rejects invalid transitions. 

- ☐  Audit event emitted for security/payment/verification-sensitive actions. 

☐  External integration has timeout, retry/idempotency and failure behavior. 

☐  AI output is schema-validated and cannot directly grant privileged state. 

☐  Privacy/retention behavior is defined and tested. 

- ☐  Unit + integration + API tests pass. 

- ☐  Observability metric/log exists for important failure paths. 

Big Hero 6  |  Engineering Foundation  |  Page _26_ 

NYAYASETU  |  BACKEND BLUEPRINT  |  v1.0 

☐  Frontend can integrate without knowing MongoDB schema. 

# **Final Foundation Summary** 

#### **Backend baseline** 

NyayaSetu v1 should be a modular TypeScript/Node.js backend backed by MongoDB, with evidence-based provider verification, privacy-minimized AI-assisted matching, deterministic ranking, atomic booking, auditable payments, lightweight engagement tracking, reputation based on completed work, and strict authorization. Verification certificates are processed temporarily and deleted in the MVP; persistent case-document storage is a separate future security subsystem, not a hidden dependency of the initial backend. 

_This blueprint is intended to be the source of truth for backend implementation. Changes that alter verification meaning, privacy guarantees, payment truth, booking state or authorization should be recorded as architecture decisions before code and frontend contracts diverge._ 

Big Hero 6  |  Engineering Foundation  |  Page _27_ 

