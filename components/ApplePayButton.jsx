import React from 'react';
import { generateEventId } from '../lib/fbPixel';
import { loadPaypalSdk } from '../lib/paypalSdk';

// PayPal's Apple Pay bridge: paypal.Applepay() reports whether this PayPal
// account/browser combo is eligible, then hands the native ApplePaySession
// merchant-validation and payment-token handshake back through
// validateMerchant()/confirmOrder() — confirmOrder finalizes the same
// create-order/capture-order pair PayPalButton uses, just authorized via
// Apple Pay instead of the PayPal login flow.
//
// Requires real setup only obtainable from the PayPal/Apple dashboards:
// Apple Pay must be enabled for this PayPal account, the site's domain
// registered with PayPal, and the resulting domain-association file hosted
// at /.well-known/apple-developer-merchantid-domain-association. It also
// only ever renders in Safari on a device with a card in Apple Wallet —
// this can't be exercised from a regular browser or this environment.
export default function ApplePayButton({ amount, items, url, disabled, onSuccess, onError }) {
  const [eligible, setEligible] = React.useState(false);
  const applepayRef = React.useRef(null);
  const stateRef = React.useRef({ amount, items, url });
  stateRef.current.amount = amount;
  stateRef.current.items = items;
  stateRef.current.url = url;

  React.useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    if (!clientId || typeof window === 'undefined' || !window.ApplePaySession) return;

    let cancelled = false;
    loadPaypalSdk(clientId)
      .then(async (paypal) => {
        if (cancelled || !paypal.Applepay) return;
        const applepay = paypal.Applepay();
        applepayRef.current = applepay;
        const config = await applepay.config();
        if (cancelled) return;
        if (config?.isEligible && window.ApplePaySession.canMakePayments()) setEligible(true);
      })
      .catch((err) => {
        // Same rule as PayPalButton: a setup/eligibility failure just hides
        // this button, it shouldn't surface as a page-level error before the
        // shopper has touched anything.
        console.error('Apple Pay setup failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = async () => {
    const applepay = applepayRef.current;
    if (!applepay) return;

    try {
      const config = await applepay.config();
      const paymentRequest = {
        countryCode: config.countryCode,
        currencyCode: config.currencyCode,
        merchantCapabilities: config.merchantCapabilities,
        supportedNetworks: config.supportedNetworks,
        requiredShippingContactFields: ['postalAddress', 'name'],
        requiredBillingContactFields: ['postalAddress'],
        total: { label: 'The Sculpt Wand', amount: Number(stateRef.current.amount).toFixed(2), type: 'final' },
      };

      const session = new window.ApplePaySession(4, paymentRequest);

      session.onvalidatemerchant = async (event) => {
        try {
          const { merchantSession } = await applepay.validateMerchant({ validationUrl: event.validationURL });
          session.completeMerchantValidation(merchantSession);
        } catch (err) {
          console.error('Apple Pay merchant validation failed:', err);
          session.abort();
          onError?.(`Apple Pay could not be verified: ${err?.message || err}`);
        }
      };

      session.onpaymentauthorized = async (event) => {
        try {
          const eventId = generateEventId();
          const orderRes = await fetch('/api/paypal/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: stateRef.current.amount }),
          });
          const orderData = await orderRes.json();
          if (!orderRes.ok) throw new Error(orderData.error || 'Could not start Apple Pay checkout.');

          await applepay.confirmOrder({
            orderId: orderData.id,
            token: event.payment.token,
            billingContact: event.payment.billingContact,
            shippingContact: event.payment.shippingContact,
          });

          const captureRes = await fetch('/api/paypal/capture-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: orderData.id,
              items: stateRef.current.items,
              eventId,
              url: stateRef.current.url,
              paymentMethod: 'Apple Pay',
            }),
          });
          const result = await captureRes.json();
          if (!captureRes.ok) throw new Error(result.error || 'Payment could not be completed.');

          session.completePayment({ status: window.ApplePaySession.STATUS_SUCCESS });
          onSuccess?.({ ...result, eventId });
        } catch (err) {
          console.error('Apple Pay payment failed:', err);
          session.completePayment({ status: window.ApplePaySession.STATUS_FAILURE });
          onError?.(err.message || 'Apple Pay checkout failed. Please try again.');
        }
      };

      session.begin();
    } catch (err) {
      console.error('Apple Pay error:', err);
      onError?.(`Apple Pay checkout failed: ${err?.message || err}`);
    }
  };

  if (!eligible) return null;

  return (
    <div style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <button type="button" className="apple-pay-button" onClick={handleClick} aria-label="Pay with Apple Pay" />
      <style jsx>{`
        .apple-pay-button {
          -webkit-appearance: -apple-pay-button;
          -apple-pay-button-type: plain;
          -apple-pay-button-style: black;
          width: 100%;
          height: 45px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
