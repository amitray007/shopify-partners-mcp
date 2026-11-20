# shopify-partners-mcp

A generic, open-source MCP server over the Shopify Partner API. Stdio transport. Node 24 and pnpm, pinned in `mise.toml`.

Check command: `mise exec -- pnpm check` (Ultracite lint, tsc, Knip, Vitest). CI runs the same command plus `pnpm build`.

## Invariants

- Read-only. No tool calls a mutation. `run_query` rejects any operation that is not a query (`src/read-only.ts`). Adding a write tool is a design decision, not a routine change.
- Every operation in `src/queries.ts` must pass Shopify's Partner API GraphQL validator for the default API version before it ships. Use the Shopify Dev MCP `validate` tool with `api: "partner"`.
- The Partner API takes two ID forms for the same object: `gid://partners/...` for `app` and `transactions`, `gid://shopify/...` for `events` and `activeSubscription`. Tools accept a bare number or either GID; `src/ids.ts` converts per call.
- Respect the limit of four requests per second per client. All traffic goes through `createPartnerClient`, which spaces requests and retries 429s.
- Keep the code generic: no company, app, or shop names in code, docs, or tests.

## Layout

- `src/client.ts`: HTTP, throttle, retry, GraphQL errors.
- `src/partner.ts`: typed data access, one function per root field.
- `src/reports.ts`: pure summaries over fetched rows.
- `src/tools.ts`: MCP tool registration only.
