import { describe, expect, it, vi } from "vitest";

import { createPartnerClient, PartnerApiError } from "../src/client.ts";
import type { ClientDeps } from "../src/client.ts";

const config = {
  endpoint: "https://partners.example/api/graphql.json",
  accessToken: "token",
};

function fakeDeps(responses: Response[]) {
  let clock = 0;
  const sleeps: number[] = [];
  const deps: ClientDeps = {
    fetch: vi.fn<typeof fetch>(() =>
      Promise.resolve(responses.shift() ?? new Response(null, { status: 500 }))
    ),
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
  };
  return { deps, sleeps };
}

const json = (body: unknown) => Response.json(body);

describe(createPartnerClient, () => {
  it("sends the access token and returns data", async () => {
    const { deps } = fakeDeps([json({ data: { app: { name: "Example" } } })]);
    const request = createPartnerClient(config, deps);

    await expect(request("query { app { name } }")).resolves.toStrictEqual({
      app: { name: "Example" },
    });
    const init = vi.mocked(deps.fetch).mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get("X-Shopify-Access-Token")).toBe(
      "token"
    );
  });

  it("spaces requests 250 ms apart", async () => {
    const { deps, sleeps } = fakeDeps([json({ data: {} }), json({ data: {} })]);
    const request = createPartnerClient(config, deps);

    await request("query { a }");
    await request("query { b }");
    expect(sleeps).toStrictEqual([250]);
  });

  it("retries after a 429 using Retry-After", async () => {
    const throttled = new Response(null, {
      status: 429,
      headers: { "Retry-After": "2" },
    });
    const { deps, sleeps } = fakeDeps([
      throttled,
      json({ data: { ok: true } }),
    ]);
    const request = createPartnerClient(config, deps);

    await expect(request("query { ok }")).resolves.toStrictEqual({ ok: true });
    expect(sleeps).toContain(2000);
  });

  it("raises GraphQL errors", async () => {
    const { deps } = fakeDeps([
      json({ errors: [{ message: "Access denied" }] }),
    ]);
    const request = createPartnerClient(config, deps);

    await expect(request("query { app }")).rejects.toThrow(
      new PartnerApiError("Access denied")
    );
  });
});
