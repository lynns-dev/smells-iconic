// Email content model: campaigns and automation steps store raw HTML
// pasted in directly (not a visual block builder) and it's wrapped here
// with the account's logo (top) and a CAN-SPAM footer (bottom) from
// lib/settingsStore.js — table-based outer layout with inline styles
// since Gmail/Outlook/Apple Mail strip <style> tags and don't support
// modern CSS (flexbox/grid) reliably; the pasted content itself is the
// author's own HTML, styled however they wrote it. This same module
// runs both server-side (API routes, to compute the HTML that actually
// gets sent) and client-side (the admin composer's live preview), so
// there's exactly one renderer to keep in sync.

const MAX_WIDTH = 600;
const FALLBACK_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
// The site's headline serif (lib/theme.js T.serif, set light italic) —
// always loaded alongside the body font so headings in the automation
// emails match the site. Gmail and Outlook ignore web fonts, hence the
// Georgia fallback, which italicises close to Source Serif.
export const EMAIL_SERIF = "'Source Serif 4', Georgia, 'Times New Roman', serif";
const SERIF_FONT_URL = 'https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..600;1,8..60,300..600&display=swap';
const BLUSH = T.blush;
const LINE = '#EDE6E1';
// This store's own brand ink/soft (lib/theme.js) — the default color for
// any content that doesn't set its own (the footer, unstyled fallback
// text), not just a generic gray.
import * as catalog from '../products';
import { BRAND } from './brand';
import { getEmailBaseUrl } from './emailBaseUrl';
import { T } from '../theme';

const INK = T.ink;
const SOFT = T.soft;

// A short curated list rather than every Google Font — Outlook desktop
// and a fair share of webmail clients ignore linked web fonts entirely
// and fall back to the sans-serif stack regardless of which one is
// picked, so the fallback matters as much as the choice itself. Fraunces
// is Veil's actual display serif (paired with Hanken Grotesk on-site),
// included here in case a headline-heavy campaign wants it, but Hanken
// Grotesk is the safer default for full-body email text.
export const EMAIL_FONTS = ['Inter', 'Hanken Grotesk', 'Fraunces', 'Poppins', 'Montserrat', 'Lato', 'Playfair Display', 'Roboto', 'Open Sans'];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Fixed width attribute rather than max-height — Outlook ignores CSS
// sizing on images and would otherwise show the logo at its full pixel size.
// With no logo image set, the store's text wordmark stands in (lib/email/brand.js).
function renderLogoRow(logoUrl) {
  if (!logoUrl) {
    if (!BRAND.wordmark) return '';
    return `<tr><td style="padding:28px 24px;text-align:center;border-bottom:1px solid ${LINE};"><a href="${BRAND.siteUrl}" style="font-family:'Archivo Black', Helvetica, Arial, sans-serif;font-size:22px;font-weight:900;letter-spacing:0.02em;color:${INK};text-decoration:none;">${escapeHtml(BRAND.wordmark)}</a></td></tr>`;
  }
  return `<tr><td style="padding:32px 24px 20px;text-align:center;border-bottom:1px solid ${LINE};"><a href="${BRAND.siteUrl}" style="text-decoration:none;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(BRAND.name)}" width="180" style="width:180px;max-width:60%;height:auto;display:inline-block;border:0;" /></a></td></tr>`;
}

// The pasted HTML is trusted content the merchant wrote themselves (same
// trust level as any other admin-only field in this app), so it's
// embedded as-is rather than sanitized — a default font/color is applied
// to the containing cell so plain, unstyled markup still reads sensibly.
function renderContentRow(html, font) {
  if (!html) return '';
  return `<tr><td style="padding:32px 40px 16px;font-family:${font};font-size:15px;line-height:1.6;color:${INK};">${html}</td></tr>`;
}

// CAN-SPAM requires a visible physical address + working unsubscribe
// mechanism in the message body itself — the List-Unsubscribe header
// (lib/resendEmail.js) enables one-click unsubscribe in mail clients that
// support it, but isn't a substitute for a visible link a human can see
// and click. {{UNSUB_URL}} is filled in per-recipient by
// lib/emailLinks.js's personalizeSendHtml, same pattern as
// {{CAMPAIGN_ID}}/{{SEND_ID}} — in preview mode (no real recipient) it's
// substituted with '#' instead so the composer's live preview doesn't
// show raw template syntax.
function renderFooter(settings, font, preview) {
  const unsubUrl = preview ? '#' : '{{UNSUB_URL}}';
  const lines = [settings?.companyName, settings?.physicalAddress].filter(Boolean).map(escapeHtml).join('<br/>');
  return `
    <tr><td style="padding:28px 24px;text-align:center;font-family:${font};font-size:12px;line-height:1.6;color:${SOFT};background:${BLUSH};">
      <div style="font-family:${EMAIL_SERIF};font-style:italic;font-size:18px;color:${INK};margin-bottom:6px;">${escapeHtml(BRAND.tagline)}</div>
      <div style="margin-bottom:14px;"><a href="${BRAND.siteUrl}/shop" style="color:${INK};font-size:11px;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;">Shop ${escapeHtml(BRAND.name)}</a></div>
      ${lines}
      <div style="margin-top:8px;"><a href="${unsubUrl}" style="color:${SOFT};text-decoration:underline;">Unsubscribe</a></div>
    </td></tr>`;
}

// Renders an abandoned cart/checkout's items as an email-safe HTML
// block — substituted wherever {{CART_ITEMS}} appears in an automation
// step's HTML (lib/emailLinks.js's personalizeSendHtml), same mechanism
// as {{UNSUB_URL}}. Subscribers who don't have any captured items (the
// Shopify tracking-pixel path doesn't send them, or the checkout never
// got far enough to capture a cart) get an empty string, so a step
// written with {{CART_ITEMS}} in it doesn't break for them — it just
// renders nothing where the product list would go.
// Cart rows in abandoned-checkout / add-to-cart emails. Captured carts
// carry the site's own relative image paths ("/images/x.png") — which an
// email client can't load — and carts that came in through the leads
// sync carry only id/name/quantity. So each row is filled in from the
// product catalogue by id, and its image is served as an absolute,
// email-sized thumbnail through the site's image optimizer (the product
// PNGs are up to ~1.6MB; this sends a ~128px version instead).
function catalogEntry(id) {
  if (!id) return null;
  return catalog.getProductById?.(id) || (catalog.FREE_GIFT?.id === id ? catalog.FREE_GIFT : null);
}

export function emailImageUrl(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  const path = src.startsWith('/') ? src : `/${src}`;
  return `${getEmailBaseUrl()}/_next/image?url=${encodeURIComponent(path)}&w=256&q=80`;
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

// One card per product (image, name, size, quantity, line price) on a
// soft blush panel, with a subtotal under the list. The free gift is
// added to carts at price 0 (lib/useCart.js), so it reads "Free".
export function renderCartItemsHtml(items) {
  if (!items || items.length === 0) return '';
  let subtotal = 0;
  let priced = false;
  const rows = items
    .map((raw, i) => {
      const product = catalogEntry(raw.id);
      const quantity = Number(raw.quantity) || 1;
      const item = {
        ...raw,
        name: raw.name || product?.name,
        size: product?.size || null,
        // Some catalogue entries lead with a placeholder SVG, which mail
        // clients won't show — use the first real photo.
        image: raw.image || product?.images?.find((src) => !src.endsWith('.svg')) || null,
        // Leads-sync carts carry no price, and the gift's catalogue price
        // is its retail value — it always rings up free.
        price: raw.id === catalog.FREE_GIFT?.id ? 0 : raw.price ?? product?.price ?? null,
      };
      if (item.price != null) {
        priced = true;
        subtotal += Number(item.price) * quantity;
      }
      const imageUrl = emailImageUrl(item.image);
      const img = imageUrl
        ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name || '')}" width="88" height="88" style="width:88px;height:88px;object-fit:cover;display:block;border:0;background:#FFFFFF;" />`
        : `<div style="width:88px;height:88px;background:#FFFFFF;"></div>`;
      const meta = [item.size, `Qty ${quantity}`].filter(Boolean).map(escapeHtml).join(' &middot; ');
      const price = item.price == null
        ? ''
        : Number(item.price) === 0 ? 'Free' : money(Number(item.price) * quantity);
      const divider = i > 0 ? `border-top:1px solid rgba(46,38,32,0.10);` : '';
      return `
        <tr>
          <td width="88" style="padding:14px 16px 14px 0;width:88px;vertical-align:middle;${divider}"><a href="${BRAND.siteUrl}/checkout" style="text-decoration:none;">${img}</a></td>
          <td style="padding:14px 0;vertical-align:middle;${divider}">
            <div style="font-family:${EMAIL_SERIF};font-size:18px;line-height:1.3;color:${INK};">${escapeHtml(item.name || 'Item')}</div>
            <div style="font-size:12px;letter-spacing:0.04em;color:${SOFT};opacity:0.75;margin-top:4px;">${meta}</div>
          </td>
          <td align="right" style="padding:14px 0 14px 12px;vertical-align:middle;white-space:nowrap;font-size:14px;font-weight:600;color:${INK};${divider}">${price}</td>
        </tr>`;
    })
    .join('\n');

  const total = priced
    ? `<tr><td colspan="3" style="padding:14px 0 0;border-top:1px solid rgba(46,38,32,0.25);">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:${INK};">Subtotal</td>
          <td align="right" style="font-size:15px;font-weight:600;color:${INK};">${money(subtotal)}</td>
        </tr></table>
      </td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;background:${BLUSH};">
  <tr><td style="padding:20px 24px;">
    <div style="font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:${INK};margin-bottom:4px;">Your bag</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${total}</table>
  </td></tr>
</table>`;
}

// Standing in for {{CART_ITEMS}} in the composer's live preview only —
// a real send fills it from the actual recipient's captured cart via
// personalizeSendHtml, but the preview has no recipient, same reasoning
// as {{UNSUB_URL}} rendering as '#' there instead of staying raw.
const PREVIEW_CART_ITEMS = [
  { id: 'babygirl', quantity: 1 },
  { id: 'daddy-is-a-state-of-mind', quantity: 1 },
];

export function renderEmailHtml(contentHtml, settings = {}, { preview = false } = {}) {
  const font = `'${settings.emailFont || 'Inter'}', ${FALLBACK_FONT}`;
  const fontLink = [
    settings.emailFont
      ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(settings.emailFont)}:wght@400;600;700&display=swap" />`
      : '',
    `<link rel="stylesheet" href="${SERIF_FONT_URL}" />`,
  ].join('');

  const content = preview
    ? (contentHtml || '')
      .replace(/{{CART_ITEMS}}/g, renderCartItemsHtml(PREVIEW_CART_ITEMS))
      .replace(/{{DISCOUNT_CODE}}/g, 'ICONIC15')
    : contentHtml;

  const rows = [
    renderLogoRow(settings.logoUrl || BRAND.logoUrl),
    renderContentRow(content, font),
    renderFooter(settings, font, preview),
  ].join('\n');

  return `${fontLink}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3F0;">
  <tr><td align="center" style="padding:24px 0;">
    <table role="presentation" width="${MAX_WIDTH}" cellpadding="0" cellspacing="0" style="max-width:${MAX_WIDTH}px;width:100%;background:#ffffff;">
      ${rows}
    </table>
  </td></tr>
</table>`;
}
