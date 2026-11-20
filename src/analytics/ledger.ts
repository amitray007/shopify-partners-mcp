import { toUnits } from "../money.ts";
import type { PartnerEvent, Plan } from "../partner.ts";

const DAY_MS = 86_400_000;
const INSTALLED_STATES = new Set(["INSTALLED", "REACTIVATED"]);

export interface ShopRecord {
  id: string;
  domain: string;
  // Each list is oldest first.
  relationships: PartnerEvent[];
  subscriptions: PartnerEvent[];
  earnings: PartnerEvent[];
  charges: PartnerEvent[];
  credits: PartnerEvent[];
}

export interface Mrr {
  currency: string;
  units: bigint;
}

export interface SubscriptionState {
  status: "none" | "trialing" | "paying" | "frozen" | "canceled";
  plan: Plan | null;
  mrr: Mrr | null;
  trialEndsAt: string | null;
  cancelEffectiveOn: string | null;
  changedAt: string | null;
}

const LISTS: Record<string, keyof Omit<ShopRecord, "id" | "domain">> = {
  Relationship: "relationships",
  SubscriptionStatus: "subscriptions",
  Earning: "earnings",
  Charge: "charges",
  Credit: "credits",
};

// Groups an app's timeline (oldest first) into one record per shop.
export function buildLedger(events: PartnerEvent[]): ShopRecord[] {
  const shops = new Map<string, ShopRecord>();
  for (const event of events) {
    const list = LISTS[event.__typename];
    if (event.shop && list) {
      const record = shops.get(event.shop.id) ?? emptyRecord(event.shop);
      shops.set(record.id, record);
      record[list].push(event);
    }
  }
  return [...shops.values()];
}

function emptyRecord(shop: {
  id: string;
  myshopifyDomain: string;
}): ShopRecord {
  return {
    id: shop.id,
    domain: shop.myshopifyDomain,
    relationships: [],
    subscriptions: [],
    earnings: [],
    charges: [],
    credits: [],
  };
}

const upTo = (events: PartnerEvent[], at: number) =>
  events.filter((event) => Date.parse(event.occurredAt) <= at);

export function relationshipStateAt(
  shop: ShopRecord,
  at: number
): string | null {
  return upTo(shop.relationships, at).at(-1)?.relationshipState ?? null;
}

export function isInstalledAt(shop: ShopRecord, at: number): boolean {
  return INSTALLED_STATES.has(relationshipStateAt(shop, at) ?? "");
}

export function firstInstallAt(shop: ShopRecord): string | null {
  return (
    shop.relationships.find((event) => event.relationshipState === "INSTALLED")
      ?.occurredAt ?? null
  );
}

export function firstPaidAt(shop: ShopRecord): string | null {
  return (
    shop.earnings.find((event) => event.earningType === "CHARGE")?.occurredAt ??
    null
  );
}

// Replays subscription events up to `at`. A shop that uninstalled is not billed, whatever its
// last subscription event says.
export function subscriptionAt(
  shop: ShopRecord,
  at: number
): SubscriptionState {
  const state: SubscriptionState = {
    status: "none",
    plan: null,
    mrr: null,
    trialEndsAt: null,
    cancelEffectiveOn: null,
    changedAt: null,
  };
  // An uninstall ends the subscription; a reinstall starts with none until a new one is created.
  const lastUninstall = upTo(shop.relationships, at).findLast(
    (event) => event.relationshipState === "UNINSTALLED"
  );
  const events = upTo(shop.subscriptions, at).filter(
    (event) => !lastUninstall || event.occurredAt > lastUninstall.occurredAt
  );
  for (const event of events) {
    applySubscriptionEvent(state, event);
  }
  const last = events.at(-1)?.subscriptionState;
  if (last === undefined) {
    return lastUninstall && !isInstalledAt(shop, at)
      ? { ...state, status: "canceled" }
      : state;
  }
  if (last === "FROZEN") {
    return { ...state, status: "frozen" };
  }
  if (last === "CANCELED" || !isInstalledAt(shop, at)) {
    return { ...state, status: "canceled" };
  }
  const trialing =
    state.trialEndsAt !== null && at < Date.parse(state.trialEndsAt);
  if (trialing) {
    return { ...state, status: "trialing" };
  }
  return {
    ...state,
    status: "paying",
    mrr: state.plan ? monthlyPrice(state.plan) : null,
  };
}

function applySubscriptionEvent(
  state: SubscriptionState,
  event: PartnerEvent
): void {
  state.changedAt = event.occurredAt;
  state.cancelEffectiveOn =
    event.subscriptionState === "CANCELLATION_SCHEDULED"
      ? (event.cancelEffectiveOn ?? null)
      : null;
  if (
    event.plan &&
    (event.subscriptionState === "CREATED" ||
      event.subscriptionState === "UPDATED")
  ) {
    state.plan = event.plan;
  }
  if (event.subscriptionState === "CREATED") {
    const days = event.plan?.trialDays ?? 0;
    state.trialEndsAt =
      days > 0
        ? new Date(Date.parse(event.occurredAt) + days * DAY_MS).toISOString()
        : null;
  }
}

// Monthly recurring value of a flat-rate plan. Usage-only (tiered) plans have no fixed MRR.
function monthlyPrice(plan: Plan): Mrr | null {
  const flat = plan.prices.find((price) => price.amount !== undefined);
  if (!flat?.amount) {
    return null;
  }
  const units = toUnits(flat.amount);
  return {
    currency: flat.currencyCode,
    units: plan.billingPeriod === "ANNUAL" ? units / 12n : units,
  };
}
