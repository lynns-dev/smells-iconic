import { getCampaign, findSend, incrementCampaignStat, logClick } from '../../../lib/email/campaignsStore';
import { getAutomation, findAutomationSend, logAutomationClick } from '../../../lib/email/automationsStore';
import { recordClick } from '../../../lib/email/subscribersStore';
import { bumpFlowStat, claimFirst } from '../../../lib/email/flowStats';

const FALLBACK = '/';
const SEND_ID_RE = /^[0-9a-f-]{8,64}$/i;

// Only same-site paths ("/checkout?..."), never "//evil.com" or a full URL
// — keeps the abandoned-checkout's ?u= target from being an open redirect.
function safeLocalPath(u) {
  const s = String(u || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.includes('\\') ? s : null;
}

// Tracking must never cost the shopper their click: every write is
// best-effort and the redirect happens regardless. (It used to be one
// Promise.all — if any write failed, the shopper landed on the homepage
// instead of their link and the click wasn't counted either.)
async function quietly(promises) {
  const results = await Promise.allSettled(promises);
  for (const r of results) if (r.status === 'rejected') console.error('Click tracking write failed:', r.reason?.message);
}

// A click proves the email was opened even when images (and so the open
// pixel) were blocked — count it as the send's open if the pixel didn't.
async function countOpen(flowId, stepIdx, sendId, test) {
  if (await claimFirst('open', sendId)) await bumpFlowStat(flowId, stepIdx, 'opened', test);
}

// Handles campaign clicks (?c=campaignId), automation-step clicks
// (?f=flowId&st=stepIndex, plus &t=testId&v=a|b during an A/B test), and
// the abandoned-checkout email (?f=abandoned_checkout&st=0&u=/checkout…).
// Same redirect-by-index mechanism for campaigns and flows (see
// lib/emailLinks.js), resolved against a different store depending on
// which query params are present. `s` (sendId) and `i` (link index) are shared.
export default async function handler(req, res) {
  const { c: campaignId, f: flowId, st: stepIndex, s: sendId, i, t: testId, v: variant } = req.query;
  if (!sendId || !SEND_ID_RE.test(String(sendId))) return res.redirect(302, FALLBACK);

  try {
    if (campaignId) {
      if (i === undefined) return res.redirect(302, FALLBACK);
      const [campaign, send] = await Promise.all([
        getCampaign(String(campaignId)),
        findSend(String(campaignId), String(sendId)),
      ]);
      const target = campaign?.linkTargets?.[Number(i)] || FALLBACK;

      if (send) {
        await quietly([
          recordClick(send.email),
          incrementCampaignStat(String(campaignId), 'clicked'),
          logClick(String(campaignId), { email: send.email, sendId: String(sendId), clickedAt: Date.now() }),
        ]);
      }

      return res.redirect(302, target);
    }

    if (flowId === 'abandoned_checkout') {
      const target = safeLocalPath(req.query.u) || '/checkout';
      await quietly([
        bumpFlowStat('abandoned_checkout', 0, 'clicks'),
        claimFirst('click', String(sendId)).then((first) => first && bumpFlowStat('abandoned_checkout', 0, 'clickers')),
        countOpen('abandoned_checkout', 0, String(sendId), null),
      ]);
      return res.redirect(302, target);
    }

    if (flowId && stepIndex !== undefined && i !== undefined) {
      const stepIdx = Number(stepIndex);
      const isB = variant === 'b' && testId;
      const [flow, send] = await Promise.all([
        getAutomation(String(flowId)),
        findAutomationSend(String(flowId), stepIdx, String(sendId)).catch(() => null),
      ]);
      const step = flow?.steps?.[stepIdx];
      const targets = isB ? step?.abLinkTargets?.[String(testId)] : step?.linkTargets;
      const target = targets?.[Number(i)] || FALLBACK;
      if (!step) return res.redirect(302, target);

      const test = testId && (variant === 'a' || variant === 'b') ? { testId: String(testId), variant } : null;
      // Counted from the link itself, so a click still counts even if the
      // send-log entry is missing; the send log only adds who clicked (for
      // conversion and engagement).
      await quietly([
        bumpFlowStat(String(flowId), stepIdx, 'clicks', test),
        claimFirst('click', String(sendId)).then((first) => first && bumpFlowStat(String(flowId), stepIdx, 'clickers', test)),
        countOpen(String(flowId), stepIdx, String(sendId), test),
        ...(send ? [
          recordClick(send.email),
          logAutomationClick(String(flowId), stepIdx, { email: send.email, sendId: String(sendId), clickedAt: Date.now(), ...(test || {}) }),
        ] : []),
      ]);

      return res.redirect(302, target);
    }

    return res.redirect(302, FALLBACK);
  } catch {
    return res.redirect(302, FALLBACK);
  }
}
