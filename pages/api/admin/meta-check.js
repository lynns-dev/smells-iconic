// Admin's "Check Meta connection" button (lib/metaCapi.js checkMetaConnection).
// Behind the admin session check in middleware.js like every /api/admin route.
import { checkMetaConnection } from '../../../lib/metaCapi';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(await checkMetaConnection());
}
