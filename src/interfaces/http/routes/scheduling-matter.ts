import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAudit } from "../../../modules/audit/application/write-audit.js";
import { assertCitizenAuthority } from "../../../modules/identity/application/assert-citizen-authority.js";
import { unavailableCaseStatus } from "../../../modules/interop/domain/case-status.js";
import { withTransaction } from "../../../shared/transaction.js";
import { requireActor } from "../actor-context.js";
import { AppError } from "../errors.js";
import { parseBody } from "../validation.js";

const bookingSchema = z.object({
  allocationId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
const reasonSchema = z.object({ reasonCode: z.string().min(1).max(100) });
const closeSchema = z.object({
  closeReason: z.string().min(1).max(200),
  cnrNumber: z.string().max(100).optional(),
});

interface BookingActorRow {
  id: string;
  status: string;
  provider_id: string;
  provider_user_id: string;
  allocation_id: string;
  citizen_user_id: string;
  roster_id: string | null;
}

async function bookingForUpdate(id: string, client: import("pg").PoolClient) {
  const result = await client.query<BookingActorRow>(
    `SELECT b.id, b.status, b.provider_id, p.user_id AS provider_user_id, b.need_request_id,
            a.id AS allocation_id, a.roster_id, n.citizen_user_id
     FROM booking b JOIN provider p ON p.id = b.provider_id
     JOIN allocation a ON a.id = b.allocation_id
     JOIN need_request n ON n.id = b.need_request_id
     WHERE b.id = $1 FOR UPDATE OF b`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "BOOKING_NOT_FOUND", "Booking was not found");
  return row;
}

export async function registerSchedulingMatterRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/v1/providers/:id/slots", async (request) => {
    requireActor(request, ["CITIZEN", "OPERATOR", "PROVIDER", "INSTITUTION", "ADMIN"]);
    return {
      providerId: request.params.id,
      availabilityPolicy: "NOT_CONFIGURED",
      slots: [],
    };
  });

  app.post("/v1/bookings", async (request, reply) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR"]);
    const body = parseBody(bookingSchema, request.body);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt)
      throw new AppError(400, "INVALID_SLOT", "endsAt must be after startsAt");

    const booking = await withTransaction(app.db, async (client) => {
      const allocation = await client.query<{
        need_request_id: string;
        provider_id: string;
        citizen_user_id: string;
      }>(
        `SELECT a.need_request_id, a.provider_id, n.citizen_user_id
         FROM allocation a JOIN need_request n ON n.id = a.need_request_id
         WHERE a.id = $1 AND a.status = 'ASSIGNED'`,
        [body.allocationId],
      );
      const selected = allocation.rows[0];
      if (!selected) throw new AppError(404, "ALLOCATION_NOT_FOUND", "Allocation was not found");
      await assertCitizenAuthority(client, actor, selected.citizen_user_id);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO booking(
           need_request_id, allocation_id, provider_id, citizen_user_id, slot, status
         ) VALUES ($1,$2,$3,$4,tstzrange($5,$6,'[)'),'HELD') RETURNING id`,
        [
          selected.need_request_id,
          body.allocationId,
          selected.provider_id,
          selected.citizen_user_id,
          startsAt,
          endsAt,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Booking insert returned no row");
      await writeAudit(client, actor, {
        action: "booking.held",
        entityType: "booking",
        entityId: row.id,
        afterSummary: {
          allocationId: body.allocationId,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
        },
      });
      return row;
    });
    return reply.code(201).send({ bookingId: booking.id, status: "HELD" });
  });

  app.post<{ Params: { id: string } }>("/v1/bookings/:id/accept", async (request) => {
    const actor = requireActor(request, ["PROVIDER", "ADMIN"]);
    return withTransaction(app.db, async (client) => {
      const booking = await bookingForUpdate(request.params.id, client);
      if (actor.actorType === "PROVIDER" && booking.provider_user_id !== actor.actorId) {
        throw new AppError(403, "FORBIDDEN", "Booking belongs to another provider");
      }
      if (booking.status !== "HELD")
        throw new AppError(409, "INVALID_BOOKING_STATE", "Only held bookings can be accepted");
      await client.query(
        "UPDATE booking SET status = 'CONFIRMED', updated_at = now() WHERE id = $1",
        [booking.id],
      );
      const matter = await client.query<{ id: string }>(
        `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
         VALUES ($1,$2,$3,'OPEN')
         ON CONFLICT (allocation_id) DO UPDATE SET status = matter.status RETURNING id`,
        [booking.allocation_id, booking.provider_id, booking.citizen_user_id],
      );
      const matterRow = matter.rows[0];
      if (!matterRow) throw new Error("Matter insert returned no row");
      await writeAudit(client, actor, {
        action: "booking.accepted",
        entityType: "booking",
        entityId: booking.id,
        afterSummary: { status: "CONFIRMED", matterId: matterRow.id },
      });
      return { bookingId: booking.id, status: "CONFIRMED", matterId: matterRow.id };
    });
  });

  app.post<{ Params: { id: string } }>("/v1/bookings/:id/decline", async (request) => {
    const actor = requireActor(request, ["PROVIDER", "ADMIN"]);
    const body = parseBody(reasonSchema, request.body);
    return withTransaction(app.db, async (client) => {
      const booking = await bookingForUpdate(request.params.id, client);
      if (actor.actorType === "PROVIDER" && booking.provider_user_id !== actor.actorId) {
        throw new AppError(403, "FORBIDDEN", "Booking belongs to another provider");
      }
      if (booking.status !== "HELD")
        throw new AppError(409, "INVALID_BOOKING_STATE", "Only held bookings can be declined");
      await client.query(
        "UPDATE booking SET status = 'DECLINED', updated_at = now() WHERE id = $1",
        [booking.id],
      );
      await client.query(
        `UPDATE allocation SET status = 'DECLINED', ended_at = now(), decline_reason = $2
         WHERE id = $1 AND status = 'ASSIGNED'`,
        [booking.allocation_id, body.reasonCode],
      );
      if (booking.roster_id) {
        await client.query(
          `UPDATE roster_membership SET active_matters = GREATEST(active_matters - 1, 0)
           WHERE roster_id = $1 AND provider_id = $2`,
          [booking.roster_id, booking.provider_id],
        );
        await client.query(
          `INSERT INTO conduct_signal(provider_id, signal_type, value)
           VALUES ($1,'ROTATION_DECLINE',$2)`,
          [booking.provider_id, { reasonCode: body.reasonCode }],
        );
      }
      await writeAudit(client, actor, {
        action: "booking.declined",
        entityType: "booking",
        entityId: booking.id,
        reasonCode: body.reasonCode,
        afterSummary: { status: "DECLINED" },
      });
      return { bookingId: booking.id, status: "DECLINED" };
    });
  });

  app.post<{ Params: { id: string } }>("/v1/bookings/:id/cancel", async (request) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR", "PROVIDER", "ADMIN"]);
    const body = parseBody(reasonSchema, request.body);
    return withTransaction(app.db, async (client) => {
      const booking = await bookingForUpdate(request.params.id, client);
      const actingCitizen = actor.onBehalfOfCitizenId ?? actor.actorId;
      if (actor.actorType === "OPERATOR") {
        await assertCitizenAuthority(client, actor, booking.citizen_user_id);
      }
      const ownsBooking =
        actor.actorType === "ADMIN" ||
        (actor.actorType === "PROVIDER" && booking.provider_user_id === actor.actorId) ||
        (["CITIZEN", "OPERATOR"].includes(actor.actorType) &&
          booking.citizen_user_id === actingCitizen);
      if (!ownsBooking) throw new AppError(403, "FORBIDDEN", "Booking belongs to another actor");
      if (!["HELD", "CONFIRMED", "SCHEDULED"].includes(booking.status)) {
        throw new AppError(409, "INVALID_BOOKING_STATE", "Booking is not active");
      }
      await client.query(
        "UPDATE booking SET status = 'CANCELLED', updated_at = now() WHERE id = $1",
        [booking.id],
      );
      if (booking.roster_id && booking.status === "HELD") {
        await client.query(
          `UPDATE roster_membership SET active_matters = GREATEST(active_matters - 1, 0)
           WHERE roster_id = $1 AND provider_id = $2`,
          [booking.roster_id, booking.provider_id],
        );
        await client.query(
          `UPDATE allocation SET status = 'CANCELLED', ended_at = now()
           WHERE id = $1 AND status = 'ASSIGNED'`,
          [booking.allocation_id],
        );
      }
      await writeAudit(client, actor, {
        action: "booking.cancelled",
        entityType: "booking",
        entityId: booking.id,
        reasonCode: body.reasonCode,
        afterSummary: { status: "CANCELLED" },
      });
      return { bookingId: booking.id, status: "CANCELLED" };
    });
  });

  app.post<{ Params: { id: string } }>("/v1/matters/:id/close", async (request) => {
    const actor = requireActor(request, ["CITIZEN", "PROVIDER", "ADMIN"]);
    const body = parseBody(closeSchema, request.body);
    return withTransaction(app.db, async (client) => {
      const matter = await client.query<{
        id: string;
        status: string;
        provider_user_id: string;
        citizen_user_id: string;
      }>(
        `SELECT m.id, m.status, p.user_id AS provider_user_id, m.citizen_user_id
         FROM matter m JOIN provider p ON p.id = m.provider_id WHERE m.id = $1 FOR UPDATE OF m`,
        [request.params.id],
      );
      const row = matter.rows[0];
      if (!row) throw new AppError(404, "MATTER_NOT_FOUND", "Matter was not found");
      if (
        actor.actorType !== "ADMIN" &&
        actor.actorId !== row.provider_user_id &&
        actor.actorId !== row.citizen_user_id
      ) {
        throw new AppError(403, "FORBIDDEN", "Matter belongs to another actor");
      }
      if (row.status !== "OPEN")
        throw new AppError(409, "INVALID_MATTER_STATE", "Matter is not open");
      await client.query(
        `UPDATE matter SET status = 'CLOSED', closed_at = now(), close_reason = $2, cnr_number = $3
         WHERE id = $1`,
        [row.id, body.closeReason, body.cnrNumber ?? null],
      );
      await client.query(
        `UPDATE allocation SET status = 'COMPLETED', ended_at = now()
         WHERE id = (SELECT allocation_id FROM matter WHERE id = $1) AND status = 'ASSIGNED'`,
        [row.id],
      );
      await client.query(
        `UPDATE roster_membership rm SET active_matters = GREATEST(rm.active_matters - 1, 0)
         FROM allocation a
         WHERE a.id = (SELECT allocation_id FROM matter WHERE id = $1)
           AND a.roster_id = rm.roster_id
           AND rm.provider_id = (SELECT provider_id FROM matter WHERE id = $1)`,
        [row.id],
      );
      await writeAudit(client, actor, {
        action: "matter.closed",
        entityType: "matter",
        entityId: row.id,
        reasonCode: body.closeReason,
        afterSummary: { status: "CLOSED", hasCnrPointer: Boolean(body.cnrNumber) },
      });
      return { matterId: row.id, status: "CLOSED" };
    });
  });

  app.get<{ Params: { id: string } }>("/v1/matters/:id/status", async (request) => {
    const actor = requireActor(request, ["CITIZEN", "PROVIDER", "OPERATOR", "ADMIN"]);
    const matter = await app.db.query<{
      id: string;
      status: string;
      cnr_number: string | null;
      citizen_user_id: string;
      provider_user_id: string;
    }>(
      `SELECT m.id, m.status, m.cnr_number, m.citizen_user_id, p.user_id AS provider_user_id
       FROM matter m JOIN provider p ON p.id = m.provider_id WHERE m.id = $1`,
      [request.params.id],
    );
    const row = matter.rows[0];
    if (!row) throw new AppError(404, "MATTER_NOT_FOUND", "Matter was not found");
    if (actor.actorType === "OPERATOR") {
      await assertCitizenAuthority(app.db, actor, row.citizen_user_id);
    } else if (
      actor.actorType !== "ADMIN" &&
      actor.actorId !== row.provider_user_id &&
      actor.actorId !== row.citizen_user_id
    ) {
      throw new AppError(403, "FORBIDDEN", "Matter belongs to another actor");
    }
    if (app.config.capabilities.caseStatus === "LIVE") {
      throw new AppError(
        503,
        "ADAPTER_NOT_IMPLEMENTED",
        "No authorized live case-status adapter is supplied",
      );
    }
    return {
      matterId: row.id,
      matterStatus: row.status,
      caseStatus: unavailableCaseStatus(
        app.config.capabilities.caseStatus,
        app.config.ecourtsPublicUrl,
      ),
    };
  });
}
