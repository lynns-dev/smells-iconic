# Smells Iconic — E-commerce (Next.js + QuickBooks Payments + Stripe)

Blush-and-cream storefront for Smells Iconic body mists. Next.js 14
(Pages Router) with a custom, Shopify-style single-page checkout that
charges cards via QuickBooks Payments, with Cash App Pay/Klarna/Afterpay/
Affirm as backup "or choose another way to pay" options via Stripe —
customers only ever see each method's own name, never "Stripe".

Placeholder graphics stand in for real product photography — see
"Notes before launch" below for what to swap in.

## Deploy to Vercel

1. Push this folder to a new GitHub repository.
2. In Vercel, **Add New → Project** and import the repo. Framework preset:
   **Next.js** (auto-detected). No build settings to change.
3. Add these Environment Variables in Vercel (Project → Settings → Environment
   Variables), then redeploy:

   | Name | Value |
   |------|-------|
   | `QB_CLIENT_ID` / `QB_CLIENT_SECRET` | app credentials from your Intuit Developer app (Payments enabled) |
   | `QB_ENVIRONMENT` / `NEXT_PUBLIC_QB_ENVIRONMENT` | `sandbox` or `production` (keep both in sync) |
   | `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV / Upstash Redis store, used to persist the QuickBooks refresh token |
   | `NEXT_PUBLIC_BASE_URL` | your deployed URL, e.g. `https://smells-iconic.vercel.app` |
   | `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | API keys from your Stripe Dashboard, power the Cash App Pay/Klarna/Afterpay/Affirm options |
   | `STRIPE_WEBHOOK_SECRET` | signing secret for a webhook endpoint pointed at `/api/stripe-webhook`, subscribed to `payment_intent.succeeded` |

The site builds and renders fully without QuickBooks or Stripe configured —
only the final **Pay now**/"or choose another way to pay" step on `/checkout`
needs them. Once the QuickBooks variables above are set, visit
`/api/qb-auth/connect` once to authorize QuickBooks; after that,
`lib/qbServerAuth.js` refreshes the access token automatically forever (no
manual rotation). Test everything in `sandbox` first — going live in
`production` additionally requires Intuit's separate Payments production
approval (see `DEPLOYMENT.md`). See `DEPLOYMENT.md` for the full walkthrough,
including the Stripe setup.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

## Structure

- `pages/index.jsx` — homepage (hero, collection, Babygirl spotlight, honest-math, reviews, formula, ritual, newsletter)
- `pages/shop.jsx` — full catalog grid
- `pages/product/[id].jsx` — product detail (static-generated per product)
- `pages/checkout.jsx` — custom single-page checkout (contact, delivery, payment, order summary)
- `pages/success.jsx` — post-checkout thank-you
- `pages/api/qb-checkout.js` — charges a card token via the QuickBooks Payments API
- `pages/api/qb-auth/connect.js`, `pages/api/qb-auth/callback.js` — one-time OAuth authorization flow
- `lib/qbPayments.js` — client-side card tokenization (direct call to Intuit's Payments Tokens REST endpoint)
- `lib/qbServerAuth.js` — server-side access token, refreshed automatically before every charge
- `lib/qbTokenStore.js` — persists the QuickBooks token pair in a KV store between requests
- `pages/api/stripe-payment-intent.js` — creates a Stripe PaymentIntent for whichever "or pay another way" method the customer picked
- `pages/api/stripe-webhook.js` — the only thing that actually records an order for those methods, once Stripe confirms the redirect-based charge succeeded
- `lib/altPaymentMethods.js` — the 4 backup methods (Cash App Pay, Klarna, Afterpay, Affirm) and their Stripe method types, shared by the checkout UI and API routes
- `lib/stripeServer.js` / `lib/stripeClient.js` — server and client Stripe SDK setup
- `lib/products.js` — product data (edit scents/prices here)
- `lib/theme.js` — design tokens (colors, fonts, shared styles)
- `lib/useCart.js` — cart Context provider, persisted to `localStorage` so it survives navigating to `/checkout`
- `components/` — Header, CartDrawer, ProductVisual

## Notes before launch

- Card numbers are tokenized in the browser (`lib/qbPayments.js`) before
  submission — the server only ever sees a one-time token, not raw card data.
- QuickBooks access tokens expire (~60 min); `lib/qbServerAuth.js` refreshes
  them automatically before each charge, so no manual rotation is needed day
  to day. The refresh token itself only needs re-authorizing (via
  `/api/qb-auth/connect`) if it goes unused for 100+ days or is revoked.
- **Production charges require a separate Intuit approval** beyond OAuth —
  see the "Required before Production charges will work" section in
  `DEPLOYMENT.md`. Always confirm the full flow works in `sandbox` first.
- **Test the Cash App Pay/Klarna/Afterpay/Affirm flows end-to-end in Stripe
  test mode before launch.** Each is a redirect to the provider's own
  authorization page and back — that round trip can only be verified with
  real Stripe test-mode keys and Stripe's own test credentials for each
  method, not from a build/lint pass. Confirm `/api/stripe-webhook` is
  actually receiving `payment_intent.succeeded` and creating orders in
  `/admin` before enabling any of these for real customers. Also confirm
  each method is enabled in Stripe Dashboard → Settings → Payment methods —
  a method not enabled there simply won't work even though it's coded here.
- Ratings and reviews on the homepage/product pages are **placeholders**.
  Connect a verified-review app and display only real reviews before launch.
- Confirm scent names, notes, and prices in `lib/products.js` match your catalog.
- **Product/lifestyle images are placeholder SVGs** (`public/images/si-*.svg`,
  blush/cream cards with the wordmark). Replace them with real bottle and
  lifestyle photography before launch — keep the same filenames referenced in
  `lib/products.js` and no code changes are needed.
