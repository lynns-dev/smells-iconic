import { getVisitorId } from '../lib/session';
import { exposedExperiments } from '../lib/experiments';
import React from 'react';
import { paymentFetch } from '../lib/paymentFetch';
let stripeScript;
function loadStripe() {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (!stripeScript) stripeScript = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/endive/stripe.js';
    script.async = true;
    script.onload = () => window.Stripe ? resolve(window.Stripe) : reject(new Error('Payment form could not load.'));
    script.onerror = () => { stripeScript = null; reject(new Error('Payment form could not load.')); };
    document.head.appendChild(script);
  });
  return stripeScript;
}
const orderKey = p => JSON.stringify([p.amount, p.items, p.email, p.shipping, p.discountCode, p.freeShipping, p.shippingProtection]);
export default function StripeCheckoutButton({ getPayload, disabled, onError, onBusy }) {
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const mount = React.useRef(null);
  const checkout = React.useRef(null);
  const version = React.useRef(0);
  const snapshot = React.useRef(null);
  const attempted = React.useRef(false);
  const enabled = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED === 'true';
  const stop = () => { version.current++; checkout.current?.destroy(); checkout.current = null; snapshot.current = null; setActive(false); setBusy(false); onBusy?.(false); };
  React.useEffect(() => () => { version.current++; checkout.current?.destroy(); onBusy?.(false); }, []);
  // The existing checkout step already validates contact and shipping. Mount
  // payment fields immediately here, with no extra Continue button. Rebuild
  // automatically when an order, address, or discount changes.
  React.useEffect(() => {
    if (!enabled) return;
    if (snapshot.current && snapshot.current !== orderKey(getPayload())) {
      stop(); attempted.current = false;
    }
    if (!attempted.current && !disabled) {
      attempted.current = true;
      open();
    }
  });
  async function open() {
    const run = ++version.current;
    setBusy(true); onBusy?.(true); onError?.('');
    try {
      const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!key) throw new Error('Payment form is temporarily unavailable.');
      const payload = { ...getPayload(), experiments: exposedExperiments(), experimentDevice: window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop', visitorId: getVisitorId() }; snapshot.current = orderKey(payload);
      const Stripe = await loadStripe();
      if (run !== version.current) return;
      const stripe = Stripe(key);
      const response = await paymentFetch('/api/stripe/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.clientSecret) throw new Error(data.error || 'Could not load payment form.');
      if (run !== version.current) return;
      const create = stripe.createEmbeddedCheckoutPage;
      if (!create) throw new Error('Payment form could not load.');
      const instance = await create.call(stripe, { fetchClientSecret: async () => data.clientSecret });
      if (run !== version.current) { instance.destroy(); return; }
      checkout.current = instance; instance.mount(mount.current); setActive(true); setBusy(false); onBusy?.(false);
    } catch (e) { if (run === version.current) { stop(); onError?.(e.message || 'Could not load payment form.'); } }
  }
  if (!enabled) return null;
  return <div style={{ width: '100%', marginTop: 16 }}>
    {!active && (busy || !attempted.current) && <p role="status" style={{ margin: '12px 0', fontSize: 14 }}>Loading secure payment form…</p>}
    {!active && !busy && attempted.current && <button id="stripe-checkout-button" type="button" disabled={disabled} style={{ width: '100%', padding: 15, cursor: 'pointer' }} onClick={open}>Retry loading payment form</button>}
    <div ref={mount} style={{ width: '100%' }} />
  </div>;
}
