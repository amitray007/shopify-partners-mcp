import { describe, expect, it, vi } from "vitest";

import { createHistoryLoader } from "../src/history.ts";
import type { EventFilter, Partner, PartnerEvent } from "../src/partner.ts";
import { earning } from "./fixture.ts";

const NOW = Date.parse("2026-06-15T00:00:00Z");

function fakePartner(events: PartnerEvent[]) {
  const listEvents = vi.fn<Partner["listEvents"]>((filter: EventFilter) => {
    const from = Date.parse(filter.occurredAtMin ?? "");
    const to = Date.parse(filter.occurredAtMax ?? "");
    const items = events
      .filter((event) => {
        const occurred = Date.parse(event.occurredAt);
        return occurred >= from && occurred <= to;
      })
      .toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    return Promise.resolve({ items, nextCursor: null });
  });
  return { listEvents };
}

describe(createHistoryLoader, () => {
  it("walks back a year at a time until a year is empty", async () => {
    const partner = fakePartner([
      earning("a", "2026-05-01", "1"),
      earning("a", "2025-03-01", "1"),
    ]);
    const history = await createHistoryLoader(partner, { now: () => NOW })("1");

    expect(partner.listEvents).toHaveBeenCalledTimes(3);
    expect(history.complete).toBeTruthy();
    expect(history.events.map((event) => event.occurredAt)).toStrictEqual([
      "2025-03-01T12:00:00Z",
      "2026-05-01T12:00:00Z",
    ]);
  });

  it("reuses the download for the same app in any ID form", async () => {
    const partner = fakePartner([]);
    const load = createHistoryLoader(partner, { now: () => NOW });

    await load("1");
    await load("gid://partners/App/1");
    expect(partner.listEvents).toHaveBeenCalledOnce();
  });
});
