// Hit on a schedule by Vercel Cron (see vercel.json). Not under /api/admin
// so it isn't gated by the admin session cookie — instead it checks
// CRON_SECRET, which Vercel sends automatically as a bearer token for its
// own cron invocations.

import { runModerationPass } from '../../../lib/adCommentsModerator';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.secret;
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  try {
    const result = await runModerationPass();
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
