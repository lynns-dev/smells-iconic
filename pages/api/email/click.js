import { getCampaign, findSend, incrementCampaignStat } from '../../../lib/campaignsStore';
import { recordClick } from '../../../lib/subscribersStore';

const FALLBACK = '/';

export default async function handler(req, res) {
  const { c: campaignId, s: sendId, i } = req.query;
  if (!campaignId || !sendId || i === undefined) return res.redirect(302, FALLBACK);

  try {
    const [campaign, send] = await Promise.all([
      getCampaign(String(campaignId)),
      findSend(String(campaignId), String(sendId)),
    ]);
    const target = campaign?.linkTargets?.[Number(i)] || FALLBACK;

    if (send) {
      await Promise.all([recordClick(send.email), incrementCampaignStat(String(campaignId), 'clicked')]);
    }

    return res.redirect(302, target);
  } catch {
    return res.redirect(302, FALLBACK);
  }
}
