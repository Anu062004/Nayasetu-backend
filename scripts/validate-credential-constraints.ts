import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.MIGRATION_DATABASE_URL;
if (!databaseUrl) throw new Error("MIGRATION_DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE provider IN SHARE MODE");
  const invalid = await client.query<{ id: string }>(
    `SELECT id::text
     FROM provider
     WHERE tier = 'FULLY_VERIFIED'
       AND (
         tier_decided_at IS NULL
         OR tier_expires_at IS NULL
         OR tier_expires_at <= tier_decided_at
       )
     ORDER BY id
     LIMIT 20`,
  );
  if (invalid.rowCount) {
    throw new Error(
      `Credential expiry cleanup is incomplete for provider ids: ${invalid.rows
        .map((row) => row.id)
        .join(", ")}`,
    );
  }
  await client.query(
    "ALTER TABLE provider VALIDATE CONSTRAINT provider_fully_verified_expiry_check",
  );
  await client.query("COMMIT");
  process.stdout.write("Credential constraint validation passed.\n");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
