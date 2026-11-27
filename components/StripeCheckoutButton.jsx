import { getVisitorId } from '../lib/session';
import { exposedExperiments } from '../lib/experiments';
import React from 'react';
import { paymentFetch } from '../lib/paymentFetch';
import { T } from '../lib/theme';
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
const contact = shipping => ({ name: shipping.name || `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim(), address: { line1: shipping.address, line2: shipping.apt || '', city: shipping.city, state: shipping.state, postal_code: shipping.zip, country: 'US' } });
export default function StripeCheckoutButton({ getPayload, disabled, onError, onBusy, onReady, submitRef }) {
  const [failed, setFailed] = React.useState(false);
  const [expressAvailable, setExpressAvailable] = React.useState(false);
  const paymentMount = React.useRef(null);
  const expressMount = React.useRef(null);
  const checkout = React.useRef(null);
  const version = React.useRef(0);
  const snapshot = React.useRef(null);
  const attempted = React.useRef(false);
  const confirming = React.useRef(false);
  const latest = React.useRef(null);
  latest.current = { getPayload, onError, onBusy, onReady };
  const enabled = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED === 'true';
  const stop = () => {
    version.current++; checkout.current?.destroy(); checkout.current = null;
    snapshot.current = null; if (submitRef) submitRef.current = null;
    setExpressAvailable(false); latest.current.onReady?.(false);
  };
  React.useEffect(() => () => { version.current++; checkout.current?.destroy(); if (submitRef) submitRef.current = null; latest.current.onReady?.(false); }, []);
  React.useEffect(() => {
    if (!enabled || confirming.current) return;
    if (snapshot.current && snapshot.current !== orderKey(getPayload())) { stop(); attempted.current = false; }
    if (!attempted.current && !disabled) { attempted.current = true; open(); }
  });
  async function open() {
    const run = ++version.current;
    setFailed(false); latest.current.onReady?.(false); latest.current.onError?.('');
    let instance;
    try {
      const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      if (!key) throw new Error('Payment fields are temporarily unavailable.');
      const payload = { ...getPayload(), visitorId: getVisitorId(), experiments: exposedExperiments(), experimentDevice: window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop' };
      snapshot.current = orderKey(payload);
      const Stripe = await loadStripe();
      if (run !== version.current) return;
      const response = await paymentFetch('/api/stripe/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.clientSecret) throw new Error(data.error || 'Could not connect payment fields.');
      if (run !== version.current) return;
      const stripe = Stripe(key);
      const sdk = stripe.initCheckoutElementsSdk({ clientSecret: data.clientSecret, defaultValues: { billingAddress: contact(payload.shipping) }, elementsOptions: { loader: 'never', savedPaymentMethod: { enableSave: 'never' }, appearance: { theme: 'stripe', variables: { colorPrimary: T.ink, colorText: T.ink, colorBackground: '#ffffff', colorDanger: '#a13d2b', fontFamily: 'Arial, sans-serif', fontSizeBase: '15px', borderRadius: '8px', spacingUnit: '4px' }, rules: { '.Input': { border: '1px solid #b8b8b8', boxShadow: 'none', padding: '13px 12px' }, '.Input:focus': { borderColor: T.ink, boxShadow: `0 0 0 1px ${T.ink}` }, '.Label': { fontSize: '13px', marginBottom: '6px' }, '.Block': { boxShadow: 'none' } } } } });
      const loaded = await sdk.loadActions();
      if (loaded.type === 'error') throw new Error(loaded.error.message);
      if (run !== version.current) return;
      const payment = sdk.createPaymentElement({ layout: 'tabs', fields: { billingDetails: { name: 'never' } }, wallets: { applePay: 'never', googlePay: 'never', link: 'never' } });
      const express = sdk.createExpressCheckoutElement({ buttonHeight: 48, paymentMethods: { applePay: 'auto', googlePay: 'auto', link: 'auto', amazonPay: 'never', paypal: 'never', klarna: 'never' } });
      instance = { destroy: () => { payment.destroy(); express.destroy(); } };
      checkout.current = instance;
      const fail = event => { if (run !== version.current) return; stop(); setFailed(true); latest.current.onError?.(event.error?.message || 'Payment fields could not connect. Please retry.'); };
      payment.on('loaderror', fail);
      payment.on('ready', () => { if (run === version.current) latest.current.onReady?.(true); });
      express.on('ready', event => { if (run === version.current) setExpressAvailable(!!event.availablePaymentMethods && Object.values(event.availablePaymentMethods).some(Boolean)); });
      async function confirm(expressCheckoutConfirmEvent) {
        if (run !== version.current || confirming.current || disabled) return;
        if (snapshot.current !== orderKey(latest.current.getPayload())) { stop(); attempted.current = false; return; }
        confirming.current = true; latest.current.onBusy?.(true); latest.current.onError?.('');
        try {
          const result = await loaded.actions.confirm({ billingAddress: contact(payload.shipping), ...(expressCheckoutConfirmEvent ? { expressCheckoutConfirmEvent } : {}) });
          if (result.type === 'error') throw new Error(result.error.message);
          window.location.assign(`/stripe-return?session_id=${encodeURIComponent(result.session.id)}`);
        } catch (error) { latest.current.onError?.(error.message || 'Payment could not complete. Please try again.'); }
        finally { confirming.current = false; latest.current.onBusy?.(false); }
      }
      express.on('confirm', confirm);
      if (submitRef) submitRef.current = () => confirm();
      express.mount(expressMount.current); payment.mount(paymentMount.current);
    } catch (error) {
      if (run !== version.current) { instance?.destroy(); return; }
      stop(); setFailed(true); latest.current.onError?.(error.message || 'Could not connect payment fields.');
    }
  }
  if (!enabled) return null;
  return <div style={{ width: '100%', marginTop: 20 }}>
    <div style={{ display: expressAvailable ? 'block' : 'none', marginBottom: 20 }}>
      <p style={{ fontSize: 12, color: T.soft, textAlign: 'center', margin: '0 0 10px' }}>Express checkout</p>
      <div ref={expressMount} />
      <p style={{ fontSize: 12, color: T.soft, textAlign: 'center', margin: '14px 0 0' }}>or pay by card</p>
    </div>
    <div style={{ border: `1.5px solid ${T.ink}`, borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: 18, borderBottom: `1px solid ${T.line}`, fontWeight: 700, fontSize: 16 }}>Credit or Debit Card</div>
      <div style={{ padding: '16px 18px' }}>
        <div ref={paymentMount} style={{ minHeight: 108 }} />
        {failed && <button type="button" onClick={open} disabled={disabled} style={{ marginTop: 12, padding: '10px 16px', cursor: 'pointer' }}>Retry payment fields</button>}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px', paddingTop: 14 }}>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: T.soft }}><span aria-hidden="true">🔒</span> Secure checkout powered by Stripe.<br />Your card details are encrypted and never stored on our servers.</p>
        </div>
      </div>
    </div>
  </div>;
}
