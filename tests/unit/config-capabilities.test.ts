import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app/build-app.js";
import type { RuntimeCapabilities } from "../../src/app/capabilities.js";
import { loadConfig } from "../../src/app/config.js";

function testEnvironment(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://unused/unused",
    LOG_LEVEL: "silent",
    AUTH_MODE: "HEADER",
    ...overrides,
  };
}

function readyPool(): Pool {
  return {
    query: async () => ({ rows: [{ "?column?": 1 }], rowCount: 1 }),
  } as unknown as Pool;
}

describe("runtime capability configuration", () => {
  it("keeps the absent payment adapter explicitly OFF", () => {
    expect(loadConfig(testEnvironment()).capabilities.payments).toBe("OFF");
    expect(loadConfig(testEnvironment({ PAYMENTS_MODE: "OFF" })).capabilities.payments).toBe("OFF");
  });

  it.each(["LIVE", "SANDBOX"])("rejects PAYMENTS_MODE=%s in every environment", (payments) => {
    expect(() => loadConfig(testEnvironment({ PAYMENTS_MODE: payments }))).toThrow(
      "PAYMENTS_MODE must remain OFF until an authorized PSP adapter is implemented",
    );
    expect(() =>
      loadConfig(
        testEnvironment({
          NODE_ENV: "production",
          AUTH_MODE: "SESSION",
          DATABASE_EXPECTED_USER: "legal_service_app",
          SESSION_TOKEN_PEPPER: "0123456789abcdef0123456789abcdef",
          PAYMENTS_MODE: payments,
        }),
      ),
    ).toThrow("PAYMENTS_MODE must remain OFF until an authorized PSP adapter is implemented");
  });

  it("publishes OFF and refuses to advertise a mutated payment capability", async () => {
    const config = loadConfig(testEnvironment());
    const app = await buildApp({ config, pool: readyPool() });
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      status: "ready",
      capabilities: { payments: "OFF" },
    });
    await app.close();

    const mutatedConfig = loadConfig(testEnvironment());
    (mutatedConfig.capabilities as unknown as { payments: string }).payments = "LIVE";
    const invalidApp = await buildApp({ config: mutatedConfig, pool: readyPool() });
    const unavailable = await invalidApp.inject({ method: "GET", url: "/health/ready" });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ status: "not_ready" });
    await invalidApp.close();
  });

  it("narrows the runtime payment capability to OFF", () => {
    const capabilities: RuntimeCapabilities = loadConfig(testEnvironment()).capabilities;
    expect(capabilities.payments).toBe("OFF");
  });
});
