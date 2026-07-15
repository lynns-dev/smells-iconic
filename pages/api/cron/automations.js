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

import { getAutomations } from '../../../lib/automationsStore';
import { getSubscribers, updateAutomationState, suppressByEmail } from '../../../lib/subscribersStore';
import { daysSinceActivity, WINBACK_AFTER_DAYS } from '../../../lib/emailEngagement';
import { sendEmail } from '../../../lib/sesEmail';

const DAY_MS = 24 * 60 * 60 * 1000;

async function runWelcomeSeries(flow, subscribers) {
  if (!flow.enabled) return 0;
  let sent = 0;
  const now = Date.now();

  for (const sub of subscribers) {
    if (sub.status !== 'subscribed' || !sub.confirmedAt) continue;
    const state = sub.automationState?.welcome_series;
    if (!state || state.step >= flow.steps.length) continue;

    const step = flow.steps[state.step];
    const dueAt = sub.confirmedAt + step.delayDays * DAY_MS;
    if (now < dueAt) continue;

    await sendEmail({ to: sub.email, subject: step.subject, html: step.html, fromName: 'Smells Iconic', unsubToken: sub.unsubToken });
    await updateAutomationState(sub.email, 'welcome_series', { step: state.step + 1 });
    sent += 1;
  }
  return sent;
}

async function runSunsetWinback(flow, subscribers) {
  if (!flow.enabled) return { sent: 0, suppressed: 0 };
  let sent = 0;
  let suppressed = 0;

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
      await sendEmail({ to: sub.email, subject: step.subject, html: step.html, fromName: 'Smells Iconic', unsubToken: sub.unsubToken });
      sent += 1;
    } else {
      await suppressByEmail(sub.email, 'sunset');
      suppressed += 1;
    }
    await updateAutomationState(sub.email, 'sunset_winback', { step: state.step + 1 });
  }
  return { sent, suppressed };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Not authorized.' });
  }

  try {
    const [automations, subscribers] = await Promise.all([getAutomations(), getSubscribers()]);
    const welcome = automations.find((a) => a.id === 'welcome_series');
    const sunset = automations.find((a) => a.id === 'sunset_winback');

    const welcomeSent = welcome ? await runWelcomeSeries(welcome, subscribers) : 0;
    const sunsetResult = sunset ? await runSunsetWinback(sunset, subscribers) : { sent: 0, suppressed: 0 };

    return res.status(200).json({ ok: true, welcomeSent, ...sunsetResult });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
