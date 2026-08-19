import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app/build-app.js";
import { loadConfig } from "../../src/app/config.js";

function testConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/unused",
    LOG_LEVEL: "silent",
    AUTH_MODE: "HEADER",
    ...overrides,
  });
}

function poolStub(): Pool {
  return {
    query: async () => ({ rows: [{ "?column?": 1 }], rowCount: 1 }),
  } as unknown as Pool;
}

describe("HTTP foundation", () => {
  it("reports liveness without touching an external integration", async () => {
    const app = await buildApp({ config: testConfig(), pool: poolStub() });
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });

  it("registers every endpoint named by blueprint section 11", async () => {
    const app = await buildApp({ config: testConfig(), pool: poolStub() });
    const routes: Array<[string, string]> = [
      ["POST", "/v1/auth/otp/request"],
      ["POST", "/v1/auth/otp/verify"],
      ["POST", "/v1/auth/delegation"],
      ["DELETE", "/v1/auth/delegation/:id"],
      ["POST", "/v1/providers"],
      ["POST", "/v1/providers/:id/credentials/issuer-fetch"],
      ["POST", "/v1/providers/:id/credentials/upload"],
      ["GET", "/v1/providers/:id/verification"],
      ["POST", "/v1/needs"],
      ["GET", "/v1/needs/:id/directory"],
      ["POST", "/v1/needs/:id/select"],
      ["POST", "/v1/needs/:id/rotate"],
      ["GET", "/v1/needs/:id/referral"],
      ["GET", "/v1/providers/:id/slots"],
      ["POST", "/v1/bookings"],
      ["POST", "/v1/bookings/:id/accept"],
      ["POST", "/v1/bookings/:id/decline"],
      ["POST", "/v1/bookings/:id/cancel"],
      ["POST", "/v1/matters/:id/close"],
      ["GET", "/v1/matters/:id/status"],
      ["GET", "/v1/me/credits"],
      ["POST", "/v1/me/redemptions"],
      ["GET", "/v1/me/service-record"],
      ["GET", "/v1/me/panel-evidence"],
      ["POST", "/v1/payments/quotes"],
      ["POST", "/v1/payments/intents"],
      ["GET", "/v1/payments/:id"],
      ["POST", "/v1/payments/webhooks/:provider"],
      ["POST", "/v1/payments/:id/offline-ack"],
      ["POST", "/v1/grievances"],
      ["GET", "/v1/institutional/providers/:id/record"],
      ["GET", "/v1/institutional/rosters/:id"],
      ["GET", "/v1/public/stats"],
    ];
    for (const [method, url] of routes) {
      expect(app.hasRoute({ method, url }), `${method} ${url}`).toBe(true);
    }
    await app.close();
  });

  it("rejects malformed UUID path identifiers before route logic", async () => {
    const app = await buildApp({ config: testConfig(), pool: poolStub() });
    const response = await app.inject({
      method: "GET",
      url: "/v1/providers/not-a-uuid/slots",
      headers: {
        "x-actor-id": "00000000-0000-4000-8000-000000000001",
        "x-actor-role": "CITIZEN",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_IDENTIFIER" } });
    await app.close();
  });

  it("rejects mock capabilities and non-session auth in production", () => {
    expect(() =>
      testConfig({ NODE_ENV: "production", CREDENTIAL_BAR_MODE: "MOCK", AUTH_MODE: "OFF" }),
    ).toThrow("Production startup rejects MOCK capability modes");
    expect(() => testConfig({ NODE_ENV: "production", AUTH_MODE: "HEADER" })).toThrow(
      "Production startup requires database-backed session authentication",
    );
    expect(() => testConfig({ AUTH_MODE: "SESSION", SESSION_TOKEN_PEPPER: "too-short" })).toThrow(
      "SESSION_TOKEN_PEPPER must contain at least 32 characters",
    );
    expect(() =>
      testConfig({
        NODE_ENV: "production",
        AUTH_MODE: "SESSION",
        SESSION_TOKEN_PEPPER: "0123456789abcdef0123456789abcdef",
      }),
    ).toThrow("Production startup requires DATABASE_EXPECTED_USER");
  });

  it("rejects zero-day freshness and zero-cell privacy thresholds", () => {
    expect(() => testConfig({ CREDENTIAL_FRESHNESS_DAYS: "0" })).toThrow();
    expect(() => testConfig({ PUBLIC_STATS_MIN_CELL_SIZE: "0" })).toThrow();
  });

  it("resolves a scoped actor from an opaque database session", async () => {
    const pool = {
      query: async (sql: string) => {
        if (sql.includes("FROM auth_session")) {
          return {
            rows: [
              {
                user_id: "00000000-0000-4000-8000-000000000001",
                role: "CITIZEN",
                scopes: [],
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;
    const app = await buildApp({
      config: testConfig({
        AUTH_MODE: "SESSION",
        SESSION_TOKEN_PEPPER: "0123456789abcdef0123456789abcdef",
      }),
      pool,
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/providers/00000000-0000-4000-8000-000000000002/slots",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "CITIZEN",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ availabilityPolicy: "NOT_CONFIGURED" });
    await app.close();
  });

  it("returns the provider credit DTO from the credits endpoint", async () => {
    const providerId = "00000000-0000-4000-8000-000000000002";
    const pool = {
      query: async (sql: string) => {
        if (sql.includes("FROM provider WHERE user_id")) {
          return { rows: [{ id: providerId }], rowCount: 1 };
        }
        if (sql.includes("FROM credit_balance")) {
          return {
            rows: [{ total_credits: "12.5", period_credits: "2.5", last_event_id: "42" }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;
    const app = await buildApp({ config: testConfig(), pool });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me/credits",
      headers: {
        "x-actor-id": "00000000-0000-4000-8000-000000000001",
        "x-actor-role": "PROVIDER",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      providerId,
      totalCredits: 12.5,
      periodCredits: 2.5,
      lastEventId: "42",
    });
    await app.close();
  });
});
