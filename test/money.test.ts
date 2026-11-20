import { describe, expect, it } from "vitest";

import { sumByCurrency } from "../src/money.ts";

describe(sumByCurrency, () => {
  it("adds decimal strings exactly, per currency", () => {
    const totals = sumByCurrency([
      { amount: "0.1", currencyCode: "USD" },
      { amount: "0.2", currencyCode: "USD" },
      { amount: "-1.005", currencyCode: "USD" },
      { amount: "12", currencyCode: "EUR" },
      null,
    ]);
    expect(totals).toStrictEqual({ USD: "-0.705", EUR: "12.00" });
  });
});
