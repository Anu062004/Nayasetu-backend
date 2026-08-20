import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const forbiddenColumns = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'need_request' AND column_name ~* 'narrative|description|free.?text')
        OR (table_name = 'matter' AND column_name ~* 'narrative|document|evidence|advice|correspondence|note')
      )
  `);
  if (forbiddenColumns.rowCount) {
    throw new Error(`Forbidden content columns: ${JSON.stringify(forbiddenColumns.rows)}`);
  }

  const forbiddenTables = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~* 'rating|ranking|portfolio|wallet|client_funds|escrow'
  `);
  if (forbiddenTables.rowCount) {
    throw new Error(`Forbidden tables: ${JSON.stringify(forbiddenTables.rows)}`);
  }

  const forbiddenQualityColumns = await client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name ~* '(^|_)(score|rating|rank)($|_)'
  `);
  if (forbiddenQualityColumns.rowCount) {
    throw new Error(
      `Forbidden provider-quality columns: ${JSON.stringify(forbiddenQualityColumns.rows)}`,
    );
  }

  const requiredObjects = await client.query<{
    booking_exclusion: boolean;
    credit_append_trigger: boolean;
    audit_append_trigger: boolean;
    verification_check_append_trigger: boolean;
    verification_case_immutable_trigger: boolean;
    provider_tier_expiry: boolean;
    provider_expiry_constraint: boolean;
    provider_expiry_constraint_validated: boolean;
    verification_case_shape_constraint: boolean;
    verification_case_shape_constraint_validated: boolean;
    verification_check_recorded_sequence: boolean;
    active_review_index: boolean;
    active_credential_policy_index: boolean;
    credential_policy_immutable_trigger: boolean;
    credential_finalizer: boolean;
    credential_degrader: boolean;
    ledger_writer: boolean;
    active_allocation_index: boolean;
    grievance_initial_trigger: boolean;
    grievance_transition_trigger: boolean;
  }>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'no_double_book'
          AND constraint_row.contype = 'x'
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'booking'
      ) AS booking_exclusion,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'credit_event_append_only'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'credit_event'
      ) AS credit_append_trigger,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'audit_event_append_only'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'audit_event'
      ) AS audit_append_trigger,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'verification_check_append_only'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'verification_check'
      ) AS verification_check_append_trigger,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'verification_case_decided_immutable'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'verification_case'
      ) AS verification_case_immutable_trigger,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'provider'
          AND column_name = 'tier_expires_at'
          AND data_type = 'timestamp with time zone'
      ) AS provider_tier_expiry,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'provider_fully_verified_expiry_check'
          AND constraint_row.contype = 'c'
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'provider'
      ) AS provider_expiry_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'provider_fully_verified_expiry_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'provider'
      ) AS provider_expiry_constraint_validated,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'verification_case_decision_shape_check'
          AND constraint_row.contype = 'c'
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'verification_case'
      ) AS verification_case_shape_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'verification_case_decision_shape_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'verification_case'
      ) AS verification_case_shape_constraint_validated,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'verification_check'
          AND column_name = 'recorded_sequence'
          AND data_type = 'bigint'
          AND is_identity = 'YES'
      ) AS verification_check_recorded_sequence,
      to_regclass('public.verification_case_one_active_review') IS NOT NULL
        AS active_review_index,
      to_regclass('public.credential_policy_one_active_per_provider_type') IS NOT NULL
        AS active_credential_policy_index,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'credential_policy_snapshot_immutable'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'credential_policy'
      ) AS credential_policy_immutable_trigger,
      to_regprocedure(
        'finalize_verification_case(uuid,uuid,text,timestamptz,uuid,text)'
      ) IS NOT NULL AS credential_finalizer,
      to_regprocedure(
        'degrade_expired_provider_tiers(uuid,integer,text)'
      ) IS NOT NULL AS credential_degrader,
      to_regprocedure(
        'append_credit_event(uuid,text,numeric,text,numeric,uuid,text,timestamptz,text,uuid,uuid,uuid,text)'
      ) IS NOT NULL AS ledger_writer,
      to_regclass('public.allocation_one_active_per_need') IS NOT NULL AS active_allocation_index,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'grievance_initial_state'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'grievance'
      ) AS grievance_initial_trigger,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'grievance_status_transition'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'grievance'
      ) AS grievance_transition_trigger
  `);
  const objectState = requiredObjects.rows[0];
  if (!objectState || Object.values(objectState).some((present) => !present)) {
    throw new Error(`Required database object is missing: ${JSON.stringify(objectState)}`);
  }

  const roleConfiguration = await client.query<{
    group_exists: boolean;
    group_can_login: boolean;
    group_is_superuser: boolean;
    group_can_create_database: boolean;
    group_can_create_role: boolean;
    group_bypasses_rls: boolean;
    login_exists: boolean;
    login_can_login: boolean;
    login_is_superuser: boolean;
    login_can_create_database: boolean;
    login_can_create_role: boolean;
    login_bypasses_rls: boolean;
    login_is_member: boolean;
    login_owns_protected_table: boolean;
  }>(`
    SELECT
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'legal_service_runtime') AS group_exists,
      COALESCE((SELECT rolcanlogin FROM pg_roles WHERE rolname = 'legal_service_runtime'), true)
        AS group_can_login,
      COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = 'legal_service_runtime'), true)
        AS group_is_superuser,
      COALESCE((SELECT rolcreatedb FROM pg_roles WHERE rolname = 'legal_service_runtime'), true)
        AS group_can_create_database,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'legal_service_runtime'), true)
        AS group_can_create_role,
      COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'legal_service_runtime'), true)
        AS group_bypasses_rls,
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'legal_service_app') AS login_exists,
      COALESCE((SELECT rolcanlogin FROM pg_roles WHERE rolname = 'legal_service_app'), false)
        AS login_can_login,
      COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = 'legal_service_app'), true)
        AS login_is_superuser,
      COALESCE((SELECT rolcreatedb FROM pg_roles WHERE rolname = 'legal_service_app'), true)
        AS login_can_create_database,
      COALESCE((SELECT rolcreaterole FROM pg_roles WHERE rolname = 'legal_service_app'), true)
        AS login_can_create_role,
      COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = 'legal_service_app'), true)
        AS login_bypasses_rls,
      CASE WHEN
        EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'legal_service_app')
        AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'legal_service_runtime')
      THEN pg_has_role('legal_service_app', 'legal_service_runtime', 'MEMBER')
      ELSE false END AS login_is_member,
      EXISTS (
        SELECT 1
        FROM pg_class table_row
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE namespace_row.nspname = 'public'
          AND table_row.relname IN (
            'credit_event', 'credit_balance', 'audit_event', 'provider',
            'verification_case', 'verification_check', 'credential_policy', 'schema_migration'
          )
          AND pg_get_userbyid(table_row.relowner) = 'legal_service_app'
      ) AS login_owns_protected_table
  `);
  const roles = roleConfiguration.rows[0];
  if (
    !roles?.group_exists ||
    roles.group_can_login ||
    roles.group_is_superuser ||
    roles.group_can_create_database ||
    roles.group_can_create_role ||
    roles.group_bypasses_rls ||
    !roles.login_exists ||
    !roles.login_can_login ||
    roles.login_is_superuser ||
    roles.login_can_create_database ||
    roles.login_can_create_role ||
    roles.login_bypasses_rls ||
    !roles.login_is_member ||
    roles.login_owns_protected_table
  ) {
    throw new Error(`Runtime role configuration is unsafe: ${JSON.stringify(roles)}`);
  }

  const privileges = await client.query<{
    may_insert_event: boolean;
    may_update_event: boolean;
    may_delete_event: boolean;
    may_truncate_event: boolean;
    may_update_balance: boolean;
    may_delete_balance: boolean;
    may_truncate_balance: boolean;
    may_read_migrations: boolean;
    may_insert_migrations: boolean;
    may_update_migrations: boolean;
    may_delete_migrations: boolean;
    may_execute_writer: boolean;
    may_update_verification_check: boolean;
    may_delete_verification_check: boolean;
    may_truncate_verification_check: boolean;
    may_update_provider: boolean;
    may_delete_provider: boolean;
    may_truncate_provider: boolean;
    may_insert_provider_tier: boolean;
    may_insert_provider_identity: boolean;
    may_update_verification_case: boolean;
    may_delete_verification_case: boolean;
    may_insert_case_decision: boolean;
    may_insert_case_identity: boolean;
    may_read_credential_policy: boolean;
    may_insert_credential_policy: boolean;
    may_update_credential_policy: boolean;
    may_delete_credential_policy: boolean;
    may_truncate_credential_policy: boolean;
    may_execute_credential_finalizer: boolean;
    may_execute_credential_degrader: boolean;
  }>(`
      SELECT
        has_table_privilege('legal_service_app', 'credit_event', 'INSERT') AS may_insert_event,
        has_table_privilege('legal_service_app', 'credit_event', 'UPDATE') AS may_update_event,
        has_table_privilege('legal_service_app', 'credit_event', 'DELETE') AS may_delete_event,
        has_table_privilege('legal_service_app', 'credit_event', 'TRUNCATE') AS may_truncate_event,
        has_table_privilege('legal_service_app', 'credit_balance', 'UPDATE') AS may_update_balance,
        has_table_privilege('legal_service_app', 'credit_balance', 'DELETE') AS may_delete_balance,
        has_table_privilege('legal_service_app', 'credit_balance', 'TRUNCATE') AS may_truncate_balance,
        has_table_privilege('legal_service_app', 'schema_migration', 'SELECT') AS may_read_migrations,
        has_table_privilege('legal_service_app', 'schema_migration', 'INSERT') AS may_insert_migrations,
        has_table_privilege('legal_service_app', 'schema_migration', 'UPDATE') AS may_update_migrations,
        has_table_privilege('legal_service_app', 'schema_migration', 'DELETE') AS may_delete_migrations,
        has_function_privilege(
          'legal_service_app',
          'append_credit_event(uuid,text,numeric,text,numeric,uuid,text,timestamptz,text,uuid,uuid,uuid,text)',
          'EXECUTE'
        ) AS may_execute_writer,
        has_table_privilege(
          'legal_service_app', 'verification_check', 'UPDATE'
        ) AS may_update_verification_check,
        has_table_privilege(
          'legal_service_app', 'verification_check', 'DELETE'
        ) AS may_delete_verification_check,
        has_table_privilege(
          'legal_service_app', 'verification_check', 'TRUNCATE'
        ) AS may_truncate_verification_check,
        has_table_privilege('legal_service_app', 'provider', 'UPDATE')
          AS may_update_provider,
        has_table_privilege('legal_service_app', 'provider', 'DELETE')
          AS may_delete_provider,
        has_table_privilege('legal_service_app', 'provider', 'TRUNCATE')
          AS may_truncate_provider,
        has_column_privilege('legal_service_app', 'provider', 'tier', 'INSERT')
          AS may_insert_provider_tier,
        has_column_privilege('legal_service_app', 'provider', 'user_id', 'INSERT')
          AS may_insert_provider_identity,
        has_table_privilege('legal_service_app', 'verification_case', 'UPDATE')
          AS may_update_verification_case,
        has_table_privilege('legal_service_app', 'verification_case', 'DELETE')
          AS may_delete_verification_case,
        has_column_privilege('legal_service_app', 'verification_case', 'tier_outcome', 'INSERT')
          AS may_insert_case_decision,
        has_column_privilege('legal_service_app', 'verification_case', 'provider_id', 'INSERT')
          AS may_insert_case_identity,
        has_table_privilege('legal_service_app', 'credential_policy', 'SELECT')
          AS may_read_credential_policy,
        has_table_privilege('legal_service_app', 'credential_policy', 'INSERT')
          AS may_insert_credential_policy,
        has_table_privilege('legal_service_app', 'credential_policy', 'UPDATE')
          AS may_update_credential_policy,
        has_table_privilege('legal_service_app', 'credential_policy', 'DELETE')
          AS may_delete_credential_policy,
        has_table_privilege('legal_service_app', 'credential_policy', 'TRUNCATE')
          AS may_truncate_credential_policy,
        has_function_privilege(
          'legal_service_app',
          'finalize_verification_case(uuid,uuid,text,timestamptz,uuid,text)',
          'EXECUTE'
        ) AS may_execute_credential_finalizer,
        has_function_privilege(
          'legal_service_app',
          'degrade_expired_provider_tiers(uuid,integer,text)',
          'EXECUTE'
        ) AS may_execute_credential_degrader
  `);
  const roleState = privileges.rows[0];
  if (
    !roleState ||
    roleState.may_insert_event ||
    roleState.may_update_event ||
    roleState.may_delete_event ||
    roleState.may_truncate_event ||
    roleState.may_update_balance ||
    roleState.may_delete_balance ||
    roleState.may_truncate_balance ||
    roleState.may_read_migrations ||
    roleState.may_insert_migrations ||
    roleState.may_update_migrations ||
    roleState.may_delete_migrations ||
    roleState.may_update_verification_check ||
    roleState.may_delete_verification_check ||
    roleState.may_truncate_verification_check ||
    roleState.may_update_provider ||
    roleState.may_delete_provider ||
    roleState.may_truncate_provider ||
    roleState.may_insert_provider_tier ||
    !roleState.may_insert_provider_identity ||
    roleState.may_update_verification_case ||
    roleState.may_delete_verification_case ||
    roleState.may_insert_case_decision ||
    !roleState.may_insert_case_identity ||
    !roleState.may_read_credential_policy ||
    roleState.may_insert_credential_policy ||
    roleState.may_update_credential_policy ||
    roleState.may_delete_credential_policy ||
    roleState.may_truncate_credential_policy ||
    !roleState.may_execute_credential_finalizer ||
    !roleState.may_execute_credential_degrader ||
    !roleState.may_execute_writer
  ) {
    throw new Error(`Runtime protected privileges are unsafe: ${JSON.stringify(roleState)}`);
  }

  process.stdout.write("Database boundary verification passed.\n");
} finally {
  await client.end();
}
