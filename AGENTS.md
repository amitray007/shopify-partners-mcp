# shopify-partners-mcp

A generic, open-source MCP server over the Shopify Partner API. Stdio transport. Node 24 and pnpm, pinned in `mise.toml`.

Check command: `mise exec -- pnpm check` (Ultracite lint, tsc, Knip, Vitest). CI runs the same command plus `pnpm build` and `pnpm smoke`. Update `EXPECTED_TOOLS` in `scripts/smoke.ts` when you add or remove a tool.

Commits and PR titles are Conventional Commits (`feat:`, `fix:`, `chore:`). Pull requests are squash-merged with the title as the commit, and release-please builds releases from them. Never publish to npm by hand; see `docs/releasing.md`.

## Invariants

- Read-only. No tool calls a mutation. `run_query` rejects any operation that is not a query (`src/read-only.ts`). Adding a write tool is a design decision, not a routine change.
- Every operation in `src/queries.ts` must pass Shopify's Partner API GraphQL validator for the default API version before it ships. Use the Shopify Dev MCP `validate` tool with `api: "partner"`.
- The Partner API takes two ID forms for the same object: `gid://partners/...` for `app` and `transactions`, `gid://shopify/...` for `events` and `activeSubscription`. Tools accept a bare number or either GID; `src/ids.ts` converts per call.
- Respect the limit of four requests per second per client. All traffic goes through `createPartnerClient`, which spaces requests and retries 429s.
- Keep the code generic: no company, app, or shop names in code, docs, or tests.

## Layout

- `src/client.ts`: HTTP, throttle, retry, GraphQL errors.
- `src/partner.ts`: typed data access, one function per root field.
- `src/history.ts`: downloads and caches an app's full event timeline, a year per step.
- `src/analytics/`: pure functions over that timeline. `ledger.ts` groups it per shop and replays subscription state; every report builds on it.
- `src/reports.ts`: pure summaries over one page range of rows (raw summary tools).
- `src/tools/`: MCP tool registration only. `src/instructions.ts` is what clients read on connect.

Analytics tests use the hand-built app in `test/fixture.ts`. Its expected numbers are worked out by hand in the comment above it; keep them independent of the code under test.
