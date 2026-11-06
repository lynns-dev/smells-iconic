// Send + recovery numbers for the abandoned-checkout email (lib/abandonedCheckout.js),
// which runs on its own cron outside the email flows, so the Email tab's
// totals can include it. "Recovered" = the same email address placed an
// order within 7 days after the email went out.
import { getSubscribers } from './subscribersStore';
import { getOrders, dateKeysForRange } from './analyticsStore';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export async function getAbandonedStats() {
  const [contacts, orders] = await Promise.all([
    getSubscribers(),
    Promise.all(dateKeysForRange('45d').map((k) => getOrders(k).catch(() => []))).then((d) => d.flat()),
  ]);
  const ordersByEmail = new Map();
  for (const o of orders) {
    const e = String(o.email || '').trim().toLowerCase();
    if (!e) continue;
    if (!ordersByEmail.has(e)) ordersByEmail.set(e, []);
    ordersByEmail.get(e).push({ at: Date.parse(o.createdAt), amount: Number(o.amount) || 0, id: o.id });
  }
  const since = Date.now() - WEEK_MS;
  const out = { sentTotal: 0, sent7d: 0, lastSentAt: null, recovered: 0, recoveredRevenue: 0 };
  const counted = new Set();
  for (const c of contacts) {
    const email = String(c.email || '').trim().toLowerCase();
    for (const e of c.automationsSent || []) {
      if (!/abandoned/i.test(e.flow || '')) continue;
      const at = Date.parse(e.sentAt);
      out.sentTotal += 1;
      if (at >= since) out.sent7d += 1;
      if (!out.lastSentAt || at > Date.parse(out.lastSentAt)) out.lastSentAt = e.sentAt;
      const hit = (ordersByEmail.get(email) || []).find((o) => o.at > at && o.at <= at + WEEK_MS && !counted.has(o.id));
      if (hit) {
        counted.add(hit.id);
        out.recovered += 1;
        out.recoveredRevenue += hit.amount;
      }
    }
  }
  out.recoveredRevenue = Math.round(out.recoveredRevenue * 100) / 100;
  out.recoveryRate = out.sentTotal ? Math.round((out.recovered / out.sentTotal) * 1000) / 10 : 0;
  return out;
}
