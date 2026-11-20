import { describe, expect, it } from "vitest";

import { parseRange } from "../src/tools/analytics.ts";

const NOW = Date.parse("2026-06-15T00:00:00Z");

describe(parseRange, () => {
  it("covers whole UTC days for plain dates", () => {
    expect(parseRange("2026-01-01", "2026-01-31", NOW)).toStrictEqual({
      from: Date.parse("2026-01-01T00:00:00.000Z"),
      to: Date.parse("2026-01-31T23:59:59.999Z"),
    });
  });

  it("defaults to the 90 days before now", () => {
    expect(parseRange(undefined, undefined, NOW)).toStrictEqual({
      from: Date.parse("2026-03-17T00:00:00Z"),
      to: NOW,
    });
  });

  it("rejects a reversed range", () => {
    expect(() => parseRange("2026-02-01", "2026-01-01", NOW)).toThrow(
      /before/u
    );
  });
});
