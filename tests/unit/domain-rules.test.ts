import { describe, expect, it } from "vitest";
import { citizenProviderSummarySchema } from "../../src/interfaces/http/schemas/citizen/common.js";
import { orderDirectoryCandidates } from "../../src/modules/allocation/domain/directory-order.js";
import { decideVerificationTier } from "../../src/modules/credential/domain/tier.js";
import { decideEligibility } from "../../src/modules/eligibility/domain/route.js";
import { redactIntakeNarrative } from "../../src/modules/intake/domain/redact.js";
import {
  computeLedgerHash,
  LEDGER_GENESIS_HASH,
  verifyLedgerChain,
} from "../../src/modules/ledger/domain/hash-chain.js";
import { maySetProviderConfirmedPaymentState } from "../../src/modules/settlement/domain/payment-evidence.js";

describe("blueprint domain invariants", () => {
  it("rejects extra fields at the citizen provider DTO boundary", () => {
    const result = citizenProviderSummarySchema.safeParse({
      providerId: "00000000-0000-4000-8000-000000000001",
      displayName: "Fixture provider",
      tier: "SELF_DECLARED",
      feeRange: [0, 0],
      languages: ["TEST_LANGUAGE"],
      nextSlot: null,
      creditBalance: 1,
    });
    expect(result.success).toBe(false);
  });
  it("does not allow unavailable or mock-only evidence to produce FULLY_VERIFIED", () => {
    const base = {
      checkType: "ENROLMENT",
      checkedAt: new Date("2026-01-01T00:00:00.000Z"),
      isRequiredDocumentLeg: true,
      isIdentityConsistencyLeg: true,
      isCurrentAuthorityLeg: true,
    } as const;
    expect(
      decideVerificationTier({
        now: new Date("2026-01-02T00:00:00.000Z"),
        requiredDocumentLegs: ["ENROLMENT"],
        requiredCurrentAuthorityLegs: ["ENROLMENT"],
        checks: [{ ...base, sourceMode: "MOCK", result: "PASS" }],
      }).tier,
    ).toBe("SELF_DECLARED");
    expect(
      decideVerificationTier({
        now: new Date(),
        requiredDocumentLegs: ["ENROLMENT"],
        requiredCurrentAuthorityLegs: ["ENROLMENT"],
        checks: [{ ...base, sourceMode: "LIVE", result: "UNAVAILABLE" }],
      }).tier,
    ).toBe("SELF_DECLARED");
  });

  it("ignores format-only checks for tier decisions", () => {
    expect(
      decideVerificationTier({
        now: new Date(),
        requiredDocumentLegs: ["ENROLMENT"],
        requiredCurrentAuthorityLegs: ["ENROLMENT"],
        checks: [
          {
            checkType: "ENROLMENT",
            checkedAt: new Date(),
            isRequiredDocumentLeg: true,
            isIdentityConsistencyLeg: true,
            isCurrentAuthorityLeg: true,
            sourceMode: "LIVE",
            result: "PASS",
            isFormatOnly: true,
          },
        ],
      }).tier,
    ).toBe("SELF_DECLARED");
  });

  it("routes Section 12 self-declaration away from paid flow", () => {
    expect(decideEligibility({ selfDeclaredSection12Category: "SUPPLIED_BY_POLICY" }).route).toBe(
      "LEGAL_AID_REFERRAL",
    );
  });

  it("redacts configured identifier patterns without retaining the raw value", () => {
    const result = redactIntakeNarrative(
      "Call 9876543210, ID 1234 5678 9012, account 1234567890123456",
    );
    expect(result.redacted).not.toContain("9876543210");
    expect(result.redacted).not.toContain("1234 5678 9012");
    expect(result.redacted).not.toContain("1234567890123456");
    expect(result.categories).toEqual(["PHONE", "AADHAAR_SHAPED", "ACCOUNT_NUMBER"]);
  });

  it("reproduces directory order for the same seed", () => {
    const candidates = [
      { providerId: "a", surfacedCount: 1 },
      { providerId: "b", surfacedCount: 1 },
      { providerId: "c", surfacedCount: 0 },
    ];
    expect(orderDirectoryCandidates("request-1", candidates)).toEqual(
      orderDirectoryCandidates("request-1", candidates),
    );
    expect(orderDirectoryCandidates("request-1", candidates)[0]?.providerId).toBe("c");
  });

  it("verifies the versioned ledger hash chain", () => {
    const first = {
      id: 1n,
      providerId: "provider",
      eventType: "PRO_BONO_MATTER_CLOSED",
      credits: "1",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      previousHash: LEDGER_GENESIS_HASH,
    };
    const firstHash = computeLedgerHash(first);
    const second = {
      id: 2n,
      providerId: "provider",
      eventType: "ROTATION_DUTY_COMPLETED",
      credits: "2",
      occurredAt: new Date("2026-01-02T00:00:00.000Z"),
      previousHash: firstHash,
    };
    expect(
      verifyLedgerChain([
        { ...first, hash: firstHash },
        { ...second, hash: computeLedgerHash(second) },
      ]),
    ).toBe(true);
    expect(
      verifyLedgerChain([
        { ...first, hash: firstHash },
        {
          id: second.id,
          providerId: second.providerId,
          eventType: second.eventType,
          credits: second.credits,
          occurredAt: second.occurredAt,
          hash: computeLedgerHash(second),
        },
      ]),
    ).toBe(false);
  });

  it("rejects frontend callbacks as payment state evidence", () => {
    expect(maySetProviderConfirmedPaymentState({ kind: "FRONTEND_CALLBACK" })).toBe(false);
    expect(
      maySetProviderConfirmedPaymentState({
        kind: "VERIFIED_PROVIDER_WEBHOOK",
        signatureValid: true,
      }),
    ).toBe(true);
  });
});
