import { EXPERIMENTS } from './experiments';
import { STEPS } from './cartFunnel';
const TTL = String(60 * 60 * 24 * 120);
const ID_RE = /^[A-Za-z0-9_-]{6,100}$/;
const eligible = (id, variant) => {
  const test = EXPERIMENTS[id];
  return Boolean(id !== 'pdp_offer_20261122' && test && !test.winner && !['draft', 'completed', 'ended', 'paused'].includes(test.status) && test.variants.includes(variant));
};
async function redis(command) {
  const response = await fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Experiment storage unavailable');
  return data.result;
}
// Freeze only valid, actually exposed browser assignments in the server's
// canonical pending order. Payment completion never reads current browser state.
export function snapshotExperimentAttribution(exps, visitorId, device) {
  if (!ID_RE.test(visitorId || '') || !exps || typeof exps !== 'object' || Array.isArray(exps)) return null;
  const assignments = Object.fromEntries(Object.entries(exps).filter(([id, variant]) => eligible(id, variant)).slice(0, 10));
  return Object.keys(assignments).length ? { visitorId, assignments, device: device === 'mobile' ? 'mobile' : device === 'desktop' ? 'desktop' : null } : null;
}
// Use the existing visitor/step/revenue keys so historical counts, the old
// success-page event and concurrent webhook/return retries cannot double count.
export const PURCHASE_LUA = `
local ttl = ARGV[1]
local amount = ARGV[2]
local steps = cjson.decode(ARGV[3])
local prefix = KEYS[1] .. ':seen:'
local visitor = ARGV[4]
local hash = KEYS[2]
if redis.call('SET', prefix .. 'visitors:' .. visitor, '1', 'NX', 'EX', ttl) then
  redis.call('HINCRBY', hash, 'visitors', 1)
end
for _, step in ipairs(steps) do
  if redis.call('SET', prefix .. step .. ':' .. visitor, '1', 'NX', 'EX', ttl) then
    redis.call('HINCRBY', hash, step, 1)
  end
end
if redis.call('SET', prefix .. 'revenue:' .. visitor, '1', 'NX', 'EX', ttl) then
  redis.call('HINCRBYFLOAT', hash, 'revenue', amount)
end
if ARGV[5] ~= '' then
  if redis.call('SET', KEYS[1] .. ':device:' .. visitor, '1', 'NX', 'EX', ttl) then
    redis.call('HINCRBY', hash, 'visitors_' .. ARGV[5], 1)
  end
  if redis.call('SET', KEYS[1] .. ':purchased-device:' .. visitor, '1', 'NX', 'EX', ttl) then
    redis.call('HINCRBY', hash, 'purchased_' .. ARGV[5], 1)
  end
end
redis.call('EXPIRE', hash, ttl)
return 1`;
async function attributionsFor(pending) {
  if (pending.experimentTrackingExcluded) return [];
  const out = [];
  const saved = pending.experimentAttribution;
  const snapshot = saved && snapshotExperimentAttribution(saved.assignments, saved.visitorId, saved.device);
  if (snapshot) {
    // The wallet experiment used a separate visitor identity and server
    // enrollment. Never substitute the cart identity for that enrollment.
    delete snapshot.assignments.shop_pay_checkout_v1;
    out.push(snapshot);
  }
  // Recover existing server enrollments, including sessions already in flight
  // at rollout. Unknown tests or unseen visitors never receive a guessed arm.
  if (!ID_RE.test(pending.sessionId || '')) return out;
  for (const id of ['babygirl_scent_landing_v1', 'shop_pay_checkout_v1']) {
    if (!EXPERIMENTS[id] || EXPERIMENTS[id].winner || out.some(a => a.assignments[id])) continue;
    const raw = await redis(['GET', `exp:${id}:session:${pending.sessionId}`]);
    if (!raw) continue;
    const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const attribution = snapshotExperimentAttribution({ [id]: record.variant }, record.visitorId, record.device);
    if (attribution) out.push(attribution);
  }
  return out;
}
// Called only AFTER Stripe paid/mode/amount/store checks and durable order
// readback. A storage error leaves Stripe confirmation retryable, never paid twice.
export async function recordStripeExperimentPurchase(pending) {
  const amount = Number(pending.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;
  await recordProductOfferPurchase(pending);
  const attributions = await attributionsFor(pending);
  if (!attributions.length) return;
  const steps = STEPS.map(([step]) => step);
  const purchased = steps.indexOf('purchased');
  if (purchased < 0) throw new Error('Purchase metric is not configured');
  for (const attribution of attributions) for (const [id, variant] of Object.entries(attribution.assignments)) {
    await redis(['EVAL', PURCHASE_LUA, '2', `exp:${id}`, `exp:${id}:${variant}`, TTL, amount.toFixed(2), JSON.stringify(steps.slice(0, purchased + 1)), attribution.visitorId, id === 'shop_pay_checkout_v1' ? (attribution.device || '') : '']);
  }
}

// Only canonical, server-priced paid orders reach this entry point. Each order
// contributes once, while purchasing visitors remain unique across repeat orders.
export const OFFER_PURCHASE_LUA = `
local hash = KEYS[1]
if redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[1]) then
 if redis.call('SET', KEYS[4], '1', 'NX', 'EX', ARGV[1]) then
  redis.call('HINCRBY', hash, 'visitors', 1)
 end
 redis.call('HINCRBY', hash, 'orders', 1)
 redis.call('HINCRBY', hash, 'units', ARGV[3])
 redis.call('HINCRBYFLOAT', hash, 'order_revenue', ARGV[2])
 if ARGV[4] ~= '' then
  redis.call('HINCRBYFLOAT', hash, 'contribution', ARGV[4])
  redis.call('HINCRBY', hash, 'costed_orders', 1)
 else
  redis.call('HINCRBY', hash, 'uncosted_orders', 1)
 end
 if redis.call('SET', KEYS[3], '1', 'NX', 'EX', ARGV[1]) then
  redis.call('HINCRBY', hash, 'purchased', 1)
 end
 redis.call('EXPIRE', hash, ARGV[1])
end
return 1`;
export async function recordProductOfferPurchase(pending) {
 const a=pending.offerExperiment;
 if(pending.experimentTrackingExcluded || !a || !['control','mix_match','gift_75'].includes(a.variant) || !ID_RE.test(a.visitorId || '') || !pending.stripeSessionId) return;
 const id='pdp_offer_20261122';
 await redis(['EVAL',OFFER_PURCHASE_LUA,'4',`exp:${id}:${a.variant}`,`exp:${id}:order:${pending.stripeSessionId}`,`exp:${id}:seen:purchased:${a.visitorId}`,`exp:${id}:seen:visitors:${a.visitorId}`,TTL,Number(pending.amount).toFixed(2),String(a.units),a.costKnown ? Number(a.contribution).toFixed(2) : '']);
}
