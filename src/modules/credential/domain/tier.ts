export type VerificationTier = "SELF_DECLARED" | "DOCUMENT_VERIFIED" | "FULLY_VERIFIED";
export type VerificationResult = "PASS" | "MISMATCH" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE";
export type CredentialCapabilityMode = "LIVE" | "MOCK" | "OFF";

export interface CredentialCheck {
  checkType: string;
  sourceMode: CredentialCapabilityMode;
  result: VerificationResult;
  checkedAt: Date;
  validUntil?: Date;
  isRequiredDocumentLeg: boolean;
  isIdentityConsistencyLeg: boolean;
  isCurrentAuthorityLeg: boolean;
  isFormatOnly?: boolean;
  isLlmDerived?: boolean;
}

export interface TierDecisionInput {
  now: Date;
  checks: readonly CredentialCheck[];
  requiredDocumentLegs: readonly string[];
  requiredCurrentAuthorityLegs: readonly string[];
  currentAuthorityFreshnessMs?: number;
}

export interface TierDecision {
  tier: VerificationTier;
  reasons: readonly string[];
}

export function decideVerificationTier(input: TierDecisionInput): TierDecision {
  const contributing = input.checks.filter(
    (check) =>
      check.result === "PASS" &&
      check.sourceMode === "LIVE" &&
      !check.isFormatOnly &&
      !check.isLlmDerived &&
      check.checkedAt <= input.now &&
      (!check.validUntil || check.validUntil > input.now),
  );
  const passedLegs = new Set(
    contributing.filter((check) => check.isRequiredDocumentLeg).map((check) => check.checkType),
  );
  const documentsComplete = input.requiredDocumentLegs.every((leg) => passedLegs.has(leg));
  if (!documentsComplete) {
    return { tier: "SELF_DECLARED", reasons: ["REQUIRED_EVIDENCE_INCOMPLETE"] };
  }
  if (!contributing.some((check) => check.isIdentityConsistencyLeg)) {
    return { tier: "SELF_DECLARED", reasons: ["IDENTITY_CONSISTENCY_REQUIRED"] };
  }

  const currentAuthorityLegs = new Set(
    contributing
      .filter(
        (check) =>
          check.sourceMode === "LIVE" &&
          check.isCurrentAuthorityLeg &&
          input.currentAuthorityFreshnessMs !== undefined &&
          check.checkedAt.getTime() > input.now.getTime() - input.currentAuthorityFreshnessMs,
      )
      .map((check) => check.checkType),
  );
  const currentAuthorityComplete = input.requiredCurrentAuthorityLegs.every((leg) =>
    currentAuthorityLegs.has(leg),
  );
  if (!currentAuthorityComplete) {
    return { tier: "DOCUMENT_VERIFIED", reasons: ["CURRENT_LIVE_AUTHORITY_REQUIRED"] };
  }

  return { tier: "FULLY_VERIFIED", reasons: ["CURRENT_LIVE_AUTHORITY_CONFIRMED"] };
}
