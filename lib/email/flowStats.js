// Per-step send/open/click counters for every automation email — the
// flows in lib/email/automationsStore.js and the abandoned-checkout email
// (lib/abandonedCheckout.js, flowId 'abandoned_checkout', step 0).
//
// Why this exists: the old counters lived inside the step objects of the
// one big `email_automations` JSON blob, bumped by read-modify-write. Any
// two writers racing (a click landing mid-cron, a second click, or the
// admin's "Save changes" posting the steps it loaded an hour earlier)
// silently overwrote each other, so clicks disappeared. These counters are
// Redis hashes bumped with HINCRBY, which is atomic: nothing can clobber them.
//
// Key: flow_stats:<flowId>:<stepIndex> (hash). Fields:
//   sent, opened, clicks, clickers        — the step overall
//   t:<testId>:<a|b>:<same metric>        — one A/B test's split
// opened / clickers are unique per send (claimed with SET NX on the
// sendId), clicks counts every click.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const UNIQUE_TTL_SECONDS = 180 * 24 * 60 * 60;

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
}

async function pipeline(commands) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data)) throw new Error('KV pipeline failed.');
  return data.map((r) => r.result);
}

export const statsKey = (flowId, stepIndex) => `flow_stats:${flowId}:${stepIndex}`;

// test: { testId, variant } while an A/B test is running on the step, else null.
export async function bumpFlowStat(flowId, stepIndex, metric, test = null, by = 1) {
  const key = statsKey(flowId, stepIndex);
  const cmds = [['HINCRBY', key, metric, String(by)]];
  if (test?.testId && (test.variant === 'a' || test.variant === 'b')) {
    cmds.push(['HINCRBY', key, `t:${test.testId}:${test.variant}:${metric}`, String(by)]);
  }
  await pipeline(cmds);
}

// True the first time it's called for (kind, sendId) — used so a reopened
// email or a second click doesn't count as another unique open/clicker.
export async function claimFirst(kind, sendId) {
  const [result] = await pipeline([['SET', `email_${kind}:${sendId}`, '1', 'NX', 'EX', String(UNIQUE_TTL_SECONDS)]]);
  return result === 'OK';
}

const num = (v) => Number(v) || 0;
// Capped at 100: a forwarded email can be opened/clicked by more people than it was sent to.
const rate = (part, whole) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 1000) / 10) : 0);

function summarize(fields, prefix = '') {
  const sent = num(fields[`${prefix}sent`]);
  const opened = num(fields[`${prefix}opened`]);
  const clickers = num(fields[`${prefix}clickers`]);
  return {
    sent,
    opened,
    clicks: num(fields[`${prefix}clicks`]),
    clickers,
    openRate: rate(opened, sent),
    clickRate: rate(clickers, sent),
    clickToOpenRate: rate(clickers, opened),
  };
}

// Reads many steps in one round trip. steps: [{ flowId, stepIndex }].
// Returns a Map keyed `${flowId}:${stepIndex}` -> { ...summary, tests: { [testId]: { a, b } } }.
export async function getFlowStats(steps) {
  if (!steps.length) return new Map();
  const results = await pipeline(steps.map(({ flowId, stepIndex }) => ['HGETALL', statsKey(flowId, stepIndex)]));
  const out = new Map();
  steps.forEach(({ flowId, stepIndex }, i) => {
    // Upstash returns HGETALL as a flat [field, value, field, value] array.
    const flat = results[i] || [];
    const fields = {};
    for (let j = 0; j < flat.length; j += 2) fields[flat[j]] = flat[j + 1];
    const tests = {};
    for (const field of Object.keys(fields)) {
      const m = /^t:([^:]+):([ab]):/.exec(field);
      if (m && !tests[m[1]]) {
        tests[m[1]] = { a: summarize(fields, `t:${m[1]}:a:`), b: summarize(fields, `t:${m[1]}:b:`) };
      }
    }
    out.set(`${flowId}:${stepIndex}`, { ...summarize(fields), tests });
  });
  return out;
}

// Two-proportion z-test on click rate (unique clickers / sent) — how sure
// we can be that the leading variant is really better and not just noise.
// Returns { leader: 'a'|'b'|null, confidence: 0-99.9 }.
export function abConfidence(a, b) {
  if (!a?.sent || !b?.sent) return { leader: null, confidence: 0 };
  const pa = a.clickers / a.sent;
  const pb = b.clickers / b.sent;
  if (pa === pb) return { leader: null, confidence: 0 };
  const pooled = (a.clickers + b.clickers) / (a.sent + b.sent);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / a.sent + 1 / b.sent));
  if (!se) return { leader: pa > pb ? 'a' : 'b', confidence: 0 };
  const z = Math.abs(pa - pb) / se;
  // Normal CDF via the Abramowitz–Stegun erf approximation.
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  const twoSided = erf; // P(|Z| < z)
  return { leader: pa > pb ? 'a' : 'b', confidence: Math.min(99.9, Math.round(twoSided * 1000) / 10) };
}

// The 1×1 open-tracking pixel. Apple Mail Privacy Protection preloads
// images for every Apple Mail user, so open rate reads high — use it to
// spot deliverability trouble (a flow far below the others is landing in
// spam) and compare subject lines; judge content on click rate.
export function openPixelTag(url) {
  return `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
}

export function appendBeforeBodyClose(html, snippet) {
  const idx = html.toLowerCase().lastIndexOf('</body>');
  return idx === -1 ? `${html}${snippet}` : `${html.slice(0, idx)}${snippet}${html.slice(idx)}`;
}
