import { addUnits, formatTotals } from "../money.ts";
import type { UnitTotals } from "../money.ts";
import { subscriptionAt } from "./ledger.ts";
import type { ShopRecord } from "./ledger.ts";
import { inRange } from "./time.ts";
import type { Range } from "./time.ts";

interface PlanStats {
  payingNow: number;
  trialingNow: number;
  mrrNow: UnitTotals;
  newSubscriptions: number;
  canceled: number;
  movedIn: number;
  movedOut: number;
}

const NO_PLAN = "(no plan handle)";

export function planPerformance(
  shops: ShopRecord[],
  range: Range,
  now: number
) {
  const plans = new Map<string, PlanStats>();
  const stats = (handle: string | null | undefined) => {
    const key = handle ?? NO_PLAN;
    const existing = plans.get(key) ?? emptyStats();
    plans.set(key, existing);
    return existing;
  };
  for (const shop of shops) {
    countCurrent(shop, now, stats);
    countChanges(shop, range, stats);
  }
  return Object.fromEntries(
    [...plans].map(([handle, plan]) => [
      handle,
      { ...plan, mrrNow: formatTotals(plan.mrrNow) },
    ])
  );
}

function emptyStats(): PlanStats {
  return {
    payingNow: 0,
    trialingNow: 0,
    mrrNow: new Map(),
    newSubscriptions: 0,
    canceled: 0,
    movedIn: 0,
    movedOut: 0,
  };
}

function countCurrent(
  shop: ShopRecord,
  now: number,
  stats: (handle: string | null | undefined) => PlanStats
): void {
  const state = subscriptionAt(shop, now);
  if (state.status === "paying") {
    const plan = stats(state.plan?.handle);
    plan.payingNow += 1;
    if (state.mrr) {
      addUnits(plan.mrrNow, state.mrr.currency, state.mrr.units);
    }
  } else if (state.status === "trialing") {
    stats(state.plan?.handle).trialingNow += 1;
  }
}

// Walks the shop's subscription events in order, so each change knows the plan before it.
function countChanges(
  shop: ShopRecord,
  range: Range,
  stats: (handle: string | null | undefined) => PlanStats
): void {
  let current: string | null = null;
  for (const event of shop.subscriptions) {
    const handle: string | null = event.plan?.handle ?? current;
    if (inRange(event.occurredAt, range)) {
      if (event.subscriptionState === "CREATED") {
        stats(handle).newSubscriptions += 1;
      } else if (event.subscriptionState === "CANCELED") {
        stats(current).canceled += 1;
      } else if (event.subscriptionState === "UPDATED" && handle !== current) {
        stats(current).movedOut += 1;
        stats(handle).movedIn += 1;
      }
    }
    if (
      event.subscriptionState === "CREATED" ||
      event.subscriptionState === "UPDATED"
    ) {
      current = handle;
    }
  }
}
