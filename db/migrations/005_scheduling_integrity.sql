-- Phase 5 scheduling safety. This migration deliberately does not define availability,
-- hold-expiry, rescheduling, provider-status, or closure-confirmation policy.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM booking
    WHERE status NOT IN ('HELD', 'CONFIRMED', 'SCHEDULED', 'DECLINED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Unknown legacy booking statuses must be resolved before migration 005';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM booking
    WHERE isempty(slot)
       OR lower_inf(slot)
       OR upper_inf(slot)
       OR NOT lower_inc(slot)
       OR upper_inc(slot)
       OR lower(slot) >= upper(slot)
       OR NOT isfinite(lower(slot))
       OR NOT isfinite(upper(slot))
       OR updated_at < created_at
  ) THEN
    RAISE EXCEPTION 'Invalid legacy booking slots or timestamps must be resolved before migration 005';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM booking booking_row
    LEFT JOIN allocation allocation_row
      ON allocation_row.id = booking_row.allocation_id
     AND allocation_row.need_request_id = booking_row.need_request_id
     AND allocation_row.provider_id = booking_row.provider_id
    LEFT JOIN need_request need_row
      ON need_row.id = booking_row.need_request_id
     AND need_row.citizen_user_id = booking_row.citizen_user_id
    WHERE allocation_row.id IS NULL
       OR need_row.id IS NULL
       OR (
         booking_row.status = 'HELD'
         AND allocation_row.status <> 'ASSIGNED'
       )
       OR (
         booking_row.status IN ('CONFIRMED', 'SCHEDULED')
         AND allocation_row.status <> 'ASSIGNED'
         AND NOT (
           allocation_row.status = 'COMPLETED'
           AND EXISTS (
             SELECT 1
             FROM matter matter_row
             WHERE matter_row.allocation_id = booking_row.allocation_id
               AND matter_row.provider_id = booking_row.provider_id
               AND matter_row.citizen_user_id = booking_row.citizen_user_id
               AND matter_row.status = 'CLOSED'
           )
         )
       )
  ) THEN
    RAISE EXCEPTION 'Inconsistent legacy booking identities must be resolved before migration 005';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM matter
    WHERE status NOT IN ('OPEN', 'CLOSED')
       OR (status = 'OPEN' AND (closed_at IS NOT NULL OR close_reason IS NOT NULL))
       OR (
         status = 'CLOSED'
         AND (
           closed_at IS NULL
           OR close_reason IS NULL
           OR btrim(close_reason) = ''
           OR closed_at < opened_at
         )
       )
  ) THEN
    RAISE EXCEPTION 'Invalid legacy matter lifecycle rows must be resolved before migration 005';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM matter matter_row
    LEFT JOIN booking booking_row
      ON booking_row.allocation_id = matter_row.allocation_id
     AND booking_row.provider_id = matter_row.provider_id
     AND booking_row.citizen_user_id = matter_row.citizen_user_id
    LEFT JOIN allocation allocation_row ON allocation_row.id = matter_row.allocation_id
    WHERE booking_row.id IS NULL
       OR (
         matter_row.status = 'OPEN'
         AND (
           booking_row.status NOT IN ('CONFIRMED', 'SCHEDULED')
           OR allocation_row.status <> 'ASSIGNED'
         )
       )
       OR (
         matter_row.status = 'CLOSED'
         AND (
           booking_row.status NOT IN ('CONFIRMED', 'SCHEDULED')
           OR allocation_row.status <> 'COMPLETED'
         )
       )
  ) THEN
    RAISE EXCEPTION 'Inconsistent legacy matter identities must be resolved before migration 005';
  END IF;
END;
$$;

ALTER TABLE booking
  ADD CONSTRAINT booking_status_check CHECK (
    status IN ('HELD', 'CONFIRMED', 'SCHEDULED', 'DECLINED', 'CANCELLED')
  ),
  ADD CONSTRAINT booking_slot_shape_check CHECK (
    NOT isempty(slot)
    AND NOT lower_inf(slot)
    AND NOT upper_inf(slot)
    AND lower_inc(slot)
    AND NOT upper_inc(slot)
    AND lower(slot) < upper(slot)
    AND isfinite(lower(slot))
    AND isfinite(upper(slot))
  ),
  ADD CONSTRAINT booking_timestamp_shape_check CHECK (updated_at >= created_at);

ALTER TABLE matter
  ADD CONSTRAINT matter_lifecycle_shape_check CHECK (
    (
      status = 'OPEN'
      AND closed_at IS NULL
      AND close_reason IS NULL
    ) OR (
      status = 'CLOSED'
      AND closed_at IS NOT NULL
      AND close_reason IS NOT NULL
      AND btrim(close_reason) <> ''
      AND closed_at >= opened_at
    )
  );

-- Redundant identity columns are retained for efficient authorization reads, but they must all
-- describe the same allocation. These validated foreign keys prevent a booking from combining
-- participants or providers from unrelated records.
ALTER TABLE allocation
  ADD CONSTRAINT allocation_booking_identity_key
    UNIQUE (id, need_request_id, provider_id);

ALTER TABLE need_request
  ADD CONSTRAINT need_request_booking_identity_key
    UNIQUE (id, citizen_user_id);

ALTER TABLE booking
  ADD CONSTRAINT booking_allocation_identity_fk
    FOREIGN KEY (allocation_id, need_request_id, provider_id)
    REFERENCES allocation(id, need_request_id, provider_id),
  ADD CONSTRAINT booking_citizen_identity_fk
    FOREIGN KEY (need_request_id, citizen_user_id)
    REFERENCES need_request(id, citizen_user_id),
  ADD CONSTRAINT booking_matter_identity_key
    UNIQUE (allocation_id, provider_id, citizen_user_id);

-- A matter can only use the provider and citizen already bound to its booking/allocation. No case
-- content is added; this is solely a metadata identity constraint.
ALTER TABLE matter
  ADD CONSTRAINT matter_booking_identity_fk
    FOREIGN KEY (allocation_id, provider_id, citizen_user_id)
    REFERENCES booking(allocation_id, provider_id, citizen_user_id);

CREATE OR REPLACE FUNCTION enforce_booking_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_allocation_assigned boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'HELD' THEN
      RAISE EXCEPTION 'A booking must start in HELD'
        USING ERRCODE = '23514';
    END IF;
    SELECT true
    INTO v_allocation_assigned
    FROM public.allocation
    WHERE id = NEW.allocation_id
      AND need_request_id = NEW.need_request_id
      AND provider_id = NEW.provider_id
      AND status = 'ASSIGNED'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A booking requires its linked allocation to be ASSIGNED'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.need_request_id IS DISTINCT FROM OLD.need_request_id
     OR NEW.allocation_id IS DISTINCT FROM OLD.allocation_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.citizen_user_id IS DISTINCT FROM OLD.citizen_user_id
     OR NEW.slot IS DISTINCT FROM OLD.slot
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Booking identity and reserved slot are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'Booking update time cannot move backwards'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'HELD' AND NEW.status IN ('CONFIRMED', 'DECLINED', 'CANCELLED') THEN
    SELECT true
    INTO v_allocation_assigned
    FROM public.allocation
    WHERE id = OLD.allocation_id
      AND need_request_id = OLD.need_request_id
      AND provider_id = OLD.provider_id
      AND status = 'ASSIGNED'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A booking transition requires its linked allocation to be ASSIGNED'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid booking transition from % to %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER booking_initial_state
BEFORE INSERT ON booking
FOR EACH ROW EXECUTE FUNCTION enforce_booking_lifecycle();

CREATE TRIGGER booking_state_transition
BEFORE UPDATE ON booking
FOR EACH ROW EXECUTE FUNCTION enforce_booking_lifecycle();

CREATE OR REPLACE FUNCTION enforce_matter_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_booking_status text;
  v_allocation_assigned boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' THEN
      RAISE EXCEPTION 'A matter must start in OPEN'
        USING ERRCODE = '23514';
    END IF;
    SELECT status
    INTO v_booking_status
    FROM public.booking
    WHERE allocation_id = NEW.allocation_id
      AND provider_id = NEW.provider_id
      AND citizen_user_id = NEW.citizen_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Matter participants must match an existing booking'
        USING ERRCODE = '23503';
    END IF;
    IF v_booking_status NOT IN ('CONFIRMED', 'SCHEDULED') THEN
      RAISE EXCEPTION 'A matter requires a confirmed or scheduled booking'
        USING ERRCODE = '23514';
    END IF;
    SELECT true
    INTO v_allocation_assigned
    FROM public.allocation
    WHERE id = NEW.allocation_id
      AND provider_id = NEW.provider_id
      AND status = 'ASSIGNED'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An open matter requires its linked allocation to be ASSIGNED'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.allocation_id IS DISTINCT FROM OLD.allocation_id
     OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
     OR NEW.citizen_user_id IS DISTINCT FROM OLD.citizen_user_id
     OR NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
    RAISE EXCEPTION 'Matter identity and opening time are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'CLOSED' AND NEW.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'A closed matter cannot be reopened'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER matter_initial_state
BEFORE INSERT ON matter
FOR EACH ROW EXECUTE FUNCTION enforce_matter_lifecycle();

CREATE TRIGGER matter_lifecycle_change
BEFORE UPDATE ON matter
FOR EACH ROW EXECUTE FUNCTION enforce_matter_lifecycle();

CREATE OR REPLACE FUNCTION protect_active_scheduling_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = OLD.status OR NEW.status = 'ASSIGNED' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'ASSIGNED' AND NEW.status = 'COMPLETED' AND EXISTS (
    SELECT 1
    FROM public.booking booking_row
    JOIN public.matter matter_row
      ON matter_row.allocation_id = booking_row.allocation_id
     AND matter_row.provider_id = booking_row.provider_id
     AND matter_row.citizen_user_id = booking_row.citizen_user_id
    WHERE booking_row.allocation_id = OLD.id
      AND booking_row.status IN ('CONFIRMED', 'SCHEDULED')
      AND matter_row.status = 'CLOSED'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking
    WHERE allocation_id = OLD.id
      AND status IN ('HELD', 'CONFIRMED', 'SCHEDULED')
  ) THEN
    RAISE EXCEPTION 'An allocation with an active booking must remain ASSIGNED'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.matter
    WHERE allocation_id = OLD.id AND status = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'An allocation with an open matter must remain ASSIGNED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER allocation_active_scheduling_guard
BEFORE UPDATE OF status ON allocation
FOR EACH ROW EXECUTE FUNCTION protect_active_scheduling_allocation();
