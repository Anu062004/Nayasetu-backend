export const BOOKING_STATUSES = [
  "HELD",
  "CONFIRMED",
  "SCHEDULED",
  "DECLINED",
  "CANCELLED",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export function isBookingStatus(value: string): value is BookingStatus {
  return BOOKING_STATUSES.some((status) => status === value);
}

const ALLOWED_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  HELD: ["CONFIRMED", "DECLINED", "CANCELLED"],
  CONFIRMED: [],
  SCHEDULED: [],
  DECLINED: [],
  CANCELLED: [],
};

export class InvalidBookingTransitionError extends Error {
  readonly from: BookingStatus;
  readonly to: BookingStatus;

  constructor(from: BookingStatus, to: BookingStatus) {
    super(`Booking cannot transition from ${from} to ${to}`);
    this.name = "InvalidBookingTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionBooking(from: BookingStatus, to: BookingStatus): BookingStatus {
  if (!canTransitionBooking(from, to)) {
    throw new InvalidBookingTransitionError(from, to);
  }
  return to;
}
