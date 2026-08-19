import type { ActorContext } from "../../../interfaces/http/actor-context.js";
import { AppError } from "../../../interfaces/http/errors.js";
import type { DatabaseClient } from "../../../shared/database.js";

export async function assertInstitutionalConsent(
  database: DatabaseClient,
  actor: ActorContext,
  providerId: string,
  scope: string,
  consentRef: string | undefined,
): Promise<string> {
  if (actor.actorType !== "INSTITUTION") {
    throw new AppError(403, "FORBIDDEN", "Institutional authority is required");
  }
  if (!actor.scopes.includes(scope)) {
    throw new AppError(403, "MISSING_SCOPE", "Required institutional scope is missing");
  }
  if (!consentRef) {
    throw new AppError(
      403,
      "CONSENT_REFERENCE_REQUIRED",
      "A consent reference is required for provider record access",
    );
  }

  const result = await database.query(
    `SELECT 1
     FROM institutional_consent
     WHERE institution_user_id = $1
       AND provider_id = $2
       AND scope = $3
       AND consent_ref = $4
       AND valid_from <= now()
       AND expires_at > now()
       AND revoked_at IS NULL`,
    [actor.actorId, providerId, scope, consentRef],
  );
  if (!result.rowCount) {
    throw new AppError(403, "CONSENT_NOT_ACTIVE", "No active consent grants this access");
  }
  return consentRef;
}
