import "dotenv/config";
import { Client } from "pg";

const requiredEnvVars = [
  "NODE_ENV",
  "DATABASE_URL",
  "DATABASE_EXPECTED_USER",
  "AUTH_MODE",
  "SESSION_TOKEN_PEPPER",
  "PAYMENTS_MODE",
];

const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

if (process.env.NODE_ENV !== "production") {
  console.error(`NODE_ENV must be 'production' for release gate, got '${process.env.NODE_ENV}'`);
  process.exit(1);
}

if (process.env.AUTH_MODE !== "SESSION") {
  console.error(`AUTH_MODE must be 'SESSION' for production, got '${process.env.AUTH_MODE}'`);
  process.exit(1);
}

if (process.env.PAYMENTS_MODE !== "OFF") {
  console.error(`PAYMENTS_MODE must be 'OFF' for this build, got '${process.env.PAYMENTS_MODE}'`);
  process.exit(1);
}

if (!process.env.SESSION_TOKEN_PEPPER || process.env.SESSION_TOKEN_PEPPER.length < 32) {
  console.error("SESSION_TOKEN_PEPPER must contain at least 32 characters");
  process.exit(1);
}

const mockModes = [
  "CREDENTIAL_DIGILOCKER_MODE",
  "CREDENTIAL_BAR_MODE",
  "CREDENTIAL_AIBE_MODE",
  "IVR_MODE",
  "WHATSAPP_MODE",
];
const enabledMocks = mockModes.filter((key) => process.env[key] === "MOCK");
if (enabledMocks.length > 0) {
  console.error(`Production startup rejects MOCK capability modes: ${enabledMocks.join(", ")}`);
  process.exit(1);
}

console.log("Environment validation passed.");

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  console.log("Database connection established.");

  const migrationCheck = await client.query(
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migration') AS exists",
  );
  if (!migrationCheck.rows[0]?.exists) {
    console.error("schema_migration table not found. Run 'npm run db:migrate' first.");
    process.exit(1);
  }
  console.log("Migration table exists.");

  const pendingMigrations = await client.query(
    "SELECT name FROM schema_migration ORDER BY applied_at DESC LIMIT 5",
  );
  console.log(`Recent migrations: ${pendingMigrations.rows.map((r) => r.name).join(", ")}`);

  const identityCheck = await client.query<{
    current_user: string;
    expected_user: boolean;
    runtime_member: boolean;
    owns_protected_table: boolean;
    privileged_login: boolean;
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
            ) AS privileged_login`,
    [process.env.DATABASE_EXPECTED_USER ?? ""],
  );

  const identity = identityCheck.rows[0];
  if (
    !identity?.expected_user ||
    !identity.runtime_member ||
    identity.owns_protected_table ||
    identity.privileged_login
  ) {
    console.error(`Unsafe database runtime identity: ${JSON.stringify(identity)}`);
    process.exit(1);
  }
  console.log("Database identity verification passed.");

  console.log("Release gate passed. Ready for deployment.");
} catch (error) {
  console.error(`Release gate failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
} finally {
  await client.end();
}
