export const paymentModes = ["LIVE", "SANDBOX", "OFF"] as const;

export type PaymentMode = (typeof paymentModes)[number];

export interface CapabilityModes {
  credentialDigiLocker: "LIVE" | "MOCK" | "OFF";
  credentialBar: "LIVE" | "MOCK" | "OFF";
  credentialAibe: "LIVE" | "MOCK" | "OFF";
  caseStatus: "LIVE" | "LINK_ONLY" | "OFF";
  payments: PaymentMode;
  ivr: "LIVE" | "MOCK" | "OFF";
  whatsapp: "LIVE" | "MOCK" | "OFF";
  institutionalExport: "LOCAL" | "LIVE" | "OFF";
}

export type RuntimeCapabilities = Omit<CapabilityModes, "payments"> & { payments: "OFF" };

const unsupportedPaymentModeMessage =
  "PAYMENTS_MODE must remain OFF until an authorized PSP adapter is implemented";

export function resolveRuntimeCapabilities(capabilities: CapabilityModes): RuntimeCapabilities {
  if (capabilities.payments !== "OFF") {
    throw new Error(unsupportedPaymentModeMessage);
  }

  return { ...capabilities, payments: "OFF" };
}

export function readinessCapabilities(capabilities: RuntimeCapabilities): RuntimeCapabilities {
  // Recheck at the publication boundary so a mutated or manually assembled config cannot advertise
  // a payment capability that this build does not implement.
  if (String(capabilities.payments) !== "OFF") {
    throw new Error(unsupportedPaymentModeMessage);
  }

  return { ...capabilities, payments: "OFF" };
}
