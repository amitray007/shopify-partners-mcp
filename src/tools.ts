import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { PartnerRequest } from "./client.ts";
import { collectPages } from "./pages.ts";
import { MAX_PAGE_SIZE } from "./partner.ts";
import type { Partner } from "./partner.ts";
import { assertReadOnlyQuery } from "./read-only.ts";
import {
  mergeTimeline,
  RELATIONSHIP_EVENT_TYPES,
  summarizeInstalls,
  summarizeRevenue,
} from "./reports.ts";

// 20 pages of 100 rows take about five seconds at the Partner API's four requests per second.
const MAX_REPORT_PAGES = 20;

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

const id = (what: string) =>
  z.string().describe(`${what} ID: the number or a gid:// ID`);
const dateTime = (what: string) =>
  z.iso.datetime({ offset: true }).describe(what);
const page = {
  first: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .optional()
    .describe("Page size, default 100"),
  after: z.string().optional().describe("nextCursor from the previous page"),
};

const transactionFilter = {
  appId: id("App").optional(),
  shopId: id("Shop").optional(),
  myshopifyDomain: z
    .string()
    .optional()
    .describe("For example example.myshopify.com"),
  createdAtMin: dateTime("Earliest creation time, ISO 8601").optional(),
  createdAtMax: dateTime("Latest creation time, ISO 8601").optional(),
  types: z
    .array(z.string())
    .optional()
    .describe("TransactionType values, e.g. APP_SUBSCRIPTION_SALE"),
};

const eventWindow = {
  occurredAtMin: dateTime(
    "Start of the window. Defaults to 30 days before the end"
  ).optional(),
  occurredAtMax: dateTime(
    "End of the window. Defaults to now; the window is at most 365 days"
  ).optional(),
};

interface ToolContext {
  partner: Partner;
  request: PartnerRequest;
  appIds: string[];
}

export function registerTools(
  server: McpServer,
  { partner, request, appIds }: ToolContext
): void {
  server.registerTool(
    "list_apps",
    {
      description:
        "List the apps named in SHOPIFY_PARTNER_APP_IDS. The Partner API has no query that lists every app.",
      annotations: READ_ONLY,
    },
    () => respond(Promise.all(appIds.map((appId) => partner.getApp(appId))))
  );

  server.registerTool(
    "get_app",
    {
      description: "Get an app's name and API key.",
      inputSchema: z.object({ appId: id("App") }),
      annotations: READ_ONLY,
    },
    ({ appId }) => respond(partner.getApp(appId))
  );

  server.registerTool(
    "list_transactions",
    {
      description:
        "List earnings transactions (app, theme, service, referral, tax), newest first, one page at a time. Needs the View financials permission.",
      inputSchema: z.object({ ...transactionFilter, ...page }),
      annotations: READ_ONLY,
    },
    ({ first, after, ...filter }) =>
      respond(partner.listTransactions(filter, { first, after }))
  );

  server.registerTool(
    "list_events",
    {
      description:
        "List the historical event timeline: installs, uninstalls, subscription changes, charges, earnings, and credits. Needs the Manage apps permission.",
      inputSchema: z.object({
        appId: id("App").optional(),
        shopId: id("Shop").optional(),
        eventTypes: z
          .array(z.string())
          .optional()
          .describe("EventType values, e.g. RELATIONSHIP_UNINSTALLED"),
        ...eventWindow,
        ...page,
      }),
      annotations: READ_ONLY,
    },
    ({ first, after, ...filter }) =>
      respond(partner.listEvents(filter, { first, after }))
  );

  server.registerTool(
    "get_active_subscription",
    {
      description:
        "Get a shop's active subscription for an app that uses Shopify managed pricing.",
      inputSchema: z.object({ appId: id("App"), shopId: id("Shop") }),
      annotations: READ_ONLY,
    },
    ({ appId, shopId }) => respond(partner.getActiveSubscription(appId, shopId))
  );

  server.registerTool(
    "revenue_summary",
    {
      description:
        "Total net, gross, and Shopify fees per currency, split by transaction type, for a time range. Reads up to 2,000 transactions.",
      inputSchema: z.object(transactionFilter),
      annotations: READ_ONLY,
    },
    async (filter) => {
      const { items, truncated } = await collectPages(
        (after) => partner.listTransactions(filter, { after }),
        MAX_REPORT_PAGES
      );
      return respondWith({ ...summarizeRevenue(items), truncated });
    }
  );

  server.registerTool(
    "install_summary",
    {
      description:
        "Count installs, uninstalls, deactivations, and reactivations per app for a time range.",
      inputSchema: z.object({ appId: id("App").optional(), ...eventWindow }),
      annotations: READ_ONLY,
    },
    async (filter) => {
      const { items, truncated } = await collectPages(
        (after) =>
          partner.listEvents(
            { ...filter, eventTypes: RELATIONSHIP_EVENT_TYPES },
            { after }
          ),
        MAX_REPORT_PAGES
      );
      return respondWith({ apps: summarizeInstalls(items), truncated });
    }
  );

  server.registerTool(
    "shop_history",
    {
      description:
        "Everything about one shop, newest first: install and billing events plus earnings transactions. Useful for support questions.",
      inputSchema: z.object({
        shopId: id("Shop"),
        appId: id("App").optional(),
        ...eventWindow,
      }),
      annotations: READ_ONLY,
    },
    async ({ shopId, appId, occurredAtMin, occurredAtMax }) => {
      const [events, transactions] = await Promise.all([
        collectPages(
          (after) =>
            partner.listEvents(
              { shopId, appId, occurredAtMin, occurredAtMax },
              { after }
            ),
          MAX_REPORT_PAGES
        ),
        collectPages(
          (after) =>
            partner.listTransactions(
              {
                shopId,
                appId,
                createdAtMin: occurredAtMin,
                createdAtMax: occurredAtMax,
              },
              { after }
            ),
          MAX_REPORT_PAGES
        ),
      ]);
      return respondWith({
        timeline: mergeTimeline(events.items, transactions.items),
        truncated: events.truncated || transactions.truncated,
      });
    }
  );

  server.registerTool(
    "run_query",
    {
      description:
        "Run a read-only GraphQL query against the Partner API for anything the other tools miss. Mutations are rejected.",
      inputSchema: z.object({
        query: z.string().describe("A GraphQL query document"),
        variables: z.record(z.string(), z.unknown()).optional(),
      }),
      annotations: READ_ONLY,
    },
    ({ query, variables }) => {
      assertReadOnlyQuery(query);
      return respond(request(query, variables));
    }
  );
}

async function respond(result: Promise<unknown>) {
  return respondWith(await result);
}

function respondWith(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}
