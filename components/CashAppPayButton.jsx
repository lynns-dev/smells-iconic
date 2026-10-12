import React from 'react';
import { useRouter } from 'next/router';
import { useCart } from '../lib/useCart';
import { loadAfterpayConfig, loadAfterpayScript, finishAfterpayOrder } from '../lib/afterpayClient';

// Cash App Pay, through the store's Afterpay account (lib/afterpay.js).
// Afterpay's own afterpay.js draws the official button, but only for an
// existing checkout — so once the order is complete (`order` non-null:
// email + address filled in) a Cash App Pay checkout is created and the
// button appears; it's re-created if the total or details change. On a
// computer the shopper scans a QR code and onComplete finishes the order
// here; on a phone they're sent to Cash App and come back through
// /afterpay/return. Renders nothing if Afterpay isn't configured or Cash
// App Pay isn't turned on for the account.

const CONTAINER_ID = 'cash-app-pay';

export default function CashAppPayButton({ order, purchaseKey, onError, onReady, onNeedDetails }) {
  const router = useRouter();
  const { clear } = useCart();
  const [ready, setReady] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  // Shown from the start (like Apple Pay / Afterpay) once Afterpay says it's
  // on, so shoppers can see Cash App is an option before filling the form;
  // Afterpay's real button replaces it once the email and address are in.
  // Dropped for good if Afterpay can't create a Cash App Pay checkout (Cash
  // App Pay not enabled on the account), so it never offers a dead option.
  const [available, setAvailable] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [hint, setHint] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    loadAfterpayConfig().then((c) => { if (!cancelled) setAvailable(Boolean(c.enabled && c.script)); });
    return () => { cancelled = true; };
  }, []);
  const signature = order ? JSON.stringify([order.amount, order.email, order.shipping, order.items?.map((i) => [i.id, i.quantity])]) : '';
  const orderRef = React.useRef(order);
  orderRef.current = order;

  React.useEffect(() => { onReady?.(ready); }, [ready, onReady]);

  React.useEffect(() => {
    if (!signature) { setReady(false); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const config = await loadAfterpayConfig();
        if (!config.enabled || !config.script) return;
        const res = await fetch('/api/afterpay/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...orderRef.current, cashAppPay: true }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) throw new Error(data.error || 'Cash App Pay is unavailable.');
        const AfterPay = await loadAfterpayScript(config.script);
        if (cancelled || !document.getElementById(CONTAINER_ID)) return;
        document.getElementById(CONTAINER_ID).innerHTML = '';
        AfterPay.initializeForCashAppPay({
          countryCode: 'US',
          token: data.token,
          cashAppPayOptions: {
            button: { size: 'medium', width: 'full', theme: 'dark', shape: 'semiround' },
            onComplete: async (event) => {
              const { status, orderToken } = event?.data || {};
              if (status !== 'SUCCESS') { onError('Cash App Pay was not completed. Please try again or pay another way.'); return; }
              setFinishing(true);
              try {
                await finishAfterpayOrder({
                  ref: data.ref, orderToken: orderToken || data.token, purchaseKey, router,
                  clearCart: clear,
                });
              } catch (err) {
                setFinishing(false);
                onError(err.message || 'Cash App Pay could not complete this payment.');
              }
            },
          },
        });
        if (!cancelled) setReady(true);
      } catch (err) {
        // Not configured / not enabled for this account: just stay hidden.
        console.warn('Cash App Pay unavailable:', err.message);
        if (!cancelled) { setReady(false); setFailed(true); }
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  React.useEffect(() => () => {
    try { window.AfterPay?.restartCashAppPay?.(); } catch { /* best-effort */ }
  }, []);

  const showPlaceholder = available && !failed && !ready && !finishing;
  return (
    <div style={{ marginTop: ready || showPlaceholder ? 10 : 0 }}>
      {showPlaceholder && (
        <button
          type="button"
          aria-label="Pay with Cash App Pay"
          onClick={() => {
            if (!order) {
              setHint(true);
              onNeedDetails?.();
            }
          }}
          style={{
            width: '100%', height: 48, border: 'none', borderRadius: 6, cursor: 'pointer',
            background: '#00D64F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
          }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: '#fff', color: '#00D64F', fontSize: 15, fontWeight: 800 }}>$</span>
          {order ? 'Loading Cash App Pay…' : 'Cash App Pay'}
        </button>
      )}
      {showPlaceholder && hint && !order && (
        <p style={{ fontSize: 12, textAlign: 'center', margin: '6px 0 0', color: '#a13d2b' }}>Enter your email and delivery address, then tap Cash App Pay again.</p>
      )}
      <div id={CONTAINER_ID} style={{ display: ready && !finishing ? 'block' : 'none' }} />
      {finishing && <p style={{ fontSize: 13, textAlign: 'center', margin: '8px 0 0' }}>Confirming your Cash App payment…</p>}
    </div>
  );
}
