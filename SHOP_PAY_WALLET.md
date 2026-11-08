# Shop Pay checkout experiment

Shopify Wallet account: Pretty Serious Brands, Shop ID 79302197414.
Shop Pay Client ID: 2c05e8f9-a1dc-4456-a735-4868741d8c61.
All three brands use this account; source identifiers and local order records
are scoped by brand, so an order cannot be imported into another brand.

## Deployment configuration

Set these server-only variables in each Vercel project. Never put API tokens
in Git, public-prefixed environment variables, or client JavaScript.

| Variable | Value |
| --- | --- |
| SHOP_PAY_STORE_DOMAIN | pretty-serious-brands.myshopify.com |
| SHOP_PAY_ADMIN_TOKEN | Admin API credential from Shop → Integrate Shop Pay |
| SHOP_PAY_STOREFRONT_TOKEN | Storefront API credential from the same page |
| SHOP_PAY_WALLET_ENABLED | true enables the 50/50 experiment; false stops new enrollment |
| CRON_SECRET | Existing project cron secret |
| SHOP_PAY_TEST_MODE | true only while Shopify Payments itself is in test mode |
| SHOP_PAY_WEBHOOK_SECRET | Optional: signing secret if webhook subscriptions are configured |

Keep existing SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET credentials unchanged;
these Wallet credentials belong to a separate API integration.

Shopify allowed origins were verified in the account: www.smellsiconic.com,
www.veilpuff.com, www.aneseskin.com, and www.anese.co. Add any additional
preview or production origin before testing the SDK there.

## Experiment

- Stable, server-assigned 50/50 cohorts per visitor: control vs shop_pay.
- Control sees current payment methods. Treatment adds Shopify's official button.
- Enrollment occurs at checkout. All processors' confirmed purchases, revenue,
  and mobile/desktop counts appear in the existing `/admin/tests` report.
- The button stays hidden if credentials, storage, or enrollment fail.
- No automatic winner selection. Compare purchase rate per exposed checkout
  visitor and revenue per visitor after an adequate sample; inspect device mix.

## Payment and order lifecycle

Server validates product IDs, quantities, catalog prices, gifts, current discount
codes and shipping. It never accepts client-supplied product prices or totals.
Shop Pay receives the same cart and shipping price as regular checkout.
This implementation retains the checkout's existing tax behavior (no additional
tax is calculated); it does not introduce a separate tax engine.

The Storefront API creates a session, then explicitly submits the final payment
with an idempotency key. An ambiguous timeout retains that key. Payment failure
does not become a success. The Admin receipt API must report a completed,
paid order with matching USD amount before local fulfillment or success UI.

Recovery index is persisted before submission. Browser polling and the
five-minute cron recover lost client callbacks. A per-order lock and ledger
check prevent duplicate records. Test orders never enter the live ledger,
send emails, or produce real Purchase events.

The optional signed webhook endpoint is `/api/shop-pay/wallet-webhook`.
Register ORDERS_CREATE and ORDER_TRANSACTIONS_CREATE if using webhooks.
Cross-brand or unknown source identifiers are ignored. Receipt queries remain
authoritative even when a webhook arrives. Browser polling and the cron do
not depend on webhook setup or delivery.

Admin refunds use the captured Shopify transaction as their parent. Saving
tracking syncs the fulfillment to Shopify/Shop; failures are returned to admin
so tracking can be retried. No shipment or refund is created merely by deployment.

## Verification and launch

Run `node --experimental-vm-modules tests/shop-pay-wallet.mjs` and
`npm run build -- --no-lint`.

Tests use mocked Shopify/Redis and cover pricing tampering, invalid products
and quantities, expired authorization, US shipping validation, Storefront
input mapping, ambiguous submission timeout recovery, idempotency, verified
payment gating, duplicate reconciliation and stable 50/50 cohorts.

Before activation: securely configure credentials; verify the admin-only
`/api/admin/shop-pay-status`; exercise session creation against Shopify;
confirm an SDK button renders at an allowed origin; exercise successful and
declined payments in Shopify Payments test mode; confirm receipt reconciliation,
admin order, refund and tracking behavior. Do not claim these live checks have
passed based solely on unit tests or build success.

At account inspection, Shopify showed accepting payments but no payout bank
account. The owner is completing bank setup separately. No bank details or
payment account settings are changed by this code.

Rollback: set SHOP_PAY_WALLET_ENABLED=false and redeploy. Existing submitted
sessions continue to reconcile through the cron so paid orders are not lost.
