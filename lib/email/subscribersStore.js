// Email marketing subscribers, stored in the same KV store as everything
// else. Key: email_subscribers -> JSON array of subscriber objects. Fine
// at DTC list scale (same single-blob pattern as discountsStore.js /
// reviewsStore.js) — migrate to a real DB if the list grows past the
// tens-of-thousands range and blob rewrites get slow.
//
// status: 'pending' (double opt-in sent, not confirmed) | 'subscribed' |
// 'unsubscribed' | 'suppressed' (bounced/complained — never send again).

import { randomUUID } from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_subscribers';

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

export async function getSubscribers() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

async function saveSubscribers(subscribers) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(subscribers),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to save subscribers (${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}).`);
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export async function findSubscriber(email) {
  const subscribers = await getSubscribers();
  const normalized = normalizeEmail(email);
  return subscribers.find((s) => s.email === normalized) || null;
}

export async function findByToken(field, token) {
  if (!token) return null;
  const subscribers = await getSubscribers();
  return subscribers.find((s) => s[field] === token) || null;
}

// Creates a new pending subscriber, or refreshes the confirm token on an
// existing pending/unsubscribed one (lets someone re-request the double
// opt-in email without creating duplicate rows).
export async function startSubscription(email, source) {
  const normalized = normalizeEmail(email);
  const subscribers = await getSubscribers();
  const existing = subscribers.find((s) => s.email === normalized);

  if (existing && existing.status === 'subscribed') return existing;

  const confirmToken = randomUUID().replace(/-/g, '');
  const unsubToken = existing?.unsubToken || randomUUID().replace(/-/g, '');
  const record = {
    email: normalized,
    status: 'pending',
    source: source || 'newsletter',
    createdAt: existing?.createdAt || Date.now(),
    confirmedAt: null,
    confirmToken,
    unsubToken,
    lastClickAt: existing?.lastClickAt || null,
    lastPurchaseAt: existing?.lastPurchaseAt || null,
    tags: existing?.tags || [],
    automationState: existing?.automationState || {},
    suppressedReason: null,
  };

  const updated = [...subscribers.filter((s) => s.email !== normalized), record];
  await saveSubscribers(updated);
  return record;
}

// Added directly (default source: 'manual', from the admin's "Add
// subscriber" form) — skips double opt-in, since creating a record here
// is an assertion that a lawful basis to email them already exists (an
// existing customer, a re-imported list, checkout consent, etc.), the
// same trust boundary upsertFromShopify already relies on for its
// already-consented Shopify customers. Also used with source: 'checkout'
// by pages/api/email/checkout-capture.js, source: 'order' by
// pages/api/email/order-received.js, and source: 'lead' by
// lib/storefrontLeadsSync.js. Suppressed addresses are left alone rather
// than reactivated — same rule as upsertFromShopify: a bounce/complaint
// is a deliverability signal independent of anyone re-asserting consent.
export async function addSubscriberManually(email, source = 'manual', extra = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('A valid email is required.');

  const subscribers = await getSubscribers();
  const existing = subscribers.find((s) => s.email === normalized);
  if (existing?.status === 'subscribed') {
    if (extra.phone && !existing.phone) {
      const updated = subscribers.map((s) => (s.email === normalized ? { ...s, phone: extra.phone } : s));
      await saveSubscribers(updated);
      return updated.find((s) => s.email === normalized);
    }
    return existing;
  }
  if (existing?.status === 'suppressed') {
    throw new Error('This address is suppressed (bounced or complained) and can\'t be re-added.');
  }

  const record = {
    email: normalized,
    status: 'subscribed',
    source,
    phone: extra.phone || existing?.phone || null,
    // Signup can reserve its immediate welcome before the cron sees it.
    // Other callers retain the existing automation state unchanged.
    ...(extra.reserveWelcome ? { signupWelcomeReserved: true } : {}),
    createdAt: existing?.createdAt || Date.now(),
    confirmedAt: existing?.confirmedAt || Date.now(),
    confirmToken: existing?.confirmToken || randomUUID().replace(/-/g, ''),
    unsubToken: existing?.unsubToken || randomUUID().replace(/-/g, ''),
    lastClickAt: existing?.lastClickAt || null,
    tags: existing?.tags || [],
    automationState: extra.reserveWelcome
      ? { ...existing?.automationState, welcome_series: { step: 1 } }
      : existing?.automationState || {},
    suppressedReason: null,
  };

  const updated = [...subscribers.filter((s) => s.email !== normalized), record];
  await saveSubscribers(updated);
  return record;
}

export async function confirmSubscriber(confirmToken) {
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.confirmToken === confirmToken && s.status === 'pending');
  if (idx === -1) return null;

  subscribers[idx] = { ...subscribers[idx], status: 'subscribed', confirmedAt: Date.now() };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

export async function unsubscribeByToken(unsubToken) {
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.unsubToken === unsubToken);
  if (idx === -1) return null;

  subscribers[idx] = { ...subscribers[idx], status: 'unsubscribed' };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

export async function suppressByEmail(email, reason) {
  const normalized = normalizeEmail(email);
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.email === normalized);
  if (idx === -1) return null;

  subscribers[idx] = { ...subscribers[idx], status: 'suppressed', suppressedReason: reason || 'bounce' };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

export async function recordClick(email) {
  const normalized = normalizeEmail(email);
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.email === normalized);
  if (idx === -1) return null;

  subscribers[idx] = { ...subscribers[idx], lastClickAt: Date.now() };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

// Syncs one Shopify customer in. Consent-gated: only a currently
// SUBSCRIBED customer is added/kept as a subscriber here — importing
// everyone regardless of Shopify's own consent state is exactly the
// list-hygiene mistake this platform exists to avoid. If an existing
// synced subscriber's consent has flipped away from subscribed, they're
// marked unsubscribed instead of just being left stale.
export async function upsertFromShopify(customer) {
  const normalized = normalizeEmail(customer.email);
  if (!normalized) return null;

  const subscribers = await getSubscribers();
  const existing = subscribers.find((s) => s.email === normalized);

  if (customer.marketingState !== 'SUBSCRIBED') {
    if (existing && existing.source === 'shopify' && existing.status === 'subscribed') {
      const updated = subscribers.map((s) => (s.email === normalized ? { ...s, status: 'unsubscribed' } : s));
      await saveSubscribers(updated);
      return updated.find((s) => s.email === normalized);
    }
    return existing || null;
  }

  // A bounce/complaint suppression is a signal about this address's
  // deliverability, independent of Shopify's consent state — never
  // un-suppress someone just because Shopify still thinks they're opted
  // in. Still refresh their order/spend fields, just not status.
  if (existing?.status === 'suppressed') {
    const updated = subscribers.map((s) =>
      s.email === normalized
        ? { ...s, shopifyCustomerId: customer.shopifyCustomerId, ordersCount: customer.ordersCount || 0, totalSpent: customer.totalSpent || 0, lastOrderAt: customer.lastOrderAt || s.lastOrderAt || null }
        : s
    );
    await saveSubscribers(updated);
    return updated.find((s) => s.email === normalized);
  }

  const record = {
    email: normalized,
    status: 'subscribed',
    source: 'shopify',
    createdAt: existing?.createdAt || Date.now(),
    // Seeded from Shopify's own consent timestamp (falling back to sync
    // time) so the welcome-series automation still has a real trigger
    // point even though these subscribers skip the double opt-in flow —
    // Shopify already captured consent, so re-confirming here would be
    // redundant friction.
    confirmedAt: existing?.confirmedAt || customer.consentUpdatedAt || Date.now(),
    confirmToken: existing?.confirmToken || randomUUID().replace(/-/g, ''),
    unsubToken: existing?.unsubToken || randomUUID().replace(/-/g, ''),
    lastClickAt: existing?.lastClickAt || null,
    shopifyCustomerId: customer.shopifyCustomerId,
    ordersCount: customer.ordersCount || 0,
    totalSpent: customer.totalSpent || 0,
    lastOrderAt: customer.lastOrderAt || existing?.lastOrderAt || null,
    tags: existing?.tags || [],
    automationState: existing?.automationState || {},
    suppressedReason: null,
  };

  const updated = [...subscribers.filter((s) => s.email !== normalized), record];
  await saveSubscribers(updated);
  return record;
}

// A step index no real flow will ever reach — used to mark a flow
// "superseded" (the subscriber moved to a later funnel stage) rather
// than "due", without needing to know that flow's actual step count
// here. pages/api/cron/automations.js's `state.step >= flow.steps.length`
// eligibility check treats this the same as "already finished".
const AUTOMATION_SUPERSEDED = { step: 999 };

// Used by the orders/create webhook — updates the precise purchase
// timestamp for an existing subscriber without touching consent status
// (an order payload doesn't carry a trustworthy consent field the way a
// customers webhook does, so this never creates a new subscriber).
// Clears any in-progress checkout (it converted, so abandoned_checkout
// shouldn't fire) and add_to_cart (moot — they bought), and gives
// order_received a fresh cycle since each order deserves its own
// thank-you regardless of whether a previous one already ran.
export async function touchLastOrder(email, timestampMs) {
  const normalized = normalizeEmail(email);
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.email === normalized);
  if (idx === -1) return null;

  subscribers[idx] = {
    ...subscribers[idx],
    lastOrderAt: timestampMs,
    ordersCount: (subscribers[idx].ordersCount || 0) + 1,
    checkoutStartedAt: null,
    checkoutValue: null,
    automationState: {
      ...subscribers[idx].automationState,
      order_received: { step: 0 },
      add_to_cart: AUTOMATION_SUPERSEDED,
      abandoned_checkout: AUTOMATION_SUPERSEDED,
    },
  };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

// From the on-site tracking pixel (pages/track.js) — cart activity for a
// known subscriber (identified by email; see pages/track.js for why
// anonymous/logged-out carts aren't tracked in this pass). No-ops for an
// email that isn't an existing subscriber, same as everywhere else in
// this app — it only acts on people already on the list. Resets
// add_to_cart to a fresh cycle keyed off this latest activity, but only
// while no checkout is in progress — once they've moved on to checkout,
// abandoned_checkout is the more specific flow and add_to_cart shouldn't
// also be nagging them.
export async function updateCartActivity(email, cartValue, itemCount) {
  const normalized = normalizeEmail(email);
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.email === normalized);
  if (idx === -1) return null;

  const current = subscribers[idx];
  subscribers[idx] = {
    ...current,
    cartValue,
    cartItemCount: itemCount,
    cartUpdatedAt: Date.now(),
    automationState: current.checkoutStartedAt
      ? current.automationState
      : { ...current.automationState, add_to_cart: { step: 0 } },
  };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

// Marks a checkout as started — the trigger point for the
// abandoned_checkout automation. Resets automationState for that flow so
// a new checkout attempt after a previous abandoned/suppressed cycle
// gets its own fresh run instead of picking up a stale step index, and
// supersedes add_to_cart — abandoned_checkout is the more specific flow
// once they've reached checkout, no need for both to nag them.
//
// `items` (optional — the Shopify pixel path doesn't send them, the
// checkout-capture path does) is what lets the automation email actually
// show the abandoned products via {{CART_ITEMS}}
// (lib/emailBlocks.js's renderCartItemsHtml) instead of staying generic.
// A later call with no items doesn't erase a previously-captured cart —
// only an explicit non-empty array replaces it.
export async function recordCheckoutStarted(email, cartValue, items) {
  const normalized = normalizeEmail(email);
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.email === normalized);
  if (idx === -1) return null;

  subscribers[idx] = {
    ...subscribers[idx],
    checkoutStartedAt: Date.now(),
    checkoutValue: cartValue,
    checkoutItems: items && items.length > 0 ? items : subscribers[idx].checkoutItems || [],
    automationState: {
      ...subscribers[idx].automationState,
      abandoned_checkout: { step: 0 },
      add_to_cart: AUTOMATION_SUPERSEDED,
    },
  };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

export async function updateAutomationState(email, flow, state) {
  const normalized = normalizeEmail(email);
  const subscribers = await getSubscribers();
  const idx = subscribers.findIndex((s) => s.email === normalized);
  if (idx === -1) return null;

  subscribers[idx] = {
    ...subscribers[idx],
    automationState: { ...subscribers[idx].automationState, [flow]: state },
  };
  await saveSubscribers(subscribers);
  return subscribers[idx];
}

export { saveSubscribers };
