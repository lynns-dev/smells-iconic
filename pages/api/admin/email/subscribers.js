import { getSubscribers, suppressByEmail } from '../../../../lib/subscribersStore';
import { engagementTier } from '../../../../lib/emailEngagement';

function toCsv(subscribers) {
  const header = ['email', 'status', 'tier', 'source', 'createdAt', 'confirmedAt', 'lastClickAt'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = subscribers.map((s) =>
    [s.email, s.status, engagementTier(s), s.source, s.createdAt || '', s.confirmedAt || '', s.lastClickAt || '']
      .map(escape)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const subscribers = await getSubscribers();

      if (req.query.format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
        return res.status(200).send(toCsv(subscribers));
      }

      const withTiers = subscribers.map((s) => ({ ...s, tier: engagementTier(s) }));
      return res.status(200).json({ subscribers: withTiers });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { email, action } = req.body || {};
    if (!email || action !== 'suppress') return res.status(400).json({ error: 'Invalid request.' });
    try {
      const subscriber = await suppressByEmail(email, 'manual');
      if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
      return res.status(200).json({ subscriber });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
