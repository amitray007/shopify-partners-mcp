// Every operation here is checked against the Partner API schema (2026-07) with Shopify's
// GraphQL validator. Aliases avoid GraphQL field-merge conflicts between union members.

const MONEY = "{ amount currencyCode }";
const SHOP_FIELDS = "{ id myshopifyDomain name }";
const SHOP = `shop ${SHOP_FIELDS}`;
const SALE = `${SHOP} grossAmount ${MONEY} netAmount ${MONEY} shopifyFee ${MONEY}`;
const APP_SALE = `${SALE} app { id name } chargeId`;

export const APP_QUERY = `query App($id: ID!) {
  app(id: $id) { id name apiKey }
}`;

export const TRANSACTIONS_QUERY = `query Transactions(
  $appId: ID, $shopId: ID, $myshopifyDomain: String,
  $createdAtMin: DateTime, $createdAtMax: DateTime,
  $types: [TransactionType!], $first: Int, $after: String
) {
  transactions(
    appId: $appId, shopId: $shopId, myshopifyDomain: $myshopifyDomain,
    createdAtMin: $createdAtMin, createdAtMax: $createdAtMax,
    types: $types, first: $first, after: $after
  ) {
    pageInfo { hasNextPage }
    edges {
      cursor
      node {
        __typename id createdAt
        ... on AppSubscriptionSale { ${APP_SALE} billingInterval }
        ... on AppUsageSale { ${APP_SALE} }
        ... on AppOneTimeSale { ${APP_SALE} }
        ... on AppSaleAdjustment { ${APP_SALE} }
        ... on AppSaleCredit { ${APP_SALE} }
        ... on ThemeSale { ${SALE} theme { name } }
        ... on ThemeSaleAdjustment { ${SALE} theme { name } }
        ... on ServiceSale { ${SALE} }
        ... on ServiceSaleAdjustment { ${SALE} }
        ... on ReferralTransaction { referredShop: shop ${SHOP_FIELDS} amount ${MONEY} category }
        ... on ReferralAdjustment { ${SHOP} amount ${MONEY} category }
        ... on TaxTransaction { amount ${MONEY} taxType }
        ... on LegacyTransaction { ${SHOP} amount ${MONEY} }
      }
    }
  }
}`;

export const EVENTS_QUERY = `query Events($filter: EventFilterInput, $first: Int, $after: String) {
  events(filter: $filter, orderBy: OCCURRED_AT_DESC, first: $first, after: $after) {
    pageInfo { hasNextPage }
    edges {
      cursor
      node {
        __typename id occurredAt eventType
        shop { id myshopifyDomain }
        subject {
          __typename
          ... on AppReference { id name }
          ... on ThemeReference { id name }
        }
        ... on Relationship { relationshipState: state reason reasonDescription }
        ... on SubscriptionStatus {
          subscriptionState: state cancelEffectiveOn
          plan {
            handle billingPeriod trialDays
            prices { __typename currencyCode ... on FlatRatePlanPrice { amount } }
          }
        }
        ... on Charge { chargeId chargeType amount ${MONEY} usageQuantity planHandle description }
        ... on Earning {
          earningType earningChargeId: chargeId settlementDate description
          grossAmount ${MONEY} netAmount ${MONEY} shopifyFee ${MONEY}
        }
        ... on Credit { money ${MONEY} status description }
      }
    }
  }
}`;

export const ACTIVE_SUBSCRIPTION_QUERY = `query ActiveSubscription($appId: ID!, $shopId: ID!) {
  activeSubscription(appId: $appId, shopId: $shopId) {
    shop { id myshopifyDomain }
    billingPeriod cancelAtEndOfCycle trialEndsAt
    currentBillingCycle { startTime endTime }
    items {
      handle description
      price {
        __typename active currency
        ... on FlatRatePrice { amount }
        ... on TieredPrice { tiersMode tiers { upTo amountPerUnit amount } }
      }
      discount { amount percentage remainingDiscountCycles discountEndsAt }
      usage { quantity cost ${MONEY} }
    }
    pendingUpdate { billingPeriod items { handle } }
  }
}`;
