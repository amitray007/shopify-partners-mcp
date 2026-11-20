import { describe, expect, it } from "vitest";

import type { PartnerEvent, Transaction } from "../src/partner.ts";
import { summarizeInstalls, summarizeRevenue } from "../src/reports.ts";

const usd = (amount: string) => ({ amount, currencyCode: "USD" });

function transaction(type: string, net: string): Transaction {
  return {
    type,
    id: `${type}-${net}`,
    createdAt: "2026-11-01T00:00:00Z",
    shop: null,
    app: null,
    theme: null,
    chargeId: null,
    gross: null,
    net: usd(net),
    shopifyFee: null,
    detail: null,
  };
}

function event(eventType: string, subject: string): PartnerEvent {
  return {
    __typename: "Relationship",
    id: `${eventType}-${subject}`,
    occurredAt: "2026-11-01T00:00:00Z",
    eventType,
    shop: null,
    subject: { __typename: "AppReference", id: "1", name: subject },
  };
}

describe(summarizeRevenue, () => {
  it("totals net per transaction type", () => {
    const summary = summarizeRevenue([
      transaction("AppSubscriptionSale", "8.00"),
      transaction("AppSubscriptionSale", "8.00"),
      transaction("AppSaleAdjustment", "-8.00"),
    ]);
    expect(summary.net).toStrictEqual({ USD: "8.00" });
    expect(summary.byType.AppSubscriptionSale).toStrictEqual({
      count: 2,
      net: { USD: "16.00" },
    });
  });
});

describe(summarizeInstalls, () => {
  it("counts relationship events per app", () => {
    const summary = summarizeInstalls([
      event("RELATIONSHIP_INSTALLED", "Alpha"),
      event("RELATIONSHIP_INSTALLED", "Alpha"),
      event("RELATIONSHIP_UNINSTALLED", "Alpha"),
      event("RELATIONSHIP_INSTALLED", "Beta"),
    ]);
    expect(summary).toStrictEqual([
      {
        subject: "Alpha",
        installed: 2,
        uninstalled: 1,
        deactivated: 0,
        reactivated: 0,
        netInstalls: 1,
      },
      {
        subject: "Beta",
        installed: 1,
        uninstalled: 0,
        deactivated: 0,
        reactivated: 0,
        netInstalls: 1,
      },
    ]);
  });
});
