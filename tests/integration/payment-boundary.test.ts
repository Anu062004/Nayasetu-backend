import { randomUUID } from "node:crypto";
import { Client, type QueryResult } from "pg";
import { describe, expect, it } from "vitest";

const ownerDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeDatabaseUrl = process.env.DATABASE_URL;
const databaseSuite = ownerDatabaseUrl && runtimeDatabaseUrl ? describe : describe.skip;

interface PaymentFixture {
  citizenId: string;
  providerUserId: string;
  otherProviderUserId: string;
  providerId: string;
  otherProviderId: string;
  matterId: string;
}

type EligibilityRoute = "PAID" | "LEGAL_AID_REFERRAL" | "PRO_BONO_ROTATION";

async function expectPostgresError(
  client: Client,
  statement: string,
  values: readonly unknown[],
  expectedCode: string,
): Promise<void> {
  const savepoint = `payment_error_${randomUUID().replaceAll("-", "")}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let result: QueryResult | undefined;
  let caught: unknown;
  try {
    result = await client.query(statement, [...values]);
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

async function createPaymentFixture(
  client: Client,
  route: EligibilityRoute = "PAID",
): Promise<PaymentFixture> {
  const citizenId = randomUUID();
  const providerUserId = randomUUID();
  const otherProviderUserId = randomUUID();
  const providerId = randomUUID();
  const otherProviderId = randomUUID();
  const needId = randomUUID();
  const allocationId = randomUUID();
  const bookingId = randomUUID();

  await client.query(
    `INSERT INTO user_account(id, status)
     VALUES ($1,'TEST'),($2,'TEST'),($3,'TEST')`,
    [citizenId, providerUserId, otherProviderUserId],
  );
  await client.query(
    `INSERT INTO provider(
       id, user_id, provider_type, display_name, district, state, status
     ) VALUES
       ($1,$2,'TEST_TYPE','Payment provider','TEST_DISTRICT','TEST_STATE','TEST'),
       ($3,$4,'TEST_TYPE','Other payment provider','TEST_DISTRICT','TEST_STATE','TEST')`,
    [providerId, providerUserId, otherProviderId, otherProviderUserId],
  );
  await client.query(
    `INSERT INTO role_grant(user_id, role)
     VALUES ($1,'PROVIDER'),($2,'PROVIDER')`,
    [providerUserId, otherProviderUserId],
  );
  await client.query(
    `INSERT INTO need_request(
       id, citizen_user_id, taxonomy_code, district, language, mode_pref, urgency, channel
     ) VALUES ($1,$2,'TEST_TAXONOMY','TEST_DISTRICT','TEST_LANGUAGE','REMOTE','TEST','TEST')`,
    [needId, citizenId],
  );
  await client.query(
    `INSERT INTO eligibility_decision(need_request_id, self_declared, route)
     VALUES ($1,false,$2)`,
    [needId, route],
  );
  await client.query(
    `INSERT INTO allocation(id, need_request_id, provider_id, mode, seed, decided_by)
     VALUES ($1,$2,$3,'CITIZEN_CHOICE',$2::text,$4)`,
    [allocationId, needId, providerId, citizenId],
  );
  await client.query(
    `INSERT INTO booking(
       id, need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
     ) VALUES (
       $1,$2,$3,$4,$5,
       tstzrange('2027-03-10T08:00:00Z','2027-03-10T09:00:00Z','[)'),
       'HELD'
     )`,
    [bookingId, needId, allocationId, providerId, citizenId],
  );
  await client.query("UPDATE booking SET status = 'CONFIRMED', updated_at = now() WHERE id = $1", [
    bookingId,
  ]);
  const matter = await client.query<{ id: string }>(
    `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
     VALUES ($1,$2,$3,'OPEN') RETURNING id`,
    [allocationId, providerId, citizenId],
  );
  const matterId = matter.rows[0]?.id;
  if (!matterId) throw new Error("Payment matter fixture returned no id");

  return {
    citizenId,
    providerUserId,
    otherProviderUserId,
    providerId,
    otherProviderId,
    matterId,
  };
}

const validBreakdown = {
  professionalFee: "100.00",
  processingFee: "10.50",
  platformCommission: "0.00",
};

databaseSuite("PostgreSQL payment persistence boundary", () => {
  it("enforces quote identity, exact disclosed money, expiry, and append-only history", async () => {
    const client = new Client({ connectionString: ownerDatabaseUrl });
    await client.connect();
    await client.query("BEGIN");
    try {
      const fixture = await createPaymentFixture(client);

      await expectPostgresError(
        client,
        `INSERT INTO payment_quote(
           matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
         ) VALUES ($1,$2,110.50,'INR',$3,now() + interval '1 hour')`,
        [fixture.matterId, fixture.otherProviderId, validBreakdown],
        "23503",
      );
      await expectPostgresError(
        client,
        `INSERT INTO payment_quote(
           matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
         ) VALUES ($1,$2,110.50,'inr',$3,now() + interval '1 hour')`,
        [fixture.matterId, fixture.providerId, validBreakdown],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO payment_quote(
           matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
         ) VALUES ($1,$2,110.50,'INR',$3,now() + interval '1 hour')`,
        [fixture.matterId, fixture.providerId, { ...validBreakdown, processingFee: "10.49" }],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO payment_quote(
           matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
         ) VALUES ($1,$2,110.50,'INR',$3,now() + interval '1 hour')`,
        [fixture.matterId, fixture.providerId, { ...validBreakdown, platformCommission: "1.00" }],
        "23514",
      );
      await expectPostgresError(
        client,
        `INSERT INTO payment_quote(
           matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
         ) VALUES ($1,$2,110.50,'INR',$3,now())`,
        [fixture.matterId, fixture.providerId, validBreakdown],
        "23514",
      );

      const quote = await client.query<{ id: string }>(
        `INSERT INTO payment_quote(
           matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
         ) VALUES ($1,$2,110.50,'INR',$3,now() + interval '1 hour') RETURNING id`,
        [fixture.matterId, fixture.providerId, validBreakdown],
      );
      const quoteId = quote.rows[0]?.id;
      if (!quoteId) throw new Error("Payment quote fixture returned no id");
      await expectPostgresError(
        client,
        "UPDATE payment_quote SET amount = 1 WHERE id = $1",
        [quoteId],
        "55000",
      );
      await expectPostgresError(
        client,
        "DELETE FROM payment_quote WHERE id = $1",
        [quoteId],
        "55000",
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });

  it("allows only the audited quote writer and denies fabricated external payment state", async () => {
    const client = new Client({ connectionString: ownerDatabaseUrl });
    await client.connect();
    await client.query("BEGIN");
    try {
      const fixture = await createPaymentFixture(client);
      const closedFixture = await createPaymentFixture(client);
      const legalAidFixture = await createPaymentFixture(client, "LEGAL_AID_REFERRAL");
      const proBonoFixture = await createPaymentFixture(client, "PRO_BONO_ROTATION");
      await client.query(
        `UPDATE matter
         SET status = 'CLOSED', closed_at = now(), close_reason = 'TEST_CLOSED'
         WHERE id = $1`,
        [closedFixture.matterId],
      );
      const intentId = randomUUID();
      const webhookId = randomUUID();
      const settlementId = randomUUID();
      const offlineId = randomUUID();
      await client.query(
        `INSERT INTO payment_intent(
           id, matter_id, payment_provider, provider_intent_ref, amount, status
         ) VALUES ($1,$2,'TEST_PSP','TEST_INTENT',110.50,'TEST_EXTERNAL_STATE')`,
        [intentId, fixture.matterId],
      );
      await client.query(
        `INSERT INTO payment_webhook_event(
           id, payment_provider, external_event_id, signature_valid, payload_hash
         ) VALUES ($1,'TEST_PSP','TEST_EVENT',false,'TEST_HASH')`,
        [webhookId],
      );
      await client.query(
        `INSERT INTO settlement_record(
           id, payment_intent_id, external_settlement_ref, status
         ) VALUES ($1,$2,'TEST_SETTLEMENT','TEST_EXTERNAL_STATE')`,
        [settlementId, intentId],
      );
      await client.query(
        `INSERT INTO offline_payment_acknowledgement(
           id, matter_id, recorded_by, external_reference, amount, currency
         ) VALUES ($1,$2,$3,'TEST_OFFLINE',110.50,'INR')`,
        [offlineId, fixture.matterId, fixture.citizenId],
      );

      await client.query("SET LOCAL ROLE legal_service_runtime");
      const acceptedRequestId = `payment-accepted-${randomUUID()}`;
      const quote = await client.query<{ id: string }>(
        `SELECT public.create_payment_quote(
           $1,$2,110.50,'INR',$3,now() + interval '1 hour',$4
         ) AS id`,
        [fixture.matterId, fixture.providerUserId, validBreakdown, acceptedRequestId],
      );
      const quoteId = quote.rows[0]?.id;
      if (!quoteId) throw new Error("Runtime quote writer returned no id");

      const audit = await client.query<{
        action: string;
        actor_type: string;
        actor_id: string;
        entity_type: string;
        entity_id: string;
        after_summary: Record<string, unknown>;
      }>(
        `SELECT action, actor_type, actor_id, entity_type, entity_id, after_summary
         FROM audit_event WHERE request_id = $1`,
        [acceptedRequestId],
      );
      expect(audit.rows).toEqual([
        {
          action: "payment.quote_created",
          actor_type: "PROVIDER",
          actor_id: fixture.providerUserId,
          entity_type: "payment_quote",
          entity_id: quoteId,
          after_summary: {
            matterId: fixture.matterId,
            amount: "110.50",
            currency: "INR",
            platformCommission: "0.00",
          },
        },
      ]);

      await expectPostgresError(
        client,
        `INSERT INTO payment_quote(
           matter_id, provider_id, amount, currency, fee_breakdown_json, expires_at
         ) VALUES ($1,$2,110.50,'INR',$3,now() + interval '1 hour')`,
        [fixture.matterId, fixture.providerId, validBreakdown],
        "42501",
      );

      const rejectedQuotes: Array<{
        actorId: string;
        matterId: string;
        requestId: string;
        expectedCode: string;
      }> = [
        {
          actorId: fixture.otherProviderUserId,
          matterId: fixture.matterId,
          requestId: `payment-wrong-provider-${randomUUID()}`,
          expectedCode: "42501",
        },
        {
          actorId: closedFixture.providerUserId,
          matterId: closedFixture.matterId,
          requestId: `payment-closed-${randomUUID()}`,
          expectedCode: "23514",
        },
        {
          actorId: legalAidFixture.providerUserId,
          matterId: legalAidFixture.matterId,
          requestId: `payment-legal-aid-${randomUUID()}`,
          expectedCode: "23514",
        },
        {
          actorId: proBonoFixture.providerUserId,
          matterId: proBonoFixture.matterId,
          requestId: `payment-pro-bono-${randomUUID()}`,
          expectedCode: "23514",
        },
      ];
      for (const rejected of rejectedQuotes) {
        await expectPostgresError(
          client,
          `SELECT public.create_payment_quote(
             $1,$2,110.50,'INR',$3,now() + interval '1 hour',$4
           )`,
          [rejected.matterId, rejected.actorId, validBreakdown, rejected.requestId],
          rejected.expectedCode,
        );
      }

      const rejectedState = await client.query<{
        accepted_quote_count: string;
        audit_count: string;
        quote_count: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM payment_quote
            WHERE matter_id IN ($1,$2,$3)) AS quote_count,
           (SELECT count(*)::text FROM audit_event
            WHERE request_id IN ($4,$5,$6,$7)) AS audit_count,
           (SELECT count(*)::text FROM payment_quote
            WHERE matter_id = $8) AS accepted_quote_count`,
        [
          closedFixture.matterId,
          legalAidFixture.matterId,
          proBonoFixture.matterId,
          ...rejectedQuotes.map((rejected) => rejected.requestId),
          fixture.matterId,
        ],
      );
      expect(rejectedState.rows[0]).toEqual({
        quote_count: "0",
        audit_count: "0",
        accepted_quote_count: "1",
      });
      await expectPostgresError(
        client,
        "UPDATE payment_quote SET amount = 1 WHERE id = $1",
        [quoteId],
        "42501",
      );
      await expectPostgresError(
        client,
        "DELETE FROM payment_quote WHERE id = $1",
        [quoteId],
        "42501",
      );
      await expectPostgresError(client, "TRUNCATE payment_quote", [], "42501");

      const deniedMutations: Array<[string, readonly unknown[]]> = [
        [
          `INSERT INTO payment_intent(
             matter_id, payment_provider, provider_intent_ref, amount, status
           ) VALUES ($1,'TEST_PSP','FORGED_INTENT',110.50,'PAID')`,
          [fixture.matterId],
        ],
        ["UPDATE payment_intent SET status = 'PAID' WHERE id = $1", [intentId]],
        ["DELETE FROM payment_intent WHERE id = $1", [intentId]],
        ["TRUNCATE payment_intent", []],
        [
          `INSERT INTO payment_webhook_event(
             payment_provider, external_event_id, signature_valid, payload_hash
           ) VALUES ('TEST_PSP','FORGED_EVENT',true,'FORGED_HASH')`,
          [],
        ],
        ["UPDATE payment_webhook_event SET processed_at = now() WHERE id = $1", [webhookId]],
        ["DELETE FROM payment_webhook_event WHERE id = $1", [webhookId]],
        ["TRUNCATE payment_webhook_event", []],
        [
          `INSERT INTO settlement_record(payment_intent_id, external_settlement_ref, status)
           VALUES ($1,'FORGED_SETTLEMENT','SETTLED')`,
          [intentId],
        ],
        ["UPDATE settlement_record SET status = 'SETTLED' WHERE id = $1", [settlementId]],
        ["DELETE FROM settlement_record WHERE id = $1", [settlementId]],
        ["TRUNCATE settlement_record", []],
        [
          `INSERT INTO offline_payment_acknowledgement(
             matter_id, recorded_by, external_reference, amount, currency
           ) VALUES ($1,$2,'FORGED_OFFLINE',110.50,'INR')`,
          [fixture.matterId, fixture.citizenId],
        ],
        ["UPDATE offline_payment_acknowledgement SET amount = 1 WHERE id = $1", [offlineId]],
        ["DELETE FROM offline_payment_acknowledgement WHERE id = $1", [offlineId]],
        ["TRUNCATE offline_payment_acknowledgement", []],
      ];
      for (const [statement, values] of deniedMutations) {
        await expectPostgresError(client, statement, values, "42501");
      }
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
