ALTER TABLE provider
  ADD COLUMN tier_expires_at timestamptz;

-- Legacy FULLY_VERIFIED rows may not have a trustworthy expiry. The constraint is enforced for
-- every new/updated row immediately; validation is deferred only when legacy cleanup is required.
ALTER TABLE provider
  ADD CONSTRAINT provider_fully_verified_expiry_check CHECK (
    tier <> 'FULLY_VERIFIED' OR (
      tier_decided_at IS NOT NULL
      AND tier_expires_at IS NOT NULL
      AND tier_expires_at > tier_decided_at
    )
  ) NOT VALID;

CREATE INDEX provider_fully_verified_revalidation_idx
  ON provider(tier_expires_at, tier_decided_at, id)
  WHERE tier = 'FULLY_VERIFIED';

ALTER TABLE verification_check
  ADD COLUMN recorded_sequence bigint GENERATED ALWAYS AS IDENTITY,
  ADD CONSTRAINT verification_check_recorded_sequence_unique UNIQUE (recorded_sequence);

ALTER TABLE verification_case
  ADD COLUMN policy_version text,
  ADD COLUMN policy_snapshot jsonb,
  ADD COLUMN decision_reasons text[] NOT NULL DEFAULT '{}',
  ADD COLUMN tier_expires_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM verification_case WHERE status <> 'REVIEW_REQUIRED'
  ) THEN
    RAISE EXCEPTION
      'Legacy verification decisions require authoritative policy metadata before migration 004';
  END IF;
END;
$$;

-- Preserve every historical case while deterministically retaining only the newest active review.
WITH ranked_review AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY provider_id ORDER BY submitted_at DESC, id DESC
         ) AS review_position
  FROM verification_case
  WHERE status = 'REVIEW_REQUIRED'
)
UPDATE verification_case verification
SET status = 'SUPERSEDED'
FROM ranked_review ranked
WHERE verification.id = ranked.id AND ranked.review_position > 1;

ALTER TABLE verification_case
  ADD CONSTRAINT verification_case_expiry_tier_check CHECK (
    tier_expires_at IS NULL OR tier_outcome = 'FULLY_VERIFIED'
  ),
  ADD CONSTRAINT verification_case_decision_shape_check CHECK (
    (
      status IN ('REVIEW_REQUIRED', 'SUPERSEDED')
      AND tier_outcome IS NULL
      AND decided_at IS NULL
      AND decided_by IS NULL
      AND policy_version IS NULL
      AND policy_snapshot IS NULL
      AND cardinality(decision_reasons) = 0
      AND tier_expires_at IS NULL
    ) OR (
      status = 'DECIDED'
      AND tier_outcome IS NOT NULL
      AND decided_at IS NOT NULL
      AND decided_by IS NOT NULL
      AND policy_version IS NOT NULL
      AND policy_snapshot IS NOT NULL
      AND cardinality(decision_reasons) > 0
      AND (
        (tier_outcome = 'FULLY_VERIFIED' AND tier_expires_at > decided_at)
        OR (tier_outcome <> 'FULLY_VERIFIED' AND tier_expires_at IS NULL)
      )
    )
  );

CREATE UNIQUE INDEX verification_case_one_active_review
  ON verification_case(provider_id)
  WHERE status = 'REVIEW_REQUIRED';

CREATE TABLE credential_policy (
  provider_type text NOT NULL,
  version text NOT NULL,
  policy_snapshot jsonb NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_type, version),
  CHECK (btrim(provider_type) <> ''),
  CHECK (btrim(version) <> ''),
  CHECK (jsonb_typeof(policy_snapshot) = 'object'),
  CHECK (jsonb_typeof(policy_snapshot -> 'providerType') = 'string'),
  CHECK (jsonb_typeof(policy_snapshot -> 'version') = 'string'),
  CHECK (policy_snapshot ? 'providerType' AND policy_snapshot ->> 'providerType' = provider_type),
  CHECK (policy_snapshot ? 'version' AND policy_snapshot ->> 'version' = version)
);

CREATE UNIQUE INDEX credential_policy_one_active_per_provider_type
  ON credential_policy(provider_type)
  WHERE active;

CREATE OR REPLACE FUNCTION protect_credential_policy_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.provider_type IS DISTINCT FROM OLD.provider_type
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Credential policy snapshots are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER credential_policy_snapshot_immutable
BEFORE UPDATE ON credential_policy
FOR EACH ROW EXECUTE FUNCTION protect_credential_policy_snapshot();

CREATE OR REPLACE FUNCTION reject_decided_verification_case_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('DECIDED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'Historical verification cases are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_case_decided_immutable
BEFORE UPDATE OR DELETE ON verification_case
FOR EACH ROW EXECUTE FUNCTION reject_decided_verification_case_change();

CREATE TRIGGER verification_check_append_only
BEFORE UPDATE OR DELETE ON verification_check
FOR EACH ROW EXECUTE FUNCTION reject_append_only_change();

CREATE OR REPLACE FUNCTION finalize_verification_case(
  p_case_id uuid,
  p_provider_id uuid,
  p_expected_policy_version text,
  p_decided_at timestamptz,
  p_decided_by uuid,
  p_request_id text
)
RETURNS TABLE(tier_outcome text, tier_expires_at timestamptz, decision_reasons text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_case record;
  v_provider record;
  v_policy jsonb;
  v_policy_version text;
  v_freshness_numeric numeric;
  v_freshness_ms bigint;
  v_freshness interval;
  v_conflict boolean;
  v_documents_complete boolean;
  v_identity_complete boolean;
  v_authority_complete boolean;
  v_document_expiry timestamptz;
  v_identity_expiry timestamptz;
  v_authority_expiry timestamptz;
BEGIN
  IF p_decided_at IS NULL OR p_request_id IS NULL OR btrim(p_request_id) = '' THEN
    RAISE EXCEPTION 'Decision time and request id are required' USING ERRCODE = '22023';
  END IF;
  IF p_decided_at < transaction_timestamp() - interval '5 minutes'
     OR p_decided_at > transaction_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Credential decision time is outside the trusted request window'
      USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.role_grant role_row
    WHERE role_row.user_id = p_decided_by
      AND role_row.role = 'ADMIN'
      AND role_row.scope = 'credentials:review'
  ) THEN
    RAISE EXCEPTION 'Credential decision requires an ADMIN credentials:review grant'
      USING ERRCODE = '42501';
  END IF;

  SELECT verification.id, verification.provider_id, verification.status,
         verification.tier_outcome
  INTO v_case
  FROM public.verification_case verification
  WHERE verification.id = p_case_id
  FOR UPDATE;
  IF NOT FOUND OR v_case.provider_id <> p_provider_id THEN
    RAISE EXCEPTION 'Verification case was not found for provider' USING ERRCODE = 'P0002';
  END IF;
  IF v_case.status <> 'REVIEW_REQUIRED' OR v_case.tier_outcome IS NOT NULL THEN
    RAISE EXCEPTION 'Verification case is not active' USING ERRCODE = '55000';
  END IF;

  SELECT provider.provider_type, provider.tier, provider.tier_expires_at
  INTO v_provider
  FROM public.provider provider
  WHERE provider.id = p_provider_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provider was not found for credential decision' USING ERRCODE = 'P0002';
  END IF;

  SELECT policy.version, policy.policy_snapshot
  INTO v_policy_version, v_policy
  FROM public.credential_policy policy
  WHERE policy.provider_type = v_provider.provider_type AND policy.active
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active credential policy exists for provider type' USING ERRCODE = 'P0002';
  END IF;
  IF p_expected_policy_version IS DISTINCT FROM v_policy_version THEN
    RAISE EXCEPTION 'Active credential policy version changed' USING ERRCODE = '40001';
  END IF;

  IF jsonb_typeof(v_policy) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_policy -> 'version') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_policy -> 'providerType') IS DISTINCT FROM 'string'
     OR jsonb_typeof(v_policy -> 'sources') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_policy -> 'requiredDocumentLegs') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_policy -> 'identityConsistencyLeg') IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_policy -> 'currentAuthorityLegs') IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_policy -> 'currentAuthorityFreshnessMs') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Active credential policy shape is invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_policy -> 'sources') = 0
     OR jsonb_array_length(v_policy -> 'requiredDocumentLegs') = 0
     OR jsonb_array_length(v_policy -> 'currentAuthorityLegs') = 0
     OR COALESCE((v_policy ->> 'currentAuthorityFreshnessMs') !~ '^[1-9][0-9]*$', true) THEN
    RAISE EXCEPTION 'Active credential policy cannot contain empty required configuration'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_policy -> 'sources') source
    WHERE jsonb_typeof(source) IS DISTINCT FROM 'object'
  ) OR EXISTS (
    WITH policy_legs AS (
      SELECT leg FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
      UNION ALL SELECT v_policy -> 'identityConsistencyLeg'
      UNION ALL SELECT leg FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    )
    SELECT 1 FROM policy_legs WHERE jsonb_typeof(leg) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'Active credential policy entries must be objects' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v_policy)) <> 7
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(v_policy) policy_key
       WHERE policy_key NOT IN (
         'version', 'providerType', 'sources', 'requiredDocumentLegs',
         'identityConsistencyLeg', 'currentAuthorityLegs', 'currentAuthorityFreshnessMs'
       )
     ) OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_policy -> 'sources') source
       WHERE (SELECT count(*) FROM jsonb_object_keys(source)) <> 2
          OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(source) source_key
            WHERE source_key NOT IN ('sourceId', 'evidenceKind')
          )
     ) OR EXISTS (
       WITH policy_legs AS (
         SELECT leg FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
         UNION ALL SELECT v_policy -> 'identityConsistencyLeg'
         UNION ALL SELECT leg FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
       )
       SELECT 1 FROM policy_legs
       WHERE (SELECT count(*) FROM jsonb_object_keys(leg)) <> 2
          OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(leg) leg_key
            WHERE leg_key NOT IN ('checkType', 'allowedSourceIds')
          )
     ) THEN
    RAISE EXCEPTION 'Active credential policy contains unexpected fields'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_policy -> 'sources') source
    WHERE jsonb_typeof(source -> 'sourceId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(source -> 'evidenceKind') IS DISTINCT FROM 'string'
  ) OR EXISTS (
    WITH policy_legs AS (
      SELECT leg FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
      UNION ALL SELECT v_policy -> 'identityConsistencyLeg'
      UNION ALL SELECT leg FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    )
    SELECT 1 FROM policy_legs
    WHERE jsonb_typeof(leg -> 'checkType') IS DISTINCT FROM 'string'
       OR jsonb_typeof(leg -> 'allowedSourceIds') IS DISTINCT FROM 'array'
  ) THEN
    RAISE EXCEPTION 'Active credential policy field types are invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    WITH policy_legs AS (
      SELECT leg FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
      UNION ALL SELECT v_policy -> 'identityConsistencyLeg'
      UNION ALL SELECT leg FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    )
    SELECT 1 FROM policy_legs
    CROSS JOIN LATERAL jsonb_array_elements(leg -> 'allowedSourceIds') source_id
    WHERE jsonb_typeof(source_id) IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'Credential policy source identifiers must be strings'
      USING ERRCODE = '22023';
  END IF;
  v_freshness_numeric := (v_policy ->> 'currentAuthorityFreshnessMs')::numeric;
  IF v_freshness_numeric > 3162240000000 THEN
    RAISE EXCEPTION 'Credential freshness exceeds the supported integer range'
      USING ERRCODE = '22023';
  END IF;
  v_freshness_ms := v_freshness_numeric::bigint;
  v_freshness := v_freshness_ms::double precision * interval '1 millisecond';
  BEGIN
    PERFORM p_decided_at - v_freshness;
    PERFORM p_decided_at + v_freshness;
  EXCEPTION WHEN datetime_field_overflow THEN
    RAISE EXCEPTION 'Credential freshness exceeds the timestamp range'
      USING ERRCODE = '22008';
  END;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_policy -> 'sources') source
    WHERE source ->> 'sourceId' IS NULL OR btrim(source ->> 'sourceId') = ''
  ) OR EXISTS (
    SELECT source ->> 'sourceId'
    FROM jsonb_array_elements(v_policy -> 'sources') source
    GROUP BY source ->> 'sourceId'
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_policy -> 'sources') source
    WHERE source ->> 'evidenceKind' IS NULL OR source ->> 'evidenceKind' NOT IN (
      'ISSUER', 'AUTHORITY', 'MANUAL_DOCUMENT', 'FORMAT_VALIDATION', 'LLM_ADVISORY'
    )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
    WHERE leg ->> 'checkType' IS NULL OR btrim(leg ->> 'checkType') = ''
  ) OR EXISTS (
    SELECT leg ->> 'checkType'
    FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
    GROUP BY leg ->> 'checkType'
    HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    WHERE leg ->> 'checkType' IS NULL OR btrim(leg ->> 'checkType') = ''
  ) OR EXISTS (
    SELECT leg ->> 'checkType'
    FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    GROUP BY leg ->> 'checkType'
    HAVING count(*) > 1
  ) OR v_policy #>> '{identityConsistencyLeg,checkType}' IS NULL
    OR btrim(v_policy #>> '{identityConsistencyLeg,checkType}') = '' THEN
    RAISE EXCEPTION 'Active credential policy identifiers are invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') required_leg
    WHERE required_leg ->> 'checkType' = v_policy #>> '{identityConsistencyLeg,checkType}'
      AND NOT EXISTS (
        SELECT identity_source.source_id
        FROM jsonb_array_elements_text(
          v_policy #> '{identityConsistencyLeg,allowedSourceIds}'
        ) identity_source(source_id)
        EXCEPT
        SELECT required_source.source_id
        FROM jsonb_array_elements_text(
          required_leg -> 'allowedSourceIds'
        ) required_source(source_id)
      )
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') authority_leg
    WHERE authority_leg ->> 'checkType' = v_policy #>> '{identityConsistencyLeg,checkType}'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') required_leg
         WHERE required_leg ->> 'checkType' = authority_leg ->> 'checkType'
       )
  ) THEN
    RAISE EXCEPTION 'Credential identity/document reuse or authority-leg separation is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    WITH all_legs AS (
      SELECT leg FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
      UNION ALL SELECT v_policy -> 'identityConsistencyLeg'
      UNION ALL SELECT leg FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    )
    SELECT 1 FROM all_legs
    WHERE jsonb_typeof(leg -> 'allowedSourceIds') IS DISTINCT FROM 'array'
       OR jsonb_array_length(leg -> 'allowedSourceIds') = 0
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
         LEFT JOIN jsonb_array_elements(v_policy -> 'sources') source
           ON source ->> 'sourceId' = allowed.source_id
         WHERE btrim(allowed.source_id) = '' OR source IS NULL
       )
       OR (
         SELECT count(*) FROM jsonb_array_elements_text(leg -> 'allowedSourceIds')
       ) <> (
         SELECT count(DISTINCT source_id)
         FROM jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
       )
  ) THEN
    RAISE EXCEPTION 'Active credential policy source mapping is invalid' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    WITH document_legs AS (
      SELECT leg FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
      UNION ALL SELECT v_policy -> 'identityConsistencyLeg'
    )
    SELECT 1
    FROM document_legs
    CROSS JOIN LATERAL jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
    JOIN LATERAL jsonb_array_elements(v_policy -> 'sources') source
      ON source ->> 'sourceId' = allowed.source_id
    WHERE source ->> 'evidenceKind' IN ('FORMAT_VALIDATION', 'LLM_ADVISORY')
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    CROSS JOIN LATERAL jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
    JOIN LATERAL jsonb_array_elements(v_policy -> 'sources') source
      ON source ->> 'sourceId' = allowed.source_id
    WHERE source ->> 'evidenceKind' <> 'AUTHORITY'
  ) THEN
    RAISE EXCEPTION 'Active credential policy assigns a non-contributing source'
      USING ERRCODE = '22023';
  END IF;

  WITH latest AS (
    SELECT DISTINCT ON (check_row.check_type, check_row.source_id)
           check_row.check_type, check_row.source_id, check_row.source_mode,
           check_row.result, check_row.checked_at
    FROM public.verification_check check_row
    WHERE check_row.case_id = p_case_id
      AND check_row.source_mode = 'LIVE'
      AND check_row.checked_at <= p_decided_at
    ORDER BY check_row.check_type, check_row.source_id, check_row.recorded_sequence DESC
  ), relevant AS (
    SELECT leg ->> 'checkType' AS check_type, allowed.source_id
    FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
    CROSS JOIN LATERAL jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
    UNION
    SELECT v_policy #>> '{identityConsistencyLeg,checkType}', allowed.source_id
    FROM jsonb_array_elements_text(
      v_policy #> '{identityConsistencyLeg,allowedSourceIds}'
    ) allowed(source_id)
    UNION
    SELECT leg ->> 'checkType', allowed.source_id
    FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    CROSS JOIN LATERAL jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
  )
  SELECT EXISTS (
    SELECT 1 FROM latest JOIN relevant USING (check_type, source_id)
    WHERE latest.result IN ('MISMATCH', 'CONFLICT')
      AND latest.source_mode = 'LIVE'
      AND latest.checked_at <= p_decided_at
  ) INTO v_conflict;

  WITH latest AS (
    SELECT DISTINCT ON (check_row.check_type, check_row.source_id)
           check_row.*, source ->> 'evidenceKind' AS evidence_kind
    FROM public.verification_check check_row
    JOIN LATERAL jsonb_array_elements(v_policy -> 'sources') source
      ON source ->> 'sourceId' = check_row.source_id
    WHERE check_row.case_id = p_case_id
      AND check_row.source_mode = 'LIVE'
      AND check_row.checked_at <= p_decided_at
    ORDER BY check_row.check_type, check_row.source_id, check_row.recorded_sequence DESC
  ), selected AS (
    SELECT leg ->> 'checkType' AS check_type, selected_check.found,
           selected_check.valid_until
    FROM jsonb_array_elements(v_policy -> 'requiredDocumentLegs') leg
    LEFT JOIN LATERAL (
      SELECT true AS found, latest.valid_until
      FROM latest
      WHERE latest.check_type = leg ->> 'checkType'
        AND latest.source_id IN (
          SELECT source_id
          FROM jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
        )
        AND latest.source_mode = 'LIVE' AND latest.result = 'PASS'
        AND latest.evidence_kind NOT IN ('FORMAT_VALIDATION', 'LLM_ADVISORY')
        AND latest.checked_at <= p_decided_at
        AND (latest.valid_until IS NULL OR latest.valid_until > p_decided_at)
      ORDER BY latest.checked_at DESC, latest.recorded_sequence DESC
      LIMIT 1
    ) selected_check ON true
  )
  SELECT bool_and(COALESCE(selected.found, false)), min(selected.valid_until)
  INTO v_documents_complete, v_document_expiry
  FROM selected;

  WITH latest AS (
    SELECT DISTINCT ON (check_row.check_type, check_row.source_id)
           check_row.*, source ->> 'evidenceKind' AS evidence_kind
    FROM public.verification_check check_row
    JOIN LATERAL jsonb_array_elements(v_policy -> 'sources') source
      ON source ->> 'sourceId' = check_row.source_id
    WHERE check_row.case_id = p_case_id
      AND check_row.source_mode = 'LIVE'
      AND check_row.checked_at <= p_decided_at
    ORDER BY check_row.check_type, check_row.source_id, check_row.recorded_sequence DESC
  )
  SELECT selected_check.found, selected_check.valid_until
  INTO v_identity_complete, v_identity_expiry
  FROM LATERAL (
    SELECT true AS found, latest.valid_until
    FROM latest
    WHERE latest.check_type = v_policy #>> '{identityConsistencyLeg,checkType}'
      AND latest.source_id IN (
        SELECT source_id FROM jsonb_array_elements_text(
          v_policy #> '{identityConsistencyLeg,allowedSourceIds}'
        ) allowed(source_id)
      )
      AND latest.source_mode = 'LIVE' AND latest.result = 'PASS'
      AND latest.evidence_kind NOT IN ('FORMAT_VALIDATION', 'LLM_ADVISORY')
      AND latest.checked_at <= p_decided_at
      AND (latest.valid_until IS NULL OR latest.valid_until > p_decided_at)
    ORDER BY latest.checked_at DESC, latest.recorded_sequence DESC
    LIMIT 1
  ) selected_check;
  v_identity_complete := COALESCE(v_identity_complete, false);

  WITH latest AS (
    SELECT DISTINCT ON (check_row.check_type, check_row.source_id)
           check_row.*, source ->> 'evidenceKind' AS evidence_kind
    FROM public.verification_check check_row
    JOIN LATERAL jsonb_array_elements(v_policy -> 'sources') source
      ON source ->> 'sourceId' = check_row.source_id
    WHERE check_row.case_id = p_case_id
      AND check_row.source_mode = 'LIVE'
      AND check_row.checked_at <= p_decided_at
    ORDER BY check_row.check_type, check_row.source_id, check_row.recorded_sequence DESC
  ), selected AS (
    SELECT leg ->> 'checkType' AS check_type, selected_check.found,
           selected_check.valid_until,
           selected_check.checked_at + v_freshness AS freshness_expiry
    FROM jsonb_array_elements(v_policy -> 'currentAuthorityLegs') leg
    LEFT JOIN LATERAL (
      SELECT true AS found, latest.checked_at, latest.valid_until
      FROM latest
      WHERE latest.check_type = leg ->> 'checkType'
        AND latest.source_id IN (
          SELECT source_id
          FROM jsonb_array_elements_text(leg -> 'allowedSourceIds') allowed(source_id)
        )
        AND latest.source_mode = 'LIVE' AND latest.result = 'PASS'
        AND latest.evidence_kind = 'AUTHORITY'
        AND latest.checked_at <= p_decided_at
        AND latest.checked_at > p_decided_at - v_freshness
        AND (latest.valid_until IS NULL OR latest.valid_until > p_decided_at)
      ORDER BY latest.checked_at DESC, latest.recorded_sequence DESC
      LIMIT 1
    ) selected_check ON true
  )
  SELECT bool_and(COALESCE(selected.found, false)),
         min(LEAST(
           selected.freshness_expiry,
           COALESCE(selected.valid_until, 'infinity'::timestamptz)
         ))
  INTO v_authority_complete, v_authority_expiry
  FROM selected;

  IF v_conflict THEN
    tier_outcome := 'SELF_DECLARED';
    decision_reasons := ARRAY['UNRESOLVED_CREDENTIAL_CONFLICT'];
    tier_expires_at := NULL;
  ELSIF NOT COALESCE(v_documents_complete, false) THEN
    tier_outcome := 'SELF_DECLARED';
    decision_reasons := ARRAY['REQUIRED_EVIDENCE_INCOMPLETE'];
    tier_expires_at := NULL;
  ELSIF NOT v_identity_complete THEN
    tier_outcome := 'SELF_DECLARED';
    decision_reasons := ARRAY['IDENTITY_CONSISTENCY_REQUIRED'];
    tier_expires_at := NULL;
  ELSIF NOT COALESCE(v_authority_complete, false) THEN
    tier_outcome := 'DOCUMENT_VERIFIED';
    decision_reasons := ARRAY['CURRENT_LIVE_AUTHORITY_REQUIRED'];
    tier_expires_at := NULL;
  ELSE
    tier_outcome := 'FULLY_VERIFIED';
    decision_reasons := ARRAY['CURRENT_LIVE_AUTHORITY_CONFIRMED'];
    tier_expires_at := LEAST(
      p_decided_at + v_freshness,
      COALESCE(v_document_expiry, 'infinity'::timestamptz),
      COALESCE(v_identity_expiry, 'infinity'::timestamptz),
      v_authority_expiry
    );
  END IF;

  UPDATE public.verification_case
  SET status = 'DECIDED',
      tier_outcome = finalize_verification_case.tier_outcome,
      decided_at = p_decided_at,
      decided_by = p_decided_by,
      policy_version = v_policy_version,
      policy_snapshot = v_policy,
      decision_reasons = finalize_verification_case.decision_reasons,
      tier_expires_at = finalize_verification_case.tier_expires_at
  WHERE id = p_case_id;

  UPDATE public.provider
  SET tier = finalize_verification_case.tier_outcome,
      tier_decided_at = p_decided_at,
      tier_expires_at = finalize_verification_case.tier_expires_at
  WHERE id = p_provider_id;

  INSERT INTO public.audit_event(
    actor_type, actor_id, action, entity_type, entity_id,
    before_summary, after_summary, request_id
  ) VALUES (
    'ADMIN', p_decided_by, 'verification.tier_decided', 'verification_case', p_case_id::text,
    jsonb_build_object('status', v_case.status, 'tierOutcome', v_case.tier_outcome),
    jsonb_build_object(
      'status', 'DECIDED', 'tier', tier_outcome, 'policyVersion', v_policy_version,
      'reasons', decision_reasons, 'tierExpiresAt', tier_expires_at
    ),
    p_request_id
  ), (
    'ADMIN', p_decided_by, 'provider.tier_updated', 'provider', p_provider_id::text,
    jsonb_build_object('tier', v_provider.tier, 'tierExpiresAt', v_provider.tier_expires_at),
    jsonb_build_object(
      'tier', tier_outcome, 'policyVersion', v_policy_version,
      'reasons', decision_reasons, 'tierExpiresAt', tier_expires_at
    ),
    p_request_id
  );

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION degrade_expired_provider_tiers(
  p_actor_id uuid,
  p_batch_size integer,
  p_request_id text
)
RETURNS TABLE(provider_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_provider record;
  v_now timestamptz := transaction_timestamp();
BEGIN
  IF p_request_id IS NULL OR btrim(p_request_id) = '' THEN
    RAISE EXCEPTION 'Revalidation request id is required' USING ERRCODE = '22023';
  END IF;
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 1000 THEN
    RAISE EXCEPTION 'Credential revalidation batch size is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.role_grant role_row
    WHERE role_row.user_id = p_actor_id
      AND role_row.role = 'ADMIN'
      AND role_row.scope = 'credentials:revalidate'
  ) THEN
    RAISE EXCEPTION 'Credential revalidation requires an ADMIN credentials:revalidate grant'
      USING ERRCODE = '42501';
  END IF;

  FOR v_provider IN
    SELECT provider.id, provider.tier_decided_at, provider.tier_expires_at
    FROM public.provider provider
    WHERE provider.tier = 'FULLY_VERIFIED'
      AND (
        provider.tier_decided_at IS NULL
        OR provider.tier_expires_at IS NULL
        OR provider.tier_expires_at <= provider.tier_decided_at
        OR provider.tier_expires_at <= v_now
      )
    ORDER BY provider.tier_expires_at NULLS FIRST, provider.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  LOOP
    UPDATE public.provider
    SET tier = 'DOCUMENT_VERIFIED', tier_decided_at = v_now, tier_expires_at = NULL
    WHERE id = v_provider.id;

    INSERT INTO public.audit_event(
      actor_type, actor_id, action, entity_type, entity_id,
      before_summary, after_summary, reason_code, request_id
    ) VALUES (
      'ADMIN', p_actor_id, 'provider.reverification.due', 'provider', v_provider.id::text,
      jsonb_build_object(
        'tier', 'FULLY_VERIFIED', 'tierDecidedAt', v_provider.tier_decided_at,
        'tierExpiresAt', v_provider.tier_expires_at
      ),
      jsonb_build_object(
        'tier', 'DOCUMENT_VERIFIED', 'tierDecidedAt', v_now, 'tierExpiresAt', NULL
      ),
      'CREDENTIAL_FRESHNESS_EXPIRED', p_request_id
    );

    provider_id := v_provider.id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION finalize_verification_case(
  uuid, uuid, text, timestamptz, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION degrade_expired_provider_tiers(
  uuid, integer, text
) FROM PUBLIC;

-- Fresh installations validate immediately. Legacy installations remain gated until the audited
-- worker removes unbounded FULLY_VERIFIED rows and the owner validation command is run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM provider
    WHERE tier = 'FULLY_VERIFIED'
      AND (
        tier_decided_at IS NULL
        OR tier_expires_at IS NULL
        OR tier_expires_at <= tier_decided_at
      )
  ) THEN
    EXECUTE 'ALTER TABLE provider VALIDATE CONSTRAINT provider_fully_verified_expiry_check';
  END IF;
END;
$$;
