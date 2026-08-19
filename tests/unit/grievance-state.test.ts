import { describe, expect, it } from "vitest";
import {
  canTransitionGrievance,
  GRIEVANCE_STATUSES,
  type GrievanceStatus,
  InvalidGrievanceTransitionError,
  isTerminalGrievanceStatus,
  transitionGrievance,
} from "../../src/modules/conduct/domain/grievance-state.js";

describe("grievance state machine", () => {
  it("exposes exactly the blueprint grievance states", () => {
    expect(GRIEVANCE_STATUSES).toEqual([
      "OPEN",
      "TRIAGED",
      "PLATFORM_RESOLVED",
      "REFERRED_TO_BAR_COUNCIL",
      "REFERRED_TO_DLSA",
    ]);
  });

  it.each([
    ["OPEN", "TRIAGED"],
    ["TRIAGED", "PLATFORM_RESOLVED"],
    ["TRIAGED", "REFERRED_TO_BAR_COUNCIL"],
    ["TRIAGED", "REFERRED_TO_DLSA"],
  ] satisfies [GrievanceStatus, GrievanceStatus][])("allows %s -> %s", (from, to) => {
    expect(canTransitionGrievance(from, to)).toBe(true);
    expect(transitionGrievance(from, to)).toBe(to);
  });

  it.each([
    ["OPEN", "PLATFORM_RESOLVED"],
    ["OPEN", "REFERRED_TO_BAR_COUNCIL"],
    ["OPEN", "REFERRED_TO_DLSA"],
    ["TRIAGED", "OPEN"],
    ["OPEN", "OPEN"],
    ["TRIAGED", "TRIAGED"],
  ] satisfies [GrievanceStatus, GrievanceStatus][])("rejects %s -> %s", (from, to) => {
    expect(canTransitionGrievance(from, to)).toBe(false);
    expect(() => transitionGrievance(from, to)).toThrow(
      new InvalidGrievanceTransitionError(from, to),
    );
  });

  it.each([
    "PLATFORM_RESOLVED",
    "REFERRED_TO_BAR_COUNCIL",
    "REFERRED_TO_DLSA",
  ] satisfies GrievanceStatus[])("treats %s as terminal", (status) => {
    expect(isTerminalGrievanceStatus(status)).toBe(true);

    for (const next of GRIEVANCE_STATUSES) {
      expect(canTransitionGrievance(status, next)).toBe(false);
      expect(() => transitionGrievance(status, next)).toThrow(InvalidGrievanceTransitionError);
    }
  });

  it("keeps OPEN and TRIAGED non-terminal", () => {
    expect(isTerminalGrievanceStatus("OPEN")).toBe(false);
    expect(isTerminalGrievanceStatus("TRIAGED")).toBe(false);
  });
});
