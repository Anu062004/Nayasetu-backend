-- Run as the database owner after replacing legal_service_runtime with the deployment role.
-- The runtime role must not own these tables or receive broad schema privileges.
GRANT USAGE ON SCHEMA public TO legal_service_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO legal_service_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO legal_service_runtime;

REVOKE UPDATE, DELETE, TRUNCATE ON credit_event FROM legal_service_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM legal_service_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON verification_check FROM legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON provider FROM legal_service_runtime;
GRANT INSERT (
  user_id, provider_type, display_name, district, state, languages, service_modes, status
) ON provider TO legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON verification_case FROM legal_service_runtime;
GRANT INSERT (provider_id, status) ON verification_case TO legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON credential_policy FROM legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON booking FROM legal_service_runtime;
GRANT UPDATE (status, updated_at) ON booking TO legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON matter FROM legal_service_runtime;
GRANT INSERT (allocation_id, provider_id, citizen_user_id, status)
  ON matter TO legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON payment_quote FROM legal_service_runtime;
REVOKE INSERT (
  id, matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at, created_at
) ON payment_quote FROM legal_service_runtime;
REVOKE UPDATE (
  id, matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at, created_at
) ON payment_quote FROM legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON payment_intent FROM legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON payment_webhook_event FROM legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON settlement_record FROM legal_service_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON offline_payment_acknowledgement
  FROM legal_service_runtime;
REVOKE ALL ON schema_migration FROM legal_service_runtime;
REVOKE INSERT ON credit_event FROM legal_service_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON credit_balance FROM legal_service_runtime;
GRANT EXECUTE ON FUNCTION append_credit_event(
  uuid, text, numeric, text, numeric, uuid, text, timestamptz,
  text, uuid, uuid, uuid, text
) TO legal_service_runtime;
GRANT EXECUTE ON FUNCTION finalize_verification_case(
  uuid, uuid, text, timestamptz, uuid, text
) TO legal_service_runtime;
GRANT EXECUTE ON FUNCTION degrade_expired_provider_tiers(
  uuid, integer, text
) TO legal_service_runtime;
GRANT EXECUTE ON FUNCTION create_payment_quote(
  uuid, uuid, numeric, text, jsonb, timestamptz, text
) TO legal_service_runtime;

-- Credit events and balance updates are available only through the security-definer writer.
