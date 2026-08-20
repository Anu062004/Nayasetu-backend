import type { Pool, PoolClient } from "pg";
import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { withTransaction } from "../../../shared/transaction.js";
import {
  decideVerificationTier,
  type TierDecision,
  type VerificationResult,
} from "../domain/tier.js";
import { type CredentialTierPolicy, validateCredentialTierPolicy } from "./credential-policy.js";
import { loadActiveCredentialPolicy } from "./load-active-credential-policy.js";

export interface RecordedCredentialCheck {
  recordedSequence: bigint;
  checkType: string;
  sourceId: string;
  sourceMode: "LIVE" | "MOCK" | "OFF";
  result: VerificationResult;
  checkedAt: Date;
  validUntil: Date | null;
}

export interface PersistedTierDecision extends TierDecision {
  tierExpiresAt: Date | null;
}

function latestChecksByLegAndSource(
  checks: readonly RecordedCredentialCheck[],
): RecordedCredentialCheck[] {
  const latest = new Map<string, RecordedCredentialCheck>();
  for (const check of checks) {
    const key = `${check.checkType}\u0000${check.sourceId}`;
    const previous = latest.get(key);
    if (!previous || check.recordedSequence > previous.recordedSequence) latest.set(key, check);
  }
  return [...latest.values()].sort((left, right) =>
    left.recordedSequence < right.recordedSequence
      ? -1
      : left.recordedSequence > right.recordedSequence
        ? 1
        : 0,
  );
}

export function decideTierFromRecordedChecks(
  providerType: string,
  checks: readonly RecordedCredentialCheck[],
  policy: CredentialTierPolicy,
  now: Date,
): PersistedTierDecision {
  validateCredentialTierPolicy(policy);
  if (providerType !== policy.providerType) {
    throw new Error("Credential policy does not match the provider type");
  }
  const sources = new Map(policy.sources.map((source) => [source.sourceId, source]));
  const requiredLegs = new Map(
    policy.requiredDocumentLegs.map((leg) => [leg.checkType, new Set(leg.allowedSourceIds)]),
  );
  const identitySources = new Set(policy.identityConsistencyLeg.allowedSourceIds);
  const authorityLegs = new Map(
    policy.currentAuthorityLegs.map((leg) => [leg.checkType, new Set(leg.allowedSourceIds)]),
  );
  const latestChecks = latestChecksByLegAndSource(
    checks.filter((check) => check.sourceMode === "LIVE" && check.checkedAt <= now),
  );

  const relevantSourcesByLeg = new Map<string, Set<string>>();
  for (const leg of [
    ...policy.requiredDocumentLegs,
    policy.identityConsistencyLeg,
    ...policy.currentAuthorityLegs,
  ]) {
    const sourcesForLeg = relevantSourcesByLeg.get(leg.checkType) ?? new Set<string>();
    for (const sourceId of leg.allowedSourceIds) sourcesForLeg.add(sourceId);
    relevantSourcesByLeg.set(leg.checkType, sourcesForLeg);
  }
  const unresolvedConflict = latestChecks.some(
    (check) =>
      (check.result === "MISMATCH" || check.result === "CONFLICT") &&
      check.sourceMode === "LIVE" &&
      check.checkedAt <= now &&
      relevantSourcesByLeg.get(check.checkType)?.has(check.sourceId),
  );
  if (unresolvedConflict) {
    return {
      tier: "SELF_DECLARED",
      reasons: ["UNRESOLVED_CREDENTIAL_CONFLICT"],
      tierExpiresAt: null,
    };
  }

  const domainChecks = latestChecks.map((check) => {
    const configuredSource = sources.get(check.sourceId);
    return {
      recordedSequence: check.recordedSequence,
      sourceId: check.sourceId,
      checkType: check.checkType,
      sourceMode: check.sourceMode,
      result: check.result,
      checkedAt: check.checkedAt,
      ...(check.validUntil ? { validUntil: check.validUntil } : {}),
      isRequiredDocumentLeg:
        configuredSource !== undefined &&
        (requiredLegs.get(check.checkType)?.has(check.sourceId) ?? false),
      isIdentityConsistencyLeg:
        configuredSource !== undefined &&
        check.checkType === policy.identityConsistencyLeg.checkType &&
        identitySources.has(check.sourceId),
      isCurrentAuthorityLeg:
        configuredSource?.evidenceKind === "AUTHORITY" &&
        (authorityLegs.get(check.checkType)?.has(check.sourceId) ?? false),
      isFormatOnly:
        configuredSource === undefined || configuredSource.evidenceKind === "FORMAT_VALIDATION",
      isLlmDerived: configuredSource?.evidenceKind === "LLM_ADVISORY",
    };
  });
  const decision = decideVerificationTier({
    now,
    requiredDocumentLegs: policy.requiredDocumentLegs.map((leg) => leg.checkType),
    requiredCurrentAuthorityLegs: policy.currentAuthorityLegs.map((leg) => leg.checkType),
    currentAuthorityFreshnessMs: policy.currentAuthorityFreshnessMs,
    checks: domainChecks,
  });
  if (decision.tier !== "FULLY_VERIFIED") return { ...decision, tierExpiresAt: null };

  const contributing = domainChecks.filter(
    (check) =>
      check.sourceMode === "LIVE" &&
      check.result === "PASS" &&
      !check.isFormatOnly &&
      !check.isLlmDerived &&
      check.checkedAt <= now &&
      (!check.validUntil || check.validUntil > now),
  );
  const newest = <T extends (typeof domainChecks)[number]>(
    candidates: readonly T[],
  ): T | undefined =>
    [...candidates].sort(
      (left, right) =>
        right.checkedAt.getTime() - left.checkedAt.getTime() ||
        (right.recordedSequence > left.recordedSequence ? 1 : -1),
    )[0];
  const requiredEvidence = policy.requiredDocumentLegs.map((leg) =>
    newest(
      contributing.filter(
        (check) => check.checkType === leg.checkType && check.isRequiredDocumentLeg,
      ),
    ),
  );
  const identityEvidence = newest(contributing.filter((check) => check.isIdentityConsistencyLeg));
  const authorityEvidence = policy.currentAuthorityLegs.map((leg) =>
    newest(
      contributing.filter(
        (check) =>
          check.checkType === leg.checkType &&
          check.isCurrentAuthorityLeg &&
          check.checkedAt.getTime() + policy.currentAuthorityFreshnessMs > now.getTime(),
      ),
    ),
  );
  if (
    requiredEvidence.some((check) => !check) ||
    !identityEvidence ||
    authorityEvidence.some((check) => !check)
  ) {
    throw new Error("FULLY_VERIFIED decision is missing selected contributing evidence");
  }
  const selectedRequiredEvidence = requiredEvidence.filter(
    (check): check is NonNullable<typeof check> => check !== undefined,
  );
  const selectedAuthorityEvidence = authorityEvidence.filter(
    (check): check is NonNullable<typeof check> => check !== undefined,
  );
  const expiryCandidates = [now.getTime() + policy.currentAuthorityFreshnessMs];
  for (const check of [
    ...selectedRequiredEvidence,
    identityEvidence,
    ...selectedAuthorityEvidence,
  ]) {
    if (check.validUntil) expiryCandidates.push(check.validUntil.getTime());
  }
  for (const check of selectedAuthorityEvidence) {
    expiryCandidates.push(check.checkedAt.getTime() + policy.currentAuthorityFreshnessMs);
  }
  const tierExpiresAt = new Date(Math.min(...expiryCandidates));
  if (tierExpiresAt <= now) throw new Error("FULLY_VERIFIED decision has no future expiry");
  return { ...decision, tierExpiresAt };
}

async function finalizeCredentialDecisionInTransaction(
  client: PoolClient,
  actor: ActorContext,
  providerId: string,
  verificationCaseId: string,
  now: Date,
): Promise<PersistedTierDecision> {
  const providerResult = await client.query<{ provider_type: string }>(
    "SELECT provider_type FROM provider WHERE id = $1 FOR UPDATE",
    [providerId],
  );
  const provider = providerResult.rows[0];
  if (!provider) throw new Error("Provider was not found for credential decision");
  const policy = await loadActiveCredentialPolicy(client, provider.provider_type);

  const caseResult = await client.query<{ id: string }>(
    `SELECT id FROM verification_case
     WHERE id = $1 AND provider_id = $2 AND status = 'REVIEW_REQUIRED' AND decided_at IS NULL
     FOR UPDATE`,
    [verificationCaseId, providerId],
  );
  if (!caseResult.rows[0]) throw new Error("Active verification case was not found for provider");

  const checkResult = await client.query<{
    recorded_sequence: string;
    check_type: string;
    source_id: string;
    source_mode: "LIVE" | "MOCK" | "OFF";
    result: VerificationResult;
    checked_at: Date;
    valid_until: Date | null;
  }>(
    `SELECT chk.recorded_sequence::text, chk.check_type, chk.source_id, chk.source_mode,
            chk.result, chk.checked_at, chk.valid_until
     FROM verification_check chk
     WHERE chk.case_id = $1
     ORDER BY chk.recorded_sequence`,
    [verificationCaseId],
  );
  const decision = decideTierFromRecordedChecks(
    provider.provider_type,
    checkResult.rows.map((check) => ({
      recordedSequence: BigInt(check.recorded_sequence),
      checkType: check.check_type,
      sourceId: check.source_id,
      sourceMode: check.source_mode,
      result: check.result,
      checkedAt: check.checked_at,
      validUntil: check.valid_until,
    })),
    policy,
    now,
  );

  const finalized = await client.query<{
    tier_outcome: TierDecision["tier"];
    tier_expires_at: Date | null;
    decision_reasons: string[];
  }>(
    `SELECT tier_outcome, tier_expires_at, decision_reasons
     FROM finalize_verification_case($1,$2,$3,$4,$5,$6)`,
    [verificationCaseId, providerId, policy.version, now, actor.actorId, actor.requestId],
  );
  const persisted = finalized.rows[0];
  if (!persisted) throw new Error("Credential finalization returned no decision");
  const expiryMatches =
    persisted.tier_expires_at?.getTime() === decision.tierExpiresAt?.getTime() ||
    (persisted.tier_expires_at === null && decision.tierExpiresAt === null);
  if (
    persisted.tier_outcome !== decision.tier ||
    !expiryMatches ||
    JSON.stringify(persisted.decision_reasons) !== JSON.stringify(decision.reasons)
  ) {
    throw new Error("Database credential decision did not match application preflight");
  }
  return {
    tier: persisted.tier_outcome,
    reasons: persisted.decision_reasons,
    tierExpiresAt: persisted.tier_expires_at,
  };
}

export async function finalizeCredentialDecision(
  pool: Pool,
  actor: ActorContext,
  providerId: string,
  verificationCaseId: string,
  now = new Date(),
): Promise<PersistedTierDecision> {
  if (actor.actorType !== "ADMIN") throw new Error("Credential tier decisions require ADMIN");
  if (!actor.scopes.includes("credentials:review")) {
    throw new Error("Credential tier decisions require credentials:review scope");
  }
  return withTransaction(pool, (client) =>
    finalizeCredentialDecisionInTransaction(client, actor, providerId, verificationCaseId, now),
  );
}
