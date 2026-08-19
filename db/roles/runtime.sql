-- Run as the database owner after replacing legal_service_runtime with the deployment role.
-- The runtime role must not own these tables or receive broad schema privileges.
GRANT USAGE ON SCHEMA public TO legal_service_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legal_service_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_service_runtime;

REVOKE UPDATE, DELETE, TRUNCATE ON credit_event FROM legal_service_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM legal_service_runtime;
REVOKE ALL ON schema_migration FROM legal_service_runtime;
REVOKE INSERT ON credit_event FROM legal_service_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON credit_balance FROM legal_service_runtime;
GRANT EXECUTE ON FUNCTION append_credit_event(
  uuid, text, numeric, text, numeric, uuid, text, timestamptz,
  text, uuid, uuid, uuid, text
) TO legal_service_runtime;

-- Credit events and balance updates are available only through the security-definer writer.
