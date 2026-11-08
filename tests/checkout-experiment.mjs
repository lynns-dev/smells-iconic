import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis-mock';
const redis = new Redis();
globalThis.fetch = async (_url, init) => {
  const [command, ...args] = JSON.parse(init.body);
  try { let result = await redis[command.toLowerCase()](...args); if (command === 'HGETALL') result = Object.entries(result).flat(); return { ok: true, json: async () => ({ result }) }; }
  catch (err) { return { ok: false, json: async () => ({ error: err.message }) }; }
};
const source = await readFile(new URL('../lib/checkoutExperimentStore.js', import.meta.url), 'utf8');
const { checkoutVariant, enrollCheckout, recordCheckoutOutcome, getCheckoutResults } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const variants = Array.from({ length: 10000 }, (_, i) => checkoutVariant(`visitor-${i}`));
const control = variants.filter(v => v === 'control').length;
assert.ok(control > 4800 && control < 5200, `Unexpected allocation ${control}`);
const variant = await enrollCheckout('visitor-1', 'session-1');
assert.equal(await enrollCheckout('visitor-1', 'session-1'), variant);
assert.equal(await enrollCheckout('visitor-1', 'session-2'), variant);
await recordCheckoutOutcome('unknown', 'purchased', 'fake-order', 99);
await recordCheckoutOutcome('session-1', 'pay_failed');
await recordCheckoutOutcome('session-1', 'pay_failed');
await recordCheckoutOutcome('session-1', 'purchased', 'order-1', 45);
await recordCheckoutOutcome('session-1', 'purchased', 'order-1', 45);
await recordCheckoutOutcome('session-1', 'purchased', 'order-2', 55);
await recordCheckoutOutcome('session-2', 'purchased', 'invalid', -1);
const result = (await getCheckoutResults()).variants.find(v => v.variant === variant);
assert.deepEqual(result, { variant, visitors: 2, pay_failed: 1, purchased: 1, orders: 2, revenue: 100 });
console.log(`PASS: stable allocation (${control}/10000 control), session enrollment, Lua counters, unknown sessions, payment failures, duplicate purchases, repeat-order revenue, invalid amounts.`);
redis.disconnect();
