import { EXPERIMENTS } from './experiments';
import { recordExperimentStep, recordExposure } from './experimentsStore';
export const BABYGIRL_TEST = 'babygirl_scent_landing_v1';
const TTL = String(60 * 60 * 24 * 120);
async function redis(command) {
  const response = await fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Experiment storage unavailable.');
  return data.result;
}
export async function enrollBabygirlSession(variant, visitorId, sessionId) {
  const test = EXPERIMENTS[BABYGIRL_TEST];
  if (test.winner || !test.variants.includes(variant) || !/^[A-Za-z0-9_-]{6,100}$/.test(sessionId || '') || !/^[A-Za-z0-9_-]{6,100}$/.test(visitorId || '')) return;
  await redis(['SET', `exp:${BABYGIRL_TEST}:session:${sessionId}`, JSON.stringify({ variant, visitorId }), 'EX', TTL, 'NX']);
}
// Conversion is a server-confirmed paid order after exposure to the Babygirl
// page. Existing per-visitor idempotency counts one purchasing visitor once.
export async function recordBabygirlPurchase(sessionId, amount) {
  if (EXPERIMENTS[BABYGIRL_TEST].winner || !sessionId || !Number.isFinite(amount) || amount <= 0) return;
  const raw = await redis(['GET', `exp:${BABYGIRL_TEST}:session:${sessionId}`]);
  if (!raw) return;
  const { variant, visitorId } = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!EXPERIMENTS[BABYGIRL_TEST].variants.includes(variant)) return;
  await recordExposure(BABYGIRL_TEST, variant, visitorId);
  await recordExperimentStep({ [BABYGIRL_TEST]: variant }, 'purchased', visitorId, { subtotal: amount });
}
