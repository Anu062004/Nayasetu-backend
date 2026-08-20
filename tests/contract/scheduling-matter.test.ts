import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app/build-app.js";
import { loadConfig } from "../../src/app/config.js";
import {
  providerBookingAcceptedResponseSchema,
  providerBookingCancelledResponseSchema,
  providerBookingDeclinedResponseSchema,
} from "../../src/interfaces/http/schemas/provider/responses.js";

const providerUserId = "00000000-0000-4000-8000-000000000001";
const citizenUserId = "00000000-0000-4000-8000-000000000002";
const bookingId = "00000000-0000-4000-8000-000000000003";
const providerId = "00000000-0000-4000-8000-000000000004";
const allocationId = "00000000-0000-4000-8000-000000000005";
const rosterId = "00000000-0000-4000-8000-000000000006";
const matterId = "00000000-0000-4000-8000-000000000007";
const conductSignalId = "00000000-0000-4000-8000-000000000008";

function testConfig() {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/unused",
    LOG_LEVEL: "silent",
    AUTH_MODE: "HEADER",
  });
}

type QueryResultStub = { rows: unknown[]; rowCount: number | null };

function transactionPool(
  handler: (sql: string, values: readonly unknown[] | undefined) => QueryResultStub,
) {
  const statements: string[] = [];
  const queries: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];
  const client = {
    query: async (sql: string, values?: readonly unknown[]) => {
      statements.push(sql);
      queries.push({ sql, values });
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [], rowCount: null };
      return handler(sql, values);
    },
    release: () => undefined,
  } as unknown as PoolClient;
  return {
    statements,
    queries,
    pool: { connect: async () => client } as unknown as Pool,
  };
}

function auditActions(database: ReturnType<typeof transactionPool>): unknown[] {
  return database.queries
    .filter(({ sql }) => sql.includes("INSERT INTO audit_event"))
    .map(({ values }) => values?.[4]);
}

function noDatabasePool() {
  let calls = 0;
  return {
    calls: () => calls,
    pool: {
      query: async () => {
        calls += 1;
        throw new Error("Database must not be used by this route");
      },
      connect: async () => {
        calls += 1;
        throw new Error("Database must not be used by this route");
      },
    } as unknown as Pool,
  };
}

const providerHeaders = {
  "x-actor-id": providerUserId,
  "x-actor-role": "PROVIDER",
};
const citizenHeaders = {
  "x-actor-id": citizenUserId,
  "x-actor-role": "CITIZEN",
};

describe("scheduling and matter HTTP contracts", () => {
  it("authenticates booking creation, then fails closed without database writes", async () => {
    const database = noDatabasePool();
    const app = await buildApp({ config: testConfig(), pool: database.pool });

    const unauthenticated = await app.inject({ method: "POST", url: "/v1/bookings", payload: {} });
    expect(unauthenticated.statusCode).toBe(401);

    const unavailable = await app.inject({
      method: "POST",
      url: "/v1/bookings",
      headers: citizenHeaders,
      payload: { deliberately: "not a booking request" },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({
      error: { code: "AVAILABILITY_POLICY_NOT_CONFIGURED" },
    });
    expect(database.calls()).toBe(0);
    await app.close();
  });

  it("keeps slots explicit and empty while availability policy is absent", async () => {
    const database = noDatabasePool();
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "GET",
      url: `/v1/providers/${providerId}/slots`,
      headers: citizenHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      providerId,
      availabilityPolicy: "NOT_CONFIGURED",
      slots: [],
    });
    expect(database.calls()).toBe(0);
    await app.close();
  });

  it("authenticates matter closure, then fails closed without database writes", async () => {
    const database = noDatabasePool();
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: `/v1/matters/${matterId}/close`,
      headers: providerHeaders,
      payload: { closeReason: "unreviewed" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "MATTER_CLOSURE_POLICY_NOT_CONFIGURED" },
    });
    expect(database.calls()).toBe(0);
    await app.close();
  });

  it.each(["accept", "decline", "cancel"])(
    "does not authorize an admin to %s a provider booking",
    async (action) => {
      const database = noDatabasePool();
      const app = await buildApp({ config: testConfig(), pool: database.pool });
      const response = await app.inject({
        method: "POST",
        url: `/v1/bookings/${bookingId}/${action}`,
        headers: {
          "x-actor-id": providerUserId,
          "x-actor-role": "ADMIN",
        },
        payload: { reasonCode: "NOT_AUTHORIZED" },
      });
      expect(response.statusCode).toBe(403);
      expect(database.calls()).toBe(0);
      await app.close();
    },
  );

  it.each([
    ["accept", providerHeaders],
    ["decline", providerHeaders],
    ["cancel", citizenHeaders],
  ] as const)(
    "rejects %s when the locked allocation is terminal before DML",
    async (action, headers) => {
      const database = transactionPool((sql) => {
        if (sql.includes("FROM booking b")) {
          return {
            rows: [
              {
                id: bookingId,
                status: "HELD",
                provider_id: providerId,
                provider_user_id: providerUserId,
                allocation_id: allocationId,
                allocation_status: "DECLINED",
                citizen_user_id: citizenUserId,
                roster_id: rosterId,
              },
            ],
            rowCount: 1,
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      });
      const app = await buildApp({ config: testConfig(), pool: database.pool });
      const response = await app.inject({
        method: "POST",
        url: `/v1/bookings/${bookingId}/${action}`,
        headers,
        payload: { reasonCode: "TERMINAL_ALLOCATION" },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: "ALLOCATION_NOT_ACTIVE" } });
      expect(database.statements.some((sql) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
      await app.close();
    },
  );

  it("accepts a locked held booking and separately audits the metadata-only matter", async () => {
    const database = transactionPool((sql) => {
      if (sql.includes("FROM booking b")) {
        return {
          rows: [
            {
              id: bookingId,
              status: "HELD",
              provider_id: providerId,
              provider_user_id: providerUserId,
              allocation_id: allocationId,
              allocation_status: "ASSIGNED",
              citizen_user_id: citizenUserId,
              roster_id: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.startsWith("UPDATE booking")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO matter")) return { rows: [{ id: matterId }], rowCount: 1 };
      if (sql.includes("INSERT INTO audit_event")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: `/v1/bookings/${bookingId}/accept`,
      headers: providerHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bookingId, status: "CONFIRMED", matterId });
    expect(database.statements.find((sql) => sql.includes("FROM booking b"))).toContain(
      "FOR UPDATE OF b, a",
    );
    expect(
      database.statements.filter((sql) => sql.includes("INSERT INTO audit_event")),
    ).toHaveLength(2);
    const matterInsert = database.statements.find((sql) => sql.includes("INSERT INTO matter"));
    expect(matterInsert).not.toContain("ON CONFLICT");
    expect(matterInsert).not.toMatch(/document|evidence|advice|correspondence|narrative/i);
    await app.close();
  });

  it("maps a duplicate matter for the allocation to an invalid booking state", async () => {
    const database = transactionPool((sql) => {
      if (sql.includes("FROM booking b")) {
        return {
          rows: [
            {
              id: bookingId,
              status: "HELD",
              provider_id: providerId,
              provider_user_id: providerUserId,
              allocation_id: allocationId,
              allocation_status: "ASSIGNED",
              citizen_user_id: citizenUserId,
              roster_id: null,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.startsWith("UPDATE booking")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO matter")) {
        throw Object.assign(new Error("duplicate allocation"), { code: "23505" });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: `/v1/bookings/${bookingId}/accept`,
      headers: providerHeaders,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_BOOKING_STATE" } });
    expect(database.statements).toContain("ROLLBACK");
    await app.close();
  });

  it("declines a rotation booking with one capacity release and one conduct signal", async () => {
    const database = transactionPool((sql) => {
      if (sql.includes("FROM booking b")) {
        return {
          rows: [
            {
              id: bookingId,
              status: "HELD",
              provider_id: providerId,
              provider_user_id: providerUserId,
              allocation_id: allocationId,
              allocation_status: "ASSIGNED",
              citizen_user_id: citizenUserId,
              roster_id: rosterId,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.startsWith("UPDATE booking")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE allocation")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE roster_membership")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO conduct_signal")) {
        return { rows: [{ id: conductSignalId }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO audit_event")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: `/v1/bookings/${bookingId}/decline`,
      headers: providerHeaders,
      payload: { reasonCode: "CONFLICT" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bookingId, status: "DECLINED" });
    expect(
      database.statements.filter((sql) => sql.startsWith("UPDATE roster_membership")),
    ).toHaveLength(1);
    expect(
      database.statements.filter((sql) => sql.includes("INSERT INTO conduct_signal")),
    ).toHaveLength(1);
    expect(auditActions(database)).toEqual([
      "allocation.declined",
      "roster.capacity_released",
      "conduct_signal.recorded",
      "booking.declined",
    ]);
    await app.close();
  });

  it("fails confirmed cancellation closed before any state mutation", async () => {
    const database = transactionPool((sql) => {
      if (sql.includes("FROM booking b")) {
        return {
          rows: [
            {
              id: bookingId,
              status: "CONFIRMED",
              provider_id: providerId,
              provider_user_id: providerUserId,
              allocation_id: allocationId,
              allocation_status: "ASSIGNED",
              citizen_user_id: citizenUserId,
              roster_id: rosterId,
            },
          ],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: `/v1/bookings/${bookingId}/cancel`,
      headers: providerHeaders,
      payload: { reasonCode: "UNREVIEWED" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "CANCELLATION_POLICY_NOT_CONFIGURED" },
    });
    expect(database.statements.some((sql) => /^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
    await app.close();
  });

  it("cancels only a held booking and releases its allocation and rotation capacity once", async () => {
    const database = transactionPool((sql) => {
      if (sql.includes("FROM booking b")) {
        return {
          rows: [
            {
              id: bookingId,
              status: "HELD",
              provider_id: providerId,
              provider_user_id: providerUserId,
              allocation_id: allocationId,
              allocation_status: "ASSIGNED",
              citizen_user_id: citizenUserId,
              roster_id: rosterId,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.startsWith("UPDATE booking")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE allocation")) return { rows: [], rowCount: 1 };
      if (sql.startsWith("UPDATE roster_membership")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO audit_event")) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const app = await buildApp({ config: testConfig(), pool: database.pool });
    const response = await app.inject({
      method: "POST",
      url: `/v1/bookings/${bookingId}/cancel`,
      headers: citizenHeaders,
      payload: { reasonCode: "NO_LONGER_NEEDED" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bookingId, status: "CANCELLED" });
    expect(database.statements.filter((sql) => sql.startsWith("UPDATE allocation"))).toHaveLength(
      1,
    );
    expect(
      database.statements.filter((sql) => sql.startsWith("UPDATE roster_membership")),
    ).toHaveLength(1);
    expect(auditActions(database)).toEqual([
      "allocation.cancelled",
      "roster.capacity_released",
      "booking.cancelled",
    ]);
    await app.close();
  });

  it("uses strict audience-specific provider booking schemas", () => {
    expect(
      providerBookingAcceptedResponseSchema.parse({
        bookingId,
        status: "CONFIRMED",
        matterId,
      }),
    ).toEqual({ bookingId, status: "CONFIRMED", matterId });
    expect(() =>
      providerBookingDeclinedResponseSchema.parse({
        bookingId,
        status: "DECLINED",
        citizenId: citizenUserId,
      }),
    ).toThrow();
    expect(() =>
      providerBookingCancelledResponseSchema.parse({
        bookingId,
        status: "CANCELLED",
        internalReason: "not exposed",
      }),
    ).toThrow();
  });
});
