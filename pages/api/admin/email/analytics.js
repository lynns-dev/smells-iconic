// Combined analytics across campaigns AND automation steps — renamed
// from campaign-analytics.js since it's no longer campaign-only. Sent/
// clicked totals fold in automation steps' stats (lib/automationSend.js
// now tracks those the same way lib/emailSend.js tracks campaigns), and
// conversion is computed per campaign and per automation step from their
// respective click logs.

import { getCampaigns } from '../../../../lib/email/campaignsStore';
import { getAutomations } from '../../../../lib/email/automationsStore';
import { getSubscribers } from '../../../../lib/email/subscribersStore';
import { computeCampaignConversion, computeAutomationStepConversion } from '../../../../lib/email/campaignAnalytics';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [campaigns, automations, subscribers] = await Promise.all([getCampaigns(), getAutomations(), getSubscribers()]);
    const subscribersByEmail = new Map(subscribers.map((s) => [s.email, s]));
    const sentCampaigns = campaigns.filter((c) => c.status === 'sent');

    let totalSent = 0;
    let totalClicked = 0;
    let totalConverted = 0;
    let totalUniqueClickers = 0;

    const perCampaign = {};
    for (const campaign of sentCampaigns) {
      const result = await computeCampaignConversion(campaign.id, subscribersByEmail);
      perCampaign[campaign.id] = result;
      totalConverted += result.converted;
      totalUniqueClickers += result.uniqueClickers;
      totalSent += campaign.stats.sent || 0;
      totalClicked += campaign.stats.clicked || 0;
    }

    const perAutomation = {};
    for (const flow of automations) {
      const perStep = {};
      for (let stepIndex = 0; stepIndex < flow.steps.length; stepIndex += 1) {
        const step = flow.steps[stepIndex];
        const stepSent = step.stats?.sent || 0;
        const stepClicked = step.stats?.clicked || 0;
        if (stepSent === 0) continue; // never sent — nothing to report, keeps the response small

        const result = await computeAutomationStepConversion(flow.id, stepIndex, subscribersByEmail);
        perStep[stepIndex] = { ...result, sent: stepSent, clicked: stepClicked };
        totalConverted += result.converted;
        totalUniqueClickers += result.uniqueClickers;
        totalSent += stepSent;
        totalClicked += stepClicked;
      }
      if (Object.keys(perStep).length > 0) perAutomation[flow.id] = perStep;
    }

    const aggregate = {
      sent: totalSent,
      clicked: totalClicked,
      clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 1000) / 10 : 0,
      converted: totalConverted,
      uniqueClickers: totalUniqueClickers,
      conversionRate: totalUniqueClickers > 0 ? Math.round((totalConverted / totalUniqueClickers) * 1000) / 10 : 0,
    };

    return res.status(200).json({ campaigns: perCampaign, automations: perAutomation, aggregate });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
