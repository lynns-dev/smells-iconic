// "How did you hear about us?" — asked once at checkout (Step 2), optional.
// Meta can't see every sale (organic, word of mouth, TikTok, Google), so the
// buyer's own answer rides along on the order's attribution
// (lib/attribution.js getStoredAttribution) and shows in admin → Orders.
const KEY = 'si-heard-from';

export const HEARD_FROM_OPTIONS = [
  'Instagram or Facebook ad',
  'Instagram (not an ad)',
  'TikTok',
  'Friend or family',
  'Google search',
  'Influencer or creator',
  'Other',
];

export function saveHeardFrom(value) {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch { /* storage blocked */ }
}

export function getHeardFrom() {
  if (typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(KEY) || ''; } catch { return ''; }
}
