export type EligibilityRoute = "PAID" | "LEGAL_AID_REFERRAL" | "PRO_BONO_ROTATION";

export interface EligibilityInput {
  selfDeclaredSection12Category?: string;
  feeCeiling?: number;
  districtFloor?: number;
}

export interface EligibilityDecision {
  route: EligibilityRoute;
  selfDeclared: boolean;
  section12Category?: string;
  policyGap?: "DISTRICT_FLOOR_NOT_CONFIGURED";
}

export function decideEligibility(input: EligibilityInput): EligibilityDecision {
  if (input.selfDeclaredSection12Category) {
    return {
      route: "LEGAL_AID_REFERRAL",
      selfDeclared: true,
      section12Category: input.selfDeclaredSection12Category,
    };
  }
  if (input.feeCeiling !== undefined && input.districtFloor === undefined) {
    return { route: "PAID", selfDeclared: false, policyGap: "DISTRICT_FLOOR_NOT_CONFIGURED" };
  }
  if (
    input.feeCeiling !== undefined &&
    input.districtFloor !== undefined &&
    input.feeCeiling < input.districtFloor
  ) {
    return { route: "PRO_BONO_ROTATION", selfDeclared: false };
  }
  return { route: "PAID", selfDeclared: false };
}
