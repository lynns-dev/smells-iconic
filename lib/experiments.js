import React from 'react';
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
  },
  cart_discount_visibility: {
    name: 'Cart: discount offer expanded vs collapsed', variants: ['control', 'collapsed'], started: '2026-11-06',
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
  if (!exp || exp.winner || typeof window === 'undefined') return;
  const variant = getVariant(id);
  if (store((s) => s.getItem(SEEN(id))) === variant) return;
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
    if (exp.winner) continue;
    const seen = store((s) => s.getItem(SEEN(id)));
    if (seen && exp.variants.includes(seen)) out[id] = seen;
  }
  return out;
}
