// Admin's Subscribers tab: the contact list (lib/subscribersStore.js) with
// each person's orders matched by email, so the tab can show customers vs.
// abandoned checkouts vs. newsletter-only. POST toggles email consent.
import { getSubscribers, setSubscriberConsent } from '../../../lib/subscribersStore';
import { getOrders, dateKeysForRange } from '../../../lib/analyticsStore';

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const { key, consent } = req.body || {};
      if (!key) return res.status(400).json({ error: 'Missing subscriber' });
      const updated = await setSubscriberConsent(key, consent);
      if (!updated) return res.status(404).json({ error: 'Subscriber not found' });
      return res.status(200).json({ subscriber: updated });
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const [subscribers, perDay] = await Promise.all([
      getSubscribers(),
      Promise.all(dateKeysForRange('45d').map((key) => getOrders(key))),
    ]);
    const byEmail = {};
    for (const o of perDay.flat()) {
      const e = String(o.email || '').trim().toLowerCase();
      if (!e || ['refunded', 'cancelled'].includes(o.status)) continue;
      const entry = byEmail[e] || (byEmail[e] = { count: 0, spent: 0, lastOrderAt: null });
      entry.count += 1;
      entry.spent += Number(o.amount || 0);
      if (!entry.lastOrderAt || o.createdAt > entry.lastOrderAt) entry.lastOrderAt = o.createdAt;
    }
    const list = subscribers
      .map((s) => ({ ...s, orders: (s.email && byEmail[s.email]) || null }))
      .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
    return res.status(200).json({ subscribers: list });
  } catch (err) {
    console.error('Subscribers fetch failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
