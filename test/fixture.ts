import type { PartnerEvent, Plan } from "../src/partner.ts";

const app = {
  __typename: "AppReference",
  id: "gid://shopify/App/1",
  name: "Example",
};
let counter = 0;

function base(
  typename: string,
  eventType: string,
  shop: string,
  at: string
): PartnerEvent {
  counter += 1;
  return {
    __typename: typename,
    id: `event-${counter}`,
    occurredAt: `${at}T12:00:00Z`,
    eventType,
    shop: {
      id: `gid://shopify/Shop/${shop}`,
      myshopifyDomain: `${shop}.myshopify.com`,
    },
    subject: app,
  };
}

function plan(
  handle: string,
  amount: string,
  options: { annual?: boolean; trialDays?: number } = {}
): Plan {
  return {
    handle,
    billingPeriod: options.annual ? "ANNUAL" : "EVERY_30_DAYS",
    trialDays: options.trialDays ?? 0,
    prices: [{ __typename: "FlatRatePlanPrice", currencyCode: "USD", amount }],
  };
}

const relationship = (
  shop: string,
  at: string,
  state: string,
  reason?: string
) => ({
  ...base("Relationship", `RELATIONSHIP_${state}`, shop, at),
  relationshipState: state,
  reason: reason ?? null,
  reasonDescription: null,
});

const subscription = (
  shop: string,
  at: string,
  state: string,
  subscribed?: Plan
) => ({
  ...base("SubscriptionStatus", `SUBSCRIPTION_${state}`, shop, at),
  subscriptionState: state,
  plan: subscribed ?? null,
  cancelEffectiveOn: null,
});

export const earning = (shop: string, at: string, net: string) => ({
  ...base("Earning", "EARNING_CHARGE_RECURRING", shop, at),
  earningType: "CHARGE",
  netAmount: { amount: net, currencyCode: "USD" },
  grossAmount: { amount: net, currencyCode: "USD" },
  shopifyFee: { amount: "0", currencyCode: "USD" },
  settlementDate: null,
});

// Four shops on one app, January to June 2026:
// a: Jan 5 install, pro $29 with a 7-day trial, upgrades to plus $49 on Mar 10, uninstalls May 20.
// b: Feb 1 install, basic $120 a year (MRR $10), still paying.
// c: Mar 1 install, never subscribes, uninstalls Mar 2.
// d: Jan 10 install, pro $29 with no trial, frozen Apr 1.
export const NOW = Date.parse("2026-06-15T00:00:00Z");

export const EVENTS: PartnerEvent[] = [
  relationship("a", "2026-01-05", "INSTALLED"),
  subscription(
    "a",
    "2026-01-05",
    "CREATED",
    plan("pro", "29.00", { trialDays: 7 })
  ),
  relationship("d", "2026-01-10", "INSTALLED"),
  subscription("d", "2026-01-10", "CREATED", plan("pro", "29.00")),
  earning("a", "2026-01-12", "23.20"),
  relationship("b", "2026-02-01", "INSTALLED"),
  subscription(
    "b",
    "2026-02-01",
    "CREATED",
    plan("basic", "120.00", { annual: true })
  ),
  earning("b", "2026-02-01", "96.00"),
  earning("a", "2026-02-11", "23.20"),
  relationship("c", "2026-03-01", "INSTALLED"),
  relationship("c", "2026-03-02", "UNINSTALLED", "Too expensive"),
  subscription("a", "2026-03-10", "UPDATED", plan("plus", "49.00")),
  earning("a", "2026-03-10", "39.20"),
  subscription("d", "2026-04-01", "FROZEN"),
  earning("a", "2026-04-10", "39.20"),
  relationship("a", "2026-05-20", "UNINSTALLED", "Not needed"),
  subscription("a", "2026-05-20", "CANCELED"),
];
