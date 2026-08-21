import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app/build-app.js";
import { loadConfig } from "../../src/app/config.js";

const PEPPER = "0123456789abcdef0123456789abcdef";
const TOKEN = "a".repeat(32);

function sessionConfig() {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/unused",
    LOG_LEVEL: "silent",
    AUTH_MODE: "SESSION",
    SESSION_TOKEN_PEPPER: PEPPER,
    PROVIDER_INITIAL_STATUS: "PENDING_REVIEW",
    TAXONOMY_CODES: "CIVIL,CRIMINAL",
  });
}

function authHeaders(role = "CITIZEN", json = false) {
  return {
    authorization: `Bearer ${TOKEN}`,
    "x-actor-role": role,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

describe("server-side session revocation", () => {
  it("revokes the current session and writes an audit event", async () => {
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
                account_status: "ACTIVE",
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          if (sql.includes("SELECT id FROM auth_session")) {
            return {
              rows: [{ id: "00000000-0000-4000-8000-00000000000f" }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        },
        release: async () => undefined,
      }),
    } as unknown as Pool;
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "DELETE",
      url: "/v1/auth/session",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ revoked: true });
    expect(statements.some((sql) => sql.includes("SET revoked_at = now()"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_event"))).toBe(true);
    await app.close();
  });

  it("is idempotent when the session is already revoked or unknown", async () => {
    const pool = {
      query: async (sql: string) => {
        if (sql.includes("FROM auth_session")) {
          return {
            rows: [
              {
                user_id: "00000000-0000-4000-8000-000000000001",
                role: "CITIZEN",
                scopes: [],
                account_status: "ACTIVE",
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({
        query: async () => ({ rows: [], rowCount: 0 }),
        release: async () => undefined,
      }),
    } as unknown as Pool;
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "DELETE",
      url: "/v1/auth/session",
      headers: authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ revoked: false });
    await app.close();
  });

  it("rejects unauthenticated revocation attempts", async () => {
    const pool = { query: async () => ({ rows: [], rowCount: 0 }) } as unknown as Pool;
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({ method: "DELETE", url: "/v1/auth/session" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe("self-service provider onboarding", () => {
  const PROFILE_BODY = {
    providerType: "ADVOCATE",
    displayName: "Test Advocate",
    district: "Bengaluru Urban",
    state: "Karnataka",
    languages: ["Kannada"],
    serviceModes: ["ONLINE"],
    services: [{ taxonomyCode: "CIVIL", feeMin: 100, feeMax: 500, proBonoAvailable: false }],
  };

  function onboardingPool(existingProviderRows: unknown[] = []) {
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
                account_status: "ACTIVE",
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          if (sql.includes("FROM provider WHERE user_id")) {
            return { rows: existingProviderRows, rowCount: existingProviderRows.length };
          }
          if (sql.includes("INSERT INTO provider(")) {
            return {
              rows: [{ id: "00000000-0000-4000-8000-000000000002" }],
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

  it("creates the provider profile, grants the role, and audits in one transaction", async () => {
    const { pool, statements } = onboardingPool();
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/provider",
      headers: authHeaders("CITIZEN", true),
      payload: PROFILE_BODY,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      providerId: "00000000-0000-4000-8000-000000000002",
      tier: "SELF_DECLARED",
      status: "PENDING_REVIEW",
    });
    expect(statements.some((sql) => sql.includes("'PROVIDER'"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_event"))).toBe(true);
    await app.close();
  });

  it("rejects a second provider profile for the same account", async () => {
    const { pool } = onboardingPool([{ id: "00000000-0000-4000-8000-000000000002" }]);
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/provider",
      headers: authHeaders("CITIZEN", true),
      payload: PROFILE_BODY,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "PROVIDER_ALREADY_EXISTS" } });
    await app.close();
  });

  it("rejects services outside the configured taxonomy", async () => {
    const { pool, statements } = onboardingPool();
    const app = await buildApp({ config: sessionConfig(), pool });
    const response = await app.inject({
      method: "POST",
      url: "/v1/me/provider",
      headers: authHeaders("CITIZEN", true),
      payload: {
        ...PROFILE_BODY,
        services: [
          { taxonomyCode: "ASTROLOGY", feeMin: 100, feeMax: 500, proBonoAvailable: false },
        ],
      },
    });
    expect(response.statusCode).toBe(422);
    expect(statements.some((sql) => sql.includes("INSERT INTO provider("))).toBe(false);
    await app.close();
  });
});
