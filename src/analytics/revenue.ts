import { addMoney, addUnits, formatTotals, formatUnits } from "../money.ts";
import type { Totals, UnitTotals } from "../money.ts";
import type { PartnerEvent } from "../partner.ts";
import { firstPaidAt, subscriptionAt } from "./ledger.ts";
import type { Mrr, ShopRecord } from "./ledger.ts";
import {
  daysBetween,
  median,
  monthStart,
  previousMonth,
  snapshotAt,
} from "./time.ts";

type Movement = "new" | "reactivation" | "expansion" | "contraction" | "churn";

export interface MrrMonth {
  month: string;
  mrr: Totals;
  payingShops: number;
  movement: Record<Movement, Totals>;
  shops: Record<Movement, number>;
}

export function mrrMovement(
  shops: ShopRecord[],
  months: string[],
  now: number
): MrrMonth[] {
  const [first] = months;
  if (!first) {
    return [];
  }
  let previous = mrrSnapshot(shops, snapshotAt(previousMonth(first), now));
  return months.map((month) => {
    const at = snapshotAt(month, now);
    const current = mrrSnapshot(shops, at);
    const result = compareSnapshots(
      shops,
      previous,
      current,
      monthStart(month)
    );
    previous = current;
    return { month, ...result };
  });
}

function mrrSnapshot(shops: ShopRecord[], at: number): Map<string, Mrr> {
  const snapshot = new Map<string, Mrr>();
  for (const shop of shops) {
    const { mrr } = subscriptionAt(shop, at);
    if (mrr) {
      snapshot.set(shop.id, mrr);
    }
  }
  return snapshot;
}

function compareSnapshots(
  shops: ShopRecord[],
  before: Map<string, Mrr>,
  after: Map<string, Mrr>,
  monthBegins: number
) {
  const movement = emptyMovement<UnitTotals>(() => new Map());
  const counts = emptyMovement(() => 0);
  const mrr: UnitTotals = new Map();
  for (const shop of shops) {
    const old = before.get(shop.id);
    const next = after.get(shop.id);
    if (next) {
      addUnits(mrr, next.currency, next.units);
    }
    const kind = classify(shop, old, next, monthBegins);
    if (kind) {
      const change =
        kind === "churn"
          ? (old?.units ?? 0n)
          : (next?.units ?? 0n) - (old?.units ?? 0n);
      addUnits(
        movement[kind],
        (next ?? old)?.currency ?? "",
        kind === "churn" ? -change : change
      );
      counts[kind] += 1;
    }
  }
  return {
    mrr: formatTotals(mrr),
    payingShops: after.size,
    movement: Object.fromEntries(
      Object.entries(movement).map(([kind, totals]) => [
        kind,
        formatTotals(totals),
      ])
    ) as Record<Movement, Totals>,
    shops: counts,
  };
}

function classify(
  shop: ShopRecord,
  old: Mrr | undefined,
  next: Mrr | undefined,
  monthBegins: number
): Movement | null {
  if (!old && next) {
    const paid = firstPaidAt(shop);
    return paid && Date.parse(paid) < monthBegins ? "reactivation" : "new";
  }
  if (old && !next) {
    return "churn";
  }
  if (old && next && next.units !== old.units) {
    return next.units > old.units ? "expansion" : "contraction";
  }
  return null;
}

function emptyMovement<T>(make: () => T): Record<Movement, T> {
  return {
    new: make(),
    reactivation: make(),
    expansion: make(),
    contraction: make(),
    churn: make(),
  };
}

export function earningsByMonth(
  shops: ShopRecord[],
  months: string[],
  now: number
) {
  const earnings = shops.flatMap((shop) => shop.earnings);
  const byMonth = Map.groupBy(earnings, (event) =>
    event.occurredAt.slice(0, 7)
  );
  const today = new Date(now).toISOString().slice(0, 10);
  const upcoming = earnings.filter(
    (event) => (event.settlementDate ?? "") >= today
  );
  return {
    months: months.map((month) =>
      summarizeEarnings(month, byMonth.get(month) ?? [])
    ),
    upcomingSettlements: Object.fromEntries(
      [...Map.groupBy(upcoming, (event) => event.settlementDate ?? "")]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([date, rows]) => [date, sumNet(rows)])
    ),
  };
}

function summarizeEarnings(month: string, rows: PartnerEvent[]) {
  const gross: UnitTotals = new Map();
  const fee: UnitTotals = new Map();
  for (const row of rows) {
    addMoney(gross, row.grossAmount);
    addMoney(fee, row.shopifyFee);
  }
  return {
    month,
    net: sumNet(rows),
    gross: formatTotals(gross),
    shopifyFee: formatTotals(fee),
    byEventType: groupNet(rows, (row) => row.eventType),
    shopsWithEarnings: new Set(rows.map((row) => row.shop?.id)).size,
  };
}

function sumNet(rows: PartnerEvent[]): Totals {
  const net: UnitTotals = new Map();
  for (const row of rows) {
    addMoney(net, row.netAmount);
  }
  return formatTotals(net);
}

function groupNet(rows: PartnerEvent[], key: (row: PartnerEvent) => string) {
  return Object.fromEntries(
    [...Map.groupBy(rows, key)].map(([group, items]) => [group, sumNet(items)])
  );
}

const TOP_SHOPS = 10;

export function customerLtv(shops: ShopRecord[], now: number) {
  const paying = shops
    .filter((shop) => shop.earnings.length > 0)
    .map((shop) => ({ shop, net: lifetimeNet(shop.earnings) }));
  const currencies = new Set(paying.flatMap(({ net }) => [...net.keys()]));
  return {
    payingShops: paying.length,
    byCurrency: Object.fromEntries(
      [...currencies].map((currency) => [currency, ltvFor(paying, currency)])
    ),
    medianPayingDays: median(
      paying.flatMap(({ shop }) => {
        const paid = firstPaidAt(shop);
        return paid ? [daysBetween(paid, payingUntil(shop, now))] : [];
      })
    ),
    topShops: paying
      .toSorted((a, b) => compareUnits(b.net, a.net))
      .slice(0, TOP_SHOPS)
      .map(({ shop, net }) => ({
        domain: shop.domain,
        shopId: shop.id,
        lifetimeNet: formatTotals(net),
        status: subscriptionAt(shop, now).status,
      })),
  };
}

function lifetimeNet(earnings: PartnerEvent[]): UnitTotals {
  const net: UnitTotals = new Map();
  for (const event of earnings) {
    addMoney(net, event.netAmount);
  }
  return net;
}

function ltvFor(paying: { net: UnitTotals }[], currency: string) {
  const values = paying.flatMap(({ net }) => {
    const units = net.get(currency);
    return units === undefined ? [] : [units];
  });
  const total = values.reduce((sum, units) => sum + units, 0n);
  const sorted = values.toSorted(compareBigInt);
  const top = sorted.slice(-TOP_SHOPS).reduce((sum, units) => sum + units, 0n);
  return {
    shops: values.length,
    total: formatUnits(total),
    average: formatUnits(total / BigInt(values.length || 1)),
    median: formatUnits(sorted[Math.floor(sorted.length / 2)] ?? 0n),
    topTenShare: total > 0n ? Number((top * 1000n) / total) / 10 : null,
  };
}

// A paying shop stops paying at its last earning when it is no longer paying now.
function payingUntil(shop: ShopRecord, now: number): number {
  if (subscriptionAt(shop, now).status === "paying") {
    return now;
  }
  return Date.parse(shop.earnings.at(-1)?.occurredAt ?? "") || now;
}

// Ranks by the raw sum across currencies; shops paying in more than one currency are rare.
function compareUnits(a: UnitTotals, b: UnitTotals): number {
  return compareBigInt(sumAll(a), sumAll(b));
}

function sumAll(totals: UnitTotals): bigint {
  return [...totals.values()].reduce((total, units) => total + units, 0n);
}

function compareBigInt(a: bigint, b: bigint): number {
  if (a === b) {
    return 0;
  }
  return a > b ? 1 : -1;
}
