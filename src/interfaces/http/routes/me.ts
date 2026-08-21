import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireActor } from "../actor-context.js";

const meResponseSchema = z.object({
  userId: z.uuid(),
  accountStatus: z.string().optional(),
  profileCompleted: z.boolean(),
  roles: z.array(z.enum(["CITIZEN", "PROVIDER", "OPERATOR", "INSTITUTION", "ADMIN"])),
  providerId: z.uuid().optional(),
});

/**
 * Account-level snapshot for the signed-in user: which roles the account
 * holds, whether the citizen profile exists, and the provider id when one
 * is attached. Read-only; no policy values are decided here.
 */
export async function registerMeRoute(app: FastifyInstance): Promise<void> {
  app.get("/v1/me", async (request) => {
    const actor = requireActor(request);
    const [grants, profile, provider] = await Promise.all([
      app.db.query<{ role: string }>(
        "SELECT role FROM role_grant WHERE user_id = $1 ORDER BY role",
        [actor.actorId],
      ),
      app.db.query<{ user_id: string }>("SELECT user_id FROM citizen_profile WHERE user_id = $1", [
        actor.actorId,
      ]),
      app.db.query<{ id: string }>("SELECT id FROM provider WHERE user_id = $1", [actor.actorId]),
    ]);
    const providerRow = provider.rows[0];
    return meResponseSchema.parse({
      userId: actor.actorId,
      ...(actor.accountStatus ? { accountStatus: actor.accountStatus } : {}),
      profileCompleted: profile.rows.length > 0,
      roles: grants.rows.map((row) => row.role),
      ...(providerRow ? { providerId: providerRow.id } : {}),
    });
  });
}
