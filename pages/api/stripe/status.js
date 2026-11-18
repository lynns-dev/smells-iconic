import { retrieveStripePurchase } from '../../../lib/stripeCheckout';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  try { const purchase = await retrieveStripePurchase(req.query.session_id, req); return res.status(200).json({ purchase }); }
  catch (e) { return res.status(503).json({ error: 'We are confirming your payment. Please wait; do not pay again.' }); }
}
