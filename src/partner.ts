import type { PartnerRequest } from "./client.ts";
import { toGid, toOptionalGid } from "./ids.ts";
import type { Money } from "./money.ts";
import { toPage } from "./pages.ts";
import type { Connection, Page } from "./pages.ts";
import {
  ACTIVE_SUBSCRIPTION_QUERY,
  APP_QUERY,
  EVENTS_QUERY,
  TRANSACTIONS_QUERY,
} from "./queries.ts";

export const MAX_PAGE_SIZE = 100;

interface ShopRef {
  id: string;
  myshopifyDomain: string;
  name?: string;
}

export interface App {
  id: string;
  name: string;
  apiKey: string;
}

interface RawTransaction {
  __typename: string;
  id: string;
  createdAt: string;
  shop?: ShopRef | null;
  referredShop?: ShopRef;
  app?: { id: string; name: string };
  theme?: { name: string };
  chargeId?: string | null;
  grossAmount?: Money | null;
  netAmount?: Money;
  shopifyFee?: Money | null;
  amount?: Money;
  category?: string;
  taxType?: string;
  billingInterval?: string | null;
}

export interface Transaction {
  type: string;
  id: string;
  createdAt: string;
  shop: ShopRef | null;
  app: { id: string; name: string } | null;
  theme: string | null;
  chargeId: string | null;
  gross: Money | null;
  net: Money | null;
  shopifyFee: Money | null;
  detail: string | null;
}

export interface PartnerEvent {
  __typename: string;
  id: string;
  occurredAt: string;
  eventType: string;
  shop: ShopRef | null;
  subject: { __typename: string; id: string; name: string } | null;
  [field: string]: unknown;
}

export interface TransactionFilter {
  appId?: string;
  shopId?: string;
  myshopifyDomain?: string;
  createdAtMin?: string;
  createdAtMax?: string;
  types?: string[];
}

export interface EventFilter {
  appId?: string;
  shopId?: string;
  eventTypes?: string[];
  occurredAtMin?: string;
  occurredAtMax?: string;
}

export interface PageRequest {
  first?: number;
  after?: string;
}

export function createPartner(request: PartnerRequest) {
  return {
    async getApp(appId: string): Promise<App | null> {
      const data = await request<{ app: App | null }>(APP_QUERY, {
        id: toGid("App", appId, "partners"),
      });
      return data.app;
    },

    async listTransactions(
      filter: TransactionFilter,
      page: PageRequest
    ): Promise<Page<Transaction>> {
      const data = await request<{ transactions: Connection<RawTransaction> }>(
        TRANSACTIONS_QUERY,
        {
          ...filter,
          appId: toOptionalGid("App", filter.appId, "partners"),
          shopId: toOptionalGid("Shop", filter.shopId, "partners"),
          first: page.first ?? MAX_PAGE_SIZE,
          after: page.after,
        }
      );
      const result = toPage(data.transactions);
      return { ...result, items: result.items.map(normalizeTransaction) };
    },

    async listEvents(
      filter: EventFilter,
      page: PageRequest
    ): Promise<Page<PartnerEvent>> {
      const { appId, shopId, ...rest } = filter;
      const data = await request<{ events: Connection<PartnerEvent> }>(
        EVENTS_QUERY,
        {
          filter: {
            ...rest,
            subjectId: toOptionalGid("App", appId, "shopify"),
            shopId: toOptionalGid("Shop", shopId, "shopify"),
          },
          first: page.first ?? MAX_PAGE_SIZE,
          after: page.after,
        }
      );
      return toPage(data.events);
    },

    async getActiveSubscription(
      appId: string,
      shopId: string
    ): Promise<unknown> {
      const data = await request<{ activeSubscription: unknown }>(
        ACTIVE_SUBSCRIPTION_QUERY,
        {
          appId: toGid("App", appId, "shopify"),
          shopId: toGid("Shop", shopId, "shopify"),
        }
      );
      return data.activeSubscription;
    },
  };
}

export type Partner = ReturnType<typeof createPartner>;

function normalizeTransaction(raw: RawTransaction): Transaction {
  return {
    type: raw.__typename,
    id: raw.id,
    createdAt: raw.createdAt,
    shop: raw.shop ?? raw.referredShop ?? null,
    app: raw.app ?? null,
    theme: raw.theme?.name ?? null,
    chargeId: raw.chargeId ?? null,
    gross: raw.grossAmount ?? null,
    net: raw.netAmount ?? raw.amount ?? null,
    shopifyFee: raw.shopifyFee ?? null,
    detail: raw.category ?? raw.taxType ?? raw.billingInterval ?? null,
  };
}
