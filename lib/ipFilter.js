// Requests from these IPs, or from Meta's own crawlers/bots, don't count
// toward site analytics (live visitors, funnel counters, recent-activity
// feed) or server-side Meta ad events -- IPs are the store owner's own
// testing/QA traffic, bots are Meta's link-preview/ad-review crawlers, and
// neither is a real customer. IP list is comma-separated so more can be
// added later via the env var alone.

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || null;
}

export function isExcludedIp(req) {
  const list = (process.env.EXCLUDED_ANALYTICS_IPS || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (list.length === 0) return false;

  const ip = getClientIp(req);
  return ip ? list.includes(ip) : false;
}

// Meta's crawlers identify themselves in their User-Agent -- this covers
// the link-preview crawler (shares in Messenger/Instagram/Facebook,
// "facebookexternalhit" and its older "Facebot" alias), its ad-quality/
// policy-review crawler ("meta-externalagent"), and the Facebook catalog/
// product-feed fetcher ("facebookcatalog"). None of these run the page's
// JS interactively like a real visitor -- when they do fetch tracking
// endpoints directly (e.g. an ad-review bot replaying a landing-page URL),
// this keeps them out of the live count and funnel numbers.
const META_BOT_UA_RE = /facebookexternalhit|facebot|meta-externalagent|facebookcatalog/i;

export function isMetaBot(req) {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && META_BOT_UA_RE.test(ua);
}

export function isExcludedTraffic(req) {
  return isExcludedIp(req) || isMetaBot(req);
}
