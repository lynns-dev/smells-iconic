import React from 'react';
import { generateEventId } from '../lib/fbPixel';
import { loadPaypalSdk } from '../lib/paypalSdk';
import { getStoredAttribution } from '../lib/attribution';
import { getSessionId } from '../lib/session';

const FUNDING_LABELS = {
  paypal: 'PayPal',
  venmo: 'Venmo',
};

// amount/items/eventId/url change on every render as the cart/discount
// change, but paypal.Buttons().render() only runs once — the createOrder/
// onApprove callbacks it's given are closures from that first render. A ref
// keeps them reading the current values without tearing down and
// re-rendering the button on every keystroke.
//
// fundingSource picks which wallet button this instance renders — 'paypal'
// (default) or 'venmo', the only two funding sources paypal.Buttons({
// fundingSource }) actually supports. Apple Pay and Google Pay are NOT
// available this way despite seeming symmetrical — see ApplePayButton.jsx
// and GooglePayButton.jsx, which use PayPal's separate paypal.Applepay()/
// paypal.Googlepay() components instead.
export default function PayPalButton({ amount, items, url, disabled, onSuccess, onError, fundingSource = 'paypal' }) {
  const containerRef = React.useRef(null);
  const stateRef = React.useRef({ amount, items, url, eventId: null });
  stateRef.current.amount = amount;
  stateRef.current.items = items;
  stateRef.current.url = url;
  const [eligible, setEligible] = React.useState(true);

  React.useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId || !containerRef.current) return;

    let cancelled = false;

    loadPaypalSdk(clientId)
      .then((paypal) => {
        if (cancelled || !containerRef.current) return;

        // Explicit funding source for every instance, including PayPal
        // itself — leaving it undefined lets the SDK auto-stack every
        // eligible funding source (Venmo included, since enable-funding
        // opts it in account-wide) inside that one button, duplicating the
        // separate Venmo instance rendered alongside it.
        const resolvedFundingSource = paypal.FUNDING[fundingSource.toUpperCase()];

        const buttons = paypal.Buttons({
          fundingSource: resolvedFundingSource,
          // No color/shape/label overrides — renders PayPal's own default
          // branded button rather than a custom-styled variant.
          style: { layout: 'vertical', height: 45 },
          createOrder: async () => {
            stateRef.current.eventId = generateEventId();
            const res = await fetch('/api/paypal/create-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amount: stateRef.current.amount }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not start PayPal checkout.');
            return data.id;
          },
          onApprove: async (data) => {
            const res = await fetch('/api/paypal/capture-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: data.orderID,
                items: stateRef.current.items,
                eventId: stateRef.current.eventId,
                url: stateRef.current.url,
                paymentMethod: FUNDING_LABELS[fundingSource] || 'PayPal',
                attribution: getStoredAttribution(),
                sessionId: getSessionId(),
              }),
            });
            const result = await res.json();
            if (!res.ok) {
              onError?.(result.error || 'Payment could not be completed.');
              return;
            }
            onSuccess?.({ ...result, eventId: stateRef.current.eventId });
          },
          onError: (err) => {
            console.error('PayPal button error:', err);
            onError?.(`PayPal checkout failed: ${err?.message || err}`);
          },
        });

        if (!buttons.isEligible()) {
          setEligible(false);
          return;
        }

        buttons.render(containerRef.current);
      })
      .catch((err) => {
        // The SDK failing to *load* (blocked by an ad/privacy blocker, a
        // network hiccup, a bad client ID) happens before the shopper has
        // touched anything — it shouldn't surface as a page-level error
        // next to the card form. Just hide this button; card checkout still
        // works. A failure *during* an actual payment attempt is handled by
        // the onError callback above and does get reported.
        console.error('PayPal SDK load failed:', err);
        if (!cancelled) setEligible(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!eligible) return null;

  return (
    <div style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <div ref={containerRef} />
    </div>
  );
}
