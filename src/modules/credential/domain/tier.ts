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
  isCurrentAuthorityLeg: boolean;
  isFormatOnly?: boolean;
}

export interface TierDecisionInput {
  now: Date;
  checks: readonly CredentialCheck[];
  requiredDocumentLegs: readonly string[];
}

export interface TierDecision {
  tier: VerificationTier;
  reasons: readonly string[];
}

export function decideVerificationTier(input: TierDecisionInput): TierDecision {
  const contributing = input.checks.filter(
    (check) => check.result === "PASS" && check.sourceMode !== "OFF" && !check.isFormatOnly,
  );
  const passedLegs = new Set(
    contributing.filter((check) => check.isRequiredDocumentLeg).map((check) => check.checkType),
  );
  const documentsComplete = input.requiredDocumentLegs.every((leg) => passedLegs.has(leg));
  if (!documentsComplete) {
    return { tier: "SELF_DECLARED", reasons: ["REQUIRED_EVIDENCE_INCOMPLETE"] };
  }

  const currentLiveAuthority = contributing.some(
    (check) =>
      check.sourceMode === "LIVE" &&
      check.isCurrentAuthorityLeg &&
      (!check.validUntil || check.validUntil >= input.now),
  );
  if (!currentLiveAuthority) {
    return { tier: "DOCUMENT_VERIFIED", reasons: ["CURRENT_LIVE_AUTHORITY_REQUIRED"] };
  }

  return { tier: "FULLY_VERIFIED", reasons: ["CURRENT_LIVE_AUTHORITY_CONFIRMED"] };
}

export function degradeStaleTier(
  tier: VerificationTier,
  tierDecidedAt: Date | undefined,
  freshnessWindowMs: number | undefined,
  now: Date,
): VerificationTier {
  if (tier !== "FULLY_VERIFIED") return tier;
  if (!tierDecidedAt || freshnessWindowMs === undefined) return "DOCUMENT_VERIFIED";
  return now.getTime() - tierDecidedAt.getTime() > freshnessWindowMs
    ? "DOCUMENT_VERIFIED"
    : "FULLY_VERIFIED";
}
