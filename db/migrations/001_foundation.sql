CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text UNIQUE,
  email text UNIQUE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_grant (
  user_id uuid NOT NULL REFERENCES user_account(id),
  role text NOT NULL CHECK (role IN ('CITIZEN', 'PROVIDER', 'OPERATOR', 'INSTITUTION', 'ADMIN')),
  scope text NOT NULL DEFAULT '',
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role, scope)
);

CREATE TABLE operator_delegation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_user_id uuid NOT NULL REFERENCES user_account(id),
  citizen_user_id uuid NOT NULL REFERENCES user_account(id),
  consent_ref text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (operator_user_id <> citizen_user_id)
);

CREATE TABLE provider (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES user_account(id),
  provider_type text NOT NULL,
  display_name text NOT NULL,
  district text NOT NULL,
  state text NOT NULL,
  languages text[] NOT NULL DEFAULT '{}',
  service_modes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL,
  tier text NOT NULL DEFAULT 'SELF_DECLARED'
    CHECK (tier IN ('SELF_DECLARED', 'DOCUMENT_VERIFIED', 'FULLY_VERIFIED')),
  tier_decided_at timestamptz
);

CREATE TABLE provider_service (
  provider_id uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  taxonomy_code text NOT NULL,
  fee_min numeric(14,2) NOT NULL CHECK (fee_min >= 0),
  fee_max numeric(14,2) NOT NULL CHECK (fee_max >= fee_min),
  pro_bono_available boolean NOT NULL DEFAULT false,
  PRIMARY KEY (provider_id, taxonomy_code)
);

CREATE TABLE verification_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES provider(id),
  status text NOT NULL,
  tier_outcome text CHECK (
    tier_outcome IS NULL OR tier_outcome IN ('SELF_DECLARED', 'DOCUMENT_VERIFIED', 'FULLY_VERIFIED')
  ),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES user_account(id)
);

CREATE TABLE verification_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES verification_case(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  source_id text NOT NULL,
  source_mode text NOT NULL CHECK (source_mode IN ('LIVE', 'MOCK', 'OFF')),
  result text NOT NULL CHECK (result IN ('PASS', 'MISMATCH', 'NOT_FOUND', 'CONFLICT', 'UNAVAILABLE')),
  matched_fields text[] NOT NULL DEFAULT '{}',
  source_ref text,
  valid_until timestamptz,
  demo_only boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL,
  CHECK ((source_mode = 'MOCK') = demo_only),
  CHECK (source_mode <> 'OFF' OR result = 'UNAVAILABLE')
);

CREATE TABLE need_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_user_id uuid NOT NULL REFERENCES user_account(id),
  operator_delegation_id uuid REFERENCES operator_delegation(id),
  taxonomy_code text NOT NULL,
  district text NOT NULL,
  language text NOT NULL,
  mode_pref text NOT NULL,
  fee_ceiling numeric(14,2) CHECK (fee_ceiling IS NULL OR fee_ceiling >= 0),
  urgency text NOT NULL,
  channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE need_request IS
  'Metadata-only request. Raw intake narrative is never persisted.';

CREATE TABLE eligibility_decision (
  need_request_id uuid PRIMARY KEY REFERENCES need_request(id) ON DELETE CASCADE,
  section12_category text,
  self_declared boolean NOT NULL,
  route text NOT NULL CHECK (route IN ('PAID', 'LEGAL_AID_REFERRAL', 'PRO_BONO_ROTATION')),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district text NOT NULL,
  taxonomy_code text NOT NULL,
  provider_type text NOT NULL,
  mode text NOT NULL CHECK (mode = 'ROTATION')
);

CREATE TABLE roster_membership (
  roster_id uuid NOT NULL REFERENCES roster(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
  status text NOT NULL,
  capacity integer NOT NULL CHECK (capacity >= 0),
  active_matters integer NOT NULL DEFAULT 0 CHECK (active_matters >= 0),
  last_assigned_at timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  conflict_blocked boolean NOT NULL DEFAULT false,
  PRIMARY KEY (roster_id, provider_id),
  CHECK (active_matters <= capacity)
);

CREATE TABLE allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_request_id uuid NOT NULL UNIQUE REFERENCES need_request(id),
  provider_id uuid NOT NULL REFERENCES provider(id),
  mode text NOT NULL CHECK (mode IN ('CITIZEN_CHOICE', 'ROTATION')),
  roster_id uuid REFERENCES roster(id),
  seed text,
  position integer CHECK (position IS NULL OR position > 0),
  decided_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid NOT NULL REFERENCES user_account(id),
  CHECK ((mode = 'ROTATION') = (roster_id IS NOT NULL)),
  CHECK (mode <> 'CITIZEN_CHOICE' OR seed IS NOT NULL)
);

CREATE TABLE directory_surface (
  need_request_id uuid NOT NULL REFERENCES need_request(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES provider(id),
  position integer NOT NULL CHECK (position > 0),
  seed text NOT NULL,
  surfaced_count_snapshot bigint NOT NULL CHECK (surfaced_count_snapshot >= 0),
  PRIMARY KEY (need_request_id, provider_id),
  UNIQUE (need_request_id, position)
);

CREATE TABLE provider_surface_counter (
  provider_id uuid PRIMARY KEY REFERENCES provider(id) ON DELETE CASCADE,
  surfaced_count bigint NOT NULL DEFAULT 0 CHECK (surfaced_count >= 0)
);

-- The blueprint references booking and gives the exclusion constraint but omits the table.
-- This minimal shape exists only to realize that constraint; hold expiry remains a policy gap.
CREATE TABLE booking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_request_id uuid NOT NULL REFERENCES need_request(id),
  provider_id uuid NOT NULL REFERENCES provider(id),
  citizen_user_id uuid NOT NULL REFERENCES user_account(id),
  slot tstzrange NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT isempty(slot)),
  CHECK (lower_inc(slot) AND NOT upper_inc(slot))
);

ALTER TABLE booking ADD CONSTRAINT no_double_book
  EXCLUDE USING gist (provider_id WITH =, slot WITH &&)
  WHERE (status IN ('HELD', 'CONFIRMED', 'SCHEDULED'));

CREATE TABLE matter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL UNIQUE REFERENCES allocation(id),
  provider_id uuid NOT NULL REFERENCES provider(id),
  citizen_user_id uuid NOT NULL REFERENCES user_account(id),
  status text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_reason text,
  cnr_number text
);

COMMENT ON TABLE matter IS
  'Metadata only: no narrative, documents, evidence, advice, correspondence, or engagement updates.';

CREATE TABLE payment_quote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matter(id),
  provider_id uuid NOT NULL REFERENCES provider(id),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  fee_breakdown_json jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_intent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matter(id),
  payment_provider text NOT NULL,
  provider_intent_ref text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_provider, provider_intent_ref)
);

CREATE TABLE payment_webhook_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_provider text NOT NULL,
  external_event_id text NOT NULL,
  signature_valid boolean NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (payment_provider, external_event_id)
);

CREATE TABLE settlement_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id uuid NOT NULL REFERENCES payment_intent(id),
  external_settlement_ref text NOT NULL,
  status text NOT NULL,
  settled_at timestamptz,
  failure_code text,
  UNIQUE (payment_intent_id, external_settlement_ref)
);

CREATE TABLE offline_payment_acknowledgement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matter_id uuid NOT NULL REFERENCES matter(id),
  recorded_by uuid NOT NULL REFERENCES user_account(id),
  external_reference text,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_event (
  id bigserial PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES provider(id),
  event_type text NOT NULL CHECK (event_type IN (
    'PRO_BONO_MATTER_CLOSED',
    'LEGAL_AID_TIER_MATTER_CLOSED',
    'ASPIRATIONAL_BLOCK_SERVICE',
    'ROTATION_DUTY_COMPLETED',
    'FIRST_RESPONSE_SLA_MET',
    'CLE_MODULE_COMPLETED',
    'LOK_ADALAT_SETTLEMENT'
  )),
  units numeric NOT NULL,
  weight_version text NOT NULL,
  credits numeric NOT NULL,
  matter_id uuid REFERENCES matter(id),
  evidence_ref text NOT NULL,
  occurred_at timestamptz NOT NULL,
  hash_version smallint NOT NULL DEFAULT 1,
  prev_hash bytea,
  hash bytea NOT NULL
);

CREATE TABLE credit_balance (
  provider_id uuid PRIMARY KEY REFERENCES provider(id),
  total_credits numeric NOT NULL DEFAULT 0,
  period_credits numeric NOT NULL DEFAULT 0,
  last_event_id bigint REFERENCES credit_event(id)
);

CREATE TABLE redemption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES provider(id),
  kind text NOT NULL CHECK (kind IN (
    'SERVICE_RECORD_EXPORT',
    'PANEL_APPLICATION_EVIDENCE_PACKET',
    'RECOGNITION_ELIGIBILITY_PACKET',
    'CLE_ACTIVITY_RECORD'
  )),
  credits_spent numeric NOT NULL CHECK (credits_spent >= 0),
  artefact_ref text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conduct_signal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES provider(id),
  matter_id uuid REFERENCES matter(id),
  signal_type text NOT NULL CHECK (signal_type IN (
    'FIRST_RESPONSE_MINUTES',
    'NO_SHOW',
    'FEE_DISCLOSED_UPFRONT',
    'QUOTE_HONOURED',
    'UNILATERAL_WITHDRAWAL'
  )),
  value jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE grievance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complainant_user_id uuid NOT NULL REFERENCES user_account(id),
  subject_provider_id uuid NOT NULL REFERENCES provider(id),
  category text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN',
    'TRIAGED',
    'PLATFORM_RESOLVED',
    'REFERRED_TO_BAR_COUNCIL',
    'REFERRED_TO_DLSA'
  )),
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE disciplinary_referral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id uuid NOT NULL REFERENCES grievance(id),
  bar_council_code text NOT NULL,
  referred_at timestamptz NOT NULL DEFAULT now(),
  external_ref text,
  outcome text
);

CREATE TABLE audit_event (
  id bigserial PRIMARY KEY,
  actor_type text NOT NULL,
  actor_id uuid NOT NULL,
  on_behalf_of_user_id uuid,
  delegation_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before_summary jsonb,
  after_summary jsonb,
  reason_code text,
  request_id text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION reject_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER credit_event_append_only
BEFORE UPDATE OR DELETE ON credit_event
FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE TRIGGER audit_event_append_only
BEFORE UPDATE OR DELETE ON audit_event
FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE INDEX verification_case_provider_idx ON verification_case(provider_id, submitted_at DESC);
CREATE INDEX need_request_citizen_idx ON need_request(citizen_user_id, created_at DESC);
CREATE INDEX roster_lookup_idx ON roster(district, taxonomy_code, provider_type);
CREATE INDEX matter_provider_idx ON matter(provider_id, opened_at DESC);
CREATE INDEX credit_event_provider_idx ON credit_event(provider_id, id);
CREATE INDEX conduct_signal_provider_idx ON conduct_signal(provider_id, recorded_at DESC);
CREATE INDEX grievance_subject_idx ON grievance(subject_provider_id, opened_at DESC);
CREATE INDEX audit_entity_idx ON audit_event(entity_type, entity_id, at DESC);
