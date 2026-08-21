import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app/build-app.js";
import { loadConfig } from "../../src/app/config.js";

const PEPPER = "0123456789abcdef0123456789abcdef";

function sessionConfig() {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/unused",
    LOG_LEVEL: "silent",
    AUTH_MODE: "SESSION",
    SESSION_TOKEN_PEPPER: PEPPER,
  });
}

function citizenSessionPool(options: { accountStatus: string | null }) {
  const statements: string[] = [];
  const pool = {
    query: async (sql: string) => {
      statements.push(sql);
      if (sql.includes("FROM auth_session")) {
        return {
          rows: [
            {
              user_id: "00000000-0000-4000-8000-000000000001",
              role: "CITIZEN",
              scopes: [],
              account_status: options.accountStatus,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM citizen_profile WHERE user_id")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("FROM user_account WHERE id")) {
          return {
            rows: [{ id: "00000000-0000-4000-8000-000000000001", status: options.accountStatus }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      release: async () => undefined,
    }),
  } as unknown as Pool;
  return { pool, statements };
}

const PROFILE_PAYLOAD = {
  fullName: "Test Citizen",
  addressLine1: "12 MG Road",
  city: "Bengaluru",
  district: "Bengaluru Urban",
  state: "Karnataka",
  pincode: "560001",
};

describe("citizen profile completion boundary", () => {
  it("returns profileCompleted false when no profile exists", async () => {
    const { pool } = citizenSessionPool({ accountStatus: "PENDING_PROFILE" });
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me/profile",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "CITIZEN",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ profileCompleted: false });
    await app.close();
  });

  it("blocks product endpoints for citizens who have not completed a profile", async () => {
    const { pool } = citizenSessionPool({ accountStatus: "PENDING_PROFILE" });
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/needs",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "CITIZEN",
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "ACCOUNT_PENDING_PROFILE" } });
    await app.close();
  });

  it("allows profile submission on the pending account and records the audit event", async () => {
    const { pool, statements } = citizenSessionPool({ accountStatus: "PENDING_PROFILE" });
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/profile",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "CITIZEN",
        "content-type": "application/json",
      },
      payload: PROFILE_PAYLOAD,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ profileCompleted: true });
    expect(statements.some((sql) => sql.includes("INSERT INTO citizen_profile"))).toBe(true);
    expect(statements.some((sql) => sql.includes("SET status = 'ACTIVE'"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_event"))).toBe(true);
    await app.close();
  });

  it("admits active citizens to product endpoints", async () => {
    const { pool } = citizenSessionPool({ accountStatus: "ACTIVE" });
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "GET",
      url: "/v1/providers/00000000-0000-4000-8000-000000000002/slots",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "CITIZEN",
      },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("rejects an invalid pincode before any write", async () => {
    const { pool, statements } = citizenSessionPool({ accountStatus: "PENDING_PROFILE" });
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/profile",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "CITIZEN",
        "content-type": "application/json",
      },
      payload: { ...PROFILE_PAYLOAD, pincode: "12" },
    });
    expect(response.statusCode).toBe(400);
    expect(statements.some((sql) => sql.includes("INSERT INTO citizen_profile"))).toBe(false);
    await app.close();
  });
});
