import { randomUUID } from "node:crypto";
import { Client, type QueryResult } from "pg";
import { describe, expect, it } from "vitest";
import { verifyLedgerChain } from "../../src/modules/ledger/domain/hash-chain.js";

const migrationDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const databaseSuite = migrationDatabaseUrl ? describe : describe.skip;

const TEST_FIXTURE_EVENT_TYPE = "CLE_MODULE_COMPLETED";
const TEST_FIXTURE_WEIGHT_VERSION = "TEST_FIXTURE_V1_NOT_PRODUCTION";
const TEST_FIXTURE_CREDIT_DELTA = "12.5";

interface LedgerRow {
  id: string;
  provider_id: string;
  event_type: string;
  credits: string;
  occurred_at: Date;
  prev_hash: Buffer | null;
  hash: Buffer;
}

async function expectPostgresError(
  client: Client,
  statement: string,
  expectedCode: string,
): Promise<void> {
  const savepoint = `expected_error_${randomUUID().replaceAll("-", "")}`;
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
      `Expected PostgreSQL error ${expectedCode}, but statement completed with ${result?.rowCount ?? 0} row(s)`,
    );
  }
  expect((caught as { code?: string }).code).toBe(expectedCode);
}

databaseSuite("PostgreSQL ledger and runtime-role integrity", () => {
  it("appends an audited hash chain, reconciles its balance, and accepts a compensating event", async () => {
    const client = new Client({ connectionString: migrationDatabaseUrl });
    const actorId = randomUUID();
    const providerId = randomUUID();
    const occurredAt = new Date("2026-08-19T10:11:12.345Z");

    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO user_account(id, status) VALUES ($1, 'TEST')", [actorId]);
      await client.query(
        `INSERT INTO provider(
           id, user_id, provider_type, display_name, district, state, status
         ) VALUES ($1,$2,'TEST_TYPE','Ledger integrity fixture','TEST_DISTRICT','TEST_STATE','TEST')`,
        [providerId, actorId],
      );
      await client.query("INSERT INTO credit_balance(provider_id) VALUES ($1)", [providerId]);
      await client.query("SET LOCAL ROLE legal_service_runtime");

      const append = (credits: string, units: string, evidenceRef: string, requestId: string) =>
        client.query<{ event_id: string; event_hash: Buffer }>(
          `SELECT event_id::text, event_hash
           FROM append_credit_event(
             $1,$2,$3::numeric,$4,$5::numeric,NULL,$6,$7,
             'PROVIDER',$8,NULL,NULL,$9
           )`,
          [
            providerId,
            TEST_FIXTURE_EVENT_TYPE,
            units,
            TEST_FIXTURE_WEIGHT_VERSION,
            credits,
            evidenceRef,
            occurredAt,
            actorId,
            requestId,
          ],
        );

      const first = await append(
        TEST_FIXTURE_CREDIT_DELTA,
        "1",
        "TEST_FIXTURE_LEDGER_INTEGRITY_ORIGINAL",
        "test-ledger-integrity-original",
      );
      const second = await append(
        `-${TEST_FIXTURE_CREDIT_DELTA}`,
        "-1",
        "TEST_FIXTURE_LEDGER_INTEGRITY_COMPENSATION",
        "test-ledger-integrity-compensation",
      );

      const events = await client.query<LedgerRow>(
        `SELECT id::text, provider_id::text, event_type, credits::text,
                occurred_at, prev_hash, hash
         FROM credit_event
         WHERE provider_id = $1
         ORDER BY id`,
        [providerId],
      );
      expect(events.rows).toHaveLength(2);
      expect(first.rows[0]?.event_id).toBe(events.rows[0]?.id);
      expect(first.rows[0]?.event_hash.equals(events.rows[0]?.hash ?? Buffer.alloc(0))).toBe(true);
      expect(second.rows[0]?.event_id).toBe(events.rows[1]?.id);
      expect(second.rows[0]?.event_hash.equals(events.rows[1]?.hash ?? Buffer.alloc(0))).toBe(true);
      expect(events.rows.map((event) => event.credits)).toEqual([
        TEST_FIXTURE_CREDIT_DELTA,
        `-${TEST_FIXTURE_CREDIT_DELTA}`,
      ]);
      expect(
        verifyLedgerChain(
          events.rows.map((event) => ({
            id: BigInt(event.id),
            providerId: event.provider_id,
            eventType: event.event_type,
            credits: event.credits,
            occurredAt: event.occurred_at,
            ...(event.prev_hash ? { previousHash: event.prev_hash } : {}),
            hash: event.hash,
          })),
        ),
      ).toBe(true);

      const balance = await client.query<{
        total_credits: string;
        period_credits: string;
        last_event_id: string | null;
        total_matches_events: boolean;
        period_matches_events: boolean;
        head_matches_events: boolean;
      }>(
        `SELECT cb.total_credits::text,
                cb.period_credits::text,
                cb.last_event_id::text,
                cb.total_credits = ledger.credit_sum AS total_matches_events,
                cb.period_credits = ledger.credit_sum AS period_matches_events,
                cb.last_event_id = ledger.event_head AS head_matches_events
         FROM credit_balance cb
         CROSS JOIN LATERAL (
           SELECT COALESCE(sum(credits), 0) AS credit_sum, max(id) AS event_head
           FROM credit_event
           WHERE provider_id = cb.provider_id
         ) ledger
         WHERE cb.provider_id = $1`,
        [providerId],
      );
      expect(Number(balance.rows[0]?.total_credits)).toBe(0);
      expect(Number(balance.rows[0]?.period_credits)).toBe(0);
      expect(balance.rows[0]?.last_event_id).toBe(events.rows[1]?.id);
      expect(balance.rows[0]?.total_matches_events).toBe(true);
      expect(balance.rows[0]?.period_matches_events).toBe(true);
      expect(balance.rows[0]?.head_matches_events).toBe(true);

      const audits = await client.query<{
        entity_id: string;
        action: string;
        request_id: string;
      }>(
        `SELECT entity_id, action, request_id
         FROM audit_event
         WHERE entity_type = 'credit_event' AND entity_id = ANY($1::text[])
         ORDER BY id`,
        [events.rows.map((event) => event.id)],
      );
      expect(audits.rows).toEqual([
        {
          entity_id: events.rows[0]?.id,
          action: "credit_event.appended",
          request_id: "test-ledger-integrity-original",
        },
        {
          entity_id: events.rows[1]?.id,
          action: "credit_event.appended",
          request_id: "test-ledger-integrity-compensation",
        },
      ]);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("denies runtime-role ledger mutations and enforces append-only triggers for the owner", async () => {
    const client = new Client({ connectionString: migrationDatabaseUrl });
    const actorId = randomUUID();
    const providerId = randomUUID();

    await client.connect();
    await client.query("BEGIN");
    try {
      await client.query("INSERT INTO user_account(id, status) VALUES ($1, 'TEST')", [actorId]);
      await client.query(
        `INSERT INTO provider(
           id, user_id, provider_type, display_name, district, state, status
         ) VALUES ($1,$2,'TEST_TYPE','Ledger grants fixture','TEST_DISTRICT','TEST_STATE','TEST')`,
        [providerId, actorId],
      );
      await client.query("INSERT INTO credit_balance(provider_id) VALUES ($1)", [providerId]);
      await client.query("SET LOCAL ROLE legal_service_runtime");
      const appended = await client.query<{ event_id: string }>(
        `SELECT event_id::text FROM append_credit_event(
           $1,$2,1,$3,$4,NULL,'TEST_FIXTURE_LEDGER_GRANTS',
           '2026-08-19T10:11:12.345Z'::timestamptz,
           'PROVIDER',$5,NULL,NULL,'test-ledger-grants'
         )`,
        [
          providerId,
          TEST_FIXTURE_EVENT_TYPE,
          TEST_FIXTURE_WEIGHT_VERSION,
          TEST_FIXTURE_CREDIT_DELTA,
          actorId,
        ],
      );
      const eventId = appended.rows[0]?.event_id;
      if (!eventId) throw new Error("Ledger fixture append returned no event");

      await expectPostgresError(
        client,
        `INSERT INTO credit_event(
           provider_id, event_type, units, weight_version, credits,
           evidence_ref, occurred_at, hash
         ) VALUES (
           '${providerId}', '${TEST_FIXTURE_EVENT_TYPE}', 1,
           '${TEST_FIXTURE_WEIGHT_VERSION}', ${TEST_FIXTURE_CREDIT_DELTA},
           'TEST_FIXTURE_DIRECT_INSERT', now(), decode(repeat('00', 32), 'hex')
         )`,
        "42501",
      );
      await expectPostgresError(
        client,
        `UPDATE credit_event SET evidence_ref = 'TEST_FIXTURE_MUTATED' WHERE id = ${eventId}`,
        "42501",
      );
      await expectPostgresError(client, `DELETE FROM credit_event WHERE id = ${eventId}`, "42501");
      await expectPostgresError(
        client,
        `UPDATE credit_balance SET total_credits = 999 WHERE provider_id = '${providerId}'`,
        "42501",
      );
      await expectPostgresError(
        client,
        `DELETE FROM credit_balance WHERE provider_id = '${providerId}'`,
        "42501",
      );

      await client.query("RESET ROLE");
      await expectPostgresError(
        client,
        `UPDATE credit_event SET evidence_ref = 'TEST_FIXTURE_MUTATED' WHERE id = ${eventId}`,
        "55000",
      );
      await expectPostgresError(client, `DELETE FROM credit_event WHERE id = ${eventId}`, "55000");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
