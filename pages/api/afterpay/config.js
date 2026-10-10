// Public Afterpay settings for the checkout button (lib/afterpay.js):
// whether it's on, and the order-total range Afterpay will finance.
import { afterpayConfig, getOrderLimits } from '../../../lib/afterpay';

// afterpay.js (Afterpay's script, which also draws the Cash App Pay
// button) has a separate sandbox build.
const SCRIPT = {
  live: 'https://portal.afterpay.com/afterpay.js',
  sandbox: 'https://portal.sandbox.afterpay.com/afterpay.js',
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { enabled, sandbox } = afterpayConfig();
  if (!enabled) return res.status(200).json({ enabled: false });
  try {
    const { min, max } = await getOrderLimits();
    return res.status(200).json({ enabled: max > 0, min, max, script: sandbox ? SCRIPT.sandbox : SCRIPT.live });
  } catch (err) {
    console.error('Afterpay config error:', err.message);
    return res.status(200).json({ enabled: false });
  }
}
