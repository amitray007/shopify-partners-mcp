# shopify-partners-mcp

An MCP server for the [Shopify Partner API](https://shopify.dev/docs/api/partner). It lets an AI client read your apps, earnings, install and billing events, and subscriptions. It is read-only: no tool changes anything in your Partner account.

## Tools

| Tool | What it returns |
| --- | --- |
| `list_apps` | The apps you list in `SHOPIFY_PARTNER_APP_IDS` (the API cannot list all apps) |
| `get_app` | One app's name and API key |
| `list_transactions` | Earnings: app, theme, service, referral, and tax transactions |
| `list_events` | The event timeline: installs, uninstalls, subscription changes, charges, earnings, credits |
| `get_active_subscription` | A shop's active subscription, for apps on Shopify managed pricing |
| `revenue_summary` | Net, gross, and Shopify fees per currency, split by transaction type |
| `install_summary` | Installs, uninstalls, deactivations, and reactivations per app |
| `shop_history` | One shop's events and transactions in one timeline |
| `run_query` | Any read-only GraphQL query, for what the other tools miss |

List tools return one page and a `nextCursor`. Summary tools read up to 2,000 rows and set `truncated` when there were more.

## Setup

1. In the Dev Dashboard, open **Organization settings > Users > Security > Partner API clients** and add a client. Give it **View financials** and **Manage apps**. Copy the token; it is shown once.
2. Find your Partner ID: the number in your Partner Dashboard URL. The Dev Dashboard organization ID is a different number and does not work here.
3. Add the server to your MCP client:

```json
{
  "mcpServers": {
    "shopify-partners": {
      "command": "npx",
      "args": ["-y", "shopify-partners-mcp"],
      "env": {
        "SHOPIFY_PARTNER_ID": "1234567",
        "SHOPIFY_PARTNER_ACCESS_TOKEN": "prtapi_...",
        "SHOPIFY_PARTNER_APP_IDS": "1234,5678"
      }
    }
  }
}
```

The package is not on npm yet. Until it is, build from source and point `command` at `node /path/to/shopify-partners-mcp/dist/index.js`.

| Variable | Required | Notes |
| --- | --- | --- |
| `SHOPIFY_PARTNER_ID` | Yes | Partner Dashboard number |
| `SHOPIFY_PARTNER_ACCESS_TOKEN` | Yes | Partner API client token |
| `SHOPIFY_PARTNER_APP_IDS` | No | Comma-separated app IDs for `list_apps` |
| `SHOPIFY_PARTNER_API_VERSION` | No | Defaults to `2026-07` |

IDs can be bare numbers or GIDs. The server converts them, because the API wants `gid://partners/...` for some fields and `gid://shopify/...` for others.

## Limits

- Shopify allows four requests per second per API client. The server spaces requests and retries when Shopify returns 429.
- The event timeline covers at most 365 days per request and defaults to the last 30 days.
- Shopify says transaction data is for analytics, not accounting.

## Development

```sh
mise install
pnpm install
pnpm check   # lint, types, unused code, tests
pnpm build
```

## License

MIT
