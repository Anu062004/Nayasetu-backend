export const GRIEVANCE_STATUSES = [
  "OPEN",
  "TRIAGED",
  "PLATFORM_RESOLVED",
  "REFERRED_TO_BAR_COUNCIL",
  "REFERRED_TO_DLSA",
] as const;

export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

export type TerminalGrievanceStatus =
  | "PLATFORM_RESOLVED"
  | "REFERRED_TO_BAR_COUNCIL"
  | "REFERRED_TO_DLSA";

const ALLOWED_TRANSITIONS: Readonly<Record<GrievanceStatus, readonly GrievanceStatus[]>> = {
  OPEN: ["TRIAGED"],
  TRIAGED: ["PLATFORM_RESOLVED", "REFERRED_TO_BAR_COUNCIL", "REFERRED_TO_DLSA"],
  PLATFORM_RESOLVED: [],
  REFERRED_TO_BAR_COUNCIL: [],
  REFERRED_TO_DLSA: [],
};

export class InvalidGrievanceTransitionError extends Error {
  readonly from: GrievanceStatus;
  readonly to: GrievanceStatus;

  constructor(from: GrievanceStatus, to: GrievanceStatus) {
    super(`Grievance cannot transition from ${from} to ${to}`);
    this.name = "InvalidGrievanceTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionGrievance(from: GrievanceStatus, to: GrievanceStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionGrievance(from: GrievanceStatus, to: GrievanceStatus): GrievanceStatus {
  if (!canTransitionGrievance(from, to)) {
    throw new InvalidGrievanceTransitionError(from, to);
  }

  return to;
}

export function isTerminalGrievanceStatus(
  status: GrievanceStatus,
): status is TerminalGrievanceStatus {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
