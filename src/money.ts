export interface Money {
  amount: string;
  currencyCode: string;
}

const SCALE_DIGITS = 6;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

export type Totals = Record<string, string>;

// Sums decimal strings exactly, per currency, so totals never pick up float drift.
export function sumByCurrency(values: (Money | null | undefined)[]): Totals {
  const sums = new Map<string, bigint>();
  for (const value of values) {
    if (value) {
      sums.set(
        value.currencyCode,
        (sums.get(value.currencyCode) ?? 0n) + toUnits(value.amount)
      );
    }
  }
  return Object.fromEntries(
    [...sums].map(([currency, units]) => [currency, fromUnits(units)])
  );
}

function toUnits(amount: string): bigint {
  const negative = amount.startsWith("-");
  const [whole = "0", fraction = ""] = amount.replace(/^[-+]/u, "").split(".");
  const units =
    BigInt(whole) * SCALE +
    BigInt(fraction.padEnd(SCALE_DIGITS, "0").slice(0, SCALE_DIGITS));
  return negative ? -units : units;
}

function fromUnits(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const absolute = units < 0n ? -units : units;
  const fraction = (absolute % SCALE)
    .toString()
    .padStart(SCALE_DIGITS, "0")
    .replace(/(?<digits>\d\d\d*?)0*$/u, "$<digits>");
  return `${sign}${absolute / SCALE}.${fraction}`;
}
