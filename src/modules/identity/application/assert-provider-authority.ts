import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { AppError } from "../../../interfaces/http/errors.js";
import type { DatabaseClient } from "../../../shared/database.js";

export async function assertProviderWriteAuthority(
  database: DatabaseClient,
  actor: ActorContext,
  providerId: string,
): Promise<void> {
  if (actor.actorType !== "PROVIDER" && actor.actorType !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Provider authority is required");
  }
  const result = await database.query<{ user_id: string }>(
    "SELECT user_id FROM provider WHERE id = $1",
    [providerId],
  );
  const provider = result.rows[0];
  if (!provider) throw new AppError(404, "PROVIDER_NOT_FOUND", "Provider profile was not found");
  if (actor.actorType === "PROVIDER" && provider.user_id !== actor.actorId) {
    throw new AppError(403, "FORBIDDEN", "Provider profile belongs to another actor");
  }
}
