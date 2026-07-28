import { getModerationLog } from '../../../lib/adCommentsStore';
import { runModerationPass } from '../../../lib/adCommentsModerator';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const log = await getModerationLog();
      return res.status(200).json({ log });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const result = await runModerationPass();
      return res.status(200).json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
