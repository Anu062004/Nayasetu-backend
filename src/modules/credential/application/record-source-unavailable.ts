import type { PoolClient } from "pg";
import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { writeAudit } from "../../audit/application/write-audit.js";
import { assertProviderWriteAuthority } from "../../identity/application/assert-provider-authority.js";
import { findOrCreateReviewRequiredCase } from "./find-or-create-review-case.js";

export interface RecordUnavailableSourceInput {
  providerId: string;
  checkType: string;
  sourceId: "DIGILOCKER" | "BAR" | "AIBE";
  sourceMode: "MOCK" | "OFF";
}

export async function recordUnavailableSourceCheck(
  client: PoolClient,
  actor: ActorContext,
  input: RecordUnavailableSourceInput,
): Promise<{ verificationCaseId: string }> {
  await assertProviderWriteAuthority(client, actor, input.providerId);
  const verificationCase = await findOrCreateReviewRequiredCase(client, input.providerId);
  await client.query(
    `INSERT INTO verification_check(
       case_id, check_type, source_id, source_mode, result, demo_only, checked_at
     ) VALUES ($1,$2,$3,$4,'UNAVAILABLE',$5,now())`,
    [
      verificationCase.id,
      input.checkType,
      input.sourceId,
      input.sourceMode,
      input.sourceMode === "MOCK",
    ],
  );
  await writeAudit(client, actor, {
    action: "verification.source_checked",
    entityType: "verification_case",
    entityId: verificationCase.id,
    afterSummary: {
      source: input.sourceId,
      mode: input.sourceMode,
      result: "UNAVAILABLE",
      reviewCaseCreated: verificationCase.created,
    },
  });
  return { verificationCaseId: verificationCase.id };
}
