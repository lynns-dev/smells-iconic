// Ad spend from Meta's Marketing API (Insights), for the admin dashboard's
// Ad spend section (components/AdSpend.jsx, pages/api/admin/ad-spend.js).
//
// Both stores advertise from the same Meta ad account, so each store only
// counts its own campaigns: ANESE's are the ones with "anese" in the name,
// VEIL's (this store, Smells Iconic) are everything else. META_CAMPAIGN_MATCH (a case-insensitive
// pattern) overrides that if campaign naming changes.
//
// Needs a token with the ads_read permission: META_ADS_ACCESS_TOKEN, falling
// back to META_CAPI_ACCESS_TOKEN when that one was generated with ads_read
// too. META_AD_ACCOUNT_ID picks the ad account.

import { GRAPH_VERSION } from './metaCapi';

const DEFAULT_AD_ACCOUNT = 'act_1056638423855981';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

export function metaAdsConfig() {
  const token = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN || '';
  const raw = String(process.env.META_AD_ACCOUNT_ID || DEFAULT_AD_ACCOUNT).trim();
  const account = raw.startsWith('act_') ? raw : `act_${raw}`;
  return { configured: Boolean(token), token, account };
}

// Whether a campaign belongs to this store.
export function isOwnCampaign(name) {
  const custom = process.env.META_CAMPAIGN_MATCH;
  if (custom) {
    try { return new RegExp(custom, 'i').test(name || ''); } catch { /* bad pattern: use the default */ }
  }
  return !/anese/i.test(name || '');
}

function actionCount(list, types) {
  for (const type of types) {
    const hit = (list || []).find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}
const PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];

// Campaign-level spend and results between two YYYY-MM-DD dates
// (inclusive), this store's campaigns only. Cached briefly per range so
// reloading the dashboard doesn't hit Meta's rate limits.
export async function getCampaignSpend(since, until) {
  const { configured, token, account } = metaAdsConfig();
  if (!configured) return { configured: false };

  const cacheKey = `${account}:${since}:${until}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const params = new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,impressions,inline_link_clicks,actions,action_values',
    time_range: JSON.stringify({ since, until }),
    limit: '200',
    access_token: token,
  });
  // META_GRAPH_BASE only for pointing tests at a stand-in server.
  const base = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
  let url = `${base}/${GRAPH_VERSION}/${account}/insights?${params}`;
  const rows = [];
  for (let page = 0; url && page < 10; page += 1) {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error?.message || `Meta returned ${res.status}`);
    }
    rows.push(...(data.data || []));
    url = data.paging?.next || null;
  }

  const campaigns = rows
    .filter((r) => isOwnCampaign(r.campaign_name))
    .map((r) => ({
      id: r.campaign_id,
      name: r.campaign_name,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      linkClicks: Number(r.inline_link_clicks) || 0,
      purchases: actionCount(r.actions, PURCHASE_TYPES),
      purchaseValue: actionCount(r.action_values, PURCHASE_TYPES),
    }))
    .sort((a, b) => b.spend - a.spend);

  const sum = (key) => Math.round(campaigns.reduce((n, c) => n + c[key], 0) * 100) / 100;
  const value = {
    configured: true,
    account,
    campaigns,
    totals: {
      spend: sum('spend'),
      impressions: sum('impressions'),
      linkClicks: sum('linkClicks'),
      purchases: sum('purchases'),
      purchaseValue: sum('purchaseValue'),
    },
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}
