import { toGid } from "./ids.ts";
import { collectPages } from "./pages.ts";
import { MAX_EVENT_PAGE_SIZE } from "./partner.ts";
import type { Partner, PartnerEvent } from "./partner.ts";

const DAY_MS = 86_400_000;
// The events query rejects ranges over 365 days; 364 leaves room for boundary rounding.
const WINDOW_MS = 364 * DAY_MS;

interface AppHistory {
  appId: string;
  // Oldest first.
  events: PartnerEvent[];
  coverageStart: string;
  loadedAt: string;
  // False when the walk stopped at maxYears or a page cap before reaching an empty year.
  complete: boolean;
}

export interface HistoryOptions {
  now: () => number;
  ttlMs: number;
  maxYears: number;
  maxPagesPerWindow: number;
}

const defaultOptions: HistoryOptions = {
  now: Date.now,
  ttlMs: 15 * 60_000,
  maxYears: 10,
  maxPagesPerWindow: 400,
};

export type LoadHistory = (appId: string) => Promise<AppHistory>;

// Loads an app's whole event timeline by walking back one year at a time until a year has no
// events, and caches it so several analytics calls in one session share a single download.
export function createHistoryLoader(
  partner: Pick<Partner, "listEvents">,
  options: Partial<HistoryOptions> = {}
): LoadHistory {
  const settings = { ...defaultOptions, ...options };
  const cache = new Map<
    string,
    { expires: number; history: Promise<AppHistory> }
  >();

  const loadWindow = (appId: string, start: number, end: number) =>
    collectPages(
      (after) =>
        partner.listEvents(
          {
            appId,
            occurredAtMin: new Date(start).toISOString(),
            occurredAtMax: new Date(end).toISOString(),
          },
          { first: MAX_EVENT_PAGE_SIZE, after }
        ),
      settings.maxPagesPerWindow
    );

  async function walkBack(appId: string): Promise<AppHistory> {
    const loadedAt = settings.now();
    const windows: PartnerEvent[][] = [];
    let end = loadedAt;
    let complete = false;
    for (let year = 0; year < settings.maxYears; year += 1) {
      const start = end - WINDOW_MS;
      // Each window starts where the previous one ended.
      // oxlint-disable-next-line no-await-in-loop
      const window = await loadWindow(appId, start, end);
      if (window.items.length === 0) {
        complete = true;
        break;
      }
      windows.push(window.items);
      if (window.truncated) {
        // Events arrive newest first, so the last one fetched marks where coverage stops.
        end = Date.parse(window.items.at(-1)?.occurredAt ?? "") || start;
        break;
      }
      end = start;
    }
    return {
      appId,
      events: windows
        .flat()
        .toSorted((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
      coverageStart: new Date(end).toISOString(),
      loadedAt: new Date(loadedAt).toISOString(),
      complete,
    };
  }

  return (appId) => {
    const key = toGid("App", appId, "shopify");
    const cached = cache.get(key);
    if (cached && cached.expires > settings.now()) {
      return cached.history;
    }
    const history = walkBack(key);
    cache.set(key, { expires: settings.now() + settings.ttlMs, history });
    history.catch(() => cache.delete(key));
    return history;
  };
}
