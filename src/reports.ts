import { sumByCurrency } from "./money.ts";
import type { Totals } from "./money.ts";
import type { PartnerEvent, Transaction } from "./partner.ts";

export interface RevenueSummary {
  transactionCount: number;
  net: Totals;
  gross: Totals;
  shopifyFee: Totals;
  byType: Record<string, { count: number; net: Totals }>;
}

export function summarizeRevenue(transactions: Transaction[]): RevenueSummary {
  const groups = Map.groupBy(transactions, (transaction) => transaction.type);
  return {
    transactionCount: transactions.length,
    net: sumByCurrency(transactions.map((transaction) => transaction.net)),
    gross: sumByCurrency(transactions.map((transaction) => transaction.gross)),
    shopifyFee: sumByCurrency(
      transactions.map((transaction) => transaction.shopifyFee)
    ),
    byType: Object.fromEntries(
      [...groups].map(([type, rows]) => [
        type,
        { count: rows.length, net: sumByCurrency(rows.map((row) => row.net)) },
      ])
    ),
  };
}

const RELATIONSHIP_EVENTS = {
  RELATIONSHIP_INSTALLED: "installed",
  RELATIONSHIP_UNINSTALLED: "uninstalled",
  RELATIONSHIP_DEACTIVATED: "deactivated",
  RELATIONSHIP_REACTIVATED: "reactivated",
} as const;

export const RELATIONSHIP_EVENT_TYPES = Object.keys(RELATIONSHIP_EVENTS);

type RelationshipCounts = Record<
  (typeof RELATIONSHIP_EVENTS)[keyof typeof RELATIONSHIP_EVENTS],
  number
>;

export interface InstallSummary extends RelationshipCounts {
  subject: string;
  netInstalls: number;
}

export function summarizeInstalls(events: PartnerEvent[]): InstallSummary[] {
  const bySubject = Map.groupBy(
    events,
    (event) => event.subject?.name ?? "unknown"
  );
  return [...bySubject].map(([subject, rows]) => {
    const counts = countRelationshipEvents(rows);
    return {
      subject,
      ...counts,
      netInstalls: counts.installed - counts.uninstalled,
    };
  });
}

function countRelationshipEvents(events: PartnerEvent[]): RelationshipCounts {
  const counts: RelationshipCounts = {
    installed: 0,
    uninstalled: 0,
    deactivated: 0,
    reactivated: 0,
  };
  for (const event of events) {
    const key =
      RELATIONSHIP_EVENTS[event.eventType as keyof typeof RELATIONSHIP_EVENTS];
    if (key) {
      counts[key] += 1;
    }
  }
  return counts;
}

export type TimelineEntry =
  | { kind: "event"; at: string; event: PartnerEvent }
  | { kind: "transaction"; at: string; transaction: Transaction };

export function mergeTimeline(
  events: PartnerEvent[],
  transactions: Transaction[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...events.map((event) => ({
      kind: "event" as const,
      at: event.occurredAt,
      event,
    })),
    ...transactions.map((transaction) => ({
      kind: "transaction" as const,
      at: transaction.createdAt,
      transaction,
    })),
  ];
  return entries.toSorted((a, b) => b.at.localeCompare(a.at));
}
