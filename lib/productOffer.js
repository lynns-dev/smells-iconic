// One-day, body-mist-only offer experiment. Dollar values are calculated in cents.
export const OFFER_TEST = 'pdp_offer_20261122';
export const OFFER_END = Date.parse('2026-11-23T00:00:00-08:00');
export const OFFER_VARIANTS = ['control', 'mix_match', 'gift_75'];
export const MIST_IDS = ['babygirl', 'ginger-creme', 'cherry-afterglow', 'daddy-is-a-state-of-mind'];
export const offerActive = (now = Date.now()) => now < OFFER_END;
export function offerSavings(items, variant, now = Date.now()) {
  if (!offerActive(now)) return 0;
  const prices = items.filter(i => MIST_IDS.includes(i.id)).flatMap(i => Array.from({length: Math.max(0, Math.min(20, i.quantity || 0))}, () => Math.round(i.price * 100))).sort((a,b)=>a-b);
  // Buy 2 get 1: repeatable; cheapest eligible units free. Gift: one free unit,
  // only when the remaining eligible body-mist spend is strictly over $75.
  if (variant === 'mix_match') return prices.slice(0, Math.floor(prices.length / 3)).reduce((a,b)=>a+b,0) / 100;
  if (variant === 'gift_75' && prices.length && prices.slice(1).reduce((a,b)=>a+b,0) > 7500) return prices[0] / 100;
  return 0;
}
export const offerLabel = v => v === 'mix_match' ? 'Buy 2 get 1 free' : 'Free mist over $75';
export function offerEconomics(items, amount) {
  const units = items.reduce((n,i)=>n+i.quantity,0);
  const costKnown = items.every(i=>MIST_IDS.includes(i.id));
  return { units, costKnown, contribution: costKnown ? Math.round((Number(amount) - units * 5 - 6)*100)/100 : null };
}
