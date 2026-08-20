export const MONEY_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,11})\.\d{2}$/;

export interface QuoteFeeBreakdown {
  professionalFee: string;
  processingFee: string;
  platformCommission: string;
}

export function toMinorUnits(value: string): bigint {
  if (!MONEY_AMOUNT_PATTERN.test(value)) {
    throw new RangeError("Money amount must be a non-negative decimal with exactly two decimals");
  }
  const [whole = "0", fraction = "00"] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction);
}

export function isZeroMoneyAmount(value: string): boolean {
  return toMinorUnits(value) === 0n;
}

export function quoteFeeBreakdownMatchesTotal(
  total: string,
  breakdown: QuoteFeeBreakdown,
): boolean {
  return (
    isZeroMoneyAmount(breakdown.platformCommission) &&
    toMinorUnits(breakdown.professionalFee) + toMinorUnits(breakdown.processingFee) ===
      toMinorUnits(total)
  );
}
