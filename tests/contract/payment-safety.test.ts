import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app/build-app.js";
import { loadConfig } from "../../src/app/config.js";
import { citizenPaymentStatusResponseSchema } from "../../src/interfaces/http/schemas/citizen/responses.js";
import {
  paymentQuoteResponseSchema,
  providerPaymentStatusResponseSchema,
} from "../../src/interfaces/http/schemas/provider/responses.js";

const providerUserId = "00000000-0000-4000-8000-000000000011";
const otherProviderUserId = "00000000-0000-4000-8000-000000000012";
const citizenUserId = "00000000-0000-4000-8000-000000000013";
const providerId = "00000000-0000-4000-8000-000000000014";
const matterId = "00000000-0000-4000-8000-000000000015";
const quoteId = "00000000-0000-4000-8000-000000000016";
const paymentId = "00000000-0000-4000-8000-000000000017";

function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/unused",
    LOG_LEVEL: "silent",
    AUTH_MODE: "HEADER",
    ...overrides,
  });
}

const providerHeaders = {
  "x-actor-id": providerUserId,
  "x-actor-role": "PROVIDER",
};
const citizenHeaders = {
  "x-actor-id": citizenUserId,
  "x-actor-role": "CITIZEN",
};

const validQuote = {
  matterId,
  amount: "1000.30",
  currency: "INR",
  feeBreakdown: {
    professionalFee: "999.90",
    processingFee: "0.40",
    platformCommission: "0.00",
  },
  expiresAt: "2999-08-20T12:00:00.000Z",
};

type StubResult = { rows: unknown[]; rowCount: number | null };

function transactionPool(handler: (sql: string, values?: readonly unknown[]) => StubResult) {
  const queries: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];
  const client = {
    query: async (sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: null };
      return handler(sql, values);
    },
    release: () => undefined,
  } as unknown as PoolClient;
  return { queries, pool: { connect: async () => client } as unknown as Pool };
}

function noDatabasePool() {
  let calls = 0;
  return {
    calls: () => calls,
    pool: {
      query: async () => {
        calls += 1;
        throw new Error("This route must not query the database");
      },
      connect: async () => {
        calls += 1;
        throw new Error("This route must not start a transaction");
      },
    } as unknown as Pool,
  };
}

describe("payment orchestration safety", () => {
  it("creates an exact provider-owned quote for an open paid matter and audits atomically", async () => {
    const database = transactionPool((sql) => {
      if (sql.includes("FROM matter m JOIN provider")) {
        return {
          rows: [
            {
              provider_id: providerId,
              status: "OPEN",
              route: "PAID",
              provider_user_id: providerUserId,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("create_payment_quote")) {
        return { rows: [{ id: quoteId }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/quotes",
      headers: providerHeaders,
      payload: validQuote,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      quoteId,
      amount: validQuote.amount,
      currency: validQuote.currency,
      feeBreakdown: validQuote.feeBreakdown,
    });
    const trustedWrites = database.queries.filter(({ sql }) =>
      sql.includes("create_payment_quote"),
    );
    expect(trustedWrites).toHaveLength(1);
    const trustedWrite = trustedWrites[0];
    expect(trustedWrite?.sql).toBe(
      "SELECT public.create_payment_quote($1,$2,$3,$4,$5,$6,$7) AS id",
    );
    expect(trustedWrite?.values?.slice(0, 6)).toEqual([
      matterId,
      providerUserId,
      "1000.30",
      "INR",
      validQuote.feeBreakdown,
      validQuote.expiresAt,
    ]);
    expect(trustedWrite?.values?.[6]).toEqual(expect.any(String));
    expect(database.queries.some(({ sql }) => sql.includes("INSERT INTO audit_event"))).toBe(false);
    expect(database.queries.some(({ sql }) => sql.includes("INSERT INTO payment_quote"))).toBe(
      false,
    );
    const trustedWriteIndex = database.queries.findIndex(({ sql }) =>
      sql.includes("create_payment_quote"),
    );
    const commitIndex = database.queries.findIndex(({ sql }) => sql === "COMMIT");
    expect(trustedWriteIndex).toBeGreaterThan(0);
    expect(commitIndex).toBeGreaterThan(trustedWriteIndex);
    await app.close();
  });

  it.each([
    ["CLOSED", "PAID", providerUserId, "MATTER_NOT_OPEN", 409],
    ["OPEN", "LEGAL_AID_REFERRAL", providerUserId, "PAYMENT_NOT_ALLOWED", 409],
    ["OPEN", "PAID", otherProviderUserId, "FORBIDDEN", 403],
  ] as const)(
    "rejects matter status %s, route %s, owner %s before quote insertion",
    async (status, route, ownerId, errorCode, statusCode) => {
      const database = transactionPool((sql) => {
        if (sql.includes("FROM matter m JOIN provider")) {
          return {
            rows: [{ provider_id: providerId, status, route, provider_user_id: ownerId }],
            rowCount: 1,
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      });
      const app = await buildApp({ config: testConfig(), pool: database.pool });
      const response = await app.inject({
        method: "POST",
        url: "/v1/payments/quotes",
        headers: providerHeaders,
        payload: validQuote,
      });
      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toMatchObject({ error: { code: errorCode } });
      expect(
        database.queries.some(
          ({ sql }) =>
            /INSERT INTO (payment_quote|audit_event)/.test(sql) ||
            sql.includes("create_payment_quote"),
        ),
      ).toBe(false);
      await app.close();
    },
  );

  it("rejects mismatched arithmetic and expired quotes without database access", async () => {
    const database = noDatabasePool();
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const mismatch = await app.inject({
      method: "POST",
      url: "/v1/payments/quotes",
      headers: providerHeaders,
      payload: { ...validQuote, amount: "1000.31" },
    });
    expect(mismatch.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ error: { code: "FEE_BREAKDOWN_MISMATCH" } });
    const expired = await app.inject({
      method: "POST",
      url: "/v1/payments/quotes",
      headers: providerHeaders,
      payload: { ...validQuote, expiresAt: "2020-01-01T00:00:00.000Z" },
    });
    expect(expired.statusCode).toBe(400);
    expect(expired.json()).toMatchObject({ error: { code: "QUOTE_EXPIRY_NOT_FUTURE" } });
    expect(database.calls()).toBe(0);
    await app.close();
  });

  it("does not authorize an unscoped admin to create quotes", async () => {
    const database = noDatabasePool();
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/payments/quotes",
      headers: { "x-actor-id": providerUserId, "x-actor-role": "ADMIN" },
      payload: validQuote,
    });
    expect(response.statusCode).toBe(403);
    expect(database.calls()).toBe(0);
    await app.close();
  });

  it("keeps intents, webhooks, and offline acknowledgement explicitly write-free", async () => {
    const database = noDatabasePool();
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const intent = await app.inject({
      method: "POST",
      url: "/v1/payments/intents",
      headers: citizenHeaders,
      payload: { matterId, quoteId },
    });
    expect(intent.statusCode).toBe(503);
    expect(intent.json()).toMatchObject({ error: { code: "PAYMENTS_UNAVAILABLE" } });
    const webhook = await app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/test-provider",
      payload: { forged: true },
    });
    expect(webhook.statusCode).toBe(503);
    expect(webhook.json()).toMatchObject({
      error: { code: "PAYMENT_ADAPTER_NOT_IMPLEMENTED" },
    });
    const offline = await app.inject({
      method: "POST",
      url: `/v1/payments/${paymentId}/offline-ack`,
      headers: citizenHeaders,
      payload: { claimed: true },
    });
    expect(offline.statusCode).toBe(503);
    expect(offline.json()).toMatchObject({
      error: { code: "OFFLINE_ACK_POLICY_NOT_CONFIGURED" },
    });
    expect(database.calls()).toBe(0);
    await app.close();
  });

  it("enforces payment resource ownership and preserves exact amounts on reads", async () => {
    const pool = {
      query: async (sql: string) => {
        if (sql.includes("FROM payment_intent")) {
          return {
            rows: [
              {
                id: paymentId,
                matter_id: matterId,
                payment_provider: "TEST_PROVIDER",
                provider_intent_ref: "test-reference",
                amount: "1000.30",
                status: "PENDING",
                created_at: new Date("2026-08-20T10:00:00.000Z"),
                updated_at: new Date("2026-08-20T10:00:00.000Z"),
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("SELECT m.citizen_user_id")) {
          return {
            rows: [{ citizen_user_id: citizenUserId, provider_user_id: providerUserId }],
            rowCount: 1,
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    } as unknown as Pool;
    const app = await buildApp({ config: testConfig(), pool });
    const owned = await app.inject({
      method: "GET",
      url: `/v1/payments/${paymentId}`,
      headers: providerHeaders,
    });
    expect(owned.statusCode).toBe(200);
    expect(owned.json()).toMatchObject({ paymentId, amount: "1000.30" });
    const forbidden = await app.inject({
      method: "GET",
      url: `/v1/payments/${paymentId}`,
      headers: { "x-actor-id": otherProviderUserId, "x-actor-role": "PROVIDER" },
    });
    expect(forbidden.statusCode).toBe(403);
    await app.close();
  });

  it("keeps payment response DTOs strict and audience-specific", () => {
    const status = {
      paymentId,
      matterId,
      paymentProvider: "TEST_PROVIDER",
      providerIntentReference: "test-reference",
      amount: "1000.30",
      status: "PENDING",
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-20T10:00:00.000Z",
    };
    expect(citizenPaymentStatusResponseSchema.parse(status)).toEqual(status);
    expect(providerPaymentStatusResponseSchema.parse(status)).toEqual(status);
    expect(() =>
      providerPaymentStatusResponseSchema.parse({ ...status, internalState: 4 }),
    ).toThrow();
    expect(() =>
      paymentQuoteResponseSchema.parse({
        quoteId,
        amount: "1000.30",
        currency: "INR",
        feeBreakdown: { ...validQuote.feeBreakdown, tax: "0.00" },
      }),
    ).toThrow();
  });
});
