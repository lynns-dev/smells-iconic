import crypto from 'crypto';
import { OFFER_TEST, OFFER_END, OFFER_VARIANTS, offerActive } from './productOffer';
const secret = () => process.env.STRIPE_WEBHOOK_SECRET;
const sign = value => { if (!secret()) throw new Error('Offer assignment unavailable'); return crypto.createHmac('sha256', secret()).update(`${OFFER_TEST}:${value}`).digest('base64url'); };
export function issueOffer(visitorId) {
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(visitorId || '') || !offerActive()) return null;
  const variant = OFFER_VARIANTS[parseInt(crypto.createHmac('sha256', secret()).update(`${OFFER_TEST}:arm:${visitorId}`).digest('hex').slice(0,8),16) % 3];
  const payload = Buffer.from(JSON.stringify({visitorId,variant,endsAt:OFFER_END})).toString('base64url');
  return { variant, token: `${payload}.${sign(payload)}`, endsAt: OFFER_END };
}
export function verifyOffer(token, { allowExpired = false } = {}) {
  try {
    if (typeof token !== 'string' || token.length > 700 || (!allowExpired && !offerActive())) return null;
    const [payload, signature, extra] = token.split('.');
    const expected = sign(payload);
    if (extra || signature?.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return null;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString());
    return data.endsAt===OFFER_END && OFFER_VARIANTS.includes(data.variant) && /^[A-Za-z0-9_-]{6,100}$/.test(data.visitorId || '') ? data : null;
  } catch { return null; }
}
