# Smells Iconic Full E-Commerce Site — Deployment Guide

This is a Next.js e-commerce site with a full product catalog, detailed product pages, shopping cart, and a custom checkout page that charges cards directly via QuickBooks Payments (no Shopify, no hosted redirect). Built in Smells Iconic's blush-and-cream, internet-archive aesthetic.

## What You Get

- **Homepage** with hero, featured products, brand story, and value proposition
- **Product catalog page** with all Smells Iconic body mists
- **Individual product detail pages** with full descriptions, scent notes, and product specifications
- **Shopping cart** (persists across pages via localStorage, sticky sidebar)
- **Custom single-page checkout** (`/checkout`, styled after Shopify's checkout) that charges QuickBooks Payments directly
- **Deployed to Vercel** (free, automatic scaling, HTTPS included)

---

## Step 1: Set Up QuickBooks Payments

1. Go to https://developer.intuit.com and sign in (or create an Intuit account).
2. Create a new app → **QuickBooks Online and Payments**.
3. On the app's **Payments** tab, enable QuickBooks Payments. This is tied to a merchant account — if you don't already have QuickBooks Payments active on your QuickBooks Online account, you'll need to complete Intuit's merchant underwriting first.
4. Under **Keys & OAuth**, grab the **Client ID** and **Client Secret** for the Sandbox environment (use Production once you're ready to take real charges). These go in `QB_CLIENT_ID` / `QB_CLIENT_SECRET`.
5. In that same **Keys & OAuth** section, add a redirect URI: `https://YOUR_DOMAIN/api/qb-auth/callback` (use your Vercel URL, or `http://localhost:3000/api/qb-auth/callback` for local testing).

### ⚠️ Two non-obvious ways to get the Charges API to fail even with a valid OAuth connection

Both of these were root-caused by direct testing against Intuit's sandbox and are easy to hit again if this integration is ever rebuilt or reconnected:

1. **Development vs. Production credentials must match `QB_ENVIRONMENT`.** Intuit issues a completely separate Client ID/Secret pair per environment (Keys & Credentials → Development / Production tabs), each with its own Redirect URIs list (Settings → Redirect URIs → Development / Production tabs). Using a Production Client ID while `QB_ENVIRONMENT=sandbox` (or vice versa) produces an access token whose environment doesn't match the API base URL it's sent to — Intuit's gateway rejects it with an **empty-body 403** before the request ever reaches real charge logic. Fix: make sure `QB_CLIENT_ID`/`QB_CLIENT_SECRET` come from the same Development/Production tab as `QB_ENVIRONMENT`, and that the matching redirect URI is registered under that same tab.
2. **Don't request `com.intuit.quickbooks.accounting` together with `com.intuit.quickbooks.payment`** in the same OAuth authorization. A combined-scope token consistently 401s (`AuthenticationFailed`) on the Payments Charges API even though it's otherwise valid — request `com.intuit.quickbooks.payment` alone (see `pages/api/qb-auth/connect.js`). This was confirmed by testing both variants directly against `sandbox.api.intuit.com/quickbooks/v4/payments/charges`.

If charges still fail after both of the above are correct, the remaining possibility is Intuit's separate Payments production-access approval (business verification / security questionnaire, found under the app's **Payments** tab if applicable) — but rule out #1 and #2 first, since they're far more common and produce very similar-looking errors.

---

## Step 2: Deploy to Vercel

### Option A: Quick Deploy (Recommended)

1. Go to https://vercel.com and sign up (or log in with GitHub)
2. Click "New Project" → "Import Git Repository"
3. Select this repo
4. Click "Deploy"
5. After deployment, go to "Settings" → "Environment Variables"
6. Add:
   - `QB_CLIENT_ID` / `QB_CLIENT_SECRET`: from Step 1
   - `QB_ENVIRONMENT` and `NEXT_PUBLIC_QB_ENVIRONMENT`: both `sandbox` (or both `production` once approved — see Step 1)
   - `KV_REST_API_URL` / `KV_REST_API_TOKEN`: from a KV store (Vercel Storage → Marketplace → Upstash, or a standalone Upstash Redis database — same REST API either way)
   - `NEXT_PUBLIC_BASE_URL`: your Vercel domain (e.g., `https://smells-iconic.vercel.app`)
7. Redeploy by going to "Deployments" → last deployment → "Redeploy"
8. Visit `/api/qb-auth/connect` once to authorize QuickBooks (see Step 1)

### Option B: Deploy via Git

1. Push this folder to a GitHub repo
2. Connect that repo to Vercel
3. Add environment variables (same as above)
4. Vercel auto-deploys every push

---

## Step 3: Connect Your Domain (Squarespace)

1. In Vercel, go to "Settings" → "Domains"
2. Click "Add Domain"
3. Enter the domain you want (e.g., `checkout.smellsiconic.com`)
4. Vercel will show you nameservers or CNAME record to add
5. In Squarespace:
   - Go to Settings → Domains
   - Find your domain settings
   - Add the Vercel DNS records
   - Wait ~24 hours for DNS to propagate
6. Once DNS is live, Vercel will auto-generate an SSL certificate

---

## Step 4: Test the Checkout

1. Go to your deployed domain
2. Add a product to the cart and click "Checkout"
3. In sandbox mode, use one of Intuit's [test cards](https://developer.intuit.com/app/developer/qbpayments/docs/develop/sandboxes/payments-test-cards)
4. Check your QuickBooks Payments dashboard — the charge should appear

---

## Step 5: Set Up Email Marketing (Amazon SES)

The site has its own email marketing platform built in — double opt-in
signup, one-click unsubscribe, bounce/complaint auto-suppression, a
campaign composer, and welcome/win-back automations — sending through
Amazon SES instead of a third-party ESP. None of this works until SES and
DNS are configured; the app builds and runs fine without it, but
`/api/email/*` routes will error until these steps are done.

### 5a. Verify a sending subdomain in SES

1. In the SES console, **Verified identities → Create identity → Domain**.
   Use a **subdomain** of your site, e.g. `mail.smellsiconic.com` (keeps
   email DNS separate from your root domain's web/MX records).
2. SES gives you 3 DKIM CNAME records — add all 3 at your DNS provider.
3. Under that identity's **Custom MAIL FROM domain**, set something like
   `bounce.mail.smellsiconic.com` and add the MX + SPF TXT records SES
   shows you. This is what makes SPF pass on the *aligned* domain, which
   Gmail/Yahoo's bulk-sender rules require — SES's shared MAIL FROM domain
   alone doesn't align with your From address.
4. At your DNS root, add a DMARC record: `_dmarc.smellsiconic.com` TXT
   `v=DMARC1; p=none; rua=mailto:you@smellsiconic.com`. Start at `p=none`
   (monitor only) and move to `p=quarantine` once DMARC reports look clean.

### 5b. Request production access

New SES accounts start in the **sandbox**: 200 emails/day, and only to
addresses you've individually verified. In the SES console, **Account
dashboard → Request production access** — describe the use case (opt-in
marketing emails for an e-commerce store) and wait for approval (usually
under 24h). Test everything in sandbox first using your own verified inbox
as the recipient.

### 5c. Set up bounce/complaint handling

1. **Configuration sets → Create set**, name it (e.g. `smells-iconic`).
2. Add an **Event destination** → SNS → create a new SNS topic → subscribe
   that topic to `https://YOUR_DOMAIN/api/email/ses-webhook` (protocol
   HTTPS). Select Bounce and Complaint events.
3. The route confirms the SNS subscription automatically on first ping —
   no manual "click to confirm" step needed.
4. Copy the topic's ARN into `SES_SNS_TOPIC_ARN` so the webhook rejects
   notifications from any other topic.

### 5d. IAM credentials

Create an IAM user (or role) with `ses:SendEmail` permission scoped to
your verified identity, and put its access key in `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`.

### 5e. Environment variables

| Name | Value |
|------|-------|
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | from the IAM user above |
| `AWS_REGION` | the region your SES identity is verified in, e.g. `us-east-1` |
| `SES_FROM_EMAIL` | an address on the verified domain, e.g. `hello@mail.smellsiconic.com` |
| `SES_CONFIGURATION_SET` | the configuration set name from 5c |
| `SES_SNS_TOPIC_ARN` | the SNS topic ARN from 5c |
| `CRON_SECRET` | any random string — protects `/api/cron/automations` |

### 5f. Automations cron

`vercel.json` schedules `/api/cron/automations` once daily — **Vercel's
Hobby plan only allows daily cron**, which is enough for the welcome
series' day-granularity steps but coarse for anything faster. If you're on
Hobby and want finer timing, use an external pinger (e.g. cron-job.org)
hitting that same URL hourly with header `Authorization: Bearer
<CRON_SECRET>` instead of/in addition to the Vercel cron entry.

---

## Customizing Products

All products live in `lib/products.js`.

To change them:
1. Edit `lib/products.js`
2. Update product names, prices, images, descriptions, scent notes
3. Push to GitHub (or redeploy to Vercel)
4. Changes go live automatically

---

## Site Structure

### Pages
- `/` — Homepage with hero, featured products, brand story
- `/shop` — Full product catalog
- `/product/[id]` — Individual product detail pages
- `/checkout` — Custom single-page checkout
- `/success` — Order confirmation page
- `/unsubscribe` — Email unsubscribe confirmation page
- `/admin` — Dashboard, live visitors, reviews, discounts, and email subscribers/campaigns/automations (password-protected)

### Components
- `Header.jsx` — Navigation, cart button, logo
- `CartDrawer.jsx` — Slide-in cart, links to `/checkout`
- Product data at `lib/products.js`

### Architecture
- **Frontend**: Next.js React app (all pages)
- **Cart state**: React Context (`lib/useCart.js`), persisted to `localStorage` so it survives navigation to `/checkout`
- **Backend**: Vercel serverless functions at `/api/qb-checkout` (charges a card token via the QuickBooks Payments API) and `/api/qb-auth/connect` + `/api/qb-auth/callback` (one-time OAuth authorization)
- **Payments**: QuickBooks Payments — card details are tokenized client-side (`lib/qbPayments.js`, a direct call to Intuit's Payments Tokens REST endpoint) before ever reaching the server
- **Token refresh**: `lib/qbServerAuth.js` transparently refreshes the QuickBooks access token using a refresh token persisted in the KV store (`lib/qbTokenStore.js`) before every charge — no manual token rotation
- **Email marketing**: sends through Amazon SES (`lib/sesEmail.js`) — double opt-in (`/api/email/subscribe`, `/api/email/confirm`), one-click unsubscribe (`/api/email/unsubscribe`, RFC 8058-compliant), bounce/complaint auto-suppression (`/api/email/ses-webhook`), click tracking (`/api/email/click`), a campaign composer + welcome/win-back automations run from `/admin`, and a daily cron (`/api/cron/automations`, see Step 5f) that advances automation steps
- **Hosting**: Vercel (free tier handles all traffic)

---

## Security Notes

- `QB_CLIENT_SECRET` and the KV-stored tokens live only in Vercel's environment variables / KV store (never in code)
- Card numbers are tokenized in the browser before submission — the server only ever sees a one-time token, not raw card data
- HTTPS is automatic (Vercel provides free SSL)

---

## Troubleshooting

**"QuickBooks Payments is not connected yet" error:**
- Visit `/api/qb-auth/connect` to complete the one-time authorization

**Charge fails with a 403, and the OAuth connection is valid:**
- This is almost always the missing Payments production-access approval described in Step 1, not a bug — confirm the same flow works in `sandbox` first, then chase down that approval with Intuit for `production`

**"KV_REST_API_URL / KV_REST_API_TOKEN are not set" error:**
- Provision a KV store (Vercel Storage → Marketplace → Upstash, or a standalone Upstash Redis database) and add its REST URL/token to your environment variables

**Domain not connecting:**
- DNS can take 24–48 hours to propagate
- Check Vercel's domain status (should show green ✓)

**"AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set" or emails not sending:**
- Complete Step 5 (SES domain verification + IAM credentials); the site works fine without it, only `/api/email/*` routes need it

**Emails send but land in spam, or Gmail/Yahoo start bulk-folder or reject them:**
- Confirm DKIM shows "Verified" in the SES console (can take a few hours after adding the CNAME records)
- Confirm the custom MAIL FROM domain's SPF TXT record is in place (Step 5a) — SES's own shared MAIL FROM doesn't align with your From address, which Gmail/Yahoo's bulk-sender rules check for
- Check the account isn't still in the SES sandbox (Step 5b) — sandbox sends to unverified addresses fail outright, they don't just land in spam
- Check DMARC reports (`rua` address from Step 5a) for alignment failures

---

## Next Steps

1. Deploy this to Vercel
2. Provision a KV store and add `QB_CLIENT_ID` / `QB_CLIENT_SECRET` / `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Development/sandbox credentials to start — see Step 1)
3. Visit `/api/qb-auth/connect` once to authorize QuickBooks, with `QB_ENVIRONMENT=sandbox`
4. Test a full checkout with an Intuit sandbox test card
5. When ready for real charges, swap to the Production Client ID/Secret + redirect URI, switch `QB_ENVIRONMENT` / `NEXT_PUBLIC_QB_ENVIRONMENT` to `production`, and re-run `/api/qb-auth/connect`
6. Connect your domain
