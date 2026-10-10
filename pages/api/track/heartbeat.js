// Public, fire-and-forget presence ping. Each active visitor's browser
// calls this every ~10s with its session id and current funnel stage; the
// KV entry expires quickly (25s) so a visitor who closes the tab drops out
// of the live count on its own, no cleanup job needed.
//
// City/country come from Vercel's edge network, which sets these headers
// on every request automatically — no third-party geolocation API needed.

import { isExcludedTraffic } from '../../../lib/ipFilter';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const TTL_SECONDS = 25;
const ALLOWED_STAGES = ['browsing', 'cart_open', 'checkout', 'purchased'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const { sessionId, stage } = req.body || {};
  if (
    typeof sessionId === 'string' &&
    sessionId.length > 0 &&
    sessionId.length < 100 &&
    ALLOWED_STAGES.includes(stage) &&
    KV_URL &&
    KV_TOKEN &&
    !isExcludedTraffic(req)
  ) {
    try {
      // Vercel sets these headers at the edge for every request — no external
      // geo-IP lookup needed. Country falls back to 'XX' locally / off Vercel.
      const city = req.headers['x-vercel-ip-city'];
      const country = req.headers['x-vercel-ip-country'] || 'XX';
      const value = JSON.stringify({
        stage,
        city: city ? decodeURIComponent(city) : null,
        country,
      });
      await fetch(`${KV_URL}/set/visitor:${sessionId}?EX=${TTL_SECONDS}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` },
        body: value,
      });
    } catch (err) {
      console.error('Heartbeat failed:', err);
    }
  }

  return res.status(204).end();
}
