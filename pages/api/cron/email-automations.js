// Scans subscribers for automation steps that are due and sends them.
// Triggered by Vercel Cron (see vercel.json) or an external pinger — see
// the "Automations" section of DEPLOYMENT.md for why Vercel's Hobby plan
// (daily-only cron) may not be frequent enough and what to use instead.
//
// welcome_series steps are timed off confirmedAt (delayDays is relative
// to double-opt-in confirmation). sunset_winback steps are timed off
// lastActivityAt (last click) rather than opens, since Apple Mail Privacy
// Protection makes "opened" true for most of a list within seconds
// regardless of whether anyone looked — see lib/emailEngagement.js.
// abandoned_checkout/add_to_cart/order_received are timed off the
// tracking-pixel/webhook signals recorded in lib/subscribersStore.js.
//
// Also folds in this store's contact list first (lib/email/leadsSync.js),
// so a signup or order since the last run counts in this same run.
// This store has no abandoned_checkout flow here (lib/email/automationsStore.js):
// that email has its own every-minute cron (pages/api/cron/abandoned-checkout.js),
// so runAbandonedCheckout below finds no flow and sends nothing.

import { getAutomations } from '../../../lib/email/automationsStore';
import { getSubscribers, updateAutomationState, suppressByEmail } from '../../../lib/email/subscribersStore';
import { getSettings } from '../../../lib/email/settingsStore';
import { daysSinceActivity, WINBACK_AFTER_DAYS } from '../../../lib/email/emailEngagement';
import { prepareStepTemplate, sendFlowStep } from '../../../lib/email/automationSend';
import { syncStoreLeads } from '../../../lib/email/leadsSync';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// Cart emails for a cart or checkout older than this are skipped, not sent
// late — e.g. the backlog that built up while this cron couldn't run.
const CART_FLOW_MAX_AGE_MS = 7 * DAY_MS;

// When a cart-flow step is due: its delay after the trigger, but never
// sooner than the gap between it and the previous step after that one
// actually went out — so a step that went out late (or a backlog catching
// up) doesn't have the next step following it minutes later.
function cartStepDueAt(flow, state, startedAt) {
  const step = flow.steps[state.step];
  const dueAt = startedAt + step.delayHours * HOUR_MS;
  const prev = flow.steps[state.step - 1];
  if (!prev || !state.sentAt) return dueAt;
  return Math.max(dueAt, state.sentAt + (step.delayHours - prev.delayHours) * HOUR_MS);
}

// One subscriber's failed send (a bad address Resend rejects, say) is
// logged and skipped instead of failing the whole run, which used to leave
// everyone after them waiting on the same failure every 15 minutes.
async function trySend(flowId, email, send) {
  try {
    await send();
    return true;
  } catch (err) {
    console.error(`Automation ${flowId} send to ${email} failed:`, err.message);
    return false;
  }
}

// A single cron run processes many subscribers who can be at different
// steps of the same flow, but a step's content (and therefore its
// click-tracking link targets) doesn't vary per recipient — so each
// step's template is only wrapped/persisted once per run, the first time
// it's actually needed, not once per subscriber (once per A/B variant
// when a test is running).
function makeStepTemplateCache(flow, settings) {
  const cache = new Map();
  return async function getTemplate(stepIndex, variant = 'a') {
    const key = `${stepIndex}:${variant}`;
    if (cache.has(key)) return cache.get(key);
    const template = await prepareStepTemplate(flow.id, flow.steps[stepIndex], stepIndex, settings, variant);
    cache.set(key, template);
    return template;
  };
}

async function runWelcomeSeries(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();
  const getTemplate = makeStepTemplateCache(flow, settings);

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.confirmedAt) continue;
    const state = sub.automationState?.welcome_series || { step: 0 };
    if (state.step >= flow.steps.length) continue;

    const step = flow.steps[state.step];
    const dueAt = sub.confirmedAt + step.delayDays * DAY_MS;
    if (now < dueAt) continue;

    // A follow-up meant only for people who haven't bought yet.
    if (step.skipIfOrdered && sub.lastOrderAt && sub.lastOrderAt >= sub.confirmedAt) {
      await updateAutomationState(sub.email, 'welcome_series', { step: state.step + 1 });
      continue;
    }

    await sendFlowStep(flow, state.step, sub, getTemplate);
    await updateAutomationState(sub.email, 'welcome_series', { step: state.step + 1 });
    sent += 1;
  }
  return sent;
}

async function runSunsetWinback(flow, subscribers, settings) {
  if (!flow.enabled) return { sent: 0, suppressed: 0 };
  let sent = 0;
  let suppressed = 0;
  const getTemplate = makeStepTemplateCache(flow, settings);

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed') continue;
    const idleDays = daysSinceActivity(sub);
    const state = sub.automationState?.sunset_winback || { step: 0 };

    // Re-engaged since the win-back email went out — reset so a future
    // idle stretch gets its own fresh cycle instead of skipping straight
    // to suppression.
    if (idleDays < WINBACK_AFTER_DAYS && state.step > 0) {
      await updateAutomationState(sub.email, 'sunset_winback', { step: 0 });
      continue;
    }

    if (state.step >= flow.steps.length) continue;
    const step = flow.steps[state.step];
    if (idleDays < step.delayDays) continue;

    if (step.subject) {
      await sendFlowStep(flow, state.step, sub, getTemplate);
      sent += 1;
    } else {
      await suppressByEmail(sub.email, 'sunset');
      suppressed += 1;
    }
    await updateAutomationState(sub.email, 'sunset_winback', { step: state.step + 1 });
  }
  return { sent, suppressed };
}

// checkoutStartedAt is cleared to null by subscribersStore.touchLastOrder
// the moment an order comes in (via the orders/create Shopify webhook),
// so a converted checkout naturally falls out of the `if
// (!sub.checkoutStartedAt) continue` guard below without any extra
// bookkeeping here.
async function runAbandonedCheckout(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();
  const getTemplate = makeStepTemplateCache(flow, settings);

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.checkoutStartedAt) continue;
    const state = sub.automationState?.abandoned_checkout || { step: 0 };
    if (state.step >= flow.steps.length) continue;
    if (now - sub.checkoutStartedAt > CART_FLOW_MAX_AGE_MS) continue;

    const step = flow.steps[state.step];
    if (now < cartStepDueAt(flow, state, sub.checkoutStartedAt)) continue;

    const ok = await trySend(flow.id, sub.email, async () => {
      await sendFlowStep(flow, state.step, sub, getTemplate);
      await updateAutomationState(sub.email, 'abandoned_checkout', { step: state.step + 1, sentAt: Date.now() });
    });
    if (ok) sent += 1;
  }
  return sent;
}

// Fires for cart activity that never reached checkout — a softer signal
// than abandoned_checkout, so it's superseded (not just skipped) the
// moment they do start a checkout; see subscribersStore.recordCheckoutStarted.
async function runAddToCart(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();
  const getTemplate = makeStepTemplateCache(flow, settings);

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.cartUpdatedAt || !(sub.cartItems || []).length) continue;
    const state = sub.automationState?.add_to_cart || { step: 0 };
    if (state.step >= flow.steps.length) continue;
    if (now - sub.cartUpdatedAt > CART_FLOW_MAX_AGE_MS) continue;

    const step = flow.steps[state.step];
    if (now < cartStepDueAt(flow, state, sub.cartUpdatedAt)) continue;

    const ok = await trySend(flow.id, sub.email, async () => {
      await sendFlowStep(flow, state.step, sub, getTemplate);
      await updateAutomationState(sub.email, 'add_to_cart', { step: state.step + 1, sentAt: Date.now() });
    });
    if (ok) sent += 1;
  }
  return sent;
}

// Not a transactional receipt (Shopify sends that) — a marketing-toned
// thank-you + later review/repeat-purchase nudge, timed off lastOrderAt.
// subscribersStore.touchLastOrder resets this to step 0 on every new
// order, so a repeat customer gets a fresh cycle each time.
async function runOrderReceived(flow, subscribers, settings) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();
  const getTemplate = makeStepTemplateCache(flow, settings);

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.lastOrderAt) continue;
    const state = sub.automationState?.order_received || { step: 0 };
    if (state.step >= flow.steps.length) continue;

    const step = flow.steps[state.step];
    const dueAt = sub.lastOrderAt + step.delayHours * HOUR_MS;
    if (now < dueAt) continue;

    await sendFlowStep(flow, state.step, sub, getTemplate);
    await updateAutomationState(sub.email, 'order_received', { step: state.step + 1 });
    sent += 1;
  }
  return sent;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  // Without CRON_SECRET, Vercel Cron's calls can't be told apart from
  // anyone else's, so nothing runs — say so in the logs (and admin → Email
  // shows a warning) rather than failing silently, which is how abandoned
  // checkout showed "on" while sending nothing.
  if (!secret) {
    console.error('Email automations: CRON_SECRET is not set — refusing to run. No automation emails are being sent.');
    return res.status(500).json({ error: 'CRON_SECRET is not set.' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  // Best-effort — a lead-sync failure is reported back but shouldn't
  // block the rest of this cron run.
  let leadsSynced = null;
  try {
    leadsSynced = await syncStoreLeads();
  } catch (err) {
    leadsSynced = { error: err.message };
  }

  try {
    const [automations, subscribers, settings] = await Promise.all([getAutomations(), getSubscribers(), getSettings()]);
    const byId = (id) => automations.find((a) => a.id === id);

    const welcomeSent = await runWelcomeSeries(byId('welcome_series') || { enabled: false }, subscribers, settings);
    const sunsetResult = await runSunsetWinback(byId('sunset_winback') || { enabled: false }, subscribers, settings);
    const abandonedCheckoutSent = await runAbandonedCheckout(byId('abandoned_checkout') || { enabled: false }, subscribers, settings);
    const addToCartSent = await runAddToCart(byId('add_to_cart') || { enabled: false }, subscribers, settings);
    const orderReceivedSent = await runOrderReceived(byId('order_received') || { enabled: false }, subscribers, settings);

    return res.status(200).json({
      ok: true,
      leadsSynced,
      welcomeSent,
      abandonedCheckoutSent,
      addToCartSent,
      orderReceivedSent,
      ...sunsetResult,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
