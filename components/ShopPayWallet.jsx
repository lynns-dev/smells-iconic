import React from 'react';
import { useRouter } from 'next/router';
import { useCart } from '../lib/useCart';
import { getSessionId } from '../lib/session';
import { getStoredAttribution } from '../lib/attribution';
import { clearCheckoutProgress } from '../lib/checkoutProgress';

const SDK_URL = 'https://cdn.shopify.com/shopifycloud/shop-js/shop-pay-payment-request.js';
const RECOVERY_KEY = 'shop-pay-wallet-recovery';
let sdkPromise;
function sdk() {
  if (window.ShopPay?.PaymentRequest) return Promise.resolve(window.ShopPay.PaymentRequest);
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = SDK_URL; script.async = true;
    script.onload = () => window.ShopPay?.PaymentRequest ? resolve(window.ShopPay.PaymentRequest) : reject(new Error('Shop Pay could not load.'));
    script.onerror = () => { script.remove(); sdkPromise = null; reject(new Error('Shop Pay could not load.')); };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

async function api(body) {
  const res = await fetch('/api/shop-pay/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Shop Pay is temporarily unavailable.');
  return data;
}

export default function ShopPayWallet({ email, shippingCost, grandTotal, purchaseKey = 'si-purchase', onBusy, onError }) {
  const { cart, appliedDiscount, clear } = useCart();
  const router = useRouter();
  const container = React.useRef(null);
  const callbacks = React.useRef({ onBusy, onError, clear, router });
  callbacks.current = { onBusy, onError, clear, router };
  const [enabled, setEnabled] = React.useState(false);
  const [variant, setVariant] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [version, setVersion] = React.useState(0);
  const signature = JSON.stringify({ cart: cart.map(i => ({ id: i.id, quantity: i.quantity, upsell: i.upsell === true })),
    email, discountCode: appliedDiscount?.code || '', freeShipping: shippingCost === 0, expectedAmount: Number(grandTotal.toFixed(2)) });

  React.useEffect(() => {
    let stopped = false;
    (async () => {
      const config = await fetch('/api/shop-pay/wallet').then(r => r.json());
      if (stopped) return;
      if (sessionStorage.getItem(RECOVERY_KEY)) { setVariant('shop_pay'); setEnabled(true); return; }
      if (!config.enabled) return;
      let visitorId;
      try {
        visitorId = localStorage.getItem('shop-pay-test-visitor');
        if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem('shop-pay-test-visitor', visitorId); }
      } catch { visitorId = getSessionId(); }
      const enrollment = await api({ action: 'enroll', visitorId, sessionId: getSessionId(), device: window.innerWidth < 768 ? 'mobile' : 'desktop' });
      if (!stopped) { setVariant(enrollment.variant); setEnabled(true); }
    })().catch(() => {});
    return () => { stopped = true; };
  }, []);

  React.useEffect(() => {
    if (!enabled || variant !== 'shop_pay' || !email || !cart.length) return undefined;
    let disposed = false, session, interval, checking = false, completed = false, checkout;
    const errorResponse = message => ({ errors: [{ type: 'generalError', message }] });
    const busy = value => callbacks.current.onBusy?.(value);
    const report = err => { if (!disposed) callbacks.current.onError?.(err.message || 'Shop Pay is temporarily unavailable.'); };
    const saveRecovery = () => { try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ id: checkout.id, access: checkout.access })); } catch {} };
    const poll = async () => {
      if (checking || completed || !checkout || disposed) return;
      checking = true;
      try {
        const result = await api({ action: 'status', id: checkout.id, access: checkout.access });
        if (disposed) return;
        if (result.status === 'paid') {
          completed = true; clearInterval(interval); session?.close(); busy(false);
          sessionStorage.removeItem(RECOVERY_KEY);
          if (result.purchase.test) { setMessage('Shop Pay test payment verified. No live order was recorded.'); return; }
          sessionStorage.setItem(purchaseKey, JSON.stringify(result.purchase));
          clearCheckoutProgress();
          await callbacks.current.router.push('/success');
          callbacks.current.clear();
        } else if (result.status === 'created') {
          clearInterval(interval); sessionStorage.removeItem(RECOVERY_KEY); busy(false);
          setVersion(v => v + 1);
        } else if (result.status === 'failed') {
          clearInterval(interval); sessionStorage.removeItem(RECOVERY_KEY); busy(false);
          setMessage('The payment was declined. You can retry in Shop Pay or choose another payment method.');
        } else { busy(true); setMessage('Confirming your Shop Pay payment. Please keep this page open.'); }
      } catch { if (!disposed) setMessage('Your payment is still being verified. Please keep this page open.'); }
      finally { checking = false; }
    };
    const startPolling = () => { saveRecovery(); poll(); if (!interval) interval = setInterval(poll, 4000); };
    (async () => {
      // A page refresh after payment must resume verification, never create
      // another charge or clear the cart based on a browser-only callback.
      const recovery = sessionStorage.getItem(RECOVERY_KEY);
      if (recovery) {
        checkout = JSON.parse(recovery); startPolling(); return;
      }
      const prepared = await api({ action: 'create', ...JSON.parse(signature), sessionId: getSessionId(),
        attribution: getStoredAttribution(), url: window.location.href });
      if (disposed) return;
      checkout = prepared;
      const payment = await sdk();
      if (disposed) return;
      payment.configure({ shopId: 79302197414, clientId: '2c05e8f9-a1dc-4456-a735-4868741d8c61', discountCodeField: false });
      session = payment.createSession({ paymentRequest: payment.build(prepared.paymentRequest) });
      session.addEventListener('sessionrequested', () => {
        busy(true); setMessage('');
        session.completeSessionRequest({ ...prepared.session, updatedPaymentRequest: payment.build(prepared.paymentRequest) });
      });
      session.addEventListener('shippingaddresschanged', async ev => {
        let result;
        try {
          const data = await api({ action: 'address', id: checkout.id, access: checkout.access, shippingAddress: ev.shippingAddress });
          result = { updatedPaymentRequest: payment.build(data.paymentRequest), errors: data.errors || [] };
        } catch (err) { result = errorResponse(err.message); }
        session.completeShippingAddressChange(result);
      });
      session.addEventListener('deliverymethodchanged', ev => session.completeDeliveryMethodChange(
        ev.deliveryMethod?.code === 'STANDARD' ? { updatedPaymentRequest: payment.build(prepared.paymentRequest) } : errorResponse('Select Standard shipping.')));
      session.addEventListener('deliverymethodtypechanged', ev => session.completeDeliveryMethodTypeChange(
        ev.deliveryMethodType === 'SHIPPING' ? { updatedPaymentRequest: payment.build(prepared.paymentRequest) } : errorResponse('Pickup is not available.')));
      session.addEventListener('discountcodechanged', () => session.completeDiscountCodeChange({ errors: [{ type: 'discountCodeError', message: 'Apply discount codes on the store checkout before opening Shop Pay.' }] }));
      session.addEventListener('paymentconfirmationrequested', async ev => {
        let result;
        try {
          saveRecovery();
          await api({ action: 'submit', id: checkout.id, access: checkout.access, paymentMethod: ev.paymentMethod,
            shippingAddress: ev.shippingAddress, deliveryMethod: ev.deliveryMethod, displayedPaymentRequest: session.paymentRequest });
        } catch (err) { result = errorResponse(err.message); startPolling(); }
        session.completePaymentConfirmationRequest(result);
      });
      session.addEventListener('paymentcomplete', () => { session.close(); startPolling(); });
      session.addEventListener('paymentattemptfailed', () => { startPolling(); });
      session.addEventListener('windowclosed', () => {
        if (disposed || completed) return;
        if (sessionStorage.getItem(RECOVERY_KEY)) startPolling();
        else { busy(false); setVersion(v => v + 1); }
      });
      const element = await payment.createButton().render(`#${container.current.id}`);
      if (disposed) { element?.remove(); return; }
      element.style.setProperty('--shop-pay-button-width', '100%');
      element.style.setProperty('--shop-pay-button-height', '48px');
    })().catch(err => { report(err); busy(false); });
    return () => {
      disposed = true; clearInterval(interval); session?.close();
      if (container.current) container.current.replaceChildren();
    };
  }, [enabled, variant, signature, version, purchaseKey]);

  if (!enabled || variant !== 'shop_pay') return null;
  return <div style={{ margin: '10px 0' }}>
    <div id="shop-pay-wallet-checkout" ref={container} />
    {message && <p role="status" style={{ fontSize: 13, lineHeight: 1.5 }}>{message}</p>}
  </div>;
}
