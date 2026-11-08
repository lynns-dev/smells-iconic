import { createHash } from 'node:crypto';

export const CHECKOUT_TEST = 'checkout_single_page_v1';
const PREFIX = `exp:${CHECKOUT_TEST}`;
const TTL = 60 * 60 * 24 * 120;
export const checkoutVariant = (visitorId) => createHash('sha256').update(`${CHECKOUT_TEST}:${visitorId}`).digest()[0] < 128 ? 'control' : 'single_page';

async function redis(command) {
  const response = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Experiment storage unavailable');
  return data.result;
}

// Atomic enrollment and counters: retries, reloads, and concurrent requests
// cannot count a checkout twice. Assignment stays stable across tab sessions.
export async function enrollCheckout(visitorId, sessionId) {
  const variant = checkoutVariant(visitorId);
  return redis(['EVAL', `
    local existing = redis.call('GET', KEYS[1])
    if existing then return existing end
    redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
    redis.call('HINCRBY', KEYS[2], 'visitors', 1)
    redis.call('EXPIRE', KEYS[2], ARGV[2])
    return ARGV[1]`, '2', `${PREFIX}:session:${sessionId}`, `${PREFIX}:${variant}`, variant, String(TTL)]);
}

export async function recordCheckoutOutcome(sessionId, kind, orderId = '', amount = 0) {
  if (!sessionId || !['purchased', 'pay_failed'].includes(kind)) return;
  const variant = await redis(['GET', `${PREFIX}:session:${sessionId}`]);
  if (!['control', 'single_page'].includes(variant)) return;
  if (kind === 'purchased' && (!orderId || !Number.isFinite(amount) || amount <= 0)) return;
  await redis(['EVAL', `
    if redis.call('SET', KEYS[2], '1', 'NX', 'EX', ARGV[1]) then
      redis.call('HINCRBY', KEYS[1], ARGV[2], 1)
    end
    if ARGV[2] == 'purchased' and redis.call('SET', KEYS[3], '1', 'NX', 'EX', ARGV[1]) then
      redis.call('HINCRBY', KEYS[1], 'orders', 1)
      redis.call('HINCRBYFLOAT', KEYS[1], 'revenue', ARGV[3])
    end
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    return 1`, '3', `${PREFIX}:${variant}`, `${PREFIX}:${kind}:${sessionId}`, `${PREFIX}:order:${orderId}`, String(TTL), kind, String(amount)]);
}

export async function getCheckoutResults() {
  const variants = await Promise.all(['control', 'single_page'].map(async (variant) => {
    const flat = await redis(['HGETALL', `${PREFIX}:${variant}`]);
    const counters = {};
    for (let i = 0; i < (flat || []).length; i += 2) counters[flat[i]] = Number(flat[i + 1]) || 0;
    return { variant, ...counters };
  }));
  return { id: CHECKOUT_TEST, name: 'Checkout: two steps vs single page', started: '2026-11-07', checkout: true, variants };
}
