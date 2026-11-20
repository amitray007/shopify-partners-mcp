import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  billingWatchlist,
  churnReport,
  retentionCohorts,
  trialFunnel,
} from "../analytics/customers.ts";
import { buildLedger } from "../analytics/ledger.ts";
import type { ShopRecord } from "../analytics/ledger.ts";
import { appOverview } from "../analytics/overview.ts";
import { planPerformance } from "../analytics/plans.ts";
import {
  customerLtv,
  earningsByMonth,
  mrrMovement,
} from "../analytics/revenue.ts";
import { DAY_MS, recentMonths } from "../analytics/time.ts";
import type { Range } from "../analytics/time.ts";
import { appIdInput, READ_ONLY, resolveAppId, respondWith } from "./shared.ts";
import type { ToolContext } from "./shared.ts";

const DEFAULT_RANGE_DAYS = 90;

const monthsInput = z
  .number()
  .int()
  .min(1)
  .max(60)
  .default(12)
  .describe("How many calendar months, ending with the current one");

const dateInput = (what: string) =>
  z
    .string()
    .optional()
    .describe(`${what}: YYYY-MM-DD (UTC) or an ISO 8601 date-time`);

const rangeInput = {
  from: dateInput(`Start. Defaults to ${DEFAULT_RANGE_DAYS} days ago`),
  to: dateInput("End. Defaults to now"),
};

const HISTORY_NOTE =
  "Computed from the app's full event history, which the server downloads once and caches for 15 minutes.";

interface Analysis {
  appId: string;
  shops: ShopRecord[];
  coverage: { from: string; complete: boolean; events: number };
}

export function registerAnalyticsTools(
  server: McpServer,
  context: ToolContext
): void {
  const { now } = context;

  const analyze = async (appId: string | undefined): Promise<Analysis> => {
    const resolved = resolveAppId(appId, context.appIds);
    const history = await context.loadHistory(resolved);
    return {
      appId: resolved,
      shops: buildLedger(history.events),
      coverage: {
        from: history.coverageStart,
        complete: history.complete,
        events: history.events.length,
      },
    };
  };

  const report = async <T>(
    appId: string | undefined,
    compute: (shops: ShopRecord[]) => T
  ) => {
    const { shops, ...meta } = await analyze(appId);
    return respondWith({ ...meta, ...compute(shops) });
  };

  server.registerTool(
    "app_overview",
    {
      description: `Start here. Where an app stands now (installed, paying, trialing, frozen, MRR, ARR) and what moved in the last 30 days. Without appId, compares every app in SHOPIFY_PARTNER_APP_IDS. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput }),
      annotations: READ_ONLY,
    },
    async ({ appId }) => {
      const ids =
        appId || context.appIds.length === 1
          ? [resolveAppId(appId, context.appIds)]
          : context.appIds;
      if (ids.length === 0) {
        throw new Error("Pass appId, or set SHOPIFY_PARTNER_APP_IDS");
      }
      const apps = [];
      for (const id of ids) {
        // Apps load one after another to stay inside the request rate limit.
        // oxlint-disable-next-line no-await-in-loop
        const { shops, ...meta } = await analyze(id);
        apps.push({ ...meta, ...appOverview(shops, now()) });
      }
      return respondWith({ apps });
    }
  );

  server.registerTool(
    "mrr_movement",
    {
      description: `Monthly recurring revenue per month with its movement: new, reactivation, expansion, contraction, and churn, in amounts and shop counts. MRR counts flat-rate subscription prices (annual plans divided by 12) of installed, non-frozen shops past their trial. Usage charges are not MRR; see earnings_by_month. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput, months: monthsInput }),
      annotations: READ_ONLY,
    },
    ({ appId, months }) =>
      report(appId, (shops) => ({
        months: mrrMovement(shops, recentMonths(now(), months), now()),
      }))
  );

  server.registerTool(
    "earnings_by_month",
    {
      description: `What you actually earned per month: net, gross, and Shopify fee per currency, split by earning event type (recurring, usage, one-time, refund, credit, adjustment), plus upcoming settlements by date. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput, months: monthsInput }),
      annotations: READ_ONLY,
    },
    ({ appId, months }) =>
      report(appId, (shops) =>
        earningsByMonth(shops, recentMonths(now(), months), now())
      )
  );

  server.registerTool(
    "retention_cohorts",
    {
      description: `Shops grouped by the month they first installed. For each cohort: the percent still installed and the percent paying at the end of each later month. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput, months: monthsInput }),
      annotations: READ_ONLY,
    },
    ({ appId, months }) =>
      report(appId, (shops) => ({
        cohorts: retentionCohorts(shops, recentMonths(now(), months), now()),
      }))
  );

  server.registerTool(
    "trial_funnel",
    {
      description: `For shops that first installed in the range: how many subscribed, started a trial, paid, and pay now, with conversion rates and median days from install to first payment. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput, ...rangeInput }),
      annotations: READ_ONLY,
    },
    ({ appId, from, to }) =>
      report(appId, (shops) =>
        trialFunnel(shops, parseRange(from, to, now()), now())
      )
  );

  server.registerTool(
    "churn_report",
    {
      description: `Uninstalls and subscription cancellations in the range: counts, uninstall reasons as Shopify reports them, scheduled cancellations, and each lost shop with its last plan and lifetime earnings, most valuable first. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput, ...rangeInput }),
      annotations: READ_ONLY,
    },
    ({ appId, from, to }) =>
      report(appId, (shops) =>
        churnReport(shops, parseRange(from, to, now()), now())
      )
  );

  server.registerTool(
    "plan_performance",
    {
      description: `Per plan handle: paying and trialing shops now, MRR now, and in the range new subscriptions, cancellations, and moves in and out of the plan. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput, ...rangeInput }),
      annotations: READ_ONLY,
    },
    ({ appId, from, to }) =>
      report(appId, (shops) => ({
        plans: planPerformance(shops, parseRange(from, to, now()), now()),
      }))
  );

  server.registerTool(
    "customer_ltv",
    {
      description: `Lifetime net earnings per paying shop: total, average, median, and top-ten share per currency, median paying days, and the ten highest-earning shops. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput }),
      annotations: READ_ONLY,
    },
    ({ appId }) => report(appId, (shops) => customerLtv(shops, now()))
  );

  server.registerTool(
    "billing_watchlist",
    {
      description: `Shops that need attention now: frozen subscriptions, scheduled cancellations, deactivated stores, and credits not applied in the last 90 days. Facts only, no predictions. ${HISTORY_NOTE}`,
      inputSchema: z.object({ appId: appIdInput }),
      annotations: READ_ONLY,
    },
    ({ appId }) => report(appId, (shops) => billingWatchlist(shops, now()))
  );
}

export function parseRange(
  from: string | undefined,
  to: string | undefined,
  now: number
): Range {
  const end = to ? parseDate(to, "end") : now;
  const start = from
    ? parseDate(from, "start")
    : end - DEFAULT_RANGE_DAYS * DAY_MS;
  if (start > end) {
    throw new Error("from must be before to");
  }
  return { from: start, to: end };
}

function parseDate(value: string, edge: "start" | "end"): number {
  const iso = /^\d{4}-\d{2}-\d{2}$/u.test(value)
    ? `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : value;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    throw new TypeError(`Not a date: ${value}`);
  }
  return at;
}
