import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { AppError } from "../../../interfaces/http/errors.js";
import type { DatabaseClient } from "../../../shared/database.js";

export async function assertInstitutionalRosterGrant(
  database: DatabaseClient,
  actor: ActorContext,
  rosterId: string,
  scope: "rosters:read" | "rosters:allocate",
): Promise<void> {
  if (actor.actorType === "ADMIN") return;
  if (actor.actorType !== "INSTITUTION") {
    throw new AppError(403, "FORBIDDEN", "Institutional roster authority is required");
  }
  if (!actor.scopes.includes(scope)) {
    throw new AppError(403, "MISSING_SCOPE", "Required institutional roster scope is missing");
  }
  const result = await database.query(
    `SELECT 1 FROM institutional_roster_grant
     WHERE institution_user_id = $1 AND roster_id = $2 AND scope = $3
       AND expires_at > now() AND revoked_at IS NULL`,
    [actor.actorId, rosterId, scope],
  );
  if (!result.rowCount) {
    throw new AppError(
      403,
      "ROSTER_GRANT_NOT_ACTIVE",
      "No active grant permits this roster access",
    );
  }
}
