// Automation flow definitions, stored in the same KV store as everything
// else. Key: email_automations -> JSON array. Seeded on first read the
// same way discountsStore.js seeds its default codes. Per-subscriber
// progress through a flow lives on the subscriber record
// (subscribersStore.updateAutomationState), not here — this store only
// holds the editable flow definitions.
//
// Step content is stored as `html` — raw HTML pasted directly, same as
// campaigns (lib/emailBlocks.js's renderEmailHtml) — so every automation
// email still gets the account's logo, footer, and font from
// lib/settingsStore.js applied automatically at send time
// (pages/api/cron/email-automations.js), and each step is editable from /admin/email
// as a plain HTML textarea, same as the campaign composer. Button/image
// The starter flows below are this store's own (lib/email/brand.js).
//
// Abandoned checkout is NOT one of them: that email already runs on its
// own every-minute cron (lib/abandonedCheckout.js,
// pages/api/cron/abandoned-checkout.js) and admin → Email shows it as a
// read-only flow. Adding a second abandoned_checkout flow here would email
// the same shoppers twice.

import { randomUUID } from 'crypto';
import { repairFlows } from './brandRepair';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY = 'email_automations';

// Small helpers so the seed HTML below reads as plain content instead of
// markup boilerplate — styled to Smells Iconic's ink and grotesk display
// type (lib/theme.js).
//
// Every starter flow ships switched OFF. The welcome and day-5 copy is the
// Email Specialist's approved draft (Nov 2026 team board); review each step
// in admin → Email → Automations, then switch the flow on.
const INK = '#15110D';
const SOFT = '#8F7C72';
const BLUSH = '#E4CEC4';
const SITE = 'https://smellsiconic.com';
const DISPLAY = "'Archivo Black', Helvetica, Arial, sans-serif";
const eyebrow = (text, align = 'left') => `<p style="margin:0 0 10px;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;font-weight:700;color:${SOFT};text-align:${align};">${text}</p>`;
const heading = (text, align = 'left') => `<p style="margin:0 0 16px;font-family:${DISPLAY};font-size:30px;line-height:1.1;letter-spacing:-0.01em;color:${INK};text-align:${align};">${text}</p>`;
const p = (text, align = 'left') => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${INK};text-align:${align};">${text}</p>`;
const button = (label, url = '') => `<div style="text-align:center;margin:28px 0;"><a href="${url}" style="background:${INK};color:#FBF5F1;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:18px 40px;display:inline-block;">${label}</a></div>`;
const code = (text) => `<div style="text-align:center;margin:20px 0;"><span style="display:inline-block;border:1px solid ${INK};background:${BLUSH};padding:10px 24px;font-size:14px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:${INK};">${text}</span></div>`;
const image = (alt, url = '') => `<img src="${url}" alt="${alt}" style="width:100%;display:block;border:0;margin:0 0 20px;" />`;
const scent = (name, notes) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${INK};"><strong style="text-transform:uppercase;letter-spacing:0.04em;">${name}</strong> — ${notes}</p>`;
// Inbox preview line — hidden in the email body itself.
const preheader = (text) => `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${text}</div>`;
const signoff = (lead) => p(lead ? `${lead}<br/>Smells Iconic` : 'Smells Iconic');

const SEED_AUTOMATIONS = [
  {
    id: 'welcome_series',
    name: 'Welcome series',
    trigger: 'confirmed',
    enabled: false,
    steps: [
      {
        delayDays: 0,
        subject: 'you smell iconic now (15% inside)',
        html: eyebrow('Welcome in')
          + heading('hi iconic,')
          + p('welcome in. Smells Iconic bottles cultural moments: the scenes, the quotes, the main-character energy you can&rsquo;t stop thinking about.')
          + p('start here:')
          + scent('Babygirl', 'milk, marshmallow, musk. soft, sweet, a little dangerous. our best seller for a reason.')
          + scent('Daddy Is a State of Mind', 'for the ones who pick up the check.')
          + p('your 15% off:')
          + code('ICONIC15')
          + p('we make small batches, so when a scent&rsquo;s gone, it&rsquo;s gone.')
          + image('Babygirl Body Mist', `${SITE}/images/si-babygirl-main.png`)
          + button('Shop Babygirl', `${SITE}/product/babygirl`)
          + signoff('smell you soon,'),
      },
      {
        delayDays: 5,
        // Only for people who haven't ordered since signing up —
        // pages/api/cron/email-automations.js skips the step for anyone who has.
        skipIfOrdered: true,
        subject: 'still thinking about it?',
        html: eyebrow('Your 15% is still here')
          + heading('hi again,')
          + p('quick reminder that your 15% off is still waiting:')
          + code('ICONIC15')
          + p('not sure where to start? the people have spoken: Babygirl is the one everyone asks about. expect &ldquo;wait, what are you wearing?&rdquo; on repeat.')
          + p('feeling more in charge than cute? Daddy Is a State of Mind has you.')
          + button('Pick your scent', `${SITE}/shop`)
          + signoff(''),
      },
    ],
  },
  {
    id: 'sunset_winback',
    name: 'Sunset / win-back',
    trigger: 'inactive',
    enabled: false,
    steps: [
      {
        delayDays: 90,
        subject: 'still want to hear from us?',
        html: eyebrow('Checking in')
          + heading('it&rsquo;s been a while.')
          + p('we only want to be in inboxes that want us there. if you&rsquo;d still like our emails, just tap below — otherwise we&rsquo;ll stop sending them.')
          + button('Yes, keep me updated', `${SITE}/shop`),
      },
      // Suppress step, not a send — pages/api/cron/email-automations.js
      // treats a falsy subject as "suppress this subscriber".
      { delayDays: 180, subject: null, html: null },
    ],
  },
  {
    id: 'add_to_cart',
    name: 'Abandoned cart',
    trigger: 'cart_updated',
    enabled: false,
    // The Email Specialist's approved draft (Nov 2026 team board). For a
    // cart that never reached checkout — the cart drawer's email form, or a
    // known shopper's cart (lib/useCart.js → pages/api/email/cart-activity.js).
    // Anyone who goes on to checkout gets the abandoned-checkout email
    // instead (lib/email/leadsSync.js). {{PRODUCT_NAME}} is the first item
    // in the cart (lib/email/automationSend.js).
    steps: [
      {
        delayHours: 24,
        subject: 'you left something iconic behind',
        html: preheader('it&rsquo;s still in your cart. for now.')
          + p('hey,')
          + p('your {{PRODUCT_NAME}} is sitting in your cart looking a little lonely.')
          + p('we only make small batches, so we can&rsquo;t promise it&rsquo;ll wait forever.')
          + '{{CART_ITEMS}}'
          + button('Finish checkout', `${SITE}/checkout`)
          + p('questions about the scent? just reply. a real person reads these.')
          + signoff(''),
      },
    ],
  },
  {
    id: 'order_received',
    name: 'Order follow-up',
    trigger: 'order_placed',
    enabled: false,
    // Not a receipt — the order confirmation email (lib/orderConfirmationEmail.js)
    // covers that. This is a later check-in and review nudge.
    steps: [
      {
        delayHours: 120,
        subject: 'how’s it smelling?',
        html: eyebrow('We&rsquo;d love to know')
          + heading('how&rsquo;s it smelling?')
          + p('your order should have landed by now. we&rsquo;d love to hear what you think — and what people said when you wore it.')
          + button('Leave a review', `${SITE}/shop`)
          + p('questions about your scent? just reply. a real person reads these.'),
      },
    ],
  },
];

function assertConfigured() {
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  }
}

async function saveAutomations(automations) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(automations),
  });
  if (!res.ok) throw new Error('Failed to save automations.');
}

export async function getAutomations() {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/${KEY}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  if (!data.result) {
    await saveAutomations(SEED_AUTOMATIONS);
    return SEED_AUTOMATIONS;
  }

  // Backfills any flow introduced after this account's automations were
  // first seeded (e.g. add_to_cart/order_received added later) — an
  // existing deployment picks up new flow types without losing any
  // edits made to the ones it already has.
  // Flows carrying the other store's branding (copied in by the old email
  // app import) get this store's own starter copy back — lib/email/brandRepair.js.
  const { flows: existing, changed: repaired } = repairFlows(JSON.parse(data.result), SEED_AUTOMATIONS);
  const missing = SEED_AUTOMATIONS.filter((seed) => !existing.some((a) => a.id === seed.id));
  if (missing.length === 0 && !repaired) return existing;
  const merged = [...existing, ...missing];
  await saveAutomations(merged);
  return merged;
}

export async function getAutomation(id) {
  const automations = await getAutomations();
  return automations.find((a) => a.id === id) || null;
}

export async function updateAutomation(id, patch) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Automation not found.');
  automations[idx] = { ...automations[idx], ...patch };
  await saveAutomations(automations);
  return automations[idx];
}

// getAutomations() only ever writes SEED_AUTOMATIONS content to KV once
// (an empty store, or a brand-new flow id added after this account was
// first set up) — a content OR timing edit to an *existing* flow's steps
// in this file never reaches an already-provisioned live store on its
// own. This is the explicit action that pushes it: overwrites each
// step's subject/html/delayDays/delayHours with the current seed values,
// matched by index, while leaving enabled, trigger, linkTargets, and
// stats untouched.
export async function syncAutomationDesign() {
  const automations = await getAutomations();
  const updated = automations.map((flow) => {
    const seed = SEED_AUTOMATIONS.find((s) => s.id === flow.id);
    if (!seed) return flow;
    const steps = flow.steps.map((step, i) => {
      const seedStep = seed.steps[i];
      if (!seedStep) return step;
      const timing = {};
      if (seedStep.delayDays !== undefined) timing.delayDays = seedStep.delayDays;
      if (seedStep.delayHours !== undefined) timing.delayHours = seedStep.delayHours;
      return { ...step, subject: seedStep.subject, html: seedStep.html, ...timing };
    });
    return { ...flow, steps };
  });
  await saveAutomations(updated);
  return updated;
}

// Send/click tracking for automation steps — mirrors campaignsStore.js's
// linkTargets/stats/send-log/click-log pattern so automation emails get
// the same click-tracking and conversion-analysis treatment campaigns
// already have (lib/automationSend.js, pages/api/email/click.js). Keyed
// by flowId + stepIndex rather than a single id, since a flow has
// multiple steps that each need their own independent link targets and
// stats — a click on step 0 shouldn't count toward step 1's numbers.

// testId set = variant B's links for that A/B test, kept per test (last
// few) so a B email clicked after its test ended still resolves.
export async function updateStepLinkTargets(flowId, stepIndex, linkTargets, testId = null) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === flowId);
  if (idx === -1) return null;
  const steps = automations[idx].steps.map((s, i) => {
    if (i !== stepIndex) return s;
    if (!testId) return { ...s, linkTargets };
    const kept = Object.entries(s.abLinkTargets || {}).filter(([id]) => id !== testId).slice(-4);
    return { ...s, abLinkTargets: Object.fromEntries([...kept, [testId, linkTargets]]) };
  });
  automations[idx] = { ...automations[idx], steps };
  await saveAutomations(automations);
  return automations[idx];
}

// Legacy counters (step.stats) from before lib/email/flowStats.js — kept
// read-only so old numbers still show; nothing writes them any more.

// Admin "Save changes": only the editable content comes from the browser.
// Server-owned fields (stats, linkTargets, abLinkTargets, abHistory, the
// running test's id/start) are kept from the stored copy — the page's copy
// can be hours old, and posting it back is what used to wipe click counts.
const EDITABLE_STEP_FIELDS = ['subject', 'html', 'delayDays', 'delayHours', 'skipIfOrdered'];

export async function updateStepContent(flowId, clientSteps) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === flowId);
  if (idx === -1) throw new Error('Automation not found.');
  if (!Array.isArray(clientSteps)) throw new Error('steps must be an array.');
  const current = automations[idx].steps;
  const steps = current.map((stored, i) => {
    const incoming = clientSteps[i];
    if (!incoming) return stored;
    const next = { ...stored };
    for (const f of EDITABLE_STEP_FIELDS) if (incoming[f] !== undefined) next[f] = incoming[f];
    if (incoming.abTest && stored.abTest) {
      next.abTest = { ...stored.abTest, subject: String(incoming.abTest.subject ?? stored.abTest.subject ?? ''), html: String(incoming.abTest.html ?? stored.abTest.html ?? '') };
    }
    return next;
  });
  automations[idx] = { ...automations[idx], steps };
  await saveAutomations(automations);
  return automations[idx];
}

// A/B test lifecycle for one step.
//  start: begins a new test (fresh testId, so its numbers start at zero).
//  end:   stops it; winner 'b' copies B's subject/html into the step so
//         everyone gets it from now on, winner 'a' keeps the original.
//         The result is kept in abHistory.
export async function setStepAbTest(flowId, stepIndex, action, { subject = '', html = '', winner = null, results = null } = {}) {
  const automations = await getAutomations();
  const idx = automations.findIndex((a) => a.id === flowId);
  if (idx === -1) throw new Error('Automation not found.');
  const step = automations[idx].steps[stepIndex];
  if (!step || !step.subject) throw new Error('That step can\'t be A/B tested.');

  let next;
  if (action === 'start') {
    if (step.abTest?.enabled) throw new Error('A test is already running on this step.');
    if (!String(subject).trim() && !String(html).trim()) throw new Error('Give variant B a different subject line or different HTML.');
    next = { ...step, abTest: { enabled: true, testId: randomUUID().slice(0, 8), subject: String(subject), html: String(html), startedAt: Date.now() } };
  } else if (action === 'end') {
    if (!step.abTest?.enabled) throw new Error('No test is running on this step.');
    if (winner !== 'a' && winner !== 'b') throw new Error('Pick a winner: a or b.');
    const t = step.abTest;
    const record = { testId: t.testId, startedAt: t.startedAt, endedAt: Date.now(), winner, subjectA: step.subject, subjectB: t.subject || step.subject, results };
    next = { ...step, abTest: null, abHistory: [...(step.abHistory || []), record].slice(-10) };
    if (winner === 'b') {
      if ((t.subject || '').trim()) next.subject = t.subject;
      // linkTargets is left alone: emails A already sent still resolve
      // against it until the next send rewrites it; B's emails resolve
      // through abLinkTargets[testId].
      if ((t.html || '').trim()) next.html = t.html;
    }
  } else {
    throw new Error('Unknown A/B action.');
  }

  const steps = automations[idx].steps.map((s, i) => (i === stepIndex ? next : s));
  automations[idx] = { ...automations[idx], steps };
  await saveAutomations(automations);
  return automations[idx];
}

export async function logAutomationSend(flowId, stepIndex, entries) {
  assertConfigured();
  const key = `automation_sends:${flowId}:${stepIndex}`;
  const existing = await getAutomationSendLog(flowId, stepIndex);
  const updated = [...existing, ...entries];
  const res = await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to log automation send.');
}

export async function getAutomationSendLog(flowId, stepIndex) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/automation_sends:${flowId}:${stepIndex}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}

export async function findAutomationSend(flowId, stepIndex, sendId) {
  const log = await getAutomationSendLog(flowId, stepIndex);
  return log.find((s) => s.sendId === sendId) || null;
}

export async function logAutomationClick(flowId, stepIndex, entry) {
  assertConfigured();
  const key = `automation_clicks:${flowId}:${stepIndex}`;
  const existing = await getAutomationClickLog(flowId, stepIndex);
  const updated = [...existing, entry];
  const res = await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error('Failed to log automation click.');
}

export async function getAutomationClickLog(flowId, stepIndex) {
  assertConfigured();
  const res = await fetch(`${KV_URL}/get/automation_clicks:${flowId}:${stepIndex}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : [];
}
