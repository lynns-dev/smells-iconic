// The public origin email links point at (click tracking, unsubscribe,
// confirm) — this store's own site. Email clients can't resolve relative
// links, so this always returns an absolute origin: NEXT_PUBLIC_BASE_URL
// when it's a valid one, otherwise the store's own domain (lib/email/brand.js).
import { BRAND } from './brand';

export function getEmailBaseUrl() {
  const configured = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (!configured) return BRAND.siteUrl;
  const candidate = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid site origin');
    }
    // A Vercel preview/deployment URL would send subscribers to a
    // throwaway host; only trust the configured value for real domains.
    if (url.hostname.endsWith('.vercel.app')) return BRAND.siteUrl;
    return url.origin;
  } catch {
    return BRAND.siteUrl;
  }
}
