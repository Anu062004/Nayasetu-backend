import type { Pool } from "pg";
import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { withTransaction } from "../../../shared/transaction.js";
import { writeAudit } from "../../audit/application/write-audit.js";
import type { VerificationResult } from "../domain/tier.js";
import { loadActiveCredentialPolicy } from "./load-active-credential-policy.js";

export interface ManualCredentialCheckInput {
  providerId: string;
  verificationCaseId: string;
  checkType: string;
  sourceId: string;
  result: VerificationResult;
  reviewReference: string;
  validUntil?: Date;
  reviewedAt?: Date;
}

export async function recordManualCredentialCheck(
  pool: Pool,
  actor: ActorContext,
  input: ManualCredentialCheckInput,
) {
  if (actor.actorType !== "ADMIN") throw new Error("Manual credential review requires ADMIN");
  if (!actor.scopes.includes("credentials:review")) {
    throw new Error("Manual credential review requires credentials:review scope");
  }
  if (!input.reviewReference.trim()) throw new Error("Manual review reference is required");
  const reviewedAt = input.reviewedAt ?? new Date();

  return withTransaction(pool, async (client) => {
    const provider = await client.query<{ id: string; provider_type: string }>(
      "SELECT id, provider_type FROM provider WHERE id = $1 FOR UPDATE",
      [input.providerId],
    );
    const providerRow = provider.rows[0];
    if (!providerRow) throw new Error("Provider was not found for manual review");
    const policy = await loadActiveCredentialPolicy(client, providerRow.provider_type);
    const manualSource = policy.sources.find((source) => source.sourceId === input.sourceId);
    const permittedRequiredLeg = policy.requiredDocumentLegs.find(
      (leg) => leg.checkType === input.checkType && leg.allowedSourceIds.includes(input.sourceId),
    );
    const permittedIdentityLeg =
      policy.identityConsistencyLeg.checkType === input.checkType &&
      policy.identityConsistencyLeg.allowedSourceIds.includes(input.sourceId);
    if (
      manualSource?.evidenceKind !== "MANUAL_DOCUMENT" ||
      (!permittedRequiredLeg && !permittedIdentityLeg)
    ) {
      throw new Error("Credential policy does not permit manual review for this credential leg");
    }
    const verificationCase = await client.query<{ id: string }>(
      `SELECT id FROM verification_case
       WHERE id = $1 AND provider_id = $2 AND status = 'REVIEW_REQUIRED' AND decided_at IS NULL
       FOR UPDATE`,
      [input.verificationCaseId, input.providerId],
    );
    if (!verificationCase.rows[0]) throw new Error("Verification case was not found for provider");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO verification_check(
         case_id, check_type, source_id, source_mode, result, matched_fields,
         source_ref, valid_until, demo_only, checked_at
       ) VALUES ($1,$2,$3,'LIVE',$4,$5,$6,$7,false,$8)
       RETURNING id`,
      [
        input.verificationCaseId,
        input.checkType,
        input.sourceId,
        input.result,
        [],
        input.reviewReference,
        input.validUntil ?? null,
        reviewedAt,
      ],
    );
    const check = inserted.rows[0];
    if (!check) throw new Error("Manual review check insert returned no row");
    await writeAudit(client, actor, {
      action: "verification.manual_review_recorded",
      entityType: "verification_check",
      entityId: check.id,
      afterSummary: {
        verificationCaseId: input.verificationCaseId,
        checkType: input.checkType,
        sourceId: input.sourceId,
        result: input.result,
        reviewReferenceRecorded: true,
        policyVersion: policy.version,
      },
    });
    return {
      checkId: check.id,
      verificationCaseId: input.verificationCaseId,
      status: "REVIEW_REQUIRED" as const,
    };
  });
}
