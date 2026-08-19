import { createHash } from "node:crypto";

export interface DirectoryCandidate {
  providerId: string;
  surfacedCount: number;
}

function seededKey(seed: string, providerId: string): string {
  return createHash("sha256").update(seed).update("\0").update(providerId).digest("hex");
}

export function orderDirectoryCandidates(
  seed: string,
  candidates: readonly DirectoryCandidate[],
): DirectoryCandidate[] {
  return [...candidates].sort(
    (left, right) =>
      left.surfacedCount - right.surfacedCount ||
      seededKey(seed, left.providerId).localeCompare(seededKey(seed, right.providerId)),
  );
}
