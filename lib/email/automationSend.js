// Shared send machinery for automation steps — used by both
// pages/api/cron/automations.js (batches of subscribers due for a step)
// and this file's sendAutomationStepNow (the admin's manual "send now"
// buttons, one subscriber at a time). Gives automation emails the same
// click-tracking/conversion-analysis treatment campaigns already have
// (lib/emailSend.js) instead of being invisible to analytics.

import { randomUUID } from 'crypto';
import { getEmailBaseUrl } from './emailBaseUrl';
import { getAutomation, updateStepLinkTargets, logAutomationSend, incrementStepStat } from './automationsStore';
import { updateAutomationState } from './subscribersStore';
import { renderEmailHtml, renderCartItemsHtml } from './emailBlocks';
import { sendEmail } from './resendEmail';
import { getSettings } from './settingsStore';
import { wrapLinksForSend, personalizeSendHtml } from './emailLinks';

// {{DISCOUNT_CODE}} in a step's HTML becomes the store's 15%-off code
// (admin → Discounts). This store has no per-subscriber codes, so it's the
// same code for everyone.
const DISCOUNT_PLACEHOLDER = '{{DISCOUNT_CODE}}';
const STEP_DISCOUNT_CODE = 'ICONIC15';
// {{PRODUCT_NAME}}: the first item in their cart/checkout.
const PRODUCT_NAME_PLACEHOLDER = '{{PRODUCT_NAME}}';

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function unsubUrlFor(sub) {
  return `${getEmailBaseUrl()}/api/email/unsubscribe?token=${sub.unsubToken}`;
}

// Wraps a step's links into click-trackable redirects and persists the
// resolved targets on the step so pages/api/email/click.js can resolve
// them later. Call once per (flow, step) per batch of sends, not once
// per subscriber — the step's content (and therefore its links) is the
// same for everyone; only the per-recipient {{SEND_ID}}/{{UNSUB_URL}}
// substitution (personalizeSendHtml, below) varies.
export async function prepareStepTemplate(flowId, step, stepIndex, settings) {
  const rendered = renderEmailHtml(step.html, settings);
  // Must be absolute, same reasoning as unsubUrlFor above — a relative
  // href has nothing to resolve against once it's sitting in an inbox.
  const baseUrl = getEmailBaseUrl();
  const { html: wrapped, links } = wrapLinksForSend(
    rendered,
    (idx) => `${baseUrl}/api/email/click?f=${encodeURIComponent(flowId)}&st=${stepIndex}&s={{SEND_ID}}&i=${idx}`
  );
  await updateStepLinkTargets(flowId, stepIndex, links);
  return wrapped;
}

// Sends one already-prepared step template to one subscriber, logging
// the send and bumping the step's `sent` stat. {{CART_ITEMS}} is filled
// from whatever's on the subscriber's own record — empty for anyone
// without a captured cart (most subscribers, most flows), so this is
// safe to always compute rather than needing every caller to know
// whether the flow it's sending even uses the placeholder.
export async function sendStepToSubscriber(flowId, stepIndex, template, subject, subscriber) {
  const sendId = randomUUID();
  // add_to_cart shows the cart they left; every other flow the checkout they left.
  const items = flowId === 'add_to_cart' ? subscriber.cartItems : subscriber.checkoutItems;
  const cartItemsHtml = renderCartItemsHtml(items);
  const html = personalizeSendHtml(template, '', sendId, unsubUrlFor(subscriber), cartItemsHtml)
    .split(DISCOUNT_PLACEHOLDER).join(STEP_DISCOUNT_CODE)
    .split(PRODUCT_NAME_PLACEHOLDER).join(escapeHtml(items?.[0]?.name || 'your picks'));
  await sendEmail({ to: subscriber.email, subject, html, unsubToken: subscriber.unsubToken });
  await logAutomationSend(flowId, stepIndex, [{ sendId, email: subscriber.email, sentAt: Date.now() }]);
  await incrementStepStat(flowId, stepIndex, 'sent', 1);
}

// Manual "send now" for a single subscriber's next due step in a given
// flow — generalized from what used to be a welcome-series-only
// function, so abandoned_checkout (in particular, for when the cron
// cadence isn't tight enough to hit its short delay) can be triggered on
// demand instead of waiting for the cron to pick it up. {{CART_ITEMS}}
// comes from the subscriber's own checkoutItems via sendStepToSubscriber,
// so this "just works" for abandoned_checkout without any special-casing
// here — same code path as every other flow.
//
// An admin can also pick a specific step (stepIndex) — e.g. jump straight
// to abandoned_checkout's 15%-off email, or re-send one. This is an
// explicit admin action, so it works while the flow is switched off; the
// on/off switch only controls the cron's automatic sends. The
// subscriber's progress only ever moves forward, so the cron never
// re-sends a step that went out by hand.
export async function sendAutomationStepNow(flowId, subscriber, stepIndex) {
  const flow = await getAutomation(flowId);
  if (!flow) throw new Error('Automation not found.');

  const state = subscriber.automationState?.[flowId] || { step: 0 };
  const index = stepIndex == null ? state.step : Number(stepIndex);
  if (!Number.isInteger(index) || index < 0 || index >= flow.steps.length) {
    throw new Error(stepIndex == null
      ? `This subscriber has already received every ${flow.name} step — pick one to re-send.`
      : 'That step does not exist.');
  }

  const step = flow.steps[index];
  if (!step.subject) {
    throw new Error('This step has no content to send.');
  }

  const settings = await getSettings();
  const template = await prepareStepTemplate(flowId, step, index, settings);
  await sendStepToSubscriber(flowId, index, template, step.subject, subscriber);
  await updateAutomationState(subscriber.email, flowId, { ...state, step: Math.max(state.step || 0, index + 1) });

  return { subject: step.subject, step: index };
}
