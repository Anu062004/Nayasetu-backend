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
    booking_status_constraint: boolean;
    booking_slot_constraint: boolean;
    booking_timestamp_constraint: boolean;
    booking_identity_constraints: boolean;
    booking_initial_trigger: boolean;
    booking_transition_trigger: boolean;
    matter_shape_constraint: boolean;
    matter_identity_constraint: boolean;
    matter_initial_trigger: boolean;
    matter_lifecycle_trigger: boolean;
    allocation_scheduling_guard_trigger: boolean;
    payment_quote_matter_provider_constraint: boolean;
    payment_quote_currency_constraint: boolean;
    payment_quote_expiry_constraint: boolean;
    payment_quote_breakdown_constraint: boolean;
    payment_quote_append_trigger: boolean;
    payment_quote_writer: boolean;
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
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'booking_status_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'booking'
      ) AS booking_status_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'booking_slot_shape_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'booking'
      ) AS booking_slot_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'booking_timestamp_shape_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'booking'
      ) AS booking_timestamp_constraint,
      (
        SELECT count(*) = 2 AND bool_and(constraint_row.convalidated)
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname IN (
          'booking_allocation_identity_fk', 'booking_citizen_identity_fk'
        )
          AND constraint_row.contype = 'f'
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'booking'
      ) AS booking_identity_constraints,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'booking_initial_state'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'booking'
      ) AS booking_initial_trigger,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'booking_state_transition'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'booking'
      ) AS booking_transition_trigger,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'matter_lifecycle_shape_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'matter'
      ) AS matter_shape_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'matter_booking_identity_fk'
          AND constraint_row.contype = 'f'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'matter'
      ) AS matter_identity_constraint,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'matter_initial_state'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'matter'
      ) AS matter_initial_trigger,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'matter_lifecycle_change'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'matter'
      ) AS matter_lifecycle_trigger,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
        WHERE trigger_row.tgname = 'allocation_active_scheduling_guard'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'allocation'
          AND pg_get_functiondef(function_row.oid) LIKE
            '%OLD.status = ''ASSIGNED'' AND NEW.status = ''COMPLETED''%'
      ) AS allocation_scheduling_guard_trigger,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'payment_quote_matter_provider_fk'
          AND constraint_row.contype = 'f'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'payment_quote'
      ) AS payment_quote_matter_provider_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'payment_quote_currency_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'payment_quote'
      ) AS payment_quote_currency_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'payment_quote_expiry_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'payment_quote'
      ) AS payment_quote_expiry_constraint,
      EXISTS (
        SELECT 1
        FROM pg_constraint constraint_row
        JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE constraint_row.conname = 'payment_quote_breakdown_check'
          AND constraint_row.contype = 'c'
          AND constraint_row.convalidated
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'payment_quote'
      ) AS payment_quote_breakdown_constraint,
      EXISTS (
        SELECT 1
        FROM pg_trigger trigger_row
        JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
        JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
        WHERE trigger_row.tgname = 'payment_quote_append_only'
          AND NOT trigger_row.tgisinternal
          AND namespace_row.nspname = 'public'
          AND table_row.relname = 'payment_quote'
      ) AS payment_quote_append_trigger,
      EXISTS (
        SELECT 1
        FROM pg_proc function_row
        WHERE function_row.oid = to_regprocedure(
          'public.create_payment_quote(uuid,uuid,numeric,text,jsonb,timestamptz,text)'
        )
          AND function_row.prosecdef
          AND function_row.proconfig @> ARRAY['search_path=pg_catalog']::text[]
          AND pg_get_userbyid(function_row.proowner) NOT IN (
            'legal_service_app', 'legal_service_runtime'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(function_row.proacl, acldefault('f', function_row.proowner))
            ) privilege_row
            WHERE privilege_row.grantee = 0
              AND privilege_row.privilege_type = 'EXECUTE'
          )
      ) AS payment_quote_writer,
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
            'verification_case', 'verification_check', 'credential_policy', 'booking', 'matter',
            'payment_quote', 'payment_intent', 'payment_webhook_event', 'settlement_record',
            'offline_payment_acknowledgement', 'schema_migration'
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
    may_insert_booking: boolean;
    may_update_booking: boolean;
    may_delete_booking: boolean;
    may_truncate_booking: boolean;
    may_update_booking_status: boolean;
    may_update_booking_timestamp: boolean;
    may_update_booking_identity: boolean;
    may_update_booking_slot: boolean;
    may_insert_matter: boolean;
    may_insert_matter_identity: boolean;
    may_insert_matter_status: boolean;
    may_insert_matter_closure: boolean;
    may_insert_matter_other: boolean;
    may_update_matter: boolean;
    may_delete_matter: boolean;
    may_truncate_matter: boolean;
    may_read_payment_quote: boolean;
    may_insert_payment_quote_table: boolean;
    may_insert_payment_quote_columns: boolean;
    may_insert_payment_quote_allowed_columns: boolean;
    may_insert_payment_quote_system_columns: boolean;
    may_execute_payment_quote_writer: boolean;
    may_mutate_payment_quote: boolean;
    may_read_payment_intent: boolean;
    may_mutate_payment_intent: boolean;
    may_mutate_payment_webhook: boolean;
    may_mutate_settlement_record: boolean;
    may_mutate_offline_acknowledgement: boolean;
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
        ) AS may_execute_credential_degrader,
        has_any_column_privilege('legal_service_app', 'booking', 'INSERT')
          AS may_insert_booking,
        has_table_privilege('legal_service_app', 'booking', 'UPDATE')
          AS may_update_booking,
        has_table_privilege('legal_service_app', 'booking', 'DELETE')
          AS may_delete_booking,
        has_table_privilege('legal_service_app', 'booking', 'TRUNCATE')
          AS may_truncate_booking,
        has_column_privilege('legal_service_app', 'booking', 'status', 'UPDATE')
          AS may_update_booking_status,
        has_column_privilege('legal_service_app', 'booking', 'updated_at', 'UPDATE')
          AS may_update_booking_timestamp,
        (
          has_column_privilege('legal_service_app', 'booking', 'id', 'UPDATE')
          OR has_column_privilege('legal_service_app', 'booking', 'need_request_id', 'UPDATE')
          OR has_column_privilege('legal_service_app', 'booking', 'allocation_id', 'UPDATE')
          OR has_column_privilege('legal_service_app', 'booking', 'provider_id', 'UPDATE')
          OR has_column_privilege('legal_service_app', 'booking', 'citizen_user_id', 'UPDATE')
          OR has_column_privilege('legal_service_app', 'booking', 'created_at', 'UPDATE')
        ) AS may_update_booking_identity,
        has_column_privilege('legal_service_app', 'booking', 'slot', 'UPDATE')
          AS may_update_booking_slot,
        has_table_privilege('legal_service_app', 'matter', 'INSERT')
          AS may_insert_matter,
        (
          has_column_privilege('legal_service_app', 'matter', 'allocation_id', 'INSERT')
          AND has_column_privilege('legal_service_app', 'matter', 'provider_id', 'INSERT')
          AND has_column_privilege('legal_service_app', 'matter', 'citizen_user_id', 'INSERT')
        ) AS may_insert_matter_identity,
        has_column_privilege('legal_service_app', 'matter', 'status', 'INSERT')
          AS may_insert_matter_status,
        (
          has_column_privilege('legal_service_app', 'matter', 'closed_at', 'INSERT')
          OR has_column_privilege('legal_service_app', 'matter', 'close_reason', 'INSERT')
        ) AS may_insert_matter_closure,
        (
          has_column_privilege('legal_service_app', 'matter', 'id', 'INSERT')
          OR has_column_privilege('legal_service_app', 'matter', 'opened_at', 'INSERT')
          OR has_column_privilege('legal_service_app', 'matter', 'cnr_number', 'INSERT')
        ) AS may_insert_matter_other,
        has_any_column_privilege('legal_service_app', 'matter', 'UPDATE')
          AS may_update_matter,
        has_table_privilege('legal_service_app', 'matter', 'DELETE')
          AS may_delete_matter,
        has_table_privilege('legal_service_app', 'matter', 'TRUNCATE')
          AS may_truncate_matter,
        has_table_privilege('legal_service_app', 'payment_quote', 'SELECT')
          AS may_read_payment_quote,
        has_table_privilege('legal_service_app', 'payment_quote', 'INSERT')
          AS may_insert_payment_quote_table,
        has_any_column_privilege('legal_service_app', 'payment_quote', 'INSERT')
          AS may_insert_payment_quote_columns,
        (
          has_column_privilege('legal_service_app', 'payment_quote', 'matter_id', 'INSERT')
          AND has_column_privilege('legal_service_app', 'payment_quote', 'provider_id', 'INSERT')
          AND has_column_privilege('legal_service_app', 'payment_quote', 'amount', 'INSERT')
          AND has_column_privilege('legal_service_app', 'payment_quote', 'currency', 'INSERT')
          AND has_column_privilege(
            'legal_service_app', 'payment_quote', 'fee_breakdown_json', 'INSERT'
          )
          AND has_column_privilege('legal_service_app', 'payment_quote', 'expires_at', 'INSERT')
        ) AS may_insert_payment_quote_allowed_columns,
        (
          has_column_privilege('legal_service_app', 'payment_quote', 'id', 'INSERT')
          OR has_column_privilege('legal_service_app', 'payment_quote', 'created_at', 'INSERT')
        ) AS may_insert_payment_quote_system_columns,
        has_function_privilege(
          'legal_service_app',
          'create_payment_quote(uuid,uuid,numeric,text,jsonb,timestamptz,text)',
          'EXECUTE'
        ) AS may_execute_payment_quote_writer,
        (
          has_any_column_privilege('legal_service_app', 'payment_quote', 'UPDATE')
          OR has_table_privilege('legal_service_app', 'payment_quote', 'DELETE')
          OR has_table_privilege('legal_service_app', 'payment_quote', 'TRUNCATE')
        ) AS may_mutate_payment_quote,
        has_table_privilege('legal_service_app', 'payment_intent', 'SELECT')
          AS may_read_payment_intent,
        (
          has_any_column_privilege('legal_service_app', 'payment_intent', 'INSERT')
          OR has_any_column_privilege('legal_service_app', 'payment_intent', 'UPDATE')
          OR has_table_privilege('legal_service_app', 'payment_intent', 'DELETE')
          OR has_table_privilege('legal_service_app', 'payment_intent', 'TRUNCATE')
        ) AS may_mutate_payment_intent,
        (
          has_any_column_privilege('legal_service_app', 'payment_webhook_event', 'INSERT')
          OR has_any_column_privilege('legal_service_app', 'payment_webhook_event', 'UPDATE')
          OR has_table_privilege('legal_service_app', 'payment_webhook_event', 'DELETE')
          OR has_table_privilege('legal_service_app', 'payment_webhook_event', 'TRUNCATE')
        ) AS may_mutate_payment_webhook,
        (
          has_any_column_privilege('legal_service_app', 'settlement_record', 'INSERT')
          OR has_any_column_privilege('legal_service_app', 'settlement_record', 'UPDATE')
          OR has_table_privilege('legal_service_app', 'settlement_record', 'DELETE')
          OR has_table_privilege('legal_service_app', 'settlement_record', 'TRUNCATE')
        ) AS may_mutate_settlement_record,
        (
          has_any_column_privilege(
            'legal_service_app', 'offline_payment_acknowledgement', 'INSERT'
          )
          OR has_any_column_privilege(
            'legal_service_app', 'offline_payment_acknowledgement', 'UPDATE'
          )
          OR has_table_privilege(
            'legal_service_app', 'offline_payment_acknowledgement', 'DELETE'
          )
          OR has_table_privilege(
            'legal_service_app', 'offline_payment_acknowledgement', 'TRUNCATE'
          )
        ) AS may_mutate_offline_acknowledgement
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
    roleState.may_insert_booking ||
    roleState.may_update_booking ||
    roleState.may_delete_booking ||
    roleState.may_truncate_booking ||
    !roleState.may_update_booking_status ||
    !roleState.may_update_booking_timestamp ||
    roleState.may_update_booking_identity ||
    roleState.may_update_booking_slot ||
    roleState.may_insert_matter ||
    !roleState.may_insert_matter_identity ||
    !roleState.may_insert_matter_status ||
    roleState.may_insert_matter_closure ||
    roleState.may_insert_matter_other ||
    roleState.may_update_matter ||
    roleState.may_delete_matter ||
    roleState.may_truncate_matter ||
    !roleState.may_read_payment_quote ||
    roleState.may_insert_payment_quote_table ||
    roleState.may_insert_payment_quote_columns ||
    roleState.may_insert_payment_quote_allowed_columns ||
    roleState.may_insert_payment_quote_system_columns ||
    !roleState.may_execute_payment_quote_writer ||
    roleState.may_mutate_payment_quote ||
    !roleState.may_read_payment_intent ||
    roleState.may_mutate_payment_intent ||
    roleState.may_mutate_payment_webhook ||
    roleState.may_mutate_settlement_record ||
    roleState.may_mutate_offline_acknowledgement ||
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
