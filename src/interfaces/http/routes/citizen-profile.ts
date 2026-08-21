import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../../modules/audit/application/write-audit.js";
import { withTransaction } from "../../../shared/transaction.js";
import { requireActor } from "../actor-context.js";
import { AppError } from "../errors.js";
import { parseBody } from "../validation.js";

const citizenProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  addressLine1: z.string().trim().min(1).max(300),
  addressLine2: z.string().trim().max(300).optional(),
  city: z.string().trim().min(1).max(200),
  district: z.string().trim().min(1).max(200),
  state: z.string().trim().min(1).max(200),
  pincode: z.string().regex(/^[0-9]{6}$/),
});

export async function registerCitizenProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/me/profile", async (request) => {
    const actor = requireActor(request, ["CITIZEN"]);
    const result = await app.db.query<{
      full_name: string;
      address_line1: string;
      address_line2: string | null;
      city: string;
      district: string;
      state: string;
      pincode: string;
    }>(
      `SELECT full_name, address_line1, address_line2, city, district, state, pincode
       FROM citizen_profile WHERE user_id = $1`,
      [actor.actorId],
    );
    const row = result.rows[0];
    if (!row) return { profileCompleted: false };
    return {
      profileCompleted: true,
      profile: {
        fullName: row.full_name,
        addressLine1: row.address_line1,
        ...(row.address_line2 ? { addressLine2: row.address_line2 } : {}),
        city: row.city,
        district: row.district,
        state: row.state,
        pincode: row.pincode,
      },
    };
  });

  app.post("/v1/me/profile", async (request, reply) => {
    const actor = requireActor(request, ["CITIZEN"]);
    const body = parseBody(citizenProfileSchema, request.body);
    await withTransaction(app.db, async (client) => {
      const account = await client.query<{ id: string; status: string }>(
        "SELECT id, status FROM user_account WHERE id = $1 FOR UPDATE",
        [actor.actorId],
      );
      if (!account.rows[0]) throw new AppError(404, "NOT_FOUND", "Account was not found");
      await client.query(
        `INSERT INTO citizen_profile(
           user_id, full_name, address_line1, address_line2, city, district, state, pincode
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (user_id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           address_line1 = EXCLUDED.address_line1,
           address_line2 = EXCLUDED.address_line2,
           city = EXCLUDED.city,
           district = EXCLUDED.district,
           state = EXCLUDED.state,
           pincode = EXCLUDED.pincode,
           updated_at = now()`,
        [
          actor.actorId,
          body.fullName,
          body.addressLine1,
          body.addressLine2 ?? null,
          body.city,
          body.district,
          body.state,
          body.pincode,
        ],
      );
      await client.query(
        `UPDATE user_account SET status = 'ACTIVE'
         WHERE id = $1 AND status = 'PENDING_PROFILE'`,
        [actor.actorId],
      );
      await writeAudit(client, actor, {
        action: "citizen.profile.completed",
        entityType: "citizen_profile",
        entityId: actor.actorId,
        afterSummary: { district: body.district, state: body.state },
      });
    });
    return reply.code(200).send({ profileCompleted: true });
  });
}
