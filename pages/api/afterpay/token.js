// The Afterpay checkout token for a pending order, for the Cash App Pay
// return page (pages/afterpay/return.jsx): on a phone the shopper comes
// back from the Cash App app, possibly in a different browser tab, and
// afterpay.js needs the token again to report the result. A token alone
// can't move money — capturing it needs this store's secret key.
import { afterpayConfig, loadPending } from '../../../lib/afterpay';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!afterpayConfig().enabled) return res.status(404).json({ error: 'Afterpay is not available.' });
  const pending = await loadPending(req.query.ref).catch(() => null);
  if (!pending?.token) return res.status(404).json({ error: 'This checkout has expired. Please start again.' });
  return res.status(200).json({ token: pending.token });
}
