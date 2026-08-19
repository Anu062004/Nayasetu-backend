export type PaymentEvidence =
  | { kind: "VERIFIED_PROVIDER_WEBHOOK"; signatureValid: true }
  | { kind: "SERVER_SIDE_PROVIDER_STATUS"; verified: true }
  | { kind: "FRONTEND_CALLBACK" }
  | { kind: "OFFLINE_ACKNOWLEDGEMENT" };

export function maySetProviderConfirmedPaymentState(evidence: PaymentEvidence): boolean {
  return (
    evidence.kind === "VERIFIED_PROVIDER_WEBHOOK" || evidence.kind === "SERVER_SIDE_PROVIDER_STATUS"
  );
}
