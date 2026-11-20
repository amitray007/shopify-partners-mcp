// Sent to MCP clients on connect, so agents learn the data model without exploring the API.
export const INSTRUCTIONS = `Read-only access to one Shopify Partner organization.

Start with app_overview. For a question about one shop, use shop_history with its myshopify.com domain.

Analytics tools (app_overview, mrr_movement, earnings_by_month, retention_cohorts, trial_funnel, churn_report, plan_performance, customer_ltv, billing_watchlist) work from the app's full event history. The first call for an app downloads it, at four requests per second, and later calls reuse it for 15 minutes. Each result has a coverage block: when complete is false, the oldest data is missing and early months undercount.

Definitions:
- Paying: installed, subscription not canceled or frozen, past its trial.
- MRR: the flat-rate plan price of each paying shop, annual plans divided by 12. Usage charges are not MRR; earnings_by_month shows them.
- Earnings: what Shopify pays you after its fee (net). Shopify calls this data analytics-grade, not accounting-grade.
- Amounts are decimal strings per currency code, never converted.

IDs: tools accept a bare number or either GID form (gid://partners/... or gid://shopify/...) and convert as the API needs.

Raw tools (list_events, list_transactions, get_active_subscription, run_query) return one page and a nextCursor. run_query rejects mutations.`;
