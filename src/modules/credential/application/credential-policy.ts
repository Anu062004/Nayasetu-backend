import { z } from "zod";

export type CredentialEvidenceKind =
  | "ISSUER"
  | "AUTHORITY"
  | "MANUAL_DOCUMENT"
  | "FORMAT_VALIDATION"
  | "LLM_ADVISORY";

export interface CredentialPolicySource {
  sourceId: string;
  evidenceKind: CredentialEvidenceKind;
}

export interface CredentialLegPolicy {
  checkType: string;
  allowedSourceIds: readonly string[];
}

export interface CredentialTierPolicy {
  version: string;
  providerType: string;
  sources: readonly CredentialPolicySource[];
  requiredDocumentLegs: readonly CredentialLegPolicy[];
  identityConsistencyLeg: CredentialLegPolicy;
  currentAuthorityLegs: readonly CredentialLegPolicy[];
  currentAuthorityFreshnessMs: number;
}

// This is a timestamp-safety bound, not a default credential-policy value.
export const MAX_CREDENTIAL_FRESHNESS_MS = 100 * 366 * 24 * 60 * 60 * 1000;

const credentialLegPolicySchema = z
  .object({
    checkType: z.string().min(1),
    allowedSourceIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

const credentialTierPolicySchema = z
  .object({
    version: z.string().min(1),
    providerType: z.string().min(1),
    sources: z
      .array(
        z
          .object({
            sourceId: z.string().min(1),
            evidenceKind: z.enum([
              "ISSUER",
              "AUTHORITY",
              "MANUAL_DOCUMENT",
              "FORMAT_VALIDATION",
              "LLM_ADVISORY",
            ]),
          })
          .strict(),
      )
      .min(1),
    requiredDocumentLegs: z.array(credentialLegPolicySchema).min(1),
    identityConsistencyLeg: credentialLegPolicySchema,
    currentAuthorityLegs: z.array(credentialLegPolicySchema).min(1),
    currentAuthorityFreshnessMs: z.number().int().positive().max(MAX_CREDENTIAL_FRESHNESS_MS),
  })
  .strict();

export function parseCredentialTierPolicy(input: unknown): CredentialTierPolicy {
  const policy = credentialTierPolicySchema.parse(input);
  validateCredentialTierPolicy(policy);
  return policy;
}

function requireUniqueNonEmpty(values: readonly string[], label: string): void {
  if (values.length === 0 || values.some((value) => value.trim().length === 0)) {
    throw new Error(`${label} must contain non-empty configured values`);
  }
  if (new Set(values).size !== values.length)
    throw new Error(`${label} must not contain duplicates`);
}

export function validateCredentialTierPolicy(policy: CredentialTierPolicy): void {
  if (!policy.version.trim() || !policy.providerType.trim()) {
    throw new Error("Credential policy version and provider type are required");
  }
  if (
    !Number.isSafeInteger(policy.currentAuthorityFreshnessMs) ||
    policy.currentAuthorityFreshnessMs <= 0 ||
    policy.currentAuthorityFreshnessMs > MAX_CREDENTIAL_FRESHNESS_MS
  ) {
    throw new Error(
      "Credential authority freshness must be a positive integer number of milliseconds",
    );
  }
  requireUniqueNonEmpty(
    policy.sources.map((source) => source.sourceId),
    "Credential policy sources",
  );
  requireUniqueNonEmpty(
    policy.requiredDocumentLegs.map((leg) => leg.checkType),
    "Required credential legs",
  );
  requireUniqueNonEmpty(
    policy.currentAuthorityLegs.map((leg) => leg.checkType),
    "Current-authority credential legs",
  );
  if (!policy.identityConsistencyLeg.checkType.trim()) {
    throw new Error("Identity-consistency credential leg is required");
  }

  const sources = new Map(policy.sources.map((source) => [source.sourceId, source]));
  for (const leg of [
    ...policy.requiredDocumentLegs,
    policy.identityConsistencyLeg,
    ...policy.currentAuthorityLegs,
  ]) {
    requireUniqueNonEmpty(leg.allowedSourceIds, `Allowed sources for ${leg.checkType}`);
    for (const sourceId of leg.allowedSourceIds) {
      if (!sources.has(sourceId))
        throw new Error(`Credential source '${sourceId}' is not declared`);
    }
  }
  for (const leg of [...policy.requiredDocumentLegs, policy.identityConsistencyLeg]) {
    for (const sourceId of leg.allowedSourceIds) {
      const kind = sources.get(sourceId)?.evidenceKind;
      if (kind === "FORMAT_VALIDATION" || kind === "LLM_ADVISORY") {
        throw new Error(`Required credential leg '${leg.checkType}' uses a non-tier source`);
      }
    }
  }
  for (const leg of policy.currentAuthorityLegs) {
    for (const sourceId of leg.allowedSourceIds) {
      if (sources.get(sourceId)?.evidenceKind !== "AUTHORITY") {
        throw new Error(`Current-authority leg '${leg.checkType}' requires an authority source`);
      }
    }
  }

  const identityRequiredLeg = policy.requiredDocumentLegs.find(
    (leg) => leg.checkType === policy.identityConsistencyLeg.checkType,
  );
  if (!identityRequiredLeg) {
    throw new Error("Identity-consistency leg must reuse a required document leg");
  }
  const requiredIdentitySources = new Set(identityRequiredLeg.allowedSourceIds);
  if (
    policy.identityConsistencyLeg.allowedSourceIds.some(
      (sourceId) => !requiredIdentitySources.has(sourceId),
    )
  ) {
    throw new Error("Identity-consistency sources must be a subset of its required document leg");
  }
  const requiredCheckTypes = new Set(policy.requiredDocumentLegs.map((leg) => leg.checkType));
  if (policy.currentAuthorityLegs.some((leg) => requiredCheckTypes.has(leg.checkType))) {
    throw new Error("Current-authority legs must be disjoint from required document legs");
  }
}
