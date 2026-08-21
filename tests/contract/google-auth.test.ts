import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signOAuthState } from "../../src/adapters/google-oauth.js";
import { buildApp } from "../../src/app/build-app.js";
import { loadConfig } from "../../src/app/config.js";

const PEPPER = "0123456789abcdef0123456789abcdef";

function googleTestConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/unused",
    LOG_LEVEL: "silent",
    AUTH_MODE: "SESSION",
    SESSION_TOKEN_PEPPER: PEPPER,
    AUTH_GOOGLE_MODE: "LIVE",
    GOOGLE_OAUTH_CLIENT_ID: "test-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI: "https://api.example.com/v1/auth/google/callback",
    GOOGLE_OAUTH_FRONTEND_URL: "https://app.example.com",
    ...overrides,
  });
}

function capturingPool() {
  const statements: string[] = [];
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
    connect: async () => ({
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("RETURNING id"))
          return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release: async () => undefined,
    }),
  } as unknown as Pool;
  return { pool, statements };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Google authentication boundary", () => {
  it("serves Google auth routes only when configured LIVE", async () => {
    const { pool } = capturingPool();
    const app = await buildApp({
      config: googleTestConfig({ AUTH_GOOGLE_MODE: "OFF" }),
      pool,
    });
    const response = await app.inject({ method: "GET", url: "/v1/auth/google/start" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "CAPABILITY_UNAVAILABLE" } });
    await app.close();
  });

  it("redirects start requests to Google with a signed state", async () => {
    const { pool } = capturingPool();
    const app = await buildApp({ config: googleTestConfig(), pool });
    const response = await app.inject({ method: "GET", url: "/v1/auth/google/start" });
    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/auth");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://api.example.com/v1/auth/google/callback",
    );
    expect(location.searchParams.get("state")).toBeTruthy();
    await app.close();
  });

  it("rejects a callback whose state fails signature verification", async () => {
    const { pool } = capturingPool();
    const app = await buildApp({ config: googleTestConfig(), pool });
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/callback",
      query: { code: "abc", state: `nonce.${Date.now()}.forged-signature` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_OAUTH_STATE" } });
    await app.close();
  });

  it("rejects an expired state even with a valid signature", async () => {
    const { pool } = capturingPool();
    const app = await buildApp({ config: googleTestConfig(), pool });
    const staleState = signOAuthState("nonce", Date.now() - 11 * 60 * 1000, PEPPER);
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/callback",
      query: { code: "abc", state: staleState },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_OAUTH_STATE" } });
    await app.close();
  });

  it("maps a denied consent to an explicit error without touching the database", async () => {
    const { pool, statements } = capturingPool();
    const app = await buildApp({ config: googleTestConfig(), pool });
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/callback",
      query: { error: "access_denied", state: "anything" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "OAUTH_REQUEST_DENIED" } });
    expect(statements).toHaveLength(0);
    await app.close();
  });

  it("issues a citizen session and redirects the token to the frontend fragment", async () => {
    const { pool, statements } = capturingPool();
    const app = await buildApp({ config: googleTestConfig(), pool });
    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "google-access-token" }), {
          status: 200,
        });
      }
      if (target === "https://openidconnect.googleapis.com/v1/userinfo") {
        return new Response(
          JSON.stringify({
            sub: "google-sub-1",
            email: "citizen@example.com",
            email_verified: true,
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch target ${target}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = signOAuthState("nonce", Date.now(), PEPPER);
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/callback",
      query: { code: "auth-code", state },
    });
    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    expect(location.origin + location.pathname).toBe("https://app.example.com/");
    const fragment = new URLSearchParams(location.hash.slice(1));
    expect(fragment.get("sessionToken")).toBeTruthy();
    expect(fragment.get("sessionToken")?.length).toBeGreaterThanOrEqual(32);
    expect(fragment.get("userId")).toBe("00000000-0000-4000-8000-000000000001");
    expect(fragment.get("accountCreated")).toBe("true");
    expect(fragment.get("accountStatus")).toBe("PENDING_PROFILE");
    expect(fragment.get("profileCompleted")).toBe("false");
    expect(statements.some((sql) => sql.includes("INSERT INTO user_account"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO role_grant"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO auth_session"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO audit_event"))).toBe(true);
    await app.close();
  });

  it("maps Google exchange failures to an explicit upstream error", async () => {
    const { pool, statements } = capturingPool();
    const app = await buildApp({ config: googleTestConfig(), pool });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 400 })),
    );
    const state = signOAuthState("nonce", Date.now(), PEPPER);
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/callback",
      query: { code: "bad-code", state },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: "IDENTITY_PROVIDER_UNAVAILABLE" } });
    expect(statements).toHaveLength(0);
    await app.close();
  });

  it("rejects unverified Google emails fail-closed", async () => {
    const { pool, statements } = capturingPool();
    const app = await buildApp({ config: googleTestConfig(), pool });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const target = String(url);
        if (target === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "google-access-token" }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            sub: "google-sub-1",
            email: "citizen@example.com",
            email_verified: false,
          }),
          { status: 200 },
        );
      }),
    );
    const state = signOAuthState("nonce", Date.now(), PEPPER);
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/callback",
      query: { code: "auth-code", state },
    });
    expect(response.statusCode).toBe(502);
    expect(statements).toHaveLength(0);
    await app.close();
  });

  it("signs an existing active citizen straight in without re-onboarding", async () => {
    const statements: string[] = [];
    const pool = {
      query: async () => ({ rows: [], rowCount: 0 }),
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          if (sql.includes("FROM user_account WHERE email")) {
            return {
              rows: [{ id: "00000000-0000-4000-8000-000000000009", status: "ACTIVE" }],
              rowCount: 1,
            };
          }
          if (sql.includes("INSERT INTO user_account")) {
            return { rows: [], rowCount: 0 };
          }
          if (sql.includes("RETURNING id")) return { rows: [{ id: "x" }], rowCount: 1 };
          return { rows: [], rowCount: 0 };
        },
        release: async () => undefined,
      }),
    } as unknown as Pool;
    const app = await buildApp({ config: googleTestConfig(), pool });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const target = String(url);
        if (target === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "google-access-token" }), {
            status: 200,
          });
        }
        return new Response(
          JSON.stringify({
            sub: "google-sub-1",
            email: "returning@example.com",
            email_verified: true,
          }),
          { status: 200 },
        );
      }),
    );
    const state = signOAuthState("nonce", Date.now(), PEPPER);
    const response = await app.inject({
      method: "GET",
      url: "/v1/auth/google/callback",
      query: { code: "auth-code", state },
    });
    expect(response.statusCode).toBe(302);
    const location = new URL(response.headers.location as string);
    const fragment = new URLSearchParams(location.hash.slice(1));
    expect(fragment.get("accountCreated")).toBeNull();
    expect(fragment.get("accountStatus")).toBe("ACTIVE");
    expect(fragment.get("profileCompleted")).toBe("true");
    expect(statements.some((sql) => sql.includes("FROM user_account WHERE email"))).toBe(true);
    await app.close();
  });

  it("enforces configuration invariants for LIVE Google auth", () => {
    expect(() => googleTestConfig({ NODE_ENV: "production", AUTH_GOOGLE_MODE: "MOCK" })).toThrow(
      "Production startup rejects MOCK capability modes",
    );
    expect(() =>
      googleTestConfig({
        AUTH_GOOGLE_MODE: "LIVE",
        GOOGLE_OAUTH_CLIENT_ID: "",
        GOOGLE_OAUTH_CLIENT_SECRET: "",
        GOOGLE_OAUTH_REDIRECT_URI: "",
        GOOGLE_OAUTH_FRONTEND_URL: "",
      }),
    ).toThrow("LIVE Google authentication requires");
    expect(() => googleTestConfig({ AUTH_GOOGLE_MODE: "LIVE", AUTH_MODE: "HEADER" })).toThrow(
      "LIVE Google authentication requires SESSION auth mode",
    );
  });
});
