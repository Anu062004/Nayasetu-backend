CREATE OR REPLACE FUNCTION enforce_grievance_state_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'OPEN' THEN
      RAISE EXCEPTION 'A grievance must start in OPEN'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'OPEN' AND NEW.status = 'TRIAGED' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'TRIAGED' AND NEW.status IN (
    'PLATFORM_RESOLVED',
    'REFERRED_TO_BAR_COUNCIL',
    'REFERRED_TO_DLSA'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid grievance transition from % to %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER grievance_initial_state
BEFORE INSERT ON grievance
FOR EACH ROW EXECUTE FUNCTION enforce_grievance_state_machine();

CREATE TRIGGER grievance_status_transition
BEFORE UPDATE OF status ON grievance
FOR EACH ROW EXECUTE FUNCTION enforce_grievance_state_machine();
