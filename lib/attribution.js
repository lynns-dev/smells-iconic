// Captures which ad/campaign brought a visitor in, so it can be attached to
// their order later (checkout often happens well after the ad click).
// Stored in localStorage (survives across the whole visit, not just one
// tab/session) and only overwritten when a NEW url actually carries
// utm/click-id params -- plain internal navigation between pages never
// clears a previously captured touch.

import { FBC_COOKIE, CLICK_MAX_AGE_MS, buildFbc, parseFbc, isFbclid, isLiveClick, cookieDomainForHost } from './metaClickId';

const STORAGE_KEY = 'si-attribution';
// The last Meta ad click, kept on its own so a later tagged visit (an email
// link, a Google ad) replacing the touch above doesn't take the click ID
// with it — see lib/metaClickId.js for why this exists at all.
const CLICK_KEY = 'si-meta-click';
// Per browser session: which click ID the server has already re-issued the
// cookie for (pages/api/track/event.js), so it's asked once a visit.
const SYNCED_KEY = 'si-fbc-synced';
// adset_name/ad_name/campaign_name aren't standard UTM params — they're what
// you get from Meta URL tags written as `adset_name={{adset.name}}` instead
// of folding those values into utm_content/utm_term. Both styles are common,
// so capture either and let describeAdPlacement() below sort out which won.
const PARAM_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'campaign_name', 'adset_name', 'ad_name',
  'fbclid', 'gclid',
];

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? match[1] : null;
}

function storedClick() {
  try {
    const click = JSON.parse(window.localStorage.getItem(CLICK_KEY) || 'null');
    return click && isFbclid(click.fbclid) && isLiveClick(click.at) ? click : null;
  } catch (e) {
    return null;
  }
}

function writeFbcCookie(fbc, at) {
  const maxAge = Math.max(60, Math.floor((at + CLICK_MAX_AGE_MS - Date.now()) / 1000));
  const domain = cookieDomainForHost(window.location.hostname);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${FBC_COOKIE}=${fbc}; Max-Age=${maxAge}; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}${secure}`;
}

// Remembers a Meta ad click the moment its fbclid shows up in the URL, and
// makes sure the `_fbc` cookie exists for it even if the Pixel never loads.
// Reloading the same link keeps the original click time.
function rememberMetaClick(fbclid) {
  if (!isFbclid(fbclid)) return;
  try {
    const cookie = parseFbc(readCookie(FBC_COOKIE));
    const known = [storedClick(), cookie].find((c) => c && c.fbclid === fbclid);
    const at = known ? known.at : Date.now();
    window.localStorage.setItem(CLICK_KEY, JSON.stringify({ fbclid, at }));
    if (!cookie || cookie.fbclid !== fbclid) writeFbcCookie(buildFbc(fbclid, at), at);
  } catch (e) {
    // storage or cookies blocked — the Pixel's own cookie is all there is
  }
}

// The current Meta click ID in Meta's own `fbc` format, or null if this
// browser hasn't arrived from a Meta ad in the last 90 days. The cookie wins
// when there is one (it is what the Pixel itself sends); otherwise the stored
// click is used and the cookie is put back, which is how a click outlives
// Safari's short cap on JavaScript-written cookies.
export function getMetaClickId() {
  if (typeof window === 'undefined') return null;
  try {
    const cookie = parseFbc(readCookie(FBC_COOKIE));
    if (cookie && isLiveClick(cookie.at)) return buildFbc(cookie.fbclid, cookie.at);
    const click = storedClick();
    if (!click) return null;
    const fbc = buildFbc(click.fbclid, click.at);
    writeFbcCookie(fbc, click.at);
    return fbc;
  } catch (e) {
    return null;
  }
}

// The click ID to hand the server on this visit's page-view ping so it can
// re-issue `_fbc` as a server-set cookie — once per visit, not on every page.
export function fbcToSync() {
  const fbc = getMetaClickId();
  if (!fbc) return null;
  try {
    if (window.sessionStorage.getItem(SYNCED_KEY) === fbc) return null;
  } catch (e) { /* storage blocked: just send it */ }
  return fbc;
}

export function markFbcSynced(fbc) {
  try { window.sessionStorage.setItem(SYNCED_KEY, fbc); } catch (e) { /* best-effort */ }
}

export function captureAttribution() {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  rememberMetaClick(params.get('fbclid'));
  const found = {};
  let hasAny = false;
  for (const key of PARAM_KEYS) {
    const value = params.get(key);
    if (value) {
      found[key] = value;
      hasAny = true;
    }
  }
  if (!hasAny) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...found,
      landingPage: window.location.pathname,
      capturedAt: new Date().toISOString(),
    }));
  } catch (e) {
    // ignore storage write failures (e.g. private browsing quota)
  }
}

// Every checkout path sends this with the order. `fbc` rides along on a
// stored touch so the order carries the click ID even on a path where the
// server never sees the shopper's cookies (a payment provider's webhook).
export function getStoredAttribution() {
  if (typeof window === 'undefined') return null;
  // Read first, and outside the try below: this also puts the `_fbc` cookie
  // back if it has expired, so the checkout request itself carries it.
  const fbc = getMetaClickId();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...JSON.parse(raw), ...(fbc ? { fbc } : {}) };
  } catch (e) {
    return null;
  }
}

// Which campaign / ad set / ad the click came from, pulled out of whatever
// naming style the ad's URL tags used.
//
// Meta's own convention maps its dynamic params onto UTMs — {{campaign.name}}
// to utm_campaign, {{adset.name}} to utm_content, {{ad.name}} to utm_term —
// so those are the fallback. An explicitly named param wins when present,
// because "adset_name" can only mean one thing, whereas utm_content is also
// used by plenty of setups to mean the ad rather than the ad set.
//
// Every value here is whatever was typed into Ads Manager. Nothing derives
// it, so a blank means the ad's URL simply didn't carry it.
export function describeAdPlacement(attr) {
  return {
    campaign: attr?.campaign_name || attr?.utm_campaign || null,
    adset: attr?.adset_name || attr?.utm_content || null,
    ad: attr?.ad_name || attr?.utm_term || null,
  };
}

// Best-effort human label for where a visitor came from, for the live admin
// view. Unlike getStoredAttribution() (which only captures a touch when a
// utm/click-id param is present, since that's all an order needs), this also
// falls back to document.referrer so someone who arrived from an organic
// search or another site still gets a real label instead of just "Direct".
export function describeTrafficSource(attr, referrer) {
  if (attr?.utm_source) return { source: attr.utm_source, campaign: attr.utm_campaign || null };
  if (attr?.fbclid) return { source: 'Facebook/Instagram ad', campaign: null };
  if (attr?.gclid) return { source: 'Google ad', campaign: null };

  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, '');
      const isOwnSite = typeof window !== 'undefined' && host === window.location.hostname;
      if (host && !isOwnSite) {
        if (/google\./.test(host)) return { source: 'Google (organic)', campaign: null };
        if (/bing\./.test(host)) return { source: 'Bing (organic)', campaign: null };
        if (/duckduckgo\./.test(host)) return { source: 'DuckDuckGo (organic)', campaign: null };
        if (/yahoo\./.test(host)) return { source: 'Yahoo (organic)', campaign: null };
        if (/(facebook|instagram)\./.test(host)) return { source: 'Facebook/Instagram', campaign: null };
        if (/tiktok\./.test(host)) return { source: 'TikTok', campaign: null };
        if (/pinterest\./.test(host)) return { source: 'Pinterest', campaign: null };
        return { source: host, campaign: null };
      }
    } catch (e) {
      // malformed referrer — fall through to Direct
    }
  }

  return { source: 'Direct', campaign: null };
}
