export interface Money {
  amount: string;
  currencyCode: string;
}

// Amounts are held as integer millionths so sums never pick up float drift.
const SCALE_DIGITS = 6;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

export type Totals = Record<string, string>;
export type UnitTotals = Map<string, bigint>;

export function toUnits(amount: string): bigint {
  const negative = amount.startsWith("-");
  const [whole = "0", fraction = ""] = amount.replace(/^[-+]/u, "").split(".");
  const units =
    BigInt(whole) * SCALE +
    BigInt(fraction.padEnd(SCALE_DIGITS, "0").slice(0, SCALE_DIGITS));
  return negative ? -units : units;
}

export function formatUnits(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const absolute = units < 0n ? -units : units;
  const fraction = (absolute % SCALE)
    .toString()
    .padStart(SCALE_DIGITS, "0")
    .replace(/(?<digits>\d\d\d*?)0*$/u, "$<digits>");
  return `${sign}${absolute / SCALE}.${fraction}`;
}

export function addUnits(
  totals: UnitTotals,
  currency: string,
  units: bigint
): void {
  totals.set(currency, (totals.get(currency) ?? 0n) + units);
}

export function addMoney(
  totals: UnitTotals,
  money: Money | null | undefined
): void {
  if (money) {
    addUnits(totals, money.currencyCode, toUnits(money.amount));
  }
}

export function formatTotals(totals: UnitTotals): Totals {
  return Object.fromEntries(
    [...totals].map(([currency, units]) => [currency, formatUnits(units)])
  );
}

export function sumByCurrency(values: (Money | null | undefined)[]): Totals {
  const totals: UnitTotals = new Map();
  for (const value of values) {
    addMoney(totals, value);
  }
  return formatTotals(totals);
}
