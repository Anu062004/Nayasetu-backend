-- Run as the database owner after replacing legal_service_runtime with the deployment role.
-- The runtime role must not own these tables or receive broad schema privileges.
GRANT USAGE ON SCHEMA public TO legal_service_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legal_service_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_service_runtime;

REVOKE UPDATE, DELETE, TRUNCATE ON credit_event FROM legal_service_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM legal_service_runtime;

-- Balance mutation remains available only to the trusted ledger transaction in this service.
-- Split it into a dedicated DB role/function when deployment role management is available.
