import { addMoney, formatTotals } from "../money.ts";
import type { UnitTotals } from "../money.ts";
import type { PartnerEvent } from "../partner.ts";
import {
  firstInstallAt,
  firstPaidAt,
  isInstalledAt,
  relationshipStateAt,
  subscriptionAt,
} from "./ledger.ts";
import type { ShopRecord } from "./ledger.ts";
import {
  DAY_MS,
  daysBetween,
  inRange,
  median,
  monthKey,
  percent,
  snapshotAt,
} from "./time.ts";
import type { Range } from "./time.ts";

const MAX_ROWS = 200;

export function retentionCohorts(
  shops: ShopRecord[],
  months: string[],
  now: number
) {
  const cohorts = Map.groupBy(
    shops.filter((shop) => firstInstallAt(shop) !== null),
    (shop) => monthKey(Date.parse(firstInstallAt(shop) ?? ""))
  );
  return months.map((month, index) => {
    const cohort = cohorts.get(month) ?? [];
    const later = months.slice(index);
    return {
      month,
      installs: cohort.length,
      // Percent of the cohort at the end of each month since install: index 0 is the install month.
      installedPercent: later.map((key) =>
        percent(
          cohort.filter((shop) => isInstalledAt(shop, snapshotAt(key, now)))
            .length,
          cohort.length
        )
      ),
      payingPercent: later.map((key) =>
        percent(
          cohort.filter(
            (shop) =>
              subscriptionAt(shop, snapshotAt(key, now)).status === "paying"
          ).length,
          cohort.length
        )
      ),
    };
  });
}

export function trialFunnel(shops: ShopRecord[], range: Range, now: number) {
  const installed = shops.filter((shop) =>
    inRange(firstInstallAt(shop), range)
  );
  const subscribed = installed.filter((shop) => created(shop) !== undefined);
  const trialed = subscribed.filter(
    (shop) => (created(shop)?.plan?.trialDays ?? 0) > 0
  );
  const paid = installed.filter((shop) => firstPaidAt(shop) !== null);
  const payingNow = installed.filter(
    (shop) => subscriptionAt(shop, now).status === "paying"
  );
  return {
    installed: installed.length,
    subscribed: subscribed.length,
    startedTrial: trialed.length,
    paid: paid.length,
    payingNow: payingNow.length,
    installToSubscribedPercent: percent(subscribed.length, installed.length),
    installToPaidPercent: percent(paid.length, installed.length),
    trialToPaidPercent: percent(
      trialed.filter((shop) => firstPaidAt(shop)).length,
      trialed.length
    ),
    medianDaysInstallToPaid: median(
      paid.map((shop) =>
        daysBetween(
          firstInstallAt(shop) ?? "",
          Date.parse(firstPaidAt(shop) ?? "")
        )
      )
    ),
  };
}

function created(shop: ShopRecord): PartnerEvent | undefined {
  return shop.subscriptions.find(
    (event) => event.subscriptionState === "CREATED"
  );
}

interface ChurnRow {
  domain: string;
  shopId: string;
  at: string;
  kind: "uninstalled" | "subscription_canceled";
  reason: string | null;
  reasonDescription: string | null;
  lastPlan: string | null;
  lifetimeNet: Record<string, string>;
  daysSinceFirstInstall: number | null;
  installedNow: boolean;
}

export function churnReport(shops: ShopRecord[], range: Range, now: number) {
  const rows = shops.flatMap((shop) => churnRows(shop, range, now));
  const reasons = Map.groupBy(
    rows.filter((row) => row.kind === "uninstalled"),
    (row) =>
      [row.reason, row.reasonDescription].filter(Boolean).join(": ") ||
      "not given"
  );
  return {
    uninstalls: rows.filter((row) => row.kind === "uninstalled").length,
    subscriptionCancellations: rows.filter(
      (row) => row.kind === "subscription_canceled"
    ).length,
    reinstalledSince: rows.filter(
      (row) => row.kind === "uninstalled" && row.installedNow
    ).length,
    uninstallReasons: Object.fromEntries(
      [...reasons]
        .map(([reason, items]) => [reason, items.length])
        .toSorted((a, b) => Number(b[1]) - Number(a[1]))
    ),
    scheduledCancellations: scheduledCancellations(shops, now),
    // Highest lifetime earnings first, so the most valuable losses lead.
    shops: rows.toSorted((a, b) => totalOf(b) - totalOf(a)).slice(0, MAX_ROWS),
    shopsTruncated: rows.length > MAX_ROWS,
  };
}

function churnRows(shop: ShopRecord, range: Range, now: number): ChurnRow[] {
  const losses = [
    ...shop.relationships.filter(
      (event) => event.relationshipState === "UNINSTALLED"
    ),
    ...shop.subscriptions.filter(
      (event) => event.subscriptionState === "CANCELED"
    ),
  ].filter((event) => inRange(event.occurredAt, range));
  const net: UnitTotals = new Map();
  for (const event of shop.earnings) {
    addMoney(net, event.netAmount);
  }
  const install = firstInstallAt(shop);
  return losses.map((event) => ({
    domain: shop.domain,
    shopId: shop.id,
    at: event.occurredAt,
    kind:
      event.__typename === "Relationship"
        ? "uninstalled"
        : "subscription_canceled",
    reason: event.reason ?? null,
    reasonDescription: event.reasonDescription ?? null,
    lastPlan:
      subscriptionAt(shop, Date.parse(event.occurredAt) - 1).plan?.handle ??
      null,
    lifetimeNet: formatTotals(net),
    daysSinceFirstInstall: install
      ? daysBetween(install, Date.parse(event.occurredAt))
      : null,
    installedNow: isInstalledAt(shop, now),
  }));
}

function totalOf(row: ChurnRow): number {
  return Object.values(row.lifetimeNet).reduce(
    (sum, amount) => sum + Number(amount),
    0
  );
}

function scheduledCancellations(shops: ShopRecord[], now: number) {
  return shops.flatMap((shop) => {
    const state = subscriptionAt(shop, now);
    return state.cancelEffectiveOn
      ? [
          {
            domain: shop.domain,
            shopId: shop.id,
            plan: state.plan?.handle ?? null,
            cancelEffectiveOn: state.cancelEffectiveOn,
          },
        ]
      : [];
  });
}

const RECENT_CREDIT_DAYS = 90;

// Facts that need attention now. Nothing here is a prediction.
export function billingWatchlist(shops: ShopRecord[], now: number) {
  const recent = now - RECENT_CREDIT_DAYS * DAY_MS;
  const row = (shop: ShopRecord, since: string | null) => ({
    domain: shop.domain,
    shopId: shop.id,
    plan: subscriptionAt(shop, now).plan?.handle ?? null,
    since,
  });
  return {
    frozenSubscriptions: shops
      .filter((shop) => subscriptionAt(shop, now).status === "frozen")
      .map((shop) => row(shop, subscriptionAt(shop, now).changedAt)),
    scheduledCancellations: scheduledCancellations(shops, now),
    deactivatedStores: shops
      .filter((shop) => relationshipStateAt(shop, now) === "DEACTIVATED")
      .map((shop) => row(shop, shop.relationships.at(-1)?.occurredAt ?? null)),
    creditsNotApplied: shops.flatMap((shop) =>
      shop.credits
        .filter(
          (credit) =>
            credit.status !== "APPLIED" &&
            Date.parse(credit.occurredAt) >= recent
        )
        .map((credit) => ({
          ...row(shop, credit.occurredAt),
          status: credit.status ?? null,
          amount: credit.money ?? null,
          description: credit.description ?? null,
        }))
    ),
  };
}
