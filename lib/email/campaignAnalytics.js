// Conversion rate for a campaign or an automation step: of the
// subscribers who clicked a link, what fraction placed an order within 7
// days of that click. Deliberately click-based (not open-based) as the
// "did this email work" signal, same reasoning as lib/emailEngagement.js's
// engagement tiering — Apple Mail Privacy Protection auto-fires opens for
// nearly everyone regardless of whether they looked, so open rate isn't a
// trustworthy input here either.
//
// Limitation worth knowing: subscribersStore.js only keeps each
// subscriber's most recent order (lastOrderAt), not full order history.
// A click that led to a real order will stop counting as "converted" if
// the subscriber placed a later order that pushed lastOrderAt outside
// this send's 7-day window — an inherent gap in the current data model,
// not a bug in this calculation.

import { getClickLog } from './campaignsStore';
import { getAutomationClickLog } from './automationsStore';

const CONVERSION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function computeConversionFromClicks(clicks, subscribersByEmail) {
  // A subscriber can click more than once — only the first click starts
  // their conversion window.
  const firstClickAt = new Map();
  for (const click of clicks) {
    const existing = firstClickAt.get(click.email);
    if (existing === undefined || click.clickedAt < existing) firstClickAt.set(click.email, click.clickedAt);
  }

  let converted = 0;
  for (const [email, clickedAt] of firstClickAt) {
    const sub = subscribersByEmail.get(email);
    if (sub?.lastOrderAt && sub.lastOrderAt >= clickedAt && sub.lastOrderAt <= clickedAt + CONVERSION_WINDOW_MS) {
      converted += 1;
    }
  }

  const uniqueClickers = firstClickAt.size;
  return {
    uniqueClickers,
    converted,
    conversionRate: uniqueClickers > 0 ? Math.round((converted / uniqueClickers) * 1000) / 10 : 0,
  };
}

export async function computeCampaignConversion(campaignId, subscribersByEmail) {
  const clicks = await getClickLog(campaignId);
  return computeConversionFromClicks(clicks, subscribersByEmail);
}

export async function computeAutomationStepConversion(flowId, stepIndex, subscribersByEmail) {
  const clicks = await getAutomationClickLog(flowId, stepIndex);
  return computeConversionFromClicks(clicks, subscribersByEmail);
}
