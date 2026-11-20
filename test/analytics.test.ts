import { describe, expect, it } from "vitest";

import {
  billingWatchlist,
  churnReport,
  retentionCohorts,
  trialFunnel,
} from "../src/analytics/customers.ts";
import { buildLedger, subscriptionAt } from "../src/analytics/ledger.ts";
import type { ShopRecord } from "../src/analytics/ledger.ts";
import { appOverview } from "../src/analytics/overview.ts";
import { planPerformance } from "../src/analytics/plans.ts";
import { customerLtv, mrrMovement } from "../src/analytics/revenue.ts";
import { EVENTS, NOW } from "./fixture.ts";

const shops = buildLedger(EVENTS);
const shop = (name: string) =>
  shops.find(
    (record) => record.domain === `${name}.myshopify.com`
  ) as ShopRecord;
const at = (date: string) => Date.parse(`${date}T23:59:59Z`);
const MONTHS = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
];
const range = (from: string, to: string) => ({
  from: Date.parse(`${from}T00:00:00Z`),
  to: at(to),
});

describe(subscriptionAt, () => {
  it("is trialing during the trial and paying after it", () => {
    expect(subscriptionAt(shop("a"), at("2026-01-08")).status).toBe("trialing");
    expect(subscriptionAt(shop("a"), at("2026-02-15")).mrr).toStrictEqual({
      currency: "USD",
      units: 29_000_000n,
    });
  });

  it("stops billing a shop after it uninstalls", () => {
    expect(subscriptionAt(shop("a"), at("2026-06-01")).status).toBe("canceled");
  });

  it("divides an annual price by 12", () => {
    expect(subscriptionAt(shop("b"), at("2026-03-01")).mrr?.units).toBe(
      10_000_000n
    );
  });
});

describe("subscription after a reinstall", () => {
  it("does not count a reinstalled shop as paying until it subscribes again", () => {
    const reinstalled = buildLedger([
      ...EVENTS.filter(
        (event) => event.shop?.myshopifyDomain === "a.myshopify.com"
      ),
      { ...EVENTS[0], id: "reinstall", occurredAt: "2026-06-01T12:00:00Z" },
    ] as typeof EVENTS);
    const [record] = reinstalled;
    expect(record && subscriptionAt(record, NOW).status).toBe("none");
  });
});

describe(mrrMovement, () => {
  const months = mrrMovement(shops, MONTHS, NOW);
  const byMonth = Object.fromEntries(
    months.map((month) => [month.month, month])
  );

  it("tracks MRR at each month end", () => {
    expect(months.map((month) => month.mrr.USD)).toStrictEqual([
      "58.00",
      "68.00",
      "88.00",
      "59.00",
      "10.00",
      "10.00",
    ]);
  });

  it("splits the change into new, expansion, and churn", () => {
    expect(byMonth["2026-01"]?.shops.new).toBe(2);
    expect(byMonth["2026-03"]?.movement.expansion).toStrictEqual({
      USD: "20.00",
    });
    expect(byMonth["2026-04"]?.movement.churn).toStrictEqual({ USD: "-29.00" });
    expect(byMonth["2026-05"]?.movement.churn).toStrictEqual({ USD: "-49.00" });
  });
});

describe(trialFunnel, () => {
  it("follows first-quarter installs to payment", () => {
    expect(
      trialFunnel(shops, range("2026-01-01", "2026-03-31"), NOW)
    ).toMatchObject({
      installed: 4,
      subscribed: 3,
      startedTrial: 1,
      paid: 2,
      payingNow: 1,
      installToPaidPercent: 50,
    });
  });
});

describe(churnReport, () => {
  it("lists losses with Shopify's uninstall reasons", () => {
    const report = churnReport(shops, range("2026-03-01", "2026-05-31"), NOW);
    expect(report.uninstalls).toBe(2);
    expect(report.subscriptionCancellations).toBe(1);
    expect(report.uninstallReasons).toStrictEqual({
      "Too expensive": 1,
      "Not needed": 1,
    });
    expect(report.shops[0]).toMatchObject({
      domain: "a.myshopify.com",
      lastPlan: "plus",
      lifetimeNet: { USD: "124.80" },
    });
  });
});

describe(planPerformance, () => {
  it("counts plan moves and current paying shops", () => {
    const plans = planPerformance(
      shops,
      range("2026-01-01", "2026-06-30"),
      NOW
    );
    expect(plans.pro).toMatchObject({ newSubscriptions: 2, movedOut: 1 });
    expect(plans.plus).toMatchObject({ movedIn: 1, canceled: 1 });
    expect(plans.basic).toMatchObject({
      payingNow: 1,
      mrrNow: { USD: "10.00" },
    });
  });
});

describe(retentionCohorts, () => {
  it("shows the January cohort halving when a shop uninstalls in May", () => {
    const [january] = retentionCohorts(shops, MONTHS, NOW);
    expect(january?.installs).toBe(2);
    expect(january?.installedPercent).toStrictEqual([
      100, 100, 100, 100, 50, 50,
    ]);
  });
});

describe(billingWatchlist, () => {
  it("flags the frozen subscription", () => {
    expect(
      billingWatchlist(shops, NOW).frozenSubscriptions.map((row) => row.domain)
    ).toStrictEqual(["d.myshopify.com"]);
  });
});

describe(customerLtv, () => {
  it("ranks shops by lifetime net earnings", () => {
    const ltv = customerLtv(shops, NOW);
    expect(ltv.payingShops).toBe(2);
    expect(ltv.byCurrency.USD).toMatchObject({
      total: "220.80",
      average: "110.40",
    });
    expect(ltv.topShops[0]?.domain).toBe("a.myshopify.com");
  });
});

describe(appOverview, () => {
  it("summarizes where the app stands now", () => {
    expect(appOverview(shops, NOW).now).toMatchObject({
      installedShops: 2,
      payingShops: 1,
      frozenSubscriptions: 1,
      mrr: { USD: "10.00" },
      arr: { USD: "120.00" },
    });
  });
});
