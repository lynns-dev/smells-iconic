// Cart drop-off report (admin → Dashboard): what shoppers do between adding
// to cart and paying, so the admin can see where and why they stop.
//
// Two kinds of record, both per Pacific calendar day:
//  - Funnel steps (STEPS), counted once per visitor per day. Reaching a step
//    also counts every step before it, so the funnel always narrows — e.g.
//    an Apple Pay express purchase skips typing an address but did get past
//    that point.
//  - Drop-off signals (cart closed without checking out, item removed,
//    discount code rejected, payment failed), turned into a plain-language
//    reason and counted once per visitor per reason per day. The latest ones
//    are also kept in a short list with the visitor's details.
//
// Written by pages/api/track/cart.js, read by pages/api/admin/cart-funnel.js.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const TTL_SECONDS = 60 * 60 * 24 * 45;
const SEEN_TTL_SECONDS = 60 * 60 * 48;
const RECENT_KEY = 'cartfunnel:recent';
const RECENT_CAP = 100;

export const STEPS = [
  ['added', 'Added to cart'],
  ['cart_open', 'Opened cart'],
  ['checkout_click', 'Clicked checkout'],
  ['checkout_view', 'Reached checkout'],
  ['address', 'Entered shipping address'],
  ['payment_step', 'Reached payment'],
  ['pay_attempt', 'Tried to pay'],
  ['purchased', 'Purchased'],
];
const STEP_KEYS = STEPS.map(([k]) => k);
export const SIGNALS = ['cart_closed', 'item_removed', 'discount_rejected', 'pay_failed'];

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayKey(date = new Date()) {
  return dayFormatter.format(date);
}
export function dayKeysForRange(range) {
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 1;
  return Array.from({ length: days }, (_, i) => dayKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
}

async function redis(command) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Redis command failed.');
  return data.result;
}

async function firstTime(key) {
  return Boolean(await redis(['SET', key, '1', 'EX', String(SEEN_TTL_SECONDS), 'NX']));
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v % 1 === 0 ? v : v.toFixed(2)}` : '';
}

function clip(value, max) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '';
}

// The plain-language reason shown in admin for a drop-off signal.
export function reasonFor(signal, detail = {}) {
  if (signal === 'cart_closed') {
    const shipping = Number(detail.shipping) || 0;
    if (shipping > 0) {
      return `Closed cart while paying ${money(shipping)} shipping${detail.freeAt ? ` (under ${money(detail.freeAt)} for free shipping)` : ''}`;
    }
    return 'Closed cart with free shipping already unlocked';
  }
  if (signal === 'item_removed') return `Removed ${clip(detail.name, 60) || 'an item'} from cart`;
  if (signal === 'discount_rejected') return `Discount code didn’t work${detail.code ? ` (${clip(detail.code, 30).toUpperCase()})` : ''}`;
  if (signal === 'pay_failed') {
    const method = clip(detail.method, 30);
    const message = clip(detail.message, 90);
    return `Payment failed${method ? ` — ${method}` : ''}${message ? `: ${message}` : ''}`;
  }
  return null;
}

// Records one step or signal for a visitor. Never throws to the caller's
// visitor — pages/api/track/cart.js catches and logs.
export async function recordCartEvent({ visitorId, kind, detail = {}, context = {} }) {
  if (!visitorId) return;
  const day = dayKey();
  const stepsKey = `cartfunnel:${day}:steps`;
  const reasonsKey = `cartfunnel:${day}:reasons`;

  const stepIndex = STEP_KEYS.indexOf(kind);
  if (stepIndex >= 0) {
    for (const step of STEP_KEYS.slice(0, stepIndex + 1)) {
      if (await firstTime(`cartfunnel:${day}:seen:${step}:${visitorId}`)) {
        await redis(['HINCRBY', stepsKey, step, '1']);
      }
    }
    await redis(['EXPIRE', stepsKey, String(TTL_SECONDS)]);
    return;
  }

  if (!SIGNALS.includes(kind)) return;
  const reason = reasonFor(kind, detail);
  if (!reason) return;
  if (await firstTime(`cartfunnel:${day}:reason:${visitorId}:${reason}`)) {
    await redis(['HINCRBY', reasonsKey, reason, '1']);
    await redis(['EXPIRE', reasonsKey, String(TTL_SECONDS)]);
  }
  const entry = {
    ts: Date.now(),
    visitorId,
    kind,
    reason,
    cart: Array.isArray(detail.items) ? detail.items.slice(0, 6).map((n) => clip(String(n), 60)).filter(Boolean) : undefined,
    subtotal: Number.isFinite(Number(detail.subtotal)) ? Number(detail.subtotal) : undefined,
    dwellSec: Number.isFinite(Number(detail.dwellSec)) ? Math.round(Number(detail.dwellSec)) : undefined,
    path: clip(context.path, 120) || undefined,
    source: clip(context.source, 80) || undefined,
    device: clip(context.device, 20) || undefined,
  };
  await redis(['LPUSH', RECENT_KEY, JSON.stringify(entry)]);
  await redis(['LTRIM', RECENT_KEY, '0', String(RECENT_CAP - 1)]);
}

function hashToObject(flat) {
  const out = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) out[flat[i]] = Number(flat[i + 1]) || 0;
  return out;
}

// Report for admin: funnel counts, top reasons, latest drop-offs.
export async function getCartFunnel(range = 'today') {
  const days = dayKeysForRange(range);
  const stepTotals = Object.fromEntries(STEP_KEYS.map((k) => [k, 0]));
  const reasonTotals = {};
  for (const day of days) {
    const steps = hashToObject(await redis(['HGETALL', `cartfunnel:${day}:steps`]));
    for (const k of STEP_KEYS) stepTotals[k] += steps[k] || 0;
    const reasons = hashToObject(await redis(['HGETALL', `cartfunnel:${day}:reasons`]));
    for (const [label, n] of Object.entries(reasons)) reasonTotals[label] = (reasonTotals[label] || 0) + n;
  }
  const since = Date.now() - days.length * 24 * 60 * 60 * 1000;
  const recent = ((await redis(['LRANGE', RECENT_KEY, '0', String(RECENT_CAP - 1)])) || [])
    .map((raw) => { try { return JSON.parse(raw); } catch { return null; } })
    .filter((e) => e && e.ts >= since)
    .slice(0, 30);
  return {
    range,
    steps: STEPS.map(([key, label]) => ({ key, label, count: stepTotals[key] })),
    reasons: Object.entries(reasonTotals).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    recent,
  };
}
