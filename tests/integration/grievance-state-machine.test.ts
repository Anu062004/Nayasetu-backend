import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const databaseSuite = databaseUrl ? describe : describe.skip;

async function expectConstraintFailure(client: Client, statement: string): Promise<void> {
  const savepoint = `grievance_error_${randomUUID().replaceAll("-", "")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let caught: unknown;
  try {
    await client.query(statement);
  } catch (error) {
    caught = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  expect((caught as { code?: string } | undefined)?.code).toBe("23514");
}

databaseSuite("PostgreSQL grievance state machine", () => {
  it("requires OPEN -> TRIAGED before a terminal outcome and prevents reopening", async () => {
    const client = new Client({ connectionString: databaseUrl });
    const complainantId = randomUUID();
    const providerUserId = randomUUID();
    const providerId = randomUUID();
    const grievanceId = randomUUID();
    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO user_account(id, status) VALUES ($1,'TEST'),($2,'TEST')", [
        complainantId,
        providerUserId,
      ]);
      await client.query(
        `INSERT INTO provider(
           id, user_id, provider_type, display_name, district, state, status
         ) VALUES ($1,$2,'TEST_TYPE','Grievance fixture','TEST_DISTRICT','TEST_STATE','TEST')`,
        [providerId, providerUserId],
      );
      await client.query(
        `INSERT INTO grievance(id, complainant_user_id, subject_provider_id, category)
         VALUES ($1,$2,$3,'TEST_CATEGORY')`,
        [grievanceId, complainantId, providerId],
      );

      await expectConstraintFailure(
        client,
        `UPDATE grievance SET status = 'PLATFORM_RESOLVED' WHERE id = '${grievanceId}'`,
      );
      await client.query("UPDATE grievance SET status = 'TRIAGED' WHERE id = $1", [grievanceId]);
      await client.query("UPDATE grievance SET status = 'REFERRED_TO_DLSA' WHERE id = $1", [
        grievanceId,
      ]);
      await expectConstraintFailure(
        client,
        `UPDATE grievance SET status = 'OPEN' WHERE id = '${grievanceId}'`,
      );

      const status = await client.query<{ status: string }>(
        "SELECT status FROM grievance WHERE id = $1",
        [grievanceId],
      );
      expect(status.rows[0]?.status).toBe("REFERRED_TO_DLSA");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("rejects insertion directly into a non-OPEN state", async () => {
    const client = new Client({ connectionString: databaseUrl });
    const complainantId = randomUUID();
    const providerUserId = randomUUID();
    const providerId = randomUUID();
    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO user_account(id, status) VALUES ($1,'TEST'),($2,'TEST')", [
        complainantId,
        providerUserId,
      ]);
      await client.query(
        `INSERT INTO provider(
           id, user_id, provider_type, display_name, district, state, status
         ) VALUES ($1,$2,'TEST_TYPE','Grievance fixture','TEST_DISTRICT','TEST_STATE','TEST')`,
        [providerId, providerUserId],
      );
      await expectConstraintFailure(
        client,
        `INSERT INTO grievance(
           complainant_user_id, subject_provider_id, category, status
         ) VALUES (
           '${complainantId}', '${providerId}', 'TEST_CATEGORY', 'TRIAGED'
         )`,
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
