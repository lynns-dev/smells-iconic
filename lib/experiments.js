import { OFFER_TEST, OFFER_END, offerActive } from './productOffer';
import React from 'react';
import { BABYGIRL_PRICE_TEST } from './products';
import { getVisitorId, getSessionId } from './session';

// Split tests (A/B). Each visitor is put in one variant per test, 50/50, and
// stays there (kept on this device). A test only counts a visitor once they
// have actually seen it (exposeExperiment), and from then on every cart /
// checkout / purchase step they reach is counted under their variant
// (lib/cartTracking.js → pages/api/track/cart.js → lib/experimentsStore.js).
// Results: admin → /admin/tests.
//
// To end a test: set `winner` to the variant that should show for everyone.
// Everyone then sees it and nothing more is counted.

export const EXPERIMENTS = {
  [OFFER_TEST]: {
    name: 'Product page offers: current offer vs buy 2 get 1 vs gift over $75',
    status: 'completed', winner: 'gift_75', // Owner selected permanent gift offer November 23, 2026.
    variants: ['control', 'mix_match', 'gift_75'], started: '2026-11-22', endsAt: OFFER_END,
    primaryMetric: 'purchased',
    hypothesis: 'Compare purchasing visitors, units and estimated contribution per visitor with $5 per mist and $6 shipping per order. Ongoing test; no automatic winner.',
  },
  shop_mobile_grid_v1: {
    name: 'Mobile collection: one column vs two columns',
    variants: ['control', 'two_columns'], started: '2026-11-19', primaryMetric: 'purchased',
    status: 'completed', winner: 'two_columns', // Owner selected two columns November 21, 2026; not a statistical significance claim.
    hypothesis: 'Two columns help mobile collection visitors compare scents and increase confirmed purchases. Both arms share the shorter introduction, copy and photo framing.',
  },
  [BABYGIRL_PRICE_TEST]: {
    name: 'Babygirl No. 01 Perfume: $65 vs $59',
    variants: ['control', 'price_59'], started: '2026-11-19', primaryMetric: 'purchased',
    hypothesis: 'The $59 price increases the share of exposed shoppers who buy Babygirl Perfume.',
  },
  babygirl_scent_landing_v1: {
    name: 'Babygirl PDP: current format vs scent + identity landing page',
    variants: ['control', 'landing'], started: '2026-11-16', primaryMetric: 'purchased',
    status: 'completed', winner: 'control', // Owner selected current product format November 19, 2026.
    hypothesis: 'A scent- and identity-led landing format increases confirmed purchase conversion among Babygirl page visitors.',
  },
  shop_pay_checkout_v1: {
    name: 'Checkout: current payment options vs adding Shop Pay',
    variants: ['control', 'shop_pay'], started: '2026-11-07', status: 'completed', winner: 'shop_pay', primaryMetric: 'purchased',
    hypothesis: 'Adding Shop Pay increases completed purchases per checkout visitor. Stable 50/50 assignment; purchases confirmed server-side across all payment methods.',
  },
  pdp_proof: {
    name: 'Product page: review + scent notes above Add to bag',
    variants: ['control', 'proof'],
    started: '2026-11-05',
    // Ended 2026-11-06: Lynnsee called it, review + scent notes now show for everyone.
    winner: 'proof',
  },
  duo_offer: {
    name: 'Babygirl / Daddy page: Pick Your Role Duo card above Add to bag',
    variants: ['control', 'duo'],
    started: '2026-11-05',
    // Ended 2026-11-06: control selected; the Duo card is disabled for everyone.
    winner: 'control',
  },
  hero_babygirl: {
    name: 'Homepage hero: Babygirl "they\'ll lean in" (matches the ads) vs Daddy',
    variants: ['control', 'babygirl'],
    started: '2026-11-06',
    // Ended 2026-11-06: Lynnsee selected Babygirl as the permanent homepage hero.
    winner: 'babygirl',
  },
  cart_checkout_cta: {
    name: 'Cart: checkout CTA wording', variants: ['control', 'continue'], started: '2026-11-06',
    // Ended 2026-11-08: keep Secure Checkout as the permanent cart CTA.
    winner: 'control',
  },
  cart_discount_visibility: {
    name: 'Cart: discount offer expanded vs collapsed', variants: ['control', 'collapsed'], started: '2026-11-06',
    winner: 'control', // Expanded offer; owner selected November 16, 2026.
  },
  cart_total_reassurance: {
    name: 'Cart: shipping and total reassurance beside checkout',
    variants: ['control', 'reassurance'],
    started: '2026-11-06',
    // Ended 2026-11-07: reassurance selected as the permanent cart experience.
    winner: 'reassurance',
  },
  ship_free_all: {
    name: 'Shipping: free on every order vs free at $50',
    variants: ['control', 'free'],
    started: '2026-11-05',
    winner: 'free',
  },
};

const KEY = (id) => `si-exp:${id}`;
const SEEN = (id) => `si-exp-seen:${id}`;

function store(fn) {
  try { return fn(window.localStorage); } catch { return null; }
}

// The visitor's variant for a test ('control' on the server and for unknown tests).
export function getVariant(id) {
  const exp = EXPERIMENTS[id];
  if (!exp || typeof window === 'undefined') return 'control';
  if (exp.winner) return exp.winner;
  // ?exp_<id>=<variant> forces a variant on this device (for checking a test).
  try {
    const forced = new URLSearchParams(window.location.search).get(`exp_${id}`);
    if (forced && exp.variants.includes(forced)) {
      store((s) => s.setItem(KEY(id), forced));
      return forced;
    }
  } catch { /* ignore */ }
  let v = store((s) => s.getItem(KEY(id)));
  if (!exp.variants.includes(v)) {
    v = exp.variants[Math.floor(Math.random() * exp.variants.length)];
    store((s) => s.setItem(KEY(id), v));
  }
  return v;
}

// React hook: 'control' on first render (matches the server), then the real variant.
export function useVariant(id) {
  const [v, setV] = React.useState('control');
  React.useEffect(() => { setV(getVariant(id)); }, [id]);
  return v;
}

// Marks that this visitor saw the test, counted once per visitor.
export function exposeExperiment(id) {
  const exp = EXPERIMENTS[id];
  if (!exp || (id === OFFER_TEST && !offerActive()) || exp.winner || typeof window === 'undefined') return;
  const variant = getVariant(id);
  // Refresh this page test's session link on return visits. Its visitor
  // denominator remains deduplicated by recordExposure on the server.
  if (store((s) => s.getItem(SEEN(id))) === variant && id !== 'babygirl_scent_landing_v1' && id !== BABYGIRL_PRICE_TEST) return;
  store((s) => s.setItem(SEEN(id), variant));
  try {
    fetch('/api/track/exp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, variant, visitorId: getVisitorId(), sessionId: getSessionId() }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* tracking never gets in the way */ }
}

// The tests this visitor has seen, with their variant: sent with every cart step.
export function exposedExperiments() {
  if (typeof window === 'undefined') return {};
  const out = {};
  for (const [id, exp] of Object.entries(EXPERIMENTS)) {
    if (exp.winner || (exp.endsAt && Date.now() >= exp.endsAt)) continue;
    const seen = store((s) => s.getItem(SEEN(id)));
    if (seen && exp.variants.includes(seen)) out[id] = seen;
  }
  return out;
}
