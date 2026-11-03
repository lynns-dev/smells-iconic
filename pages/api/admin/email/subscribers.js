import { getSubscribers, suppressByEmail, addSubscriberManually } from '../../../../lib/email/subscribersStore';
import { engagementTier } from '../../../../lib/email/emailEngagement';
import { computeGrade, gradeSummary } from '../../../../lib/email/listGrading';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toCsv(subscribers) {
  const header = ['email', 'status', 'tier', 'grade', 'source', 'createdAt', 'confirmedAt', 'lastClickAt', 'ordersCount', 'totalSpent'];
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = subscribers.map((s) =>
    [s.email, s.status, engagementTier(s), computeGrade(s).grade, s.source, s.createdAt || '', s.confirmedAt || '', s.lastClickAt || '', s.ordersCount || '', s.totalSpent || '']
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

      const withTiers = subscribers.map((s) => ({ ...s, tier: engagementTier(s), grade: computeGrade(s).grade }));
      return res.status(200).json({ subscribers: withTiers, gradeSummary: gradeSummary(subscribers) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { email, action } = req.body || {};

    if (action === 'add') {
      if (!email || !EMAIL_RE.test(String(email).trim())) {
        return res.status(400).json({ error: 'Enter a valid email address.' });
      }
      try {
        const subscriber = await addSubscriberManually(email);
        return res.status(200).json({ subscriber });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    if (action === 'suppress') {
      if (!email) return res.status(400).json({ error: 'Invalid request.' });
      try {
        const subscriber = await suppressByEmail(email, 'manual');
        if (!subscriber) return res.status(404).json({ error: 'Subscriber not found.' });
        return res.status(200).json({ subscriber });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Invalid request.' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
