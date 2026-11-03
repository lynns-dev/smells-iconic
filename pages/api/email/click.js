import { getCampaign, findSend, incrementCampaignStat, logClick } from '../../../lib/email/campaignsStore';
import {
  getAutomation,
  findAutomationSend,
  incrementStepStat,
  logAutomationClick,
} from '../../../lib/email/automationsStore';
import { recordClick } from '../../../lib/email/subscribersStore';

const FALLBACK = '/';

// Handles both campaign clicks (?c=campaignId) and automation-step
// clicks (?f=flowId&st=stepIndex) — same redirect-by-index mechanism
// either way (see lib/emailLinks.js), just resolved against a different
// store depending on which query params are present. `s` (sendId) and
// `i` (link index) are shared by both.
export default async function handler(req, res) {
  const { c: campaignId, f: flowId, st: stepIndex, s: sendId, i } = req.query;
  if (!sendId || i === undefined) return res.redirect(302, FALLBACK);

  try {
    if (campaignId) {
      const [campaign, send] = await Promise.all([
        getCampaign(String(campaignId)),
        findSend(String(campaignId), String(sendId)),
      ]);
      const target = campaign?.linkTargets?.[Number(i)] || FALLBACK;

      if (send) {
        await Promise.all([
          recordClick(send.email),
          incrementCampaignStat(String(campaignId), 'clicked'),
          logClick(String(campaignId), { email: send.email, sendId: String(sendId), clickedAt: Date.now() }),
        ]);
      }

      return res.redirect(302, target);
    }

    if (flowId && stepIndex !== undefined) {
      const stepIdx = Number(stepIndex);
      const [flow, send] = await Promise.all([
        getAutomation(String(flowId)),
        findAutomationSend(String(flowId), stepIdx, String(sendId)),
      ]);
      const target = flow?.steps?.[stepIdx]?.linkTargets?.[Number(i)] || FALLBACK;

      if (send) {
        await Promise.all([
          recordClick(send.email),
          incrementStepStat(String(flowId), stepIdx, 'clicked'),
          logAutomationClick(String(flowId), stepIdx, { email: send.email, sendId: String(sendId), clickedAt: Date.now() }),
        ]);
      }

      return res.redirect(302, target);
    }

    return res.redirect(302, FALLBACK);
  } catch {
    return res.redirect(302, FALLBACK);
  }
}
