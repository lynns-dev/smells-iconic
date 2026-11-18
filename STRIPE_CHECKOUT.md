# Gated Stripe-only hosted checkout

This integration preserves existing payment methods and checkout totals. It is disabled until BOTH flags are deliberately enabled after configuration and testing.

## Required configuration
- STRIPE_SECRET_KEY: existing merchant account's server-only Stripe key.
- STRIPE_WEBHOOK_SECRET: signing secret for this site's `/api/stripe/webhook` endpoint.
- STRIPE_CHECKOUT_ORIGIN: exact canonical HTTPS origin, e.g. `https://www.smellsiconic.com` (no path).
- STRIPE_CHECKOUT_ENABLED=true: server gate.
- NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=true: build-time button gate (requires rebuild).
- Existing KV_REST_API_URL / KV_REST_API_TOKEN.

Subscribe the endpoint to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. For a shared Stripe account each store needs its own webhook endpoint, signing secret, and canonical origin. Card payment supports eligible Stripe-hosted wallets subject to merchant/domain configuration; no Apple Pay availability is claimed without testing. No publishable key is needed for hosted checkout.

The button is on `/checkout`; existing legacy `/checkout-qb` and separate offer-page payment paths are not replaced. Keep all existing processor configurations until Stripe is verified.

## Verification before enabling
1. In Stripe test mode, use a separate test deployment and test webhook signing secret. Never combine a live key with test-mode expectations.
2. Run `node --experimental-vm-modules tests/stripe-checkout.mjs` and `npm run build`.
3. Confirm discount, shipping, address, protection if applicable, cancel/resume and successful payment paths with test-only details.
4. Confirm exactly one admin paid order, confirmation email and deduplicated Meta Purchase for test-mode fixtures in a non-production test store. Replay webhook and confirm no extra order.
5. Confirm signed webhook retries when ledger storage is unavailable. Disable flags if any verification fails.

No live purchase has been made by this implementation task. Existing fulfillment can suppress errors, so the Stripe handler explicitly reads the paid order back before acknowledging fulfillment. Atomic per-payment lock and a 180-day completion marker suppress duplicate webhook/return processing. Pending order details persist 30 days; a missing pending record fails closed for manual reconciliation.

## Sole processor activation
The public Stripe flag also hides prior payment options and skips their SDK initialization on the main checkout. Set STRIPE_ONLY_ENABLED=true only at verified cutover; this blocks new legacy processor payment initiations. Historical webhooks/completions remain available for pre-cutover orders. STRIPE_CHECKOUT_MODE defaults to live; test deployments must explicitly use test and separate test-only data stores. Live deployments reject test-mode sessions before fulfillment.

## Embedded checkout
The existing checkout now mounts Stripe embedded Checkout in place. Requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY from the same account as STRIPE_SECRET_KEY. Uses ui_mode embedded_page, Stripe.js endive createEmbeddedCheckoutPage, and return_url only after payment. Do not activate before verifying iframe renders. Official reference: https://docs.stripe.com/checkout/embedded/quickstart
