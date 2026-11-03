// Feeds this store's contact list (lib/subscribersStore.js — the newsletter
// form, cart drawer and checkout contact fields, and orders) into the email
// list (lib/email/subscribersStore.js). Run at the start of every
// automations cron (pages/api/cron/email-automations.js). Only contacts seen
// since the last sync are processed.
//
// Rules:
// - A contact with an email and marketing consent becomes a subscriber.
// - A contact who unsubscribed (consent switched off) is unsubscribed here too.
// - A newer order (lastOrderAt) is recorded with touchLastOrder, which stops
//   cart emails and starts the order follow-up.
// - A cart given with an email in the cart drawer starts the abandoned-cart
//   flow (add_to_cart); reaching checkout after that stops it, since the
//   abandoned-checkout email (lib/abandonedCheckout.js) takes over.
// - The very first sync is the existing list, not new signups, so those
//   subscribers are marked as past the welcome series — switching the
//   welcome on emails new signups only, not everyone already on file.
//
// Done in memory with one write: the email list is a single KV blob, and
// the first sync can be the whole contact list.

import { randomUUID } from 'crypto';
import { getSubscribers as getContacts } from '../subscribersStore';
import { getSubscribers, saveSubscribers } from './subscribersStore';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const CURSOR_KEY = 'email_leads_synced_at';
// Same marker lib/email/subscribersStore.js uses for "flow finished".
const SUPERSEDED = { step: 999 };
// Listed in priority order: a contact who signed up through the newsletter
// form counts as a newsletter signup even if they reached checkout first.
const SOURCE_FOR = { newsletter: 'newsletter', checkout: 'checkout', order: 'order', cart: 'lead' };

async function kv(path, body) {
  const res = await fetch(`${KV_URL}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    ...(body === undefined ? {} : { body }),
  });
  return res.json();
}

function ms(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function newSubscriber(contact, now, firstSync) {
  const source = SOURCE_FOR[Object.keys(SOURCE_FOR).find((s) => (contact.sources || []).includes(s))] || 'lead';
  return {
    email: contact.email,
    status: 'subscribed',
    source,
    phone: contact.phone || null,
    createdAt: ms(contact.firstSeen) || now,
    confirmedAt: now,
    confirmToken: randomUUID().replace(/-/g, ''),
    unsubToken: randomUUID().replace(/-/g, ''),
    lastClickAt: null,
    tags: [],
    automationState: firstSync ? { welcome_series: SUPERSEDED } : {},
    suppressedReason: null,
  };
}

export async function syncStoreLeads() {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const since = Number((await kv(`get/${CURSOR_KEY}`)).result) || 0;
  const firstSync = since === 0;
  const startedAt = Date.now();

  const contacts = (await getContacts()).filter((c) => c.email
    && Math.max(ms(c.lastSeen), ms(c.lastOrderAt), ms(c.unsubscribedAt)) > since);
  if (contacts.length === 0) {
    await kv(`set/${CURSOR_KEY}`, String(startedAt));
    return { checked: 0, added: 0, unsubscribed: 0, orders: 0 };
  }

  const list = await getSubscribers();
  const byEmail = new Map(list.map((s) => [s.email, s]));
  let added = 0;
  let unsubscribed = 0;
  let orders = 0;

  for (const c of contacts) {
    const email = String(c.email).trim().toLowerCase();
    let sub = byEmail.get(email);

    if (!c.consent) {
      if (sub?.status === 'subscribed' && c.unsubscribedAt) {
        sub = { ...sub, status: 'unsubscribed' };
        byEmail.set(email, sub);
        unsubscribed += 1;
      }
      continue;
    }

    if (!sub) {
      sub = newSubscriber({ ...c, email }, startedAt, firstSync);
      added += 1;
    } else if (sub.status === 'pending') {
      sub = { ...sub, status: 'subscribed', confirmedAt: sub.confirmedAt || startedAt };
    }

    const orderAt = ms(c.lastOrderAt);
    if (orderAt && orderAt > (sub.lastOrderAt || 0)) {
      sub = {
        ...sub,
        lastOrderAt: orderAt,
        ordersCount: (sub.ordersCount || 0) + 1,
        checkoutStartedAt: null,
        checkoutValue: null,
        automationState: {
          ...sub.automationState,
          // The first sync's orders are history — no follow-up for them.
          order_received: firstSync ? SUPERSEDED : { step: 0 },
          add_to_cart: SUPERSEDED,
          abandoned_checkout: SUPERSEDED,
        },
      };
      orders += 1;
    }
    // The cart drawer's email form saves the bag with source 'cart'
    // (lib/subscribersStore.js upsertSubscriber); lastSeen is when.
    const seenAt = ms(c.lastSeen);
    const checkoutAt = ms(c.lastCheckoutAt);
    if (!firstSync && (c.sources || []).includes('cart') && c.cart?.length
      && seenAt > (sub.cartUpdatedAt || 0) && seenAt > checkoutAt && seenAt > (sub.lastOrderAt || 0)) {
      sub = {
        ...sub,
        cartItems: c.cart.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price ?? null, image: null })),
        cartValue: c.cart.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0),
        cartUpdatedAt: seenAt,
        automationState: { ...sub.automationState, add_to_cart: { step: 0 } },
      };
    }
    if (sub.cartUpdatedAt && checkoutAt > sub.cartUpdatedAt && sub.automationState?.add_to_cart?.step !== SUPERSEDED.step) {
      sub = { ...sub, automationState: { ...sub.automationState, add_to_cart: SUPERSEDED } };
    }
    if (!sub.phone && c.phone) sub = { ...sub, phone: c.phone };
    byEmail.set(email, sub);
  }

  await saveSubscribers([...byEmail.values()]);
  await kv(`set/${CURSOR_KEY}`, String(startedAt));
  return { checked: contacts.length, added, unsubscribed, orders };
}
