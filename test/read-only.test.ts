import { describe, expect, it } from "vitest";

import { assertReadOnlyQuery } from "../src/read-only.ts";

describe(assertReadOnlyQuery, () => {
  it("accepts a query", () => {
    expect(() =>
      assertReadOnlyQuery("query { app(id: 1) { name } }")
    ).not.toThrow();
  });

  it("rejects a mutation", () => {
    expect(() =>
      assertReadOnlyQuery("mutation { appSubscriptionCancel { id } }")
    ).toThrow(/mutation/u);
  });

  it("rejects a mutation hidden next to a query", () => {
    const document =
      "query A { app(id: 1) { name } } mutation B { appSubscriptionCancel { id } }";
    expect(() => assertReadOnlyQuery(document)).toThrow(/mutation/u);
  });

  it("rejects a subscription", () => {
    expect(() => assertReadOnlyQuery("subscription { events { id } }")).toThrow(
      /subscription/u
    );
  });
});
