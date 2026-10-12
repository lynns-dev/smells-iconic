// Order ledger and funnel event counters, both day-bucketed in the same
// Upstash KV store used elsewhere. Keys use the calendar date
// (YYYY-MM-DD) in the store's own Pacific timezone, not UTC — "today" in
// the admin dashboard should roll over at midnight for the person actually
// looking at it, not at 4/5pm Pacific when UTC happens to tick over.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const STORE_TIMEZONE = 'America/Los_Angeles';

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// en-CA formats as YYYY-MM-DD directly; DateTimeFormat handles the
// PST/PDT transition automatically so this stays correct year-round.
export function todayKey() {
  return dateFormatter.format(new Date());
}

// Date keys (Pacific calendar days) covered by a funnel time-filter range,
// newest first. 'today' resolves to the same single key as todayKey(), so
// the funnel's default view still rolls over at Pacific midnight exactly
// like Revenue/Orders today.
const RANGE_DAYS = { today: 1, yesterday: 1, '7d': 7, '30d': 30, '45d': 45 };

export function dateKeysForRange(range) {
  const days = RANGE_DAYS[range] ?? 1;
  const startOffset = range === 'yesterday' ? 1 : 0;
  const now = Date.now();
  return Array.from({ length: days }, (_, i) =>
    dateFormatter.format(new Date(now - (startOffset + i) * 24 * 60 * 60 * 1000))
  );
}

export async function recordOrder(order) {
  assertConfigured();
  const key = `orders:${todayKey()}`;
  const res = await fetch(`${KV_URL}/get/${key}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  const existing = data.result ? JSON.parse(data.result) : [];
  const updated = [...existing, order];
  await fetch(`${KV_URL}/set/${key}?EX=${60 * 60 * 24 * 45}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  return updated;
}

// Merges `updates` into the stored order with this id (orders are kept 45
// days). Used to save each order's Meta Purchase outcome (order.meta).
export async function updateOrderStatus(orderId, updates) {
  assertConfigured();
  const keys = dateKeysForRange('45d');
  const perDay = await Promise.all(keys.map(async (key) => ({ key, orders: await getOrders(key) })));
  for (const { key, orders } of perDay) {
    const idx = orders.findIndex((o) => o.id === orderId);
    if (idx === -1) continue;
    const updated = { ...orders[idx], ...updates };
    orders[idx] = updated;
    await fetch(`${KV_URL}/set/orders:${key}?EX=${60 * 60 * 24 * 45}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify(orders),
    });
    return updated;
  }
  return null;
}

export async function getOrders(dateKey = todayKey()) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/orders:${dateKey}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

// Flattens orders across the last N days into one newest-first list, for
// the admin Orders screen. 45 days matches the TTL orders are stored with.
export async function getRecentOrders(days = 30, limit = 100) {
  const keys = dateKeysForRange(days >= 30 ? '30d' : days >= 7 ? '7d' : 'today');
  const perDay = await Promise.all(keys.map((key) => getOrders(key)));
  return perDay
    .flat()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

const EVENT_NAMES = ['pageview', 'addtocart', 'checkout_start', 'purchase'];

// Adding several items or reloading /checkout shouldn't inflate these past
// one count per visitor — the admin funnel counts carts/checkouts per
// person, not per action.
// pageview too: the funnel's first step is Visitors (people), not every
// page they look at.
const DEDUPED_EVENTS = ['pageview', 'addtocart', 'checkout_start'];

export async function incrementEvent(name, sessionId) {
  if (!EVENT_NAMES.includes(name)) return;
  assertConfigured();
  const key = `events:${todayKey()}:${name}`;

  if (DEDUPED_EVENTS.includes(name) && sessionId) {
    const seenKey = `events:${todayKey()}:${name}:seen:${sessionId}`;
    // Raw command form, as veil-ecommerce fixed it: the old
    // /set/<key>?EX=..&NX=true shorthand (NX as a query flag with a POST-body
    // value) isn't honored by Upstash the way it was assumed to be — it came
    // back without a result on first-time visitors too, so every add-to-cart
    // and checkout start was skipped as "already counted" and the admin
    // funnel stayed at zero.
    const setResult = await redisCommand(['SET', seenKey, '1', 'EX', String(60 * 60 * 24), 'NX']);
    if (!setResult) return; // this visitor was already counted today
  }

  await fetch(`${KV_URL}/incr/${key}`, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  // Give the counter the same retention as the order ledger; INCR creates
  // the key with no TTL, so set one after the fact (cheap, idempotent).
  await fetch(`${KV_URL}/expire/${key}/${60 * 60 * 24 * 45}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
}

// Accepts either a single date key (back-compat) or an array of them, in
// which case counts are summed across all days — how the funnel time
// filter turns "last 7 days" into one set of totals.
export async function getEventCounts(dateKeys = [todayKey()]) {
  assertConfigured();
  const keys = Array.isArray(dateKeys) ? dateKeys : [dateKeys];
  const pairs = keys.flatMap((dateKey) => EVENT_NAMES.map((name) => ({ name, redisKey: `events:${dateKey}:${name}` })));
  const values = await redisCommand(['MGET', ...pairs.map((p) => p.redisKey)]);
  const counts = Object.fromEntries(EVENT_NAMES.map((name) => [name, 0]));
  pairs.forEach((p, i) => {
    counts[p.name] += Number(values[i]) || 0;
  });
  return counts;
}

// Timestamped event log for the "last few minutes" live-activity view — a
// Redis sorted set (score = timestamp ms) so a sliding window is a single
// ZRANGEBYSCORE. Entries older than RETENTION_MS are trimmed on every write
// so the set never grows unbounded; nothing needs this data past a few
// minutes, unlike the day-bucketed counters/order ledger above.
const RETENTION_MS = 15 * 60 * 1000;
const RECENT_EVENTS_KEY = 'events:recent';

async function redisCommand(command) {
  assertConfigured();
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Redis command failed.');
  return data.result;
}

export async function logEvent(type, meta = {}) {
  const now = Date.now();
  const entry = JSON.stringify({ type, ts: now, ...meta });
  await redisCommand(['ZADD', RECENT_EVENTS_KEY, String(now), entry]);
  await redisCommand(['ZREMRANGEBYSCORE', RECENT_EVENTS_KEY, '-inf', String(now - RETENTION_MS)]);
}

export async function getRecentEvents(windowMs = 5 * 60 * 1000) {
  const since = Date.now() - windowMs;
  const raw = await redisCommand(['ZRANGEBYSCORE', RECENT_EVENTS_KEY, String(since), '+inf']);
  return (raw || []).map((entry) => {
    try {
      return JSON.parse(entry);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// Visitor log for admin's Visitors tab: one entry per visitor (browser
// session) per day, newest first, with where they came from — source,
// referrer, landing page and every URL parameter on that first page
// (utm_*, fbclid, gclid, ad/campaign names, anything else). Capped so the
// list never grows unbounded.
const VISITORS_KEY = 'visitors:recent';
const VISITORS_CAP = 1000;

export async function logVisitor(entry) {
  // One entry per person per day: the device's visitor id (kept across tabs
  // and return visits), falling back to the tab session id.
  const id = entry.visitorId || entry.sessionId;
  if (!id) return;
  const fresh = await redisCommand(['SET', `visitors:seen:${todayKey()}:${id}`, '1', 'EX', String(60 * 60 * 24), 'NX']);
  if (!fresh) return; // this visitor is already in today's log
  await redisCommand(['LPUSH', VISITORS_KEY, JSON.stringify({ ...entry, ts: Date.now() })]);
  await redisCommand(['LTRIM', VISITORS_KEY, '0', String(VISITORS_CAP - 1)]);
}

export async function getRecentVisitors(limit = 300) {
  const raw = await redisCommand(['LRANGE', VISITORS_KEY, '0', String(limit - 1)]);
  return (raw || []).map((item) => {
    try {
      return JSON.parse(item);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// What each visitor did during their visit, for the Visitors tab: products
// added to cart, whether they reached checkout or bought, the deepest
// they scrolled on each page, and the last form field they typed into
// (which shows where an abandoned checkout stopped). Keyed by the tab
// session id the visitor log uses; kept for a week.
const JOURNEY_TTL_SECONDS = 60 * 60 * 24 * 7;

// Remembers which person (device visitor id) a tab session belongs to, so a
// purchase — which only knows the session — lands on the right journey.
export async function linkSessionToVisitor(sessionId, visitorId) {
  if (!sessionId || !visitorId || sessionId === visitorId) return;
  await redisCommand(['SET', `session_visitor:${sessionId}`, visitorId, 'EX', String(60 * 60 * 24 * 7)]);
}

export async function visitorIdForSession(sessionId) {
  if (!sessionId) return null;
  return (await redisCommand(['GET', `session_visitor:${sessionId}`])) || null;
}

// id: the device visitor id where known (one journey per person across
// tabs and return visits), otherwise the tab session id.
export async function updateJourney(id, update) {
  if (!id || typeof id !== 'string' || id.length > 100) return;
  const key = `visitor_journey:${id}`;
  const raw = await redisCommand(['GET', key]);
  let j = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { j = {}; }
  const now = Date.now();
  j.lastSeen = now;
  if (update.path) {
    j.lastPath = update.path;
    j.pages = [...new Set([...(j.pages || []), update.path])].slice(-15);
  }
  if (update.stage) j.lastStage = update.stage;
  if (update.path && Number.isFinite(update.scrollPct)) {
    j.scroll = { ...(j.scroll || {}) };
    j.scroll[update.path] = Math.max(j.scroll[update.path] || 0, update.scrollPct);
  }
  if (update.field) j.lastField = { label: update.field, path: update.path || j.lastPath || null, ts: now };
  if (update.cartAdd) {
    j.cart = [...new Set([...(j.cart || []), update.cartAdd])].slice(-10);
    j.cartAt = j.cartAt || now;
  }
  if (update.checkout) j.checkoutAt = j.checkoutAt || now;
  if (update.purchased) j.purchased = { amount: update.purchased.amount, at: now };
  await redisCommand(['SET', key, JSON.stringify(j), 'EX', String(JOURNEY_TTL_SECONDS)]);
}

export async function getJourneys(journeyIds) {
  const ids = [...new Set(journeyIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const values = await redisCommand(['MGET', ...ids.map((id) => `visitor_journey:${id}`)]);
  const map = {};
  ids.forEach((id, i) => {
    try {
      if (values?.[i]) map[id] = JSON.parse(values[i]);
    } catch {
      // ignore a malformed entry
    }
  });
  return map;
}
