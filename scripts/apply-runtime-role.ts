import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimePassword = process.env.RUNTIME_DATABASE_PASSWORD;
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required");
if (!runtimePassword || runtimePassword.length < 16) {
  throw new Error("RUNTIME_DATABASE_PASSWORD must contain at least 16 characters");
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roleSql = await readFile(path.join(repositoryRoot, "db", "roles", "runtime.sql"), "utf8");
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'legal_service_runtime') THEN
        CREATE ROLE legal_service_runtime NOLOGIN;
      END IF;
    END
    $$
  `);
  await client.query(
    `ALTER ROLE legal_service_runtime
     NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`,
  );
  await client.query(roleSql);
  const loginExists = await client.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'legal_service_app') AS exists",
  );
  const passwordStatement = await client.query<{ statement: string }>(
    `SELECT format(
       CASE WHEN $2::boolean
         THEN 'ALTER ROLE legal_service_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD %L'
         ELSE 'CREATE ROLE legal_service_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT PASSWORD %L'
       END,
       $1::text
     ) AS statement`,
    [runtimePassword, loginExists.rows[0]?.exists ?? false],
  );
  const statement = passwordStatement.rows[0]?.statement;
  if (!statement) throw new Error("Failed to build runtime login statement");
  await client.query(statement);
  await client.query("GRANT legal_service_runtime TO legal_service_app");
  process.stdout.write("Applied least-privilege runtime role grants.\n");
} finally {
  await client.end();
}
