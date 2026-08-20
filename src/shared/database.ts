import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import type { AppConfig } from "../app/config.js";

export type DatabaseClient = Pick<PoolClient, "query">;

export async function assertDatabaseRuntimeIdentity(
  database: DatabaseClient,
  expectedUser: string | undefined,
): Promise<void> {
  if (!expectedUser) return;
  const result = await database.query<{
    current_user: string;
    expected_user: boolean;
    runtime_member: boolean;
    owns_protected_table: boolean;
    privileged_login: boolean;
    unsafe_runtime_role: boolean;
  }>(
    `SELECT current_user,
            current_user = $1 AS expected_user,
            pg_has_role(current_user, 'legal_service_runtime', 'MEMBER') AS runtime_member,
            EXISTS (
              SELECT 1
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public'
                AND c.relname IN (
                  'credit_event', 'credit_balance', 'audit_event', 'provider',
                  'verification_case', 'verification_check', 'credential_policy',
                  'booking', 'matter', 'payment_quote', 'payment_intent',
                  'payment_webhook_event', 'settlement_record',
                  'offline_payment_acknowledgement', 'schema_migration'
                )
                AND pg_get_userbyid(c.relowner) = current_user
            ) AS owns_protected_table,
            EXISTS (
              SELECT 1 FROM pg_roles
              WHERE rolname = current_user
                AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
            ) AS privileged_login,
            EXISTS (
              SELECT 1 FROM pg_roles
              WHERE rolname = 'legal_service_runtime'
                AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)
            ) AS unsafe_runtime_role`,
    [expectedUser],
  );
  const identity = result.rows[0];
  if (
    !identity?.expected_user ||
    !identity.runtime_member ||
    identity.owns_protected_table ||
    identity.privileged_login ||
    identity.unsafe_runtime_role
  ) {
    throw new Error(`Unsafe database runtime identity '${identity?.current_user ?? "unknown"}'`);
  }
}

export function createPool(config: AppConfig): Pool {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    application_name: "legal-service-rails-backend",
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

export async function queryOne<T extends QueryResultRow>(
  client: DatabaseClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<T> {
  const result: QueryResult<T> = await client.query<T>(text, [...values]);
  const row = result.rows[0];
  if (!row) throw new Error("Expected database row was not returned");
  return row;
}
