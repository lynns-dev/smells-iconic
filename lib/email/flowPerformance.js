// Open/click performance per automation and per step, for admin → Email.
// Combines the live counters (lib/email/flowStats.js) with the old
// step.stats numbers from before they existed, so history isn't lost:
//  - sent / clickers: old + new
//  - opens: only measured since open tracking shipped, so open rate uses
//    only the sends that carried the pixel
// A flow is flagged when it has enough sends to judge (MIN_SENT) and its
// click or open rate is under the floor below.

import { getFlowStats, abConfidence } from './flowStats';

export const MIN_SENT = 30;
export const CLICK_RATE_FLOOR = 1.0; // % of sends that click
export const OPEN_RATE_FLOOR = 20; // % — below this usually means spam folder

// Capped at 100: a forwarded email can be opened/clicked by more people than it was sent to.
const rate = (part, whole) => (whole > 0 ? Math.min(100, Math.round((part / whole) * 1000) / 10) : 0);

export const ABANDONED_FLOW = { id: 'abandoned_checkout', name: 'Abandoned checkout', steps: [{ subject: 'You left something behind' }] };

function combine(legacy = {}, live = {}) {
  const sent = (legacy.sent || 0) + (live.sent || 0);
  const clickers = (legacy.clicked || 0) + (live.clickers || 0);
  return {
    sent,
    trackedSent: live.sent || 0,
    opened: live.opened || 0,
    clickers,
    clicks: (legacy.clicked || 0) + (live.clicks || 0),
    openRate: rate(live.opened || 0, live.sent || 0),
    clickRate: rate(clickers, sent),
    clickToOpenRate: rate(live.clickers || 0, live.opened || 0),
  };
}

function health(m) {
  if (m.sent < MIN_SENT) return { status: 'learning', note: `Needs ${MIN_SENT}+ sends to judge` };
  const issues = [];
  if (m.trackedSent >= MIN_SENT && m.openRate < OPEN_RATE_FLOOR) issues.push(`open rate under ${OPEN_RATE_FLOOR}% — check spam placement and subject line`);
  if (m.clickRate < CLICK_RATE_FLOOR) issues.push(`click rate under ${CLICK_RATE_FLOOR}% — content/offer isn't landing`);
  return issues.length ? { status: 'failing', note: issues.join('; ') } : { status: 'ok', note: '' };
}

// flows: automations from the store (plus ABANDONED_FLOW). Returns
// { flows: [{ id, name, enabled, ...metrics, health, steps: [{ index, subject, ...metrics, abTest }] }], totals }.
export async function computeFlowPerformance(flows) {
  const keys = [];
  for (const flow of flows) flow.steps.forEach((s, i) => { if (s.subject) keys.push({ flowId: flow.id, stepIndex: i }); });
  const live = await getFlowStats(keys);

  const rows = flows.map((flow) => {
    const steps = flow.steps.map((step, index) => {
      if (!step.subject) return null;
      const stat = live.get(`${flow.id}:${index}`) || {};
      const metrics = combine(step.stats, stat);
      const running = step.abTest?.enabled ? step.abTest : null;
      const results = running ? stat.tests?.[running.testId] || null : null;
      return {
        index,
        subject: step.subject,
        ...metrics,
        health: health(metrics),
        abTest: running ? { testId: running.testId, startedAt: running.startedAt, subjectB: running.subject || step.subject, results, ...abConfidence(results?.a, results?.b) } : null,
        abHistory: step.abHistory || [],
      };
    }).filter(Boolean);

    const sum = steps.reduce((acc, s) => ({
      sent: acc.sent + s.sent, trackedSent: acc.trackedSent + s.trackedSent, opened: acc.opened + s.opened,
      clickers: acc.clickers + s.clickers, clicks: acc.clicks + s.clicks,
      trackedClickers: acc.trackedClickers + (live.get(`${flow.id}:${s.index}`)?.clickers || 0),
    }), { sent: 0, trackedSent: 0, opened: 0, clickers: 0, clicks: 0, trackedClickers: 0 });
    const metrics = {
      sent: sum.sent, trackedSent: sum.trackedSent, opened: sum.opened, clickers: sum.clickers, clicks: sum.clicks,
      openRate: rate(sum.opened, sum.trackedSent), clickRate: rate(sum.clickers, sum.sent), clickToOpenRate: rate(sum.trackedClickers, sum.opened),
    };
    return { id: flow.id, name: flow.name, enabled: flow.enabled !== false, ...metrics, health: health(metrics), steps };
  });

  return rows;
}
