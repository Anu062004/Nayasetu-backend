import { randomUUID } from "node:crypto";
import { Client, Pool, type PoolClient, type QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { runCredentialRevalidationBatch } from "../../src/workers/credential-revalidation.js";

const ownerDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
const databaseSuite = ownerDatabaseUrl && runtimeDatabaseUrl ? describe : describe.skip;

const TEST_POLICY = {
  version: "TEST_POLICY_V1_NOT_PRODUCTION",
  providerType: "TEST_PROVIDER_TYPE",
  sources: [
    { sourceId: "TEST_MANUAL_SOURCE", evidenceKind: "MANUAL_DOCUMENT" },
    { sourceId: "TEST_AUTHORITY_SOURCE", evidenceKind: "AUTHORITY" },
  ],
  requiredDocumentLegs: [{ checkType: "TEST_IDENTITY", allowedSourceIds: ["TEST_MANUAL_SOURCE"] }],
  identityConsistencyLeg: {
    checkType: "TEST_IDENTITY",
    allowedSourceIds: ["TEST_MANUAL_SOURCE"],
  },
  currentAuthorityLegs: [
    { checkType: "TEST_CURRENCY", allowedSourceIds: ["TEST_AUTHORITY_SOURCE"] },
  ],
  currentAuthorityFreshnessMs: 86_400_000,
} as const;

async function createProvider(
  database: Client | Pool,
  input: {
    providerId: string;
    userId: string;
    tier?: "SELF_DECLARED" | "DOCUMENT_VERIFIED" | "FULLY_VERIFIED";
    tierDecidedAt?: Date;
    tierExpiresAt?: Date;
  },
): Promise<void> {
  await database.query("INSERT INTO user_account(id, status) VALUES ($1, 'TEST')", [input.userId]);
  await database.query(
    `INSERT INTO provider(
       id, user_id, provider_type, display_name, district, state, status,
       tier, tier_decided_at, tier_expires_at
     ) VALUES (
       $1,$2,$3,'Credential revalidation fixture',
       'TEST_DISTRICT','TEST_STATE','TEST',$4,$5,$6
     )`,
    [
      input.providerId,
      input.userId,
      TEST_POLICY.providerType,
      input.tier ?? "SELF_DECLARED",
      input.tierDecidedAt ?? null,
      input.tierExpiresAt ?? null,
    ],
  );
}

async function expectPostgresError(
  client: Client,
  statement: string,
  expectedCode: string,
): Promise<void> {
  const savepoint = `credential_error_${randomUUID().replaceAll("-", "")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let result: QueryResult | undefined;
  let caught: unknown;
  try {
    result = await client.query(statement);
  } catch (error) {
    caught = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (!caught) {
    throw new Error(
      `Expected PostgreSQL error ${expectedCode}, got ${result?.rowCount ?? 0} affected row(s)`,
    );
  }
  expect((caught as { code?: string }).code).toBe(expectedCode);
}

databaseSuite("PostgreSQL credential decision boundary", () => {
  it("degrades each expired FULLY_VERIFIED provider once under concurrent runtime claims", async () => {
    const owner = new Pool({ connectionString: ownerDatabaseUrl, max: 2 });
    const runtime = new Pool({ connectionString: runtimeDatabaseUrl, max: 20 });
    const workerClients: PoolClient[] = [];
    const adminActorId = randomUUID();
    const staleProviderId = randomUUID();
    const staleProviderUserId = randomUUID();
    const currentProviderId = randomUUID();
    const currentProviderUserId = randomUUID();
    const now = new Date();

    try {
      await owner.query("INSERT INTO user_account(id, status) VALUES ($1, 'TEST')", [adminActorId]);
      await owner.query(
        "INSERT INTO role_grant(user_id, role, scope) VALUES ($1, 'ADMIN', 'credentials:revalidate')",
        [adminActorId],
      );
      await createProvider(owner, {
        providerId: staleProviderId,
        userId: staleProviderUserId,
        tier: "FULLY_VERIFIED",
        tierDecidedAt: new Date(now.getTime() - 60 * 86_400_000),
        tierExpiresAt: new Date(now.getTime() - 86_400_000),
      });
      await createProvider(owner, {
        providerId: currentProviderId,
        userId: currentProviderUserId,
        tier: "FULLY_VERIFIED",
        tierDecidedAt: new Date(now.getTime() - 86_400_000),
        tierExpiresAt: new Date(now.getTime() + 86_400_000),
      });

      const executions = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const workerClient = await runtime.connect();
          workerClients.push(workerClient);
          await workerClient.query("BEGIN");
          const result = await runCredentialRevalidationBatch({
            database: workerClient,
            adminActorId,
            batchSize: 10,
          });
          return { workerClient, result };
        }),
      );
      const results = executions.map((execution) => execution.result);
      expect(results.reduce((sum, result) => sum + result.processed, 0)).toBe(1);
      expect(results.flatMap((result) => result.providerIds)).toEqual([staleProviderId]);

      const winner = executions.find((execution) => execution.result.processed === 1)?.workerClient;
      if (!winner) throw new Error("Credential revalidation winner was not retained");
      const providers = await winner.query<{
        id: string;
        tier: string;
        tier_decided_at: Date;
        tier_expires_at: Date | null;
      }>(
        `SELECT id, tier, tier_decided_at, tier_expires_at
         FROM provider WHERE id = ANY($1::uuid[])`,
        [[staleProviderId, currentProviderId]],
      );
      expect(providers.rows.find((provider) => provider.id === staleProviderId)).toMatchObject({
        tier: "DOCUMENT_VERIFIED",
        tier_expires_at: null,
      });
      expect(
        providers.rows
          .find((provider) => provider.id === staleProviderId)
          ?.tier_decided_at.getTime(),
      ).toBeGreaterThanOrEqual(now.getTime());
      expect(providers.rows.find((provider) => provider.id === currentProviderId)).toMatchObject({
        tier: "FULLY_VERIFIED",
        tier_expires_at: new Date(now.getTime() + 86_400_000),
      });

      const audits = await winner.query<{ action: string; actor_id: string }>(
        `SELECT action, actor_id FROM audit_event
         WHERE entity_type = 'provider' AND entity_id = $1`,
        [staleProviderId],
      );
      expect(audits.rows).toEqual([
        { action: "provider.reverification.due", actor_id: adminActorId },
      ]);
    } finally {
      await Promise.all(
        workerClients.map(async (workerClient) => {
          await workerClient.query("ROLLBACK");
          workerClient.release();
        }),
      );
      await owner.query("DELETE FROM provider WHERE id = ANY($1::uuid[])", [
        [staleProviderId, currentProviderId],
      ]);
      await owner.query("DELETE FROM role_grant WHERE user_id = $1", [adminActorId]);
      await owner.query("DELETE FROM user_account WHERE id = ANY($1::uuid[])", [
        [adminActorId, staleProviderUserId, currentProviderUserId],
      ]);
      await runtime.end();
      await owner.end();
    }
  }, 60_000);

  it("computes final decisions from owner policy and immutable checks through runtime grants", async () => {
    const client = new Client({ connectionString: ownerDatabaseUrl });
    const adminActorId = randomUUID();
    const providerUserId = randomUUID();
    const providerId = randomUUID();
    const caseId = randomUUID();
    const decidedAt = new Date();
    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO user_account(id, status) VALUES ($1, 'TEST')", [
        adminActorId,
      ]);
      await client.query(
        "INSERT INTO role_grant(user_id, role, scope) VALUES ($1, 'ADMIN', 'credentials:review')",
        [adminActorId],
      );
      await createProvider(client, { providerId, userId: providerUserId });
      await client.query(
        `INSERT INTO credential_policy(provider_type, version, policy_snapshot, active)
         VALUES ($1,$2,$3,true)`,
        [TEST_POLICY.providerType, TEST_POLICY.version, TEST_POLICY],
      );
      await client.query(
        "INSERT INTO verification_case(id, provider_id, status) VALUES ($1,$2,'REVIEW_REQUIRED')",
        [caseId, providerId],
      );
      await client.query(
        `INSERT INTO verification_check(
           case_id, check_type, source_id, source_mode, result, checked_at
         ) VALUES
            ($1,'TEST_IDENTITY','TEST_MANUAL_SOURCE','LIVE','PASS',$2),
            ($1,'TEST_CURRENCY','TEST_AUTHORITY_SOURCE','LIVE','PASS',$2),
            ($1,'TEST_IDENTITY','TEST_MANUAL_SOURCE','MOCK','CONFLICT',$2),
            ($1,'TEST_CURRENCY','TEST_AUTHORITY_SOURCE','OFF','MISMATCH',$2),
            ($1,'TEST_IDENTITY','TEST_MANUAL_SOURCE','LIVE','CONFLICT',$3),
            ($1,'TEST_CURRENCY','TEST_AUTHORITY_SOURCE','LIVE','MISMATCH',$3)`,
        [caseId, decidedAt, new Date(decidedAt.getTime() + 86_400_000)],
      );

      await client.query("SET LOCAL ROLE legal_service_runtime");
      const finalized = await client.query<{
        tier_outcome: string;
        tier_expires_at: Date;
        decision_reasons: string[];
      }>(
        `SELECT tier_outcome, tier_expires_at, decision_reasons
         FROM finalize_verification_case($1,$2,$3,$4,$5,$6)`,
        [
          caseId,
          providerId,
          TEST_POLICY.version,
          decidedAt,
          adminActorId,
          "test-credential-finalize",
        ],
      );
      expect(finalized.rows[0]).toEqual({
        tier_outcome: "FULLY_VERIFIED",
        tier_expires_at: new Date(decidedAt.getTime() + 86_400_000),
        decision_reasons: ["CURRENT_LIVE_AUTHORITY_CONFIRMED"],
      });

      const stored = await client.query<{
        tier: string;
        tier_expires_at: Date;
        status: string;
        policy_version: string;
      }>(
        `SELECT provider.tier, provider.tier_expires_at,
                verification.status, verification.policy_version
         FROM provider
         JOIN verification_case verification ON verification.provider_id = provider.id
         WHERE provider.id = $1 AND verification.id = $2`,
        [providerId, caseId],
      );
      expect(stored.rows[0]).toEqual({
        tier: "FULLY_VERIFIED",
        tier_expires_at: new Date(decidedAt.getTime() + 86_400_000),
        status: "DECIDED",
        policy_version: TEST_POLICY.version,
      });
      const audit = await client.query(
        "SELECT 1 FROM audit_event WHERE request_id = 'test-credential-finalize'",
      );
      expect(audit.rowCount).toBe(2);

      await expectPostgresError(
        client,
        `UPDATE provider SET tier = 'SELF_DECLARED' WHERE id = '${providerId}'`,
        "42501",
      );
      await expectPostgresError(client, `DELETE FROM provider WHERE id = '${providerId}'`, "42501");
      await expectPostgresError(client, "TRUNCATE provider", "42501");
      await expectPostgresError(
        client,
        `UPDATE verification_case SET status = 'REVIEW_REQUIRED' WHERE id = '${caseId}'`,
        "42501",
      );
      await expectPostgresError(
        client,
        `UPDATE credential_policy SET active = false
         WHERE provider_type = '${TEST_POLICY.providerType}'`,
        "42501",
      );
      await expectPostgresError(
        client,
        `INSERT INTO provider(
           user_id, provider_type, display_name, district, state, status, tier
         ) VALUES (
           '${providerUserId}', '${TEST_POLICY.providerType}', 'forbidden',
           'TEST_DISTRICT', 'TEST_STATE', 'TEST', 'FULLY_VERIFIED'
         )`,
        "42501",
      );
      await expectPostgresError(
        client,
        `INSERT INTO verification_case(
           provider_id, status, tier_outcome, decided_at, decided_by
         ) VALUES (
           '${providerId}', 'DECIDED', 'FULLY_VERIFIED', now(), '${adminActorId}'
         )`,
        "42501",
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("enforces one active review and append-only recorded checks", async () => {
    const client = new Client({ connectionString: ownerDatabaseUrl });
    const providerId = randomUUID();
    const providerUserId = randomUUID();
    const caseId = randomUUID();
    await client.connect();
    await client.query("BEGIN");
    try {
      await createProvider(client, { providerId, userId: providerUserId });
      await client.query(
        "INSERT INTO verification_case(id, provider_id, status) VALUES ($1,$2,'REVIEW_REQUIRED')",
        [caseId, providerId],
      );
      await expectPostgresError(
        client,
        `INSERT INTO verification_case(provider_id, status)
         VALUES ('${providerId}', 'REVIEW_REQUIRED')`,
        "23505",
      );
      const checks = await client.query<{ id: string; recorded_sequence: string }>(
        `INSERT INTO verification_check(
           case_id, check_type, source_id, source_mode, result, checked_at
         ) VALUES
           ($1,'TEST_IDENTITY','TEST_MANUAL_SOURCE','OFF','UNAVAILABLE',now()),
           ($1,'TEST_IDENTITY','TEST_MANUAL_SOURCE','OFF','UNAVAILABLE',now())
         RETURNING id, recorded_sequence::text`,
        [caseId],
      );
      expect(BigInt(checks.rows[1]?.recorded_sequence ?? "0")).toBeGreaterThan(
        BigInt(checks.rows[0]?.recorded_sequence ?? "0"),
      );
      await expectPostgresError(
        client,
        `UPDATE verification_check SET source_ref = 'changed'
         WHERE id = '${checks.rows[0]?.id}'`,
        "55000",
      );
      await expectPostgresError(
        client,
        `DELETE FROM verification_check WHERE id = '${checks.rows[0]?.id}'`,
        "55000",
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
