import { describe, expect, it } from "vitest";

import { toGid } from "../src/ids.ts";

describe(toGid, () => {
  it("builds a GID from a bare number", () => {
    expect(toGid("App", "1234", "partners")).toBe("gid://partners/App/1234");
  });

  it("converts between the partners and shopify namespaces", () => {
    expect(toGid("Shop", "gid://partners/Shop/77", "shopify")).toBe(
      "gid://shopify/Shop/77"
    );
  });

  it("rejects a GID of the wrong kind", () => {
    expect(() => toGid("App", "gid://shopify/Shop/77", "partners")).toThrow(
      /App ID/u
    );
  });
});
