import { describe, expect, it } from "vitest";
import {
  BOOKING_STATUSES,
  type BookingStatus,
  canTransitionBooking,
  InvalidBookingTransitionError,
  isBookingStatus,
  transitionBooking,
} from "../../src/modules/scheduling/domain/booking-state.js";

describe("booking state machine", () => {
  it("exposes only the known persisted booking states", () => {
    expect(BOOKING_STATUSES).toEqual(["HELD", "CONFIRMED", "SCHEDULED", "DECLINED", "CANCELLED"]);
    expect(isBookingStatus("HELD")).toBe(true);
    expect(isBookingStatus("EXPIRED")).toBe(false);
  });

  it.each([
    ["HELD", "CONFIRMED"],
    ["HELD", "DECLINED"],
    ["HELD", "CANCELLED"],
  ] satisfies [BookingStatus, BookingStatus][])("allows %s -> %s", (from, to) => {
    expect(canTransitionBooking(from, to)).toBe(true);
    expect(transitionBooking(from, to)).toBe(to);
  });

  it.each([
    ["HELD", "SCHEDULED"],
    ["CONFIRMED", "DECLINED"],
    ["CONFIRMED", "CANCELLED"],
    ["SCHEDULED", "CONFIRMED"],
    ["SCHEDULED", "CANCELLED"],
    ["DECLINED", "CANCELLED"],
    ["CANCELLED", "HELD"],
  ] satisfies [BookingStatus, BookingStatus][])("rejects %s -> %s", (from, to) => {
    expect(canTransitionBooking(from, to)).toBe(false);
    expect(() => transitionBooking(from, to)).toThrow(new InvalidBookingTransitionError(from, to));
  });
});
