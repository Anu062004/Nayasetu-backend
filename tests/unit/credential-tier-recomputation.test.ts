import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  type CredentialTierPolicy,
  validateCredentialTierPolicy,
} from "../../src/modules/credential/application/credential-policy.js";
import { decideTierFromRecordedChecks } from "../../src/modules/credential/application/recompute-provider-tier.js";
import { recordManualCredentialCheck } from "../../src/modules/credential/application/record-manual-review.js";

const now = new Date("2026-08-19T12:00:00.000Z");
const policy: CredentialTierPolicy = {
  version: "test-policy-v1",
  providerType: "TEST_PROVIDER_TYPE",
  sources: [
    { sourceId: "TEST_MANUAL", evidenceKind: "MANUAL_DOCUMENT" },
    { sourceId: "TEST_AUTHORITY", evidenceKind: "AUTHORITY" },
    { sourceId: "TEST_FORMAT", evidenceKind: "FORMAT_VALIDATION" },
    { sourceId: "TEST_LLM", evidenceKind: "LLM_ADVISORY" },
  ],
  requiredDocumentLegs: [{ checkType: "IDENTITY", allowedSourceIds: ["TEST_MANUAL"] }],
  identityConsistencyLeg: { checkType: "IDENTITY", allowedSourceIds: ["TEST_MANUAL"] },
  currentAuthorityLegs: [{ checkType: "CURRENCY", allowedSourceIds: ["TEST_AUTHORITY"] }],
  currentAuthorityFreshnessMs: 24 * 60 * 60 * 1000,
};

let nextSequence = 1n;
function check(
  checkType: string,
  sourceId: string,
  sourceMode: "LIVE" | "MOCK" | "OFF",
  result: "PASS" | "MISMATCH" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE",
  checkedAt = now,
  recordedSequence = nextSequence++,
) {
  return {
    recordedSequence,
    checkType,
    sourceId,
    sourceMode,
    result,
    checkedAt,
    validUntil: null,
  } as const;
}

describe("credential tier recomputation from persisted checks", () => {
  it("requires documents, explicit identity consistency, and fresh authority for full verification", () => {
    const decision = decideTierFromRecordedChecks(
      "TEST_PROVIDER_TYPE",
      [
        check("IDENTITY", "TEST_MANUAL", "LIVE", "PASS"),
        check("CURRENCY", "TEST_AUTHORITY", "LIVE", "PASS"),
      ],
      policy,
      now,
    );
    expect(decision.tier).toBe("FULLY_VERIFIED");
    expect(decision.tierExpiresAt).toEqual(new Date("2026-08-20T12:00:00.000Z"));
  });

  it("rejects an identity-consistency leg that does not safely reuse a required leg", () => {
    const separateIdentityPolicy: CredentialTierPolicy = {
      ...policy,
      identityConsistencyLeg: { checkType: "NAME_MATCH", allowedSourceIds: ["TEST_MANUAL"] },
    };
    expect(() => validateCredentialTierPolicy(separateIdentityPolicy)).toThrow(
      "must reuse a required document leg",
    );
    expect(() =>
      validateCredentialTierPolicy({
        ...policy,
        identityConsistencyLeg: {
          checkType: "IDENTITY",
          allowedSourceIds: ["TEST_MANUAL", "TEST_AUTHORITY"],
        },
      }),
    ).toThrow("must be a subset");
    expect(() =>
      validateCredentialTierPolicy({
        ...policy,
        currentAuthorityLegs: [{ checkType: "IDENTITY", allowedSourceIds: ["TEST_AUTHORITY"] }],
      }),
    ).toThrow("must be disjoint");
  });

  it("caps full-tier expiry by contributing document and authority evidence", () => {
    const documentExpiry = new Date("2026-08-19T13:00:00.000Z");
    const authorityExpiry = new Date("2026-08-19T14:00:00.000Z");
    const checks = [
      { ...check("IDENTITY", "TEST_MANUAL", "LIVE", "PASS"), validUntil: documentExpiry },
      { ...check("CURRENCY", "TEST_AUTHORITY", "LIVE", "PASS"), validUntil: authorityExpiry },
    ];
    expect(
      decideTierFromRecordedChecks("TEST_PROVIDER_TYPE", checks, policy, now).tierExpiresAt,
    ).toEqual(documentExpiry);
  });

  it("caps expiry using only the latest qualifying alternative source selected for each leg", () => {
    const alternativePolicy: CredentialTierPolicy = {
      ...policy,
      sources: [...policy.sources, { sourceId: "TEST_ISSUER", evidenceKind: "ISSUER" }],
      requiredDocumentLegs: [
        { checkType: "IDENTITY", allowedSourceIds: ["TEST_MANUAL", "TEST_ISSUER"] },
      ],
      identityConsistencyLeg: {
        checkType: "IDENTITY",
        allowedSourceIds: ["TEST_MANUAL", "TEST_ISSUER"],
      },
    };
    const olderExpiry = new Date("2026-08-19T12:30:00.000Z");
    const selectedExpiry = new Date("2026-08-19T15:00:00.000Z");
    const checks = [
      {
        ...check("IDENTITY", "TEST_MANUAL", "LIVE", "PASS", new Date("2026-08-19T10:00:00.000Z")),
        validUntil: olderExpiry,
      },
      {
        ...check("IDENTITY", "TEST_ISSUER", "LIVE", "PASS", new Date("2026-08-19T11:00:00.000Z")),
        validUntil: selectedExpiry,
      },
      check("CURRENCY", "TEST_AUTHORITY", "LIVE", "PASS"),
    ];
    const decision = decideTierFromRecordedChecks(
      "TEST_PROVIDER_TYPE",
      checks,
      alternativePolicy,
      now,
    );
    expect(decision.tier).toBe("FULLY_VERIFIED");
    expect(decision.tierExpiresAt).toEqual(selectedExpiry);
  });

  it("expires authority freshness from check time and treats exact expiry as stale", () => {
    const checkedAt = new Date("2026-08-18T12:00:00.000Z");
    const decision = decideTierFromRecordedChecks(
      "TEST_PROVIDER_TYPE",
      [
        check("IDENTITY", "TEST_MANUAL", "LIVE", "PASS"),
        check("CURRENCY", "TEST_AUTHORITY", "LIVE", "PASS", checkedAt),
      ],
      policy,
      now,
    );
    expect(decision.tier).toBe("DOCUMENT_VERIFIED");
    expect(decision.tierExpiresAt).toBeNull();
  });

  it("does not let mock, unavailable, format, or LLM checks satisfy a required leg", () => {
    const nonContributing = [
      check("IDENTITY", "TEST_MANUAL", "MOCK", "PASS"),
      check("IDENTITY", "TEST_MANUAL", "LIVE", "UNAVAILABLE"),
      check("IDENTITY", "TEST_FORMAT", "LIVE", "PASS"),
      check("IDENTITY", "TEST_LLM", "LIVE", "PASS"),
    ];
    expect(
      decideTierFromRecordedChecks("TEST_PROVIDER_TYPE", nonContributing, policy, now).tier,
    ).toBe("SELF_DECLARED");
  });

  it("uses persisted monotonic order rather than timestamps or UUID ordering", () => {
    const checks = [
      check("IDENTITY", "TEST_MANUAL", "LIVE", "PASS", now, 10n),
      check(
        "IDENTITY",
        "TEST_MANUAL",
        "LIVE",
        "MISMATCH",
        new Date("2026-08-19T10:00:00.000Z"),
        11n,
      ),
      check("CURRENCY", "TEST_AUTHORITY", "LIVE", "PASS", now, 12n),
    ];
    expect(decideTierFromRecordedChecks("TEST_PROVIDER_TYPE", checks, policy, now)).toEqual({
      tier: "SELF_DECLARED",
      reasons: ["UNRESOLVED_CREDENTIAL_CONFLICT"],
      tierExpiresAt: null,
    });
  });

  it("does not treat mock or future mismatch checks as unresolved conflicts", () => {
    const alternativePolicy: CredentialTierPolicy = {
      ...policy,
      sources: [...policy.sources, { sourceId: "TEST_ISSUER", evidenceKind: "ISSUER" }],
      requiredDocumentLegs: [
        { checkType: "IDENTITY", allowedSourceIds: ["TEST_MANUAL", "TEST_ISSUER"] },
      ],
      identityConsistencyLeg: { checkType: "IDENTITY", allowedSourceIds: ["TEST_MANUAL"] },
    };
    const baseChecks = [
      check("IDENTITY", "TEST_MANUAL", "LIVE", "PASS"),
      check("CURRENCY", "TEST_AUTHORITY", "LIVE", "PASS"),
    ];
    expect(
      decideTierFromRecordedChecks(
        "TEST_PROVIDER_TYPE",
        [...baseChecks, check("IDENTITY", "TEST_ISSUER", "MOCK", "MISMATCH")],
        alternativePolicy,
        now,
      ).tier,
    ).toBe("FULLY_VERIFIED");
    expect(
      decideTierFromRecordedChecks(
        "TEST_PROVIDER_TYPE",
        [
          ...baseChecks,
          check(
            "IDENTITY",
            "TEST_ISSUER",
            "LIVE",
            "MISMATCH",
            new Date("2026-08-19T12:00:00.001Z"),
          ),
        ],
        alternativePolicy,
        now,
      ).tier,
    ).toBe("FULLY_VERIFIED");
  });

  it("records one configured manual leg while leaving explicit finalization separate", async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes("SELECT id, provider_type FROM provider")) {
          return { rows: [{ id: "provider", provider_type: policy.providerType }], rowCount: 1 };
        }
        if (sql.includes("FROM credential_policy")) {
          return {
            rows: [{ version: policy.version, policy_snapshot: policy }],
            rowCount: 1,
          };
        }
        if (sql.includes("SELECT id FROM verification_case")) {
          return { rows: [{ id: "case" }], rowCount: 1 };
        }
        if (sql.includes("INSERT INTO verification_check")) {
          return {
            rows: [{ id: "00000000-0000-4000-8000-000000000004" }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => undefined,
    };
    const pool = { connect: async () => client } as unknown as Pool;
    const result = await recordManualCredentialCheck(
      pool,
      {
        actorId: "00000000-0000-4000-8000-000000000001",
        actorType: "ADMIN",
        scopes: ["credentials:review"],
        requestId: "manual-check-test",
      },
      {
        providerId: "00000000-0000-4000-8000-000000000002",
        verificationCaseId: "00000000-0000-4000-8000-000000000003",
        checkType: "IDENTITY",
        sourceId: "TEST_MANUAL",
        result: "PASS",
        reviewReference: "review-reference",
        reviewedAt: now,
      },
    );
    expect(result).toMatchObject({ status: "REVIEW_REQUIRED" });
    expect(statements.some((sql) => sql.includes("finalize_verification_case"))).toBe(false);
  });
});
