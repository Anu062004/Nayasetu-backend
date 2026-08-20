import { describe, expect, it } from "vitest";
import { institutionalProviderRecordSchema } from "../../src/interfaces/http/schemas/institutional/responses.js";
import {
  providerCreditSummarySchema,
  providerVerificationResponseSchema,
} from "../../src/interfaces/http/schemas/provider/responses.js";

const providerId = "00000000-0000-4000-8000-000000000001";

describe("provider and institutional response contracts", () => {
  it("rejects undeclared provider response fields", () => {
    expect(() =>
      providerCreditSummarySchema.parse({
        providerId,
        totalCredits: 12,
        periodCredits: 3,
        lastEventId: "42",
        internalScore: 99,
      }),
    ).toThrow();
  });

  it("exposes allowlisted credential decision replay metadata without the policy snapshot", () => {
    const response = {
      verificationCaseId: "00000000-0000-4000-8000-000000000002",
      status: "DECIDED",
      tierOutcome: "FULLY_VERIFIED",
      currentTier: "FULLY_VERIFIED",
      policyVersion: "test-policy-v1",
      decisionReasons: ["CURRENT_LIVE_AUTHORITY_CONFIRMED"],
      tierExpiresAt: "2026-08-20T12:00:00.000Z",
      currentTierExpiresAt: "2026-08-20T12:00:00.000Z",
      submittedAt: "2026-08-19T11:00:00.000Z",
      decidedAt: "2026-08-19T12:00:00.000Z",
      checks: [],
    };
    expect(providerVerificationResponseSchema.parse(response)).toEqual(response);
    expect(() =>
      providerVerificationResponseSchema.parse({ ...response, policySnapshot: { internal: true } }),
    ).toThrow();
  });

  it("accepts JSON-valued objective signals and rejects undeclared nested fields", () => {
    const response = {
      providerId,
      tier: "DOCUMENT_VERIFIED",
      serviceCredits: 12,
      objectiveSignals: [
        {
          type: "ROTATION_DECLINE",
          value: { reasonCode: "CONFLICT" },
          recordedAt: "2026-08-19T12:30:00+00:00",
        },
      ],
      consentRef: "consent-reference",
    };

    expect(institutionalProviderRecordSchema.parse(response)).toEqual(response);
    expect(() =>
      institutionalProviderRecordSchema.parse({
        ...response,
        objectiveSignals: [{ ...response.objectiveSignals[0], internalNote: "not public" }],
      }),
    ).toThrow();
  });
});
