import type { PoolClient } from "pg";
import type { ActorContext } from "../../../interfaces/http/actor-context.js";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId: string;
  beforeSummary?: Record<string, unknown>;
  afterSummary?: Record<string, unknown>;
  reasonCode?: string;
}

export async function writeAudit(
  client: PoolClient,
  actor: ActorContext,
  input: AuditInput,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_event(
       actor_type, actor_id, on_behalf_of_user_id, delegation_id,
       action, entity_type, entity_id, before_summary, after_summary, reason_code, request_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      actor.actorType,
      actor.actorId,
      actor.onBehalfOfCitizenId ?? null,
      actor.delegationId ?? null,
      input.action,
      input.entityType,
      input.entityId,
      input.beforeSummary ?? null,
      input.afterSummary ?? null,
      input.reasonCode ?? null,
      actor.requestId,
    ],
  );
}
