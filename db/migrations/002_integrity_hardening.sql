ALTER TABLE audit_event
  ADD CONSTRAINT audit_actor_type_check CHECK (
    actor_type IN ('CITIZEN', 'PROVIDER', 'OPERATOR', 'INSTITUTION', 'ADMIN')
  ),
  ADD CONSTRAINT audit_actor_fk FOREIGN KEY (actor_id) REFERENCES user_account(id),
  ADD CONSTRAINT audit_on_behalf_fk FOREIGN KEY (on_behalf_of_user_id) REFERENCES user_account(id),
  ADD CONSTRAINT audit_delegation_fk FOREIGN KEY (delegation_id) REFERENCES operator_delegation(id);

CREATE TABLE auth_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  token_digest bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX auth_session_active_lookup
  ON auth_session(token_digest, expires_at) WHERE revoked_at IS NULL;

ALTER TABLE need_request
  ADD COLUMN directory_provider_type text,
  ADD COLUMN directory_generated_at timestamptz,
  ADD COLUMN directory_minimum_tier text CHECK (
    directory_minimum_tier IS NULL OR
    directory_minimum_tier IN ('SELF_DECLARED', 'DOCUMENT_VERIFIED', 'FULLY_VERIFIED')
  );

ALTER TABLE directory_surface
  ADD COLUMN provider_snapshot jsonb,
  ADD COLUMN filter_snapshot jsonb;

ALTER TABLE roster
  ADD COLUMN minimum_tier text CHECK (
    minimum_tier IS NULL OR minimum_tier IN ('SELF_DECLARED', 'DOCUMENT_VERIFIED', 'FULLY_VERIFIED')
  );

ALTER TABLE booking ADD COLUMN allocation_id uuid REFERENCES allocation(id);
UPDATE booking b
SET allocation_id = a.id
FROM allocation a
WHERE a.need_request_id = b.need_request_id;
ALTER TABLE booking ALTER COLUMN allocation_id SET NOT NULL;
ALTER TABLE booking ADD CONSTRAINT booking_allocation_unique UNIQUE (allocation_id);

ALTER TABLE allocation
  ADD COLUMN status text NOT NULL DEFAULT 'ASSIGNED'
    CHECK (status IN ('ASSIGNED', 'DECLINED', 'CANCELLED', 'COMPLETED')),
  ADD COLUMN ended_at timestamptz,
  ADD COLUMN decline_reason text;
ALTER TABLE allocation DROP CONSTRAINT allocation_need_request_id_key;
CREATE UNIQUE INDEX allocation_one_active_per_need
  ON allocation(need_request_id) WHERE status = 'ASSIGNED';

ALTER TABLE conduct_signal DROP CONSTRAINT conduct_signal_signal_type_check;
ALTER TABLE conduct_signal ADD CONSTRAINT conduct_signal_signal_type_check CHECK (signal_type IN (
  'FIRST_RESPONSE_MINUTES',
  'NO_SHOW',
  'FEE_DISCLOSED_UPFRONT',
  'QUOTE_HONOURED',
  'UNILATERAL_WITHDRAWAL',
  'ROTATION_DECLINE'
));

CREATE TABLE institutional_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_user_id uuid NOT NULL REFERENCES user_account(id),
  provider_id uuid NOT NULL REFERENCES provider(id),
  scope text NOT NULL,
  consent_ref text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > valid_from),
  UNIQUE (institution_user_id, provider_id, scope, consent_ref)
);

CREATE TABLE institutional_roster_grant (
  institution_user_id uuid NOT NULL REFERENCES user_account(id),
  roster_id uuid NOT NULL REFERENCES roster(id),
  scope text NOT NULL CHECK (scope IN ('rosters:read', 'rosters:allocate')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (institution_user_id, roster_id, scope),
  CHECK (expires_at > granted_at),
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE OR REPLACE FUNCTION ledger_hash_field(value bytea)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT int4send(octet_length(value)) || value
$$;

CREATE OR REPLACE FUNCTION append_credit_event(
  p_provider_id uuid,
  p_event_type text,
  p_units numeric,
  p_weight_version text,
  p_credits numeric,
  p_matter_id uuid,
  p_evidence_ref text,
  p_occurred_at timestamptz,
  p_actor_type text,
  p_actor_id uuid,
  p_on_behalf_of_user_id uuid,
  p_delegation_id uuid,
  p_request_id text
)
RETURNS TABLE(event_id bigint, event_hash bytea)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_last_event_id bigint;
  v_previous_hash bytea;
  v_event_id bigint;
  v_event_hash bytea;
  v_payload bytea;
  v_credits_text text;
BEGIN
  SELECT cb.last_event_id INTO v_last_event_id
  FROM public.credit_balance cb
  WHERE cb.provider_id = p_provider_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider ledger head is missing' USING ERRCODE = 'P0002';
  END IF;

  IF v_last_event_id IS NULL THEN
    v_previous_hash := decode(repeat('00', 32), 'hex');
  ELSE
    SELECT ce.hash INTO STRICT v_previous_hash
    FROM public.credit_event ce
    WHERE ce.id = v_last_event_id AND ce.provider_id = p_provider_id;
  END IF;

  v_event_id := nextval(pg_get_serial_sequence('public.credit_event', 'id'));
  v_credits_text := p_credits::text;
  v_payload :=
    public.ledger_hash_field(convert_to('v1', 'UTF8')) ||
    public.ledger_hash_field(v_previous_hash) ||
    public.ledger_hash_field(convert_to(v_event_id::text, 'UTF8')) ||
    public.ledger_hash_field(convert_to(p_provider_id::text, 'UTF8')) ||
    public.ledger_hash_field(convert_to(p_event_type, 'UTF8')) ||
    public.ledger_hash_field(convert_to(v_credits_text, 'UTF8')) ||
    public.ledger_hash_field(convert_to(
      to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'UTF8'
    ));
  v_event_hash := digest(v_payload, 'sha256');

  INSERT INTO public.credit_event(
    id, provider_id, event_type, units, weight_version, credits, matter_id,
    evidence_ref, occurred_at, hash_version, prev_hash, hash
  ) VALUES (
    v_event_id, p_provider_id, p_event_type, p_units, p_weight_version, p_credits, p_matter_id,
    p_evidence_ref, p_occurred_at, 1,
    CASE WHEN v_last_event_id IS NULL THEN NULL ELSE v_previous_hash END,
    v_event_hash
  );

  UPDATE public.credit_balance
  SET total_credits = total_credits + p_credits,
      period_credits = period_credits + p_credits,
      last_event_id = v_event_id
  WHERE provider_id = p_provider_id;

  INSERT INTO public.audit_event(
    actor_type, actor_id, on_behalf_of_user_id, delegation_id,
    action, entity_type, entity_id, after_summary, request_id
  ) VALUES (
    p_actor_type, p_actor_id, p_on_behalf_of_user_id, p_delegation_id,
    'credit_event.appended', 'credit_event', v_event_id::text,
    jsonb_build_object(
      'providerId', p_provider_id,
      'eventType', p_event_type,
      'credits', v_credits_text,
      'weightVersion', p_weight_version
    ),
    p_request_id
  );

  RETURN QUERY SELECT v_event_id, v_event_hash;
END;
$$;

REVOKE ALL ON FUNCTION append_credit_event(
  uuid, text, numeric, text, numeric, uuid, text, timestamptz,
  text, uuid, uuid, uuid, text
)
  FROM PUBLIC;

CREATE OR REPLACE FUNCTION enforce_zero_initial_credit_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.total_credits <> 0 OR NEW.period_credits <> 0 OR NEW.last_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Initial credit balance must be zero' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER credit_balance_zero_initial
BEFORE INSERT ON credit_balance
FOR EACH ROW EXECUTE FUNCTION enforce_zero_initial_credit_balance();
