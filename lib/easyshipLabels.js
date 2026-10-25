// Daily label auto-buy for Easyship (pages/api/cron/easyship-labels.js,
// every morning) and admin's "Buy 1 now" (pages/api/admin/orders/easyship.js).
//
// Queue: paid orders already in Easyship (order.easyship.shipmentId) with
// no tracking and no label yet, oldest first. For each, the label Easyship
// would buy — the courier service the account's own settings selected —
// is priced off the shipment (lib/easyship.js labelQuote) and bought only
// when that price is confirmed at or under the cap. Anything over the cap,
// or without a confirmed price, is skipped and noted on the order for
// admin, never bought on a guess.
//
// Safety: off until admin switches it on (easyship_autobuy); the daily
// limit counts every auto-bought label today (store time) so a re-run
// can't exceed it; a per-order lock (SET NX) stops two runs buying the same
// label; one failed purchase stops the run so a systematic error can't
// repeat across the queue. Every attempt is logged (easyship_label_log).
// The tracking webhook then marks the order shipped and emails the customer.

import { getOrders, dateKeysForRange, updateOrderStatus } from './analyticsStore';
import { easyshipConfig, getShipment, labelQuote, buyLabel } from './easyship';

// Written out in full: the Smells Iconic store's next.config.js only maps
// its KV variables onto these names where code names them literally.
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export const DEFAULTS = { enabled: false, dailyLimit: 5, capUsd: 6 };
const SETTINGS_KEY = 'easyship_autobuy';
const LOG_KEY = 'easyship_label_log';
const LOG_LIMIT = 200;

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
const storeDay = (d = new Date()) => dayFormatter.format(d);

async function redis(command) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Redis command failed.');
  return data.result;
}

export async function getAutobuySettings() {
  const raw = await redis(['GET', SETTINGS_KEY]);
  let saved = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch { saved = {}; }
  return { ...DEFAULTS, ...saved };
}

export async function setAutobuyEnabled(enabled) {
  const next = { ...(await getAutobuySettings()), enabled: Boolean(enabled), updatedAt: new Date().toISOString() };
  await redis(['SET', SETTINGS_KEY, JSON.stringify(next)]);
  return next;
}

export async function getLabelLog(limit = 20) {
  const rows = await redis(['LRANGE', LOG_KEY, String(-limit), '-1']);
  return (rows || []).map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean).reverse();
}

async function log(entry) {
  await redis(['RPUSH', LOG_KEY, JSON.stringify({ at: new Date().toISOString(), day: storeDay(), ...entry })]);
  await redis(['LTRIM', LOG_KEY, String(-LOG_LIMIT), '-1']);
}

export async function autoBoughtToday() {
  const today = storeDay();
  return (await getLabelLog(LOG_LIMIT)).filter((e) => e.day === today && e.outcome === 'bought' && e.trigger === 'auto').length;
}

export const needsLabel = (o) => (o.status || 'paid') === 'paid' && o.easyship?.sent && o.easyship?.shipmentId && !o.trackingNumber && !o.easyship?.label?.boughtAt;

export async function labelQueue() {
  const orders = (await Promise.all(dateKeysForRange('45d').map((key) => getOrders(key)))).flat();
  return orders.filter(needsLabel).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

async function note(order, label) {
  await updateOrderStatus(order.id, { easyship: { ...order.easyship, label: { ...(order.easyship?.label || {}), ...label } } }).catch(() => {});
}

// Buys up to `limit` labels from the front of the queue. trigger: 'auto'
// (the morning run) or 'manual' (admin's "Buy 1 now"). Returns a summary.
export async function buyLabels({ limit, trigger, capUsd }) {
  const summary = { bought: [], skipped: [], failed: null };
  if (!easyshipConfig().configured) return { ...summary, failed: 'EASYSHIP_API_TOKEN is not set.' };
  const queue = await labelQueue();
  for (const order of queue) {
    if (summary.bought.length >= limit) break;
    // Another run (or a second click) is already on this order.
    const locked = await redis(['SET', `easyship_label_lock:${order.id}`, '1', 'NX', 'EX', '900']);
    if (locked !== 'OK') continue;

    let quote;
    try {
      quote = labelQuote(await getShipment(order.easyship.shipmentId));
    } catch (err) {
      quote = { price: null, reason: `Couldn't read the shipment from Easyship: ${err.message}` };
    }
    if (quote.price == null || quote.price > capUsd) {
      const reason = quote.price == null ? quote.reason : `Label is $${quote.price.toFixed(2)}${quote.courier ? ` (${quote.courier})` : ''}, over the $${capUsd.toFixed(2)} cap — buy it in Easyship if it's OK.`;
      summary.skipped.push({ id: order.id, reason });
      await note(order, { skippedAt: new Date().toISOString(), skipReason: reason });
      await log({ orderId: order.id, trigger, outcome: 'skipped', reason, price: quote.price ?? null });
      continue;
    }

    const result = await buyLabel(order.easyship.shipmentId, quote.courierServiceId);
    if (!result.ok) {
      summary.failed = `Order ${order.id}: ${result.error}`;
      await note(order, { failedAt: new Date().toISOString(), error: result.error });
      await log({ orderId: order.id, trigger, outcome: 'failed', error: result.error, price: quote.price });
      // A failed purchase is more likely a setup problem than this one order
      // — stop rather than repeat it down the queue.
      break;
    }
    const entry = { boughtAt: new Date().toISOString(), cost: quote.price, currency: quote.currency, courier: quote.courier || null, trigger };
    summary.bought.push({ id: order.id, cost: quote.price, courier: quote.courier || null });
    await note(order, { ...entry, skipReason: null, error: null });
    await log({ orderId: order.id, trigger, outcome: 'bought', price: quote.price, courier: quote.courier || null });
  }
  return summary;
}
