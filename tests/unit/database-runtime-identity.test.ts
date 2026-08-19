import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/shared/database.js";
import { assertDatabaseRuntimeIdentity } from "../../src/shared/database.js";

function databaseIdentityStub(identity: {
  current_user: string;
  expected_user: boolean;
  runtime_member: boolean;
  owns_protected_table: boolean;
  privileged_login: boolean;
  unsafe_runtime_role: boolean;
}) {
  return {
    query: async () => ({ rows: [identity], rowCount: 1 }),
  } as unknown as DatabaseClient;
}

describe("database runtime identity", () => {
  it("accepts only the expected non-owner runtime member", async () => {
    await expect(
      assertDatabaseRuntimeIdentity(
        databaseIdentityStub({
          current_user: "legal_service_app",
          expected_user: true,
          runtime_member: true,
          owns_protected_table: false,
          privileged_login: false,
          unsafe_runtime_role: false,
        }),
        "legal_service_app",
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    {
      current_user: "unexpected_login",
      expected_user: false,
      runtime_member: true,
      owns_protected_table: false,
      privileged_login: false,
      unsafe_runtime_role: false,
    },
    {
      current_user: "legal_service_app",
      expected_user: true,
      runtime_member: false,
      owns_protected_table: false,
      privileged_login: false,
      unsafe_runtime_role: false,
    },
    {
      current_user: "legal_service_app",
      expected_user: true,
      runtime_member: true,
      owns_protected_table: true,
      privileged_login: false,
      unsafe_runtime_role: false,
    },
    {
      current_user: "legal_service_app",
      expected_user: true,
      runtime_member: true,
      owns_protected_table: false,
      privileged_login: true,
      unsafe_runtime_role: false,
    },
    {
      current_user: "legal_service_app",
      expected_user: true,
      runtime_member: true,
      owns_protected_table: false,
      privileged_login: false,
      unsafe_runtime_role: true,
    },
  ])("rejects unsafe identity %#", async (identity) => {
    await expect(
      assertDatabaseRuntimeIdentity(databaseIdentityStub(identity), "legal_service_app"),
    ).rejects.toThrow("Unsafe database runtime identity");
  });
});
