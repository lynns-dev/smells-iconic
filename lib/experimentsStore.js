// Server side of split tests (lib/experiments.js): per test and variant, how
// many visitors saw it and how many of them reached each cart/checkout step,
// plus purchase revenue. Each visitor is counted once per test per step.
// Hash per variant: `exp:<test>:<variant>` → { visitors, added, ..., purchased, revenue }.
import { EXPERIMENTS } from './experiments';
import { STEPS } from './cartFunnel';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const TTL = String(60 * 60 * 24 * 120);
const STEP_KEYS = STEPS.map(([k]) => k);

async function redis(command) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Redis command failed.');
  return data.result;
}

function valid(id, variant) {
  const exp = EXPERIMENTS[id];
  return Boolean(exp && !exp.winner && exp.variants.includes(variant));
}

async function once(key) {
  return Boolean(await redis(['SET', key, '1', 'EX', TTL, 'NX']));
}

export async function recordExposure(id, variant, visitorId) {
  if (!valid(id, variant) || !visitorId) return;
  if (await once(`exp:${id}:seen:visitors:${visitorId}`)) {
    await redis(['HINCRBY', `exp:${id}:${variant}`, 'visitors', '1']);
    await redis(['EXPIRE', `exp:${id}:${variant}`, TTL]);
  }
}

// A cart step for a visitor who has seen these tests ({ testId: variant }).
// Reaching a step also counts the steps before it, like the main funnel.
export async function recordExperimentStep(exps, kind, visitorId, detail = {}) {
  const stepIndex = STEP_KEYS.indexOf(kind);
  if (stepIndex < 0 || !visitorId || !exps || typeof exps !== 'object') return;
  for (const [id, variant] of Object.entries(exps).slice(0, 10)) {
    if (!valid(id, variant)) continue;
    const hash = `exp:${id}:${variant}`;
    for (const step of STEP_KEYS.slice(0, stepIndex + 1)) {
      if (await once(`exp:${id}:seen:${step}:${visitorId}`)) await redis(['HINCRBY', hash, step, '1']);
    }
    if (kind === 'purchased' && Number(detail.subtotal) > 0 && (await once(`exp:${id}:seen:revenue:${visitorId}`))) {
      await redis(['HINCRBYFLOAT', hash, 'revenue', String(Number(detail.subtotal).toFixed(2))]);
    }
  }
}

export async function getExperimentResults() {
  const out = [];
  for (const [id, exp] of Object.entries(EXPERIMENTS)) {
    const variants = [];
    for (const v of exp.variants) {
      const flat = (await redis(['HGETALL', `exp:${id}:${v}`])) || [];
      const h = {};
      for (let i = 0; i < flat.length; i += 2) h[flat[i]] = Number(flat[i + 1]) || 0;
      variants.push({ variant: v, ...h });
    }
    out.push({ id, name: exp.name, started: exp.started, winner: exp.winner || null, variants });
  }
  return out;
}
