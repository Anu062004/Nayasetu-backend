import type { Pool } from "pg";
import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { withSerializableRetry } from "../../../shared/transaction.js";

export type CreditEventType =
  | "PRO_BONO_MATTER_CLOSED"
  | "LEGAL_AID_TIER_MATTER_CLOSED"
  | "ASPIRATIONAL_BLOCK_SERVICE"
  | "ROTATION_DUTY_COMPLETED"
  | "FIRST_RESPONSE_SLA_MET"
  | "CLE_MODULE_COMPLETED"
  | "LOK_ADALAT_SETTLEMENT";

export interface AppendCreditEventInput {
  providerId: string;
  eventType: CreditEventType;
  units: string;
  weightVersion: string;
  credits: string;
  matterId?: string;
  evidenceRef: string;
  occurredAt: Date;
  actor: ActorContext;
}

const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export async function appendCreditEvent(pool: Pool, input: AppendCreditEventInput) {
  if (!decimalPattern.test(input.units) || !decimalPattern.test(input.credits)) {
    throw new Error("Ledger units and credits must use canonical decimal strings");
  }
  if (!input.weightVersion || !input.evidenceRef) {
    throw new Error("Ledger weight version and evidence reference are required");
  }
  return withSerializableRetry(pool, async (client) => {
    const result = await client.query<{ event_id: string; event_hash: Buffer }>(
      `SELECT event_id::text, event_hash
       FROM append_credit_event(
         $1,$2,$3::numeric,$4,$5::numeric,$6,$7,$8,$9,$10,$11,$12,$13
       )`,
      [
        input.providerId,
        input.eventType,
        input.units,
        input.weightVersion,
        input.credits,
        input.matterId ?? null,
        input.evidenceRef,
        input.occurredAt,
        input.actor.actorType,
        input.actor.actorId,
        input.actor.onBehalfOfCitizenId ?? null,
        input.actor.delegationId ?? null,
        input.actor.requestId,
      ],
    );
    const event = result.rows[0];
    if (!event) throw new Error("Ledger writer returned no event");
    return { id: event.event_id, hash: event.event_hash.toString("hex") };
  });
}
