// One pass of the automated texts (lib/sms/smsAutomations.js), run by
// pages/api/cron/sms-automations.js. Stops at the first "out of credits"
// error instead of trying everyone else.
import { getSmsSubscribers, normalizeUsPhone } from '../email/smsStore';
import { getSubscribers as getContacts } from '../subscribersStore';
import { getOrders, dateKeysForRange } from '../analyticsStore';
import { getProductById } from '../products';
import { bumpFlowStat } from '../email/flowStats';
import { sendSms, smsConfigured } from './resendSms';
import { getSmsAutomations, inSendWindow, claimOnce, releaseClaim, createTrackedLink, fillMessage, logSmsEvent } from './smsAutomations';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WELCOME_MAX_AGE = 3 * DAY;
const CHECKOUT_MAX_AGE = DAY;
const ABANDONED_GAP_SECONDS = 3 * 24 * 60 * 60;
const MAX_PER_RUN = 200;

class OutOfCredits extends Error {}

async function textOne(flow, phone, message, lockKey, meta) {
  try {
    await sendSms(phone, message);
  } catch (err) {
    await releaseClaim(lockKey);
    if (/credit/i.test(err.message)) throw new OutOfCredits(err.message);
    console.error(`Text ${flow.id} to ${phone} failed:`, err.message);
    return false;
  }
  await bumpFlowStat(flow.id, 0, 'sent').catch(() => {});
  await logSmsEvent({ flow: flow.id, phone, ...meta }).catch(() => {});
  return true;
}

export async function runSmsAutomations({ now = Date.now(), ignoreWindow = false } = {}) {
  if (!smsConfigured()) return { skipped: 'RESENDSMS_API_KEY is not set' };
  const flows = await getSmsAutomations();
  const on = flows.filter((f) => f.enabled);
  if (!on.length) return { skipped: 'no text flows are on' };
  if (!ignoreWindow && !inSendWindow(new Date(now))) return { skipped: 'outside 11am–8pm ET send window' };

  const subs = (await getSmsSubscribers()).filter((s) => s.status === 'subscribed' && s.consentAt);
  const result = { welcome: 0, abandoned: 0, failed: 0 };
  let budget = MAX_PER_RUN;

  try {
    const welcome = on.find((f) => f.id === 'sms_welcome');
    if (welcome) {
      for (const s of subs) {
        if (budget <= 0) break;
        const at = Date.parse(s.consentAt);
        if (now - at > WELCOME_MAX_AGE || now - at < (welcome.delayMinutes || 0) * MIN) continue;
        const lock = `sms_sent:sms_welcome:${s.phone}`;
        if (!(await claimOnce(lock, 365 * 24 * 60 * 60))) continue;
        const link = await createTrackedLink(welcome.id, `${welcome.link}?utm_source=sms&utm_medium=sms&utm_campaign=welcome`);
        budget -= 1;
        (await textOne(welcome, s.phone, fillMessage(welcome.message, { link: link.url }), lock, {})) ? result.welcome++ : result.failed++;
      }
    }

    const abandoned = on.find((f) => f.id === 'sms_abandoned_checkout');
    if (abandoned && budget > 0) {
      const [contacts, orders] = await Promise.all([
        getContacts(),
        Promise.all(dateKeysForRange('7d').slice(0, 2).map((k) => getOrders(k).catch(() => []))).then((d) => d.flat()),
      ]);
      const byPhone = new Map();
      const byEmail = new Map();
      for (const c of contacts) {
        const p = normalizeUsPhone(c.phone);
        if (p && (!byPhone.has(p) || (c.lastCheckoutAt || '') > (byPhone.get(p).lastCheckoutAt || ''))) byPhone.set(p, c);
        if (c.email) byEmail.set(String(c.email).toLowerCase(), c);
      }
      const orderTimes = new Map();
      for (const o of orders) {
        for (const k of [String(o.email || '').toLowerCase(), normalizeUsPhone(o.phone || o.shipping?.phone)].filter(Boolean)) {
          orderTimes.set(k, Math.max(orderTimes.get(k) || 0, Date.parse(o.createdAt) || 0));
        }
      }

      for (const s of subs) {
        if (budget <= 0) break;
        const c = byPhone.get(s.phone) || (s.email && byEmail.get(String(s.email).toLowerCase()));
        if (!c?.lastCheckoutAt || !c.cart?.length) continue;
        const at = Date.parse(c.lastCheckoutAt);
        if (now - at < (abandoned.delayMinutes || 60) * MIN || now - at > CHECKOUT_MAX_AGE) continue;
        const ordered = [c.lastOrderAt && Date.parse(c.lastOrderAt), orderTimes.get(s.phone), c.email && orderTimes.get(String(c.email).toLowerCase())].filter(Boolean);
        // Same hour of slack as the abandoned-checkout email: a tab-close save can land just after the order.
        if (ordered.some((t) => t >= at - HOUR)) continue;
        if (!(await claimOnce(`sms_gap:abandoned:${s.phone}`, ABANDONED_GAP_SECONDS))) continue;
        const lock = `sms_sent:sms_abandoned_checkout:${s.phone}:${c.lastCheckoutAt}`;
        if (!(await claimOnce(lock, 7 * 24 * 60 * 60))) continue;
        const restore = c.cart.map((i) => `${i.id}:${i.quantity}`).join(',');
        const link = await createTrackedLink(abandoned.id, `/checkout?restore=${encodeURIComponent(restore)}&utm_source=sms&utm_medium=sms&utm_campaign=abandoned_checkout`);
        const product = getProductById(c.cart[0].id)?.name || c.cart[0].name;
        budget -= 1;
        const ok = await textOne(abandoned, s.phone, fillMessage(abandoned.message, { link: link.url, product }), lock, { checkoutAt: c.lastCheckoutAt });
        if (ok) result.abandoned++;
        else { result.failed++; await releaseClaim(`sms_gap:abandoned:${s.phone}`); }
      }
    }
  } catch (err) {
    if (err instanceof OutOfCredits) return { ...result, stopped: `Out of ResendSMS credits: ${err.message}` };
    throw err;
  }
  return result;
}
