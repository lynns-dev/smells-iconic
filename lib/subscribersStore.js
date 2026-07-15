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
  if (!res.ok) throw new Error('Failed to save subscribers.');
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
