-- Phase 7A payment persistence boundary. This migration records quotes and external-provider
-- references only. It deliberately defines no PSP state graph, signature scheme, offline evidence
-- semantics, wallet, custody, escrow, or money-movement behavior.

-- The redundant provider identifier on a quote must identify the same provider as its matter.
-- The composite key is intentionally relational; the matter UUID remains the business identity.
ALTER TABLE public.matter
  ADD CONSTRAINT matter_payment_quote_identity_key UNIQUE (id, provider_id);

-- Earlier application builds persisted the same three disclosed components as JSON numbers.
-- Canonicalize only rows whose values are already exact, non-negative two-decimal facts and whose
-- sum already equals the stored quote amount. Anything else remains untouched so validation fails
-- rather than rounding or repairing historical money implicitly.
UPDATE public.payment_quote
SET fee_breakdown_json = jsonb_build_object(
  'professionalFee',
  ((fee_breakdown_json ->> 'professionalFee')::numeric)::numeric(14,2)::text,
  'processingFee',
  ((fee_breakdown_json ->> 'processingFee')::numeric)::numeric(14,2)::text,
  'platformCommission',
  ((fee_breakdown_json ->> 'platformCommission')::numeric)::numeric(14,2)::text
)
WHERE jsonb_typeof(fee_breakdown_json) = 'object'
  AND fee_breakdown_json ?& ARRAY[
    'professionalFee', 'processingFee', 'platformCommission'
  ]::text[]
  AND fee_breakdown_json - ARRAY[
    'professionalFee', 'processingFee', 'platformCommission'
  ]::text[] = '{}'::jsonb
  AND jsonb_typeof(fee_breakdown_json -> 'professionalFee') = 'number'
  AND jsonb_typeof(fee_breakdown_json -> 'processingFee') = 'number'
  AND jsonb_typeof(fee_breakdown_json -> 'platformCommission') = 'number'
  AND (fee_breakdown_json ->> 'professionalFee')::numeric BETWEEN 0 AND 999999999999.99
  AND (fee_breakdown_json ->> 'processingFee')::numeric BETWEEN 0 AND 999999999999.99
  AND (fee_breakdown_json ->> 'platformCommission')::numeric = 0
  AND trunc((fee_breakdown_json ->> 'professionalFee')::numeric, 2)
    = (fee_breakdown_json ->> 'professionalFee')::numeric
  AND trunc((fee_breakdown_json ->> 'processingFee')::numeric, 2)
    = (fee_breakdown_json ->> 'processingFee')::numeric
  AND amount =
    (fee_breakdown_json ->> 'professionalFee')::numeric
    + (fee_breakdown_json ->> 'processingFee')::numeric
    + (fee_breakdown_json ->> 'platformCommission')::numeric;

ALTER TABLE public.payment_quote
  ADD CONSTRAINT payment_quote_matter_provider_fk
    FOREIGN KEY (matter_id, provider_id)
    REFERENCES public.matter(id, provider_id)
    NOT VALID,
  ADD CONSTRAINT payment_quote_currency_check CHECK (
    currency::text ~ '^[A-Z]{3}$'
  ) NOT VALID,
  ADD CONSTRAINT payment_quote_expiry_check CHECK (
    isfinite(created_at)
    AND isfinite(expires_at)
    AND expires_at > created_at
  ) NOT VALID,
  ADD CONSTRAINT payment_quote_breakdown_check CHECK (
    CASE
      WHEN jsonb_typeof(fee_breakdown_json) = 'object'
       AND fee_breakdown_json ?& ARRAY[
         'professionalFee', 'processingFee', 'platformCommission'
       ]::text[]
       AND fee_breakdown_json - ARRAY[
         'professionalFee', 'processingFee', 'platformCommission'
       ]::text[] = '{}'::jsonb
       AND jsonb_typeof(fee_breakdown_json -> 'professionalFee') = 'string'
       AND jsonb_typeof(fee_breakdown_json -> 'processingFee') = 'string'
       AND jsonb_typeof(fee_breakdown_json -> 'platformCommission') = 'string'
       AND fee_breakdown_json ->> 'professionalFee'
         ~ '^(0|[1-9][0-9]{0,11})[.][0-9]{2}$'
       AND fee_breakdown_json ->> 'processingFee'
         ~ '^(0|[1-9][0-9]{0,11})[.][0-9]{2}$'
       AND fee_breakdown_json ->> 'platformCommission'
         ~ '^(0|[1-9][0-9]{0,11})[.][0-9]{2}$'
      THEN
        (fee_breakdown_json ->> 'professionalFee')::numeric >= 0
        AND (fee_breakdown_json ->> 'processingFee')::numeric >= 0
        AND (fee_breakdown_json ->> 'platformCommission')::numeric = 0
        AND amount =
          (fee_breakdown_json ->> 'professionalFee')::numeric
          + (fee_breakdown_json ->> 'processingFee')::numeric
          + (fee_breakdown_json ->> 'platformCommission')::numeric
      ELSE false
    END
  ) NOT VALID;

ALTER TABLE public.payment_quote
  VALIDATE CONSTRAINT payment_quote_matter_provider_fk;
ALTER TABLE public.payment_quote
  VALIDATE CONSTRAINT payment_quote_currency_check;
ALTER TABLE public.payment_quote
  VALIDATE CONSTRAINT payment_quote_expiry_check;
ALTER TABLE public.payment_quote
  VALIDATE CONSTRAINT payment_quote_breakdown_check;

CREATE FUNCTION public.reject_payment_quote_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Payment quotes are append-only'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payment_quote_mutation() FROM PUBLIC;

CREATE TRIGGER payment_quote_append_only
BEFORE UPDATE OR DELETE ON public.payment_quote
FOR EACH ROW EXECUTE FUNCTION public.reject_payment_quote_mutation();

-- Quote creation is a trusted, atomic transition: the runtime cannot insert a quote without
-- proving the provider actor, open matter, and paid eligibility route recorded in this database.
CREATE FUNCTION public.create_payment_quote(
  p_matter_id uuid,
  p_actor_id uuid,
  p_amount numeric,
  p_currency text,
  p_fee_breakdown jsonb,
  p_expires_at timestamptz,
  p_request_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_quote_id uuid;
  v_provider_id uuid;
  v_provider_user_id uuid;
  v_matter_status text;
  v_eligibility_route text;
BEGIN
  IF p_request_id IS NULL OR btrim(p_request_id) = '' THEN
    RAISE EXCEPTION 'Payment quote request id is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT matter_row.provider_id,
         provider_row.user_id,
         matter_row.status,
         eligibility_row.route
  INTO v_provider_id,
       v_provider_user_id,
       v_matter_status,
       v_eligibility_route
  FROM public.matter matter_row
  JOIN public.provider provider_row
    ON provider_row.id = matter_row.provider_id
  JOIN public.allocation allocation_row
    ON allocation_row.id = matter_row.allocation_id
  JOIN public.eligibility_decision eligibility_row
    ON eligibility_row.need_request_id = allocation_row.need_request_id
  WHERE matter_row.id = p_matter_id
  FOR UPDATE OF matter_row, provider_row, allocation_row, eligibility_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment quote matter was not found'
      USING ERRCODE = '23503';
  END IF;

  IF v_provider_user_id IS DISTINCT FROM p_actor_id OR NOT EXISTS (
    SELECT 1
    FROM public.role_grant role_row
    WHERE role_row.user_id = p_actor_id
      AND role_row.role = 'PROVIDER'
  ) THEN
    RAISE EXCEPTION 'Payment quote actor does not own the matter provider'
      USING ERRCODE = '42501';
  END IF;

  IF v_matter_status <> 'OPEN' THEN
    RAISE EXCEPTION 'Only an open matter can receive a payment quote'
      USING ERRCODE = '23514';
  END IF;

  IF v_eligibility_route <> 'PAID' THEN
    RAISE EXCEPTION 'Only a paid eligibility route can receive a payment quote'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.payment_quote(
    matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
  ) VALUES (
    p_matter_id, v_provider_id, p_amount, p_currency, p_fee_breakdown, p_expires_at
  )
  RETURNING id INTO v_quote_id;

  INSERT INTO public.audit_event(
    actor_type, actor_id, action, entity_type, entity_id, after_summary, request_id
  ) VALUES (
    'PROVIDER',
    p_actor_id,
    'payment.quote_created',
    'payment_quote',
    v_quote_id::text,
    jsonb_build_object(
      'matterId', p_matter_id,
      'amount', p_amount::numeric(14,2)::text,
      'currency', p_currency,
      'platformCommission', p_fee_breakdown ->> 'platformCommission'
    ),
    p_request_id
  );

  RETURN v_quote_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_quote(
  uuid, uuid, numeric, text, jsonb, timestamptz, text
) FROM PUBLIC;

COMMENT ON TABLE public.payment_quote IS
  'Immutable disclosed quote metadata only; no platform-held funds or money movement.';
COMMENT ON TABLE public.payment_intent IS
  'External PSP intent reference and observed state only; no platform-held balance.';
COMMENT ON TABLE public.payment_webhook_event IS
  'External webhook receipt metadata only; signature rules remain provider-specific.';
COMMENT ON TABLE public.settlement_record IS
  'External PSP settlement reference and observed state only; no platform custody.';
COMMENT ON TABLE public.offline_payment_acknowledgement IS
  'Separate offline acknowledgement metadata; evidence semantics are not yet configured.';
