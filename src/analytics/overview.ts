import { addMoney, addUnits, formatTotals } from "../money.ts";
import type { UnitTotals } from "../money.ts";
import {
  firstInstallAt,
  firstPaidAt,
  isInstalledAt,
  subscriptionAt,
} from "./ledger.ts";
import type { ShopRecord } from "./ledger.ts";
import { DAY_MS, inRange } from "./time.ts";

const RECENT_DAYS = 30;

const sum = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

// One snapshot of an app: where it stands now and what moved in the last 30 days.
export function appOverview(shops: ShopRecord[], now: number) {
  const recent = { from: now - RECENT_DAYS * DAY_MS, to: now };
  const states = shops.map((shop) => ({
    shop,
    state: subscriptionAt(shop, now),
  }));
  const mrr: UnitTotals = new Map();
  for (const { state } of states) {
    if (state.mrr) {
      addUnits(mrr, state.mrr.currency, state.mrr.units);
    }
  }
  const net: UnitTotals = new Map();
  for (const event of shops.flatMap((shop) => shop.earnings)) {
    if (inRange(event.occurredAt, recent)) {
      addMoney(net, event.netAmount);
    }
  }
  const count = (status: string) =>
    states.filter(({ state }) => state.status === status).length;
  const eventsInRange = (shop: ShopRecord, relationship: string) =>
    shop.relationships.filter(
      (event) =>
        event.relationshipState === relationship &&
        inRange(event.occurredAt, recent)
    ).length;
  return {
    now: {
      installedShops: shops.filter((shop) => isInstalledAt(shop, now)).length,
      payingShops: count("paying"),
      trialingShops: count("trialing"),
      frozenSubscriptions: count("frozen"),
      scheduledCancellations: states.filter(
        ({ state }) => state.cancelEffectiveOn
      ).length,
      mrr: formatTotals(mrr),
      arr: formatTotals(
        new Map([...mrr].map(([currency, units]) => [currency, units * 12n]))
      ),
    },
    last30Days: {
      newInstalls: shops.filter((shop) => inRange(firstInstallAt(shop), recent))
        .length,
      installs: sum(shops.map((shop) => eventsInRange(shop, "INSTALLED"))),
      uninstalls: sum(shops.map((shop) => eventsInRange(shop, "UNINSTALLED"))),
      firstTimePayers: shops.filter((shop) =>
        inRange(firstPaidAt(shop), recent)
      ).length,
      netEarnings: formatTotals(net),
    },
  };
}
