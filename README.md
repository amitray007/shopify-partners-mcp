# shopify-partners-mcp

An MCP server for the [Shopify Partner API](https://shopify.dev/docs/api/partner). It lets an AI client read your apps, earnings, install and billing events, and subscriptions. It is read-only: no tool changes anything in your Partner account.

## Tools

### Analytics

These tools answer business questions directly. The first call for an app downloads its full event history (one year per step, until a year has no events). Later calls reuse it for 15 minutes. Every result has a `coverage` block that says how far back the data goes.

| Tool | What it answers |
| --- | --- |
| `app_overview` | Where an app stands now (installed, paying, trialing, frozen, MRR, ARR) and the last 30 days. Without `appId`, compares all configured apps |
| `mrr_movement` | MRR per month, split into new, reactivation, expansion, contraction, and churn |
| `earnings_by_month` | Net, gross, and Shopify fee per month by earning type, plus upcoming settlements |
| `retention_cohorts` | Percent of each install-month cohort still installed and still paying, month by month |
| `trial_funnel` | Installs, then subscriptions, then trials, then first payment, with conversion rates |
| `churn_report` | Uninstalls and cancellations with Shopify's uninstall reasons, scheduled cancellations, and the most valuable shops lost |
| `plan_performance` | Per plan: paying and trialing shops, MRR, new subscriptions, cancellations, and moves between plans |
| `customer_ltv` | Lifetime net earnings per paying shop, top-ten share, and the highest-earning shops |
| `billing_watchlist` | Frozen subscriptions, scheduled cancellations, deactivated stores, and credits not applied |

Definitions:

- Paying: installed, subscription not canceled or frozen, and past its trial.
- MRR: the flat-rate plan price of each paying shop. Annual plans count as one twelfth. Usage charges are not MRR; `earnings_by_month` shows them.
- Amounts stay in their own currency. The server never converts them.

### Raw data

| Tool | What it returns |
| --- | --- |
| `list_apps` | The apps you list in `SHOPIFY_PARTNER_APP_IDS` (the API cannot list all apps) |
| `get_app` | One app's name and API key |
| `list_transactions` | Earnings: app, theme, service, referral, and tax transactions |
| `list_events` | The event timeline: installs, uninstalls, subscription changes, charges, earnings, credits |
| `get_active_subscription` | A shop's active subscription, for apps on Shopify managed pricing |
| `revenue_summary` | Net, gross, and Shopify fees per currency, split by transaction type |
| `install_summary` | Installs, uninstalls, deactivations, and reactivations per app |
| `shop_history` | One shop's events and transactions in one timeline, by shop ID or myshopify.com domain |
| `run_query` | Any read-only GraphQL query, for what the other tools miss |

List tools return one page and a `nextCursor`. Summary tools read up to 2,000 rows and set `truncated` when there were more. When `SHOPIFY_PARTNER_APP_IDS` names one app, `appId` is optional everywhere.

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
- The event timeline covers at most 365 days per request and defaults to the last 30 days. The analytics tools step through it a year at a time for you.
- Filtering events by shop needs an app ID. `shop_history` fills it in from your config.
- Shopify may not have turned on the event timeline for every organization. If it is off, the analytics tools return Shopify's error.
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
