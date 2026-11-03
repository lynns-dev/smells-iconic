// Admin's text-alert opt-ins (lib/email/smsStore.js): GET returns the list,
// or a CSV with ?format=csv for importing into an SMS provider.
import { getSmsSubscribers } from '../../../../lib/email/smsStore';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const list = await getSmsSubscribers();
    if (req.query.format === 'csv') {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['phone', 'email', 'status', 'source', 'consentAt', 'consentIp', 'consentText'];
      const rows = list.map((s) => header.map((k) => esc(s[k])).join(','));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="sms-subscribers.csv"');
      return res.status(200).send([header.join(','), ...rows].join('\n'));
    }
    return res.status(200).json({ subscribers: list });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
