// Sends a campaign to its resolved segment in throttled batches — SES
// enforces a per-account max-send-rate (starts low in the sandbox, and
// stays modest until a production access + sending-limit increase
// request), so blasting the whole list in parallel would just start
// throwing throttling errors partway through.

import { randomUUID } from 'crypto';
import { getEmailBaseUrl } from './emailBaseUrl';
import { getCampaign, updateCampaign, logSend } from './campaignsStore';
import { getSubscribers } from './subscribersStore';
import { resolveSegment } from './emailEngagement';
import { sendEmail } from './resendEmail';
import { wrapLinksForSend, personalizeSendHtml } from './emailLinks';
import { renderEmailHtml } from './emailBlocks';
import { getSettings } from './settingsStore';

const BATCH_SIZE = 14;
const BATCH_PAUSE_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendCampaign(campaignId) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) throw new Error('Campaign not found.');
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    throw new Error('This campaign has already been sent.');
  }

  const subscribers = await getSubscribers();
  const recipients = resolveSegment(subscribers, campaign.segment);
  if (recipients.length === 0) throw new Error('No subscribers in this segment.');

  // Re-rendered from contentHtml + current settings here, not read from
  // campaign.html — that field is only ever refreshed when contentHtml
  // itself is edited (pages/api/admin/email/campaigns.js), so a draft
  // created before the logo/font/footer was set in Settings would send
  // without it forever otherwise. Automations already work this way
  // (pages/api/cron/automations.js re-renders from raw step.html on
  // every run); this brings campaigns in line with that.
  const settings = await getSettings();
  const renderedHtml = renderEmailHtml(campaign.contentHtml, settings);
  // Must be absolute — a relative href has nothing to resolve against once
  // it's sitting in an inbox rather than a browser tab on this app's
  // origin, so mail clients were sending clicks to a hostless
  // "http:///api/email/click?..." instead of this app.
  const baseUrl = getEmailBaseUrl();
  const { html: template, links } = wrapLinksForSend(
    renderedHtml,
    (idx) => `${baseUrl}/api/email/click?c={{CAMPAIGN_ID}}&s={{SEND_ID}}&i=${idx}`
  );
  await updateCampaign(campaignId, { status: 'sending', linkTargets: links });

  let sentCount = 0;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const entries = [];

    await Promise.all(
      batch.map(async (sub) => {
        const sendId = randomUUID();
        try {
          const unsubUrl = `${getEmailBaseUrl()}/api/email/unsubscribe?token=${sub.unsubToken}`;
          await sendEmail({
            to: sub.email,
            subject: campaign.subject,
            html: personalizeSendHtml(template, campaignId, sendId, unsubUrl),
            fromName: campaign.fromName,
            unsubToken: sub.unsubToken,
          });
          entries.push({ sendId, email: sub.email, sentAt: Date.now() });
          sentCount += 1;
        } catch (err) {
          console.error(`Campaign ${campaignId} send to ${sub.email} failed:`, err.message);
        }
      })
    );

    if (entries.length) await logSend(campaignId, entries);
    if (i + BATCH_SIZE < recipients.length) await sleep(BATCH_PAUSE_MS);
  }

  await updateCampaign(campaignId, {
    status: 'sent',
    sentAt: Date.now(),
    stats: { ...campaign.stats, sent: sentCount },
  });

  return { sent: sentCount, total: recipients.length };
}
