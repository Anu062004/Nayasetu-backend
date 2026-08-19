export const redemptionKinds = [
  "SERVICE_RECORD_EXPORT",
  "PANEL_APPLICATION_EVIDENCE_PACKET",
  "RECOGNITION_ELIGIBILITY_PACKET",
  "CLE_ACTIVITY_RECORD",
] as const;

export type RedemptionKind = (typeof redemptionKinds)[number];

export function evidenceDisclaimer(kind: RedemptionKind): string {
  if (kind === "SERVICE_RECORD_EXPORT") return "Provider service record; not an official decision.";
  return "Evidence artifact only; the competent institution decides official recognition or eligibility.";
}
