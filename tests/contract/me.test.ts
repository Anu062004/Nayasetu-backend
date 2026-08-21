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

function mePool(options: {
  accountStatus: string | null;
  roles: string[];
  hasProfile: boolean;
  providerId?: string;
}) {
  const pool = {
    query: async (sql: string) => {
      if (sql.includes("FROM auth_session")) {
        return {
          rows: [
            {
              user_id: "00000000-0000-4000-8000-000000000001",
              role: options.roles[0] ?? "CITIZEN",
              scopes: [],
              account_status: options.accountStatus,
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("FROM role_grant WHERE user_id")) {
        return { rows: options.roles.map((role) => ({ role })), rowCount: options.roles.length };
      }
      if (sql.includes("FROM citizen_profile WHERE user_id")) {
        const rows = options.hasProfile
          ? [{ user_id: "00000000-0000-4000-8000-000000000001" }]
          : [];
        return { rows, rowCount: rows.length };
      }
      if (sql.includes("FROM provider WHERE user_id")) {
        const rows = options.providerId ? [{ id: options.providerId }] : [];
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: async () => undefined,
    }),
  } as unknown as Pool;
  return pool;
}

describe("GET /v1/me", () => {
  it("returns roles, profile state and provider id for a dual-role account", async () => {
    const app = await buildApp({
      config: sessionConfig(),
      pool: mePool({
        accountStatus: "ACTIVE",
        roles: ["CITIZEN", "PROVIDER"],
        hasProfile: true,
        providerId: "00000000-0000-4000-8000-000000000002",
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "PROVIDER",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: "00000000-0000-4000-8000-000000000001",
      accountStatus: "ACTIVE",
      profileCompleted: true,
      roles: ["CITIZEN", "PROVIDER"],
      providerId: "00000000-0000-4000-8000-000000000002",
    });
    await app.close();
  });

  it("is reachable by a pending-profile citizen and omits absent state", async () => {
    const app = await buildApp({
      config: sessionConfig(),
      pool: mePool({ accountStatus: "PENDING_PROFILE", roles: ["CITIZEN"], hasProfile: false }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${"a".repeat(32)}`,
        "x-actor-role": "CITIZEN",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: "00000000-0000-4000-8000-000000000001",
      accountStatus: "PENDING_PROFILE",
      profileCompleted: false,
      roles: ["CITIZEN"],
    });
    await app.close();
  });

  it("requires authentication", async () => {
    const app = await buildApp({
      config: sessionConfig(),
      pool: mePool({ accountStatus: "ACTIVE", roles: ["CITIZEN"], hasProfile: true }),
    });
    const response = await app.inject({ method: "GET", url: "/v1/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });
});
