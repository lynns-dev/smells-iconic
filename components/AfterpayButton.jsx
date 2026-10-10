import React from 'react';
import { loadAfterpayConfig as loadConfig } from '../lib/afterpayClient';

// Afterpay button for the checkout pages (lib/afterpay.js has the flow).
// Renders nothing unless Afterpay is configured and the order total is in
// the range Afterpay finances. getOrder() runs at click time and returns
// the order, or { error } if the shopper still has something to fill in.

// Afterpay's own "Checkout with Afterpay" button artwork, served from
// Afterpay's asset host. Tried in order; if none loads (blocked, moved),
// the button falls back to a plain mint text button so checkout never
// shows a broken image.
const BUTTON_IMAGES = [
  'https://static.afterpay.com/en-US/integration/button/checkout-with-afterpay/black-on-mint.svg',
  'https://static.afterpay.com/button/checkout-with-afterpay/black-on-mint.svg',
  'https://static.afterpay.com/button/checkout-with-afterpay/white-on-black.svg',
];


export default function AfterpayButton({ total, getOrder, onError, onReady }) {
  const [config, setConfig] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [imageIndex, setImageIndex] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    loadConfig().then((c) => { if (!cancelled) setConfig(c); });
    return () => { cancelled = true; };
  }, []);

  const amount = Number(total) || 0;
  const available = Boolean(config?.enabled && amount >= config.min && amount <= config.max);
  React.useEffect(() => { onReady?.(available); }, [available, onReady]);
  if (!available) return null;

  const click = async () => {
    const order = getOrder();
    if (order?.error) { onError(order.error); return; }
    onError('');
    setBusy(true);
    try {
      const res = await fetch('/api/afterpay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectCheckoutUrl) throw new Error(data.error || 'Afterpay is unavailable right now.');
      window.location.assign(data.redirectCheckoutUrl);
    } catch (err) {
      onError(err.message || 'Afterpay is unavailable right now.');
      setBusy(false);
    }
  };

  const installment = (Math.ceil((amount / 4) * 100) / 100).toFixed(2);
  const image = BUTTON_IMAGES[imageIndex];
  const label = `Checkout with Afterpay — 4 interest-free payments of $${installment}`;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={click}
        disabled={busy}
        aria-label={label}
        style={image ? {
          display: 'block', width: '100%', height: 50, padding: 0, border: 'none', borderRadius: 6, overflow: 'hidden',
          background: '#B2FCE4', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
        } : {
          width: '100%', minHeight: 50, border: 'none', borderRadius: 6, cursor: busy ? 'default' : 'pointer',
          background: '#B2FCE4', color: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '8px 12px', opacity: busy ? 0.6 : 1, fontFamily: 'inherit',
        }}
      >
        {image ? (
          <img
            src={image}
            alt="Checkout with Afterpay"
            onError={() => setImageIndex((i) => i + 1)}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{busy ? 'Opening Afterpay…' : 'Checkout with afterpay'}</span>
        )}
      </button>
      <p style={{ fontSize: 12, textAlign: 'center', margin: '6px 0 0', opacity: 0.75 }}>
        {busy ? 'Opening Afterpay…' : `4 interest-free payments of $${installment}`}
      </p>
    </div>
  );
}
