import type { FastifyInstance } from "fastify";
import type { PoolClient, QueryResult } from "pg";
import { z } from "zod";
import { writeAudit } from "../../../modules/audit/application/write-audit.js";
import { assertCitizenAuthority } from "../../../modules/identity/application/assert-citizen-authority.js";
import { unavailableCaseStatus } from "../../../modules/interop/domain/case-status.js";
import {
  BookingNotFoundError,
  type LockedBooking,
  lockBooking,
  transitionLockedBooking,
} from "../../../modules/scheduling/application/locked-booking.js";
import {
  type BookingStatus,
  InvalidBookingTransitionError,
} from "../../../modules/scheduling/domain/booking-state.js";
import { withTransaction } from "../../../shared/transaction.js";
import { requireActor } from "../actor-context.js";
import { AppError } from "../errors.js";
import {
  citizenBookingCancelledResponseSchema,
  matterStatusResponseSchema,
  providerSlotsResponseSchema,
} from "../schemas/citizen/responses.js";
import {
  providerBookingAcceptedResponseSchema,
  providerBookingCancelledResponseSchema,
  providerBookingDeclinedResponseSchema,
} from "../schemas/provider/responses.js";
import { parseBody } from "../validation.js";

const reasonSchema = z.object({ reasonCode: z.string().min(1).max(100) });

async function bookingForUpdate(id: string, client: PoolClient): Promise<LockedBooking> {
  try {
    return await lockBooking(client, id);
  } catch (error) {
    if (error instanceof BookingNotFoundError) {
      throw new AppError(404, "BOOKING_NOT_FOUND", "Booking was not found");
    }
    throw error;
  }
}

async function changeBookingStatus(
  client: PoolClient,
  booking: LockedBooking,
  nextStatus: BookingStatus,
): Promise<BookingStatus> {
  try {
    return await transitionLockedBooking(client, booking, nextStatus);
  } catch (error) {
    if (error instanceof InvalidBookingTransitionError) {
      throw new AppError(
        409,
        "INVALID_BOOKING_STATE",
        `Booking cannot transition from ${error.from} to ${error.to}`,
      );
    }
    throw error;
  }
}

function requireSingleRow(rowCount: number | null, operation: string): void {
  if (rowCount !== 1) {
    throw new AppError(
      409,
      "SCHEDULING_STATE_CONFLICT",
      `${operation} did not affect exactly one row`,
    );
  }
}

function requireActiveAllocation(booking: LockedBooking): void {
  if (booking.allocationStatus !== "ASSIGNED") {
    throw new AppError(409, "ALLOCATION_NOT_ACTIVE", "The booking allocation is no longer active");
  }
}

export async function registerSchedulingMatterRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/v1/providers/:id/slots", async (request) => {
    requireActor(request, ["CITIZEN", "OPERATOR", "PROVIDER", "INSTITUTION", "ADMIN"]);
    return providerSlotsResponseSchema.parse({
      providerId: request.params.id,
      availabilityPolicy: "NOT_CONFIGURED",
      slots: [],
    });
  });

  app.post("/v1/bookings", async (request) => {
    requireActor(request, ["CITIZEN", "OPERATOR"]);
    throw new AppError(
      503,
      "AVAILABILITY_POLICY_NOT_CONFIGURED",
      "Booking is unavailable until a reviewed availability policy is configured",
    );
  });

  app.post<{ Params: { id: string } }>("/v1/bookings/:id/accept", async (request) => {
    const actor = requireActor(request, ["PROVIDER"]);
    return withTransaction(app.db, async (client) => {
      const booking = await bookingForUpdate(request.params.id, client);
      if (booking.providerUserId !== actor.actorId) {
        throw new AppError(403, "FORBIDDEN", "Booking belongs to another provider");
      }
      requireActiveAllocation(booking);
      const status = await changeBookingStatus(client, booking, "CONFIRMED");
      let matter: QueryResult<{ id: string }>;
      try {
        matter = await client.query<{ id: string }>(
          `INSERT INTO matter(allocation_id, provider_id, citizen_user_id, status)
           VALUES ($1,$2,$3,'OPEN') RETURNING id`,
          [booking.allocationId, booking.providerId, booking.citizenUserId],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new AppError(
            409,
            "INVALID_BOOKING_STATE",
            "The booking allocation already has a matter",
          );
        }
        throw error;
      }
      const matterRow = matter.rows[0];
      requireSingleRow(matter.rowCount, "Matter creation");
      if (!matterRow) throw new Error("Matter creation returned no row");
      await writeAudit(client, actor, {
        action: "booking.accepted",
        entityType: "booking",
        entityId: booking.id,
        beforeSummary: { status: booking.status },
        afterSummary: { status, matterId: matterRow.id },
      });
      await writeAudit(client, actor, {
        action: "matter.created",
        entityType: "matter",
        entityId: matterRow.id,
        afterSummary: { status: "OPEN", allocationId: booking.allocationId },
      });
      return providerBookingAcceptedResponseSchema.parse({
        bookingId: booking.id,
        status,
        matterId: matterRow.id,
      });
    });
  });

  app.post<{ Params: { id: string } }>("/v1/bookings/:id/decline", async (request) => {
    const actor = requireActor(request, ["PROVIDER"]);
    const body = parseBody(reasonSchema, request.body);
    return withTransaction(app.db, async (client) => {
      const booking = await bookingForUpdate(request.params.id, client);
      if (booking.providerUserId !== actor.actorId) {
        throw new AppError(403, "FORBIDDEN", "Booking belongs to another provider");
      }
      requireActiveAllocation(booking);
      const status = await changeBookingStatus(client, booking, "DECLINED");
      const releasedAllocation = await client.query(
        `UPDATE allocation SET status = 'DECLINED', ended_at = now(), decline_reason = $2
         WHERE id = $1 AND status = 'ASSIGNED'`,
        [booking.allocationId, body.reasonCode],
      );
      requireSingleRow(releasedAllocation.rowCount, "Allocation decline");
      await writeAudit(client, actor, {
        action: "allocation.declined",
        entityType: "allocation",
        entityId: booking.allocationId,
        reasonCode: body.reasonCode,
        beforeSummary: { status: "ASSIGNED" },
        afterSummary: { status: "DECLINED" },
      });
      if (booking.rosterId) {
        const releasedCapacity = await client.query(
          `UPDATE roster_membership SET active_matters = active_matters - 1
           WHERE roster_id = $1 AND provider_id = $2 AND active_matters > 0`,
          [booking.rosterId, booking.providerId],
        );
        requireSingleRow(releasedCapacity.rowCount, "Roster capacity release");
        await writeAudit(client, actor, {
          action: "roster.capacity_released",
          entityType: "roster_membership",
          entityId: `${booking.rosterId}:${booking.providerId}`,
          afterSummary: { activeMatterDelta: -1, bookingId: booking.id },
        });
        const signal = await client.query<{ id: string }>(
          `INSERT INTO conduct_signal(provider_id, signal_type, value)
           VALUES ($1,'ROTATION_DECLINE',$2) RETURNING id`,
          [booking.providerId, { reasonCode: body.reasonCode }],
        );
        requireSingleRow(signal.rowCount, "Rotation decline conduct signal");
        const signalRow = signal.rows[0];
        if (!signalRow) throw new Error("Rotation decline conduct signal returned no row");
        await writeAudit(client, actor, {
          action: "conduct_signal.recorded",
          entityType: "conduct_signal",
          entityId: signalRow.id,
          reasonCode: body.reasonCode,
          afterSummary: { providerId: booking.providerId, type: "ROTATION_DECLINE" },
        });
      }
      await writeAudit(client, actor, {
        action: "booking.declined",
        entityType: "booking",
        entityId: booking.id,
        reasonCode: body.reasonCode,
        beforeSummary: { status: booking.status },
        afterSummary: { status, rotationCapacityReleased: booking.rosterId !== null },
      });
      return providerBookingDeclinedResponseSchema.parse({ bookingId: booking.id, status });
    });
  });

  app.post<{ Params: { id: string } }>("/v1/bookings/:id/cancel", async (request) => {
    const actor = requireActor(request, ["CITIZEN", "OPERATOR", "PROVIDER"]);
    const body = parseBody(reasonSchema, request.body);
    return withTransaction(app.db, async (client) => {
      const booking = await bookingForUpdate(request.params.id, client);
      const actingCitizen = actor.onBehalfOfCitizenId ?? actor.actorId;
      if (actor.actorType === "OPERATOR") {
        await assertCitizenAuthority(client, actor, booking.citizenUserId);
      }
      const ownsBooking =
        (actor.actorType === "PROVIDER" && booking.providerUserId === actor.actorId) ||
        (["CITIZEN", "OPERATOR"].includes(actor.actorType) &&
          booking.citizenUserId === actingCitizen);
      if (!ownsBooking) throw new AppError(403, "FORBIDDEN", "Booking belongs to another actor");
      requireActiveAllocation(booking);
      if (booking.status === "CONFIRMED" || booking.status === "SCHEDULED") {
        throw new AppError(
          503,
          "CANCELLATION_POLICY_NOT_CONFIGURED",
          "Confirmed booking cancellation is unavailable until a reviewed policy is configured",
        );
      }
      const status = await changeBookingStatus(client, booking, "CANCELLED");
      const cancelledAllocation = await client.query(
        `UPDATE allocation SET status = 'CANCELLED', ended_at = now()
         WHERE id = $1 AND status = 'ASSIGNED'`,
        [booking.allocationId],
      );
      requireSingleRow(cancelledAllocation.rowCount, "Allocation cancellation");
      await writeAudit(client, actor, {
        action: "allocation.cancelled",
        entityType: "allocation",
        entityId: booking.allocationId,
        reasonCode: body.reasonCode,
        beforeSummary: { status: "ASSIGNED" },
        afterSummary: { status: "CANCELLED" },
      });
      if (booking.rosterId) {
        const releasedCapacity = await client.query(
          `UPDATE roster_membership SET active_matters = active_matters - 1
           WHERE roster_id = $1 AND provider_id = $2 AND active_matters > 0`,
          [booking.rosterId, booking.providerId],
        );
        requireSingleRow(releasedCapacity.rowCount, "Roster capacity release");
        await writeAudit(client, actor, {
          action: "roster.capacity_released",
          entityType: "roster_membership",
          entityId: `${booking.rosterId}:${booking.providerId}`,
          afterSummary: { activeMatterDelta: -1, bookingId: booking.id },
        });
      }
      await writeAudit(client, actor, {
        action: "booking.cancelled",
        entityType: "booking",
        entityId: booking.id,
        reasonCode: body.reasonCode,
        beforeSummary: { status: booking.status },
        afterSummary: { status },
      });
      const response = { bookingId: booking.id, status };
      return actor.actorType === "PROVIDER"
        ? providerBookingCancelledResponseSchema.parse(response)
        : citizenBookingCancelledResponseSchema.parse(response);
    });
  });

  app.post<{ Params: { id: string } }>("/v1/matters/:id/close", async (request) => {
    requireActor(request, ["CITIZEN", "PROVIDER"]);
    throw new AppError(
      503,
      "MATTER_CLOSURE_POLICY_NOT_CONFIGURED",
      "Matter closure is unavailable until a reviewed confirmation policy is configured",
    );
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
    return matterStatusResponseSchema.parse({
      matterId: row.id,
      matterStatus: row.status,
      caseStatus: unavailableCaseStatus(
        app.config.capabilities.caseStatus,
        app.config.ecourtsPublicUrl,
      ),
    });
  });
}
