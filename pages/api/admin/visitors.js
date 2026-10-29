// Admin's Visitors tab: the most recent visitors with their source, landing
// page, referrer and URL parameters (lib/analyticsStore.js logVisitor).
// Behind the admin session check in middleware.js like every /api/admin route.
import { getRecentVisitors, getJourneys } from '../../../lib/analyticsStore';
import { getSubscribers } from '../../../lib/subscribersStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const visitors = await getRecentVisitors(Math.min(Number(req.query.limit) || 300, 1000));
    // What each one did (cart, checkout, purchase, scroll, last field) —
    // lib/analyticsStore.js updateJourney.
    const journeys = await getJourneys(visitors.map((v) => v.visitorId || v.sessionId));
    // Who they are, for visitors who typed an email or phone at checkout or
    // in the cart — what the "Send abandoned checkout email" button needs.
    const linked = Object.values(journeys).some((j) => j.contactKey);
    const contacts = new Map(linked ? (await getSubscribers()).map((s) => [s.key, s]) : []);
    return res.status(200).json({
      visitors: visitors.map((v) => {
        const journey = journeys[v.visitorId || v.sessionId] || null;
        const s = journey?.contactKey ? contacts.get(journey.contactKey) : null;
        const contact = s ? {
          key: s.key, email: s.email, name: s.name, consent: Boolean(s.consent), unsubscribed: Boolean(s.unsubscribedAt && !s.consent),
          cartCount: (s.cart || []).reduce((n, i) => n + (Number(i.quantity) || 1), 0), abandonedEmailSentAt: s.abandonedEmailSentAt || null,
        } : null;
        return { ...v, journey, contact };
      }),
    });
  } catch (err) {
    console.error('Visitors fetch failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
