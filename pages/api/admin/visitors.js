// Admin's Visitors tab: the most recent visitors with their source, landing
// page, referrer and URL parameters (lib/analyticsStore.js logVisitor).
// Behind the admin session check in middleware.js like every /api/admin route.
import { getRecentVisitors, getJourneys } from '../../../lib/analyticsStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const visitors = await getRecentVisitors(Math.min(Number(req.query.limit) || 300, 1000));
    // What each one did (cart, checkout, purchase, scroll, last field) —
    // lib/analyticsStore.js updateJourney.
    const journeys = await getJourneys(visitors.map((v) => v.sessionId));
    return res.status(200).json({ visitors: visitors.map((v) => ({ ...v, journey: journeys[v.sessionId] || null })) });
  } catch (err) {
    console.error('Visitors fetch failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
