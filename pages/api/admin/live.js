// Live visitor count + funnel-stage breakdown, plus a Shopify-Live-View-style
// last-5-minutes activity summary: per-minute bucketed counts and a recent
// event feed. Visitor presence reads whatever smellsiconic:visitor:* keys currently exist
// in KV — each one naturally expires ~25s after a browser stops sending
// heartbeats (see pages/api/track/heartbeat.js), so no cleanup job is needed.
// Activity data comes from the timestamped event log in lib/analyticsStore.js.

import { TRAFFIC_PREFIX, getRecentEvents } from '../../../lib/analyticsStore';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const WINDOW_MS = 5 * 60 * 1000;
const BUCKET_MS = 60 * 1000;
const BUCKET_COUNT = WINDOW_MS / BUCKET_MS;

function parseVisitorValue(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Brief transition window right after deploy — old entries were a
    // plain stage string, not JSON. They expire within 25s on their own.
    return { stage: raw, city: null, country: 'XX' };
  }
}

async function getLiveVisitors() {
  const keysRes = await fetch(`${KV_URL}/keys/${TRAFFIC_PREFIX}visitor:*`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const keysData = await keysRes.json();
  const keys = keysData.result || [];

  if (keys.length === 0) return { count: 0, byStage: {}, byCountry: {} };

  const mgetRes = await fetch(`${KV_URL}/mget/${keys.join('/')}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const mgetData = await mgetRes.json();
  const visitors = (mgetData.result || []).map(parseVisitorValue).filter(Boolean);

  const byStage = {};
  // Keyed by country code; each entry tracks its own count plus a per-city
  // breakdown so the admin view can show "New York, US" not just "US".
  const byCountry = {};
  for (const v of visitors) {
    if (v.stage) byStage[v.stage] = (byStage[v.stage] || 0) + 1;
    const country = v.country || 'XX';
    if (!byCountry[country]) byCountry[country] = { count: 0, cities: {} };
    byCountry[country].count += 1;
    if (v.city) byCountry[country].cities[v.city] = (byCountry[country].cities[v.city] || 0) + 1;
  }
  for (const country of Object.keys(byCountry)) {
    byCountry[country].cities = Object.entries(byCountry[country].cities)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }

  return { count: keys.length, byStage, byCountry };
}

function buildActivity(events) {
  const now = Date.now();
  const buckets = Array.from({ length: BUCKET_COUNT }, () => ({ addtocart: 0, checkout_start: 0, purchase: 0 }));

  const counts = { addtocart: 0, checkout_start: 0, purchase: 0, revenue: 0 };
  // Headline counts are per visitor, not per action — someone adding 3
  // items or reloading checkout twice still only counts once. The bucket
  // sparkline and recent feed below stay un-deduped since those represent
  // a raw activity pulse, not a visitor total.
  const seenSessions = { addtocart: new Set(), checkout_start: new Set() };
  for (const ev of events) {
    const age = now - ev.ts;
    const bucketIndex = BUCKET_COUNT - 1 - Math.min(BUCKET_COUNT - 1, Math.floor(age / BUCKET_MS));
    if (buckets[bucketIndex] && ev.type in buckets[bucketIndex]) buckets[bucketIndex][ev.type] += 1;

    if (ev.type === 'addtocart' || ev.type === 'checkout_start') {
      if (ev.sessionId && seenSessions[ev.type].has(ev.sessionId)) continue;
      if (ev.sessionId) seenSessions[ev.type].add(ev.sessionId);
      counts[ev.type] += 1;
    } else if (ev.type in counts) {
      counts[ev.type] += 1;
    }
    if (ev.type === 'purchase') counts.revenue += Number(ev.amount) || 0;
  }

  const recent = events
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 15)
    .map((ev) => ({ type: ev.type, ts: ev.ts, productName: ev.productName, amount: ev.amount }));

  return { counts, buckets, recent };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ error: 'KV_REST_API_URL / KV_REST_API_TOKEN are not set.' });
  }

  try {
    const [liveVisitors, recentEvents] = await Promise.all([getLiveVisitors(), getRecentEvents(WINDOW_MS)]);
    return res.status(200).json({ ...liveVisitors, activity: buildActivity(recentEvents) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
