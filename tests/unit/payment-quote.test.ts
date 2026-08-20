import { describe, expect, it } from "vitest";
import {
  isZeroMoneyAmount,
  quoteFeeBreakdownMatchesTotal,
  toMinorUnits,
} from "../../src/modules/settlement/domain/quote-money.js";

describe("exact quote money arithmetic", () => {
  it("converts canonical decimal strings to exact minor units", () => {
    expect(toMinorUnits("0.00")).toBe(0n);
    expect(toMinorUnits("0.10")).toBe(10n);
    expect(toMinorUnits("999999999999.99")).toBe(99_999_999_999_999n);
  });

  it("adds professional and processing fees without floating-point arithmetic", () => {
    expect(
      quoteFeeBreakdownMatchesTotal("0.30", {
        professionalFee: "0.10",
        processingFee: "0.20",
        platformCommission: "0.00",
      }),
    ).toBe(true);
    expect(
      quoteFeeBreakdownMatchesTotal("0.31", {
        professionalFee: "0.10",
        processingFee: "0.20",
        platformCommission: "0.00",
      }),
    ).toBe(false);
  });

  it("requires zero platform commission", () => {
    expect(isZeroMoneyAmount("0.00")).toBe(true);
    expect(
      quoteFeeBreakdownMatchesTotal("100.00", {
        professionalFee: "99.00",
        processingFee: "1.00",
        platformCommission: "0.01",
      }),
    ).toBe(false);
  });

  it.each(["0", "0.1", "-1.00", "1.001", "01.00", "1e2", "", "1000000000000.00"])(
    "rejects non-canonical or unsafe database amount %s",
    (amount) => {
      expect(() => toMinorUnits(amount)).toThrow(RangeError);
    },
  );
});
