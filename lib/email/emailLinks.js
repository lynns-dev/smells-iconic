// Rewrites <a href> targets in an email's HTML into click-tracking
// redirects, and lets a send-id be stamped in per recipient without
// re-parsing the HTML for every send. The redirect target is resolved
// server-side from the stored linkTargets array by index — the click URL
// itself only ever carries an index, never a raw URL, so a recipient
// can't tamper with the query string to turn this into an open redirect.
// Shared by campaigns (lib/emailSend.js) and automation steps
// (lib/automationSend.js) — buildClickUrl(idx) supplies the
// source-specific redirect URL (campaign vs. flow+step), everything else
// about link extraction/wrapping is identical either way.

// Matches only <a ...href="...">, not <link href="..."> (the Google
// Fonts stylesheet lib/emailBlocks.js prepends) or any other tag with an
// href — an email client auto-loading a stylesheet isn't a "click," and
// wrapping that href would both break the stylesheet (redirect instead
// of a CSS response) and inflate click stats on every single open, the
// exact kind of unreliable signal click-based tracking exists to avoid.
const A_HREF_RE = /(<a\b[^>]*\shref=)"([^"]*)"/gi;

export function wrapLinksForSend(html, buildClickUrl) {
  const links = [];
  const wrapped = html.replace(A_HREF_RE, (match, prefix, url) => {
    // {{UNSUB_URL}} (lib/emailBlocks.js's footer) is filled in per
    // recipient below, not click-tracked like a normal link — wrapping
    // it here would both point every recipient's unsubscribe link at the
    // same tracked redirect and consume the placeholder before
    // personalizeSendHtml ever gets to fill in a real token.
    if (!url || url.startsWith('mailto:') || url.startsWith('#') || url === '{{UNSUB_URL}}') return match;
    let idx = links.indexOf(url);
    if (idx === -1) {
      idx = links.length;
      links.push(url);
    }
    return `${prefix}"${buildClickUrl(idx)}"`;
  });
  return { html: wrapped, links };
}

// cartItemsHtml (lib/emailBlocks.js's renderCartItemsHtml) fills
// {{CART_ITEMS}} — only meaningful for the abandoned_checkout automation,
// but harmless to always accept: campaigns and every other automation
// step just never have that token in their content, so the replace is a
// no-op for them.
export function personalizeSendHtml(templateHtml, campaignId, sendId, unsubUrl, cartItemsHtml = '') {
  return templateHtml
    .replace(/{{CAMPAIGN_ID}}/g, campaignId)
    .replace(/{{SEND_ID}}/g, sendId)
    .replace(/{{UNSUB_URL}}/g, unsubUrl)
    .replace(/{{CART_ITEMS}}/g, cartItemsHtml);
}
