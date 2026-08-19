export type CaseStatusMode = "LIVE" | "LINK_ONLY" | "OFF";

export type CaseStatusResult =
  | { status: "LIVE_RESULT"; data: Record<string, unknown> }
  | { status: "LINK_REQUIRED"; url: string }
  | { status: "UNAVAILABLE" };

export function unavailableCaseStatus(mode: Exclude<CaseStatusMode, "LIVE">, officialUrl: string) {
  return mode === "LINK_ONLY"
    ? ({ status: "LINK_REQUIRED", url: officialUrl } as const)
    : ({ status: "UNAVAILABLE" } as const);
}
