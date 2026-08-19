import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { AppError } from "../../../interfaces/http/errors.js";
import type { DatabaseClient } from "../../../shared/database.js";

export async function assertCitizenAuthority(
  database: DatabaseClient,
  actor: ActorContext,
  citizenUserId: string,
): Promise<void> {
  if (actor.actorType === "CITIZEN") {
    if (actor.actorId !== citizenUserId) {
      throw new AppError(403, "FORBIDDEN", "Citizen identity mismatch");
    }
    return;
  }
  if (
    actor.actorType !== "OPERATOR" ||
    actor.onBehalfOfCitizenId !== citizenUserId ||
    !actor.delegationId
  ) {
    throw new AppError(403, "DELEGATION_REQUIRED", "An active matching delegation is required");
  }
  const result = await database.query(
    `SELECT 1 FROM operator_delegation
     WHERE id = $1 AND operator_user_id = $2 AND citizen_user_id = $3 AND ended_at IS NULL`,
    [actor.delegationId, actor.actorId, citizenUserId],
  );
  if (!result.rowCount) {
    throw new AppError(403, "DELEGATION_INACTIVE", "Delegation is not active");
  }
}
