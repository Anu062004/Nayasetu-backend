import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { AppError } from "../../../interfaces/http/errors.js";
import type { DatabaseClient } from "../../../shared/database.js";

export async function assertProviderWriteAuthority(
  database: DatabaseClient,
  actor: ActorContext,
  providerId: string,
): Promise<void> {
  if (actor.actorType === "ADMIN") return;
  if (actor.actorType !== "PROVIDER") {
    throw new AppError(403, "FORBIDDEN", "Provider authority is required");
  }
  const result = await database.query("SELECT 1 FROM provider WHERE id = $1 AND user_id = $2", [
    providerId,
    actor.actorId,
  ]);
  if (!result.rowCount) {
    throw new AppError(403, "FORBIDDEN", "Provider profile belongs to another actor");
  }
}
