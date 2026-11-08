import crypto from 'crypto';
import { recordExposure, recordExperimentStep } from './experimentsStore';

export const WALLET_TEST = 'shop_pay_checkout_v1';
const TTL = String(60 * 60 * 24 * 120);
async function redis(command) {
  const res = await fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: {
    Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error('Experiment storage unavailable.');
  return data.result;
}

export const walletVariant = visitorId => crypto.createHash('sha256').update(`${WALLET_TEST}:${visitorId}`).digest()[0] < 128 ? 'control' : 'shop_pay';

export async function enrollWalletTest(visitorId, sessionId, device) {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(visitorId || '') || !/^[a-zA-Z0-9-]{8,120}$/.test(sessionId || '')) throw new Error('Invalid experiment enrollment.');
  const assigned = walletVariant(visitorId);
  const record = { variant: assigned, visitorId, device: device === 'mobile' ? 'mobile' : 'desktop' };
  const sessionKey = `exp:${WALLET_TEST}:session:${sessionId}`;
  await redis(['SET', sessionKey, JSON.stringify(record), 'EX', TTL, 'NX']);
  const existing = await redis(['GET', sessionKey]);
  const enrollment = typeof existing === 'string' ? JSON.parse(existing) : existing;
  await recordExposure(WALLET_TEST, enrollment.variant, enrollment.visitorId);
  await recordExperimentStep({ [WALLET_TEST]: enrollment.variant }, 'checkout_view', enrollment.visitorId);
  const hash = `exp:${WALLET_TEST}:${enrollment.variant}`;
  if (await redis(['SET', `exp:${WALLET_TEST}:device:${enrollment.visitorId}`, '1', 'EX', TTL, 'NX'])) {
    await redis(['HINCRBY', hash, `visitors_${enrollment.device}`, '1']);
  }
  return enrollment.variant;
}

// All payment methods, including the control arm, record their server-
// confirmed purchases here. Browser loss doesn't bias Shop Pay's results.
export async function recordWalletTestPurchase(sessionId, amount) {
  if (!sessionId) return;
  const raw = await redis(['GET', `exp:${WALLET_TEST}:session:${sessionId}`]);
  if (!raw) return;
  const { variant, visitorId, device } = typeof raw === 'string' ? JSON.parse(raw) : raw;
  await recordExperimentStep({ [WALLET_TEST]: variant }, 'purchased', visitorId, { subtotal: amount });
  if (await redis(['SET', `exp:${WALLET_TEST}:purchased-device:${visitorId}`, '1', 'EX', TTL, 'NX'])) {
    await redis(['HINCRBY', `exp:${WALLET_TEST}:${variant}`, `purchased_${device}`, '1']);
  }
}
