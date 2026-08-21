import type { PoolClient } from "pg";
import { type BookingStatus, isBookingStatus, transitionBooking } from "../domain/booking-state.js";

export interface LockedBooking {
  id: string;
  status: BookingStatus;
  allocationStatus: string;
  providerId: string;
  providerUserId: string;
  allocationId: string;
  citizenUserId: string;
  rosterId: string | null;
  createdAt: Date | null;
}

export class BookingNotFoundError extends Error {
  constructor() {
    super("Booking was not found");
    this.name = "BookingNotFoundError";
  }
}

export async function lockBooking(client: PoolClient, bookingId: string): Promise<LockedBooking> {
  const result = await client.query<{
    id: string;
    status: string;
    allocation_status: string;
    provider_id: string;
    provider_user_id: string;
    allocation_id: string;
    citizen_user_id: string;
    roster_id: string | null;
  }>(
    `SELECT b.id, b.status, b.provider_id, b.created_at, p.user_id AS provider_user_id,
            a.id AS allocation_id, a.status AS allocation_status, a.roster_id, n.citizen_user_id
     FROM booking b JOIN provider p ON p.id = b.provider_id
     JOIN allocation a ON a.id = b.allocation_id
     JOIN need_request n ON n.id = b.need_request_id
     WHERE b.id = $1 FOR UPDATE OF b, a`,
    [bookingId],
  );
  const row = result.rows[0];
  if (!row) throw new BookingNotFoundError();
  if (!isBookingStatus(row.status)) {
    throw new Error(`Booking ${row.id} has unknown state '${row.status}'`);
  }
  return {
    id: row.id,
    status: row.status,
    allocationStatus: row.allocation_status,
    providerId: row.provider_id,
    providerUserId: row.provider_user_id,
    allocationId: row.allocation_id,
    citizenUserId: row.citizen_user_id,
    rosterId: row.roster_id,
    createdAt: (row as { created_at?: Date }).created_at ?? null,
  };
}

export async function transitionLockedBooking(
  client: PoolClient,
  booking: LockedBooking,
  nextStatus: BookingStatus,
): Promise<BookingStatus> {
  const status = transitionBooking(booking.status, nextStatus);
  const updated = await client.query(
    "UPDATE booking SET status = $2, updated_at = now() WHERE id = $1 AND status = $3",
    [booking.id, status, booking.status],
  );
  if (updated.rowCount !== 1) {
    throw new Error(`Locked booking ${booking.id} did not update exactly once`);
  }
  return status;
}
