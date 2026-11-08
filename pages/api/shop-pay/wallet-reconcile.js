import { reconcilePending } from '../../../lib/shopPayWallet';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  try { return res.status(200).json({ results: await reconcilePending() }); }
  catch (err) { console.error('Shop Pay reconciliation failed:', err.message); return res.status(500).json({ error: 'Reconciliation failed' }); }
}
