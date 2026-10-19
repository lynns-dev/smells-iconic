import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ProductVisual from '../components/ProductVisual';
import AddressFields from '../components/AddressFields';
import PayPalButton from '../components/PayPalButton';
import AfterpayButton from '../components/AfterpayButton';
import CashAppPayButton from '../components/CashAppPayButton';
import {
  createSquareCard, tokenizeSquareCard,
  createApplePayButton, createGooglePayButton, tokenizeWallet, tokenizeWalletWithContact,
} from '../lib/squareClient';
import { useCart } from '../lib/useCart';
import { useAllReviews } from '../lib/useReviews';
import { tokenizeCard } from '../lib/qbPayments';
import { fbTrack, generateEventId, refreshPixelIdentity } from '../lib/fbPixel';
import { firstTimeToday, cartSignature } from '../lib/funnelTracking';
import { getIdentity, rememberIdentity } from '../lib/identity';
import { getStoredAttribution } from '../lib/attribution';
import { getSessionId, getVisitorId } from '../lib/session';
import { loadCheckoutProgress, saveCheckoutProgress, clearCheckoutProgress } from '../lib/checkoutProgress';
import { T, S } from '../lib/theme';
import { trackCart } from '../lib/cartTracking';

// Same layout as Anese's checkout: two steps (Shipping -> Payment) with
// large touch-friendly fields and buttons.
//  - Step 1: express Apple Pay (the wallet sheet collects the address),
//    Afterpay and Cash App Pay (these use the address and email typed
//    below), shipping address, shipping method, country, contact email,
//    "Continue to final step".
//  - Step 2: "How do you want to pay?" — Apple Pay / Google Pay, Afterpay,
//    Cash App Pay, PayPal / Venmo, then the card box, billing recap (always
//    the shipping address), Back + Place order.
// Each step is a real <form>; a step's inputs aren't in the DOM while the
// other step shows, so the browser only validates what's on screen.
// Order summary: sticky sidebar on desktop, collapsible panel on mobile.
//
// Cards go through Square (lib/squareClient.js, /api/square-checkout). Until
// the Square keys are set the card box falls back to QuickBooks Payments,
// so card checkout never goes dark.
const SQUARE_ENABLED = Boolean(process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID && process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const EMPTY_ADDRESS = { name: '', address: '', apt: '', city: '', state: '', zip: '', phone: '' };

function addressComplete(a) {
  return Boolean(a?.address?.trim() && a?.city?.trim() && a?.state && a?.zip?.trim());
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

function detectCardBrand(digits) {
  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  return 'Card';
}

function formatCardNumber(digits) {
  if (/^3[47]/.test(digits)) return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function LockIcon(props) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ShipIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3 7l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 7v10l9 4 9-4V7M12 11v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ReturnIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 12a8 8 0 1 1 2.34 5.66" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 8v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LeafIcon(props) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 19c9 0 14-5 14-14-9 0-14 5-14 14Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5 19c0-6 3-9 9-11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon(props) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 12.5l5.5 5.5L20 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Itemized cart, discount code and totals — the mobile order-summary panel.
function OrderItemsPanel({
  cart, subtotal, discountTotal, codeDiscountAmount, appliedDiscount, shippingCost, addressEntered,
  grandTotal, discountCode, setDiscountCode, discountMessage, setDiscountMessage,
  clearDiscount, handleApplyDiscount,
}) {
  return (
    <div style={reviewCard}>
      <div>
        {cart.map((item) => (
          <div key={item.id} style={summaryItem}>
            <div style={summaryImgWrap}>
              <ProductVisual id={item.id} images={item.images} alt={item.name} width={48} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</div>
              <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>{item.size}</div>
            </div>
            <div style={{ fontSize: 14 }}>${(item.price * item.quantity).toFixed(2)}</div>
          </div>
        ))}
      </div>

      <DiscountField
        discountCode={discountCode} setDiscountCode={setDiscountCode} discountMessage={discountMessage}
        setDiscountMessage={setDiscountMessage} appliedDiscount={appliedDiscount} clearDiscount={clearDiscount}
        handleApplyDiscount={handleApplyDiscount}
      />

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
        <Totals
          subtotal={subtotal} discountTotal={discountTotal} codeDiscountAmount={codeDiscountAmount}
          appliedDiscount={appliedDiscount} shippingCost={shippingCost} addressEntered={addressEntered} grandTotal={grandTotal}
        />
      </div>
    </div>
  );
}

function DiscountField({ discountCode, setDiscountCode, discountMessage, setDiscountMessage, appliedDiscount, clearDiscount, handleApplyDiscount }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          placeholder="Discount code"
          value={discountCode}
          onChange={(e) => {
            setDiscountCode(e.target.value);
            if (appliedDiscount) clearDiscount();
            setDiscountMessage('');
          }}
          // Enter must apply the code, not fall through to native form submit.
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            handleApplyDiscount();
          }}
          style={{ ...bigInput, height: 46, flex: 1 }}
        />
        <button type="button" style={{ ...smallOutlineButton, height: 46 }} onClick={handleApplyDiscount}>Apply</button>
      </div>
      {discountMessage && (
        <p style={{ fontSize: 12, color: appliedDiscount ? T.ink : '#a13d2b', marginTop: 8 }}>{discountMessage}</p>
      )}
    </div>
  );
}

function Totals({ subtotal, discountTotal, codeDiscountAmount, appliedDiscount, shippingCost, addressEntered, grandTotal, big }) {
  return (
    <>
      <div style={summaryRow}>
        <span style={{ color: T.soft }}>Subtotal</span>
        <span>${subtotal.toFixed(2)}</span>
      </div>
      {discountTotal > 0 && (
        <div style={summaryRow}>
          <span style={{ color: T.soft }}>Discount</span>
          <span>−${discountTotal.toFixed(2)}</span>
        </div>
      )}
      {codeDiscountAmount > 0 && (
        <div style={summaryRow}>
          <span style={{ color: T.soft }}>Promo ({appliedDiscount.code})</span>
          <span>−${codeDiscountAmount.toFixed(2)}</span>
        </div>
      )}
      <div style={summaryRow}>
        <span style={{ color: T.soft }}>Shipping</span>
        <span>{shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`}</span>
      </div>
      <div style={{ ...summaryRow, borderTop: `1px solid ${T.line}`, paddingTop: big ? 16 : 12, marginTop: big ? 6 : 4 }}>
        <span style={{ fontFamily: T.sans, fontSize: big ? 18 : 17, fontWeight: big ? 400 : 700 }}>Total</span>
        <span style={{ fontFamily: T.sans, fontSize: 20, fontWeight: big ? 400 : 700 }}>${grandTotal.toFixed(2)}</span>
      </div>
    </>
  );
}

function ReviewCard({ r }) {
  return (
    <div style={featuredReviewCard}>
      <div style={{ color: T.ink, fontSize: 13, letterSpacing: '0.05em' }}>
        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
      </div>
      <p style={{ fontSize: 13, color: T.ink, lineHeight: 1.6, margin: '8px 0 0' }}>&ldquo;{r.text}&rdquo;</p>
      <div style={{ fontSize: 12, color: T.soft, marginTop: 8 }}>{r.author}</div>
    </div>
  );
}

// Desktop sidebar — both reviews at once.
function FeaturedReviews({ reviews }) {
  if (reviews.length === 0) return null;
  return (
    <div style={featuredReviewsWrap}>
      <p style={fieldGroupLabel}>What customers are saying</p>
      {reviews.map((r) => <ReviewCard key={r.id || r.author} r={r} />)}
    </div>
  );
}

// Mobile — one review at a time under the step's button.
function ReviewsCarousel({ reviews }) {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (reviews.length < 2) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % reviews.length), 5000);
    return () => clearInterval(id);
  }, [reviews.length]);
  if (reviews.length === 0) return null;
  const r = reviews[index % reviews.length];
  return (
    <div>
      <p style={{ ...fieldGroupLabel, textAlign: 'center' }}>What customers are saying</p>
      <ReviewCard r={r} />
      {reviews.length > 1 && (
        <div style={carouselDots}>
          {reviews.map((rev, i) => (
            <span key={rev.id || rev.author} style={{ ...carouselDot, background: i === index ? T.ink : T.line }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, total, hydrated, clear, appliedDiscount, applyDiscount, clearDiscount, codeDiscountAmount, discountedTotal } = useCart();

  // Restored once at mount so a refresh mid-checkout resumes on the same
  // step with the form filled in (lib/checkoutProgress.js).
  const [savedProgress] = React.useState(loadCheckoutProgress);

  const [email, setEmail] = React.useState(savedProgress?.email ?? '');
  const [newsletter, setNewsletter] = React.useState(savedProgress?.newsletter ?? true);
  const [shipping, setShipping] = React.useState(savedProgress?.shipping ?? EMPTY_ADDRESS);
  const [step, setStep] = React.useState(savedProgress?.step === 2 && addressComplete(savedProgress?.shipping) && savedProgress?.email ? 2 : 1);
  const [card, setCard] = React.useState({ number: '', expiry: '', cvc: '' });

  // Square card (Step 2) and Step 2's Apple Pay / Google Pay, which reuse
  // the address from Step 1.
  const squareCardRef = React.useRef(null);
  const [squareReady, setSquareReady] = React.useState(false);
  const [squareError, setSquareError] = React.useState('');
  const appleMethodRef = React.useRef(null);
  const googleMethodRef = React.useRef(null);
  const [appleAvailable, setAppleAvailable] = React.useState(false);
  const [googleAvailable, setGoogleAvailable] = React.useState(false);

  // Express Apple Pay at the top of Step 1 — the wallet sheet collects
  // name, email and address itself. A separate instance from Step 2's since
  // the two payment requests are configured differently. Google Pay is only
  // offered on Step 2.
  const expressAppleMethodRef = React.useRef(null);
  const [expressAppleAvailable, setExpressAppleAvailable] = React.useState(false);

  const [afterpayReady, setAfterpayReady] = React.useState(false);
  const [cashAppReady, setCashAppReady] = React.useState(false);
  // Cash App Pay shows (as a placeholder) before the details are in.
  const [cashAppShown, setCashAppShown] = React.useState(false);
  const [expressError, setExpressError] = React.useState('');
  const cashAppEventId = React.useMemo(() => generateEventId(), []);

  const [discountCode, setDiscountCode] = React.useState(savedProgress?.discountCode ?? '');
  const [discountMessage, setDiscountMessage] = React.useState('');
  const [orderSummaryOpen, setOrderSummaryOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const errorRef = React.useRef(null);
  const formTopRef = React.useRef(null);

  // Real, approved 5-star reviews with text — none shown if there aren't any.
  const allReviews = useAllReviews();
  const featuredReviews = React.useMemo(() => Object.values(allReviews || {})
    .flatMap((p) => p?.reviews || [])
    .filter((r) => r.rating === 5 && r.text && r.text.length <= 160)
    .slice(0, 2)
    .map((r) => ({ ...r, author: r.author ? `${r.author}, Verified Buyer` : 'Verified Buyer' })), [allReviews]);

  React.useEffect(() => {
    saveCheckoutProgress({ step, email, newsletter, shipping, discountCode });
  }, [step, email, newsletter, shipping, discountCode]);

  React.useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  // Every step change scrolls back to the top of the form (not on first load).
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  React.useEffect(() => {
    if (appliedDiscount) setDiscountCode(appliedDiscount.code);
  }, [appliedDiscount]);

  React.useEffect(() => {
    if (hydrated && cart.length === 0) router.replace('/shop');
  }, [hydrated, cart.length, router]);

  // Cart drop-off report (lib/cartFunnel.js): reaching checkout, and
  // reaching the payment step.
  React.useEffect(() => {
    if (hydrated && cart.length > 0) trackCart('checkout_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);
  React.useEffect(() => {
    if (hydrated && step === 2) trackCart('payment_step');
  }, [hydrated, step]);

  // Bounced back here after a declined or abandoned redirect payment
  // (Cash App Pay, Afterpay) — the cart was never cleared for that path.
  React.useEffect(() => {
    if (!router.isReady || !router.query.payment_error) return;
    setError('That payment didn’t go through — please try again or use a different method.');
    trackCart('pay_failed', { method: 'Afterpay / Cash App', message: 'Declined or cancelled at Afterpay / Cash App' });
    router.replace('/checkout', undefined, { shallow: true });
  }, [router.isReady, router.query.payment_error, router]);

  React.useEffect(() => {
    if (!hydrated || cart.length === 0) return;
    // Once per distinct cart per device per day (lib/funnelTracking.js).
    if (!firstTimeToday(`checkout_start:cart:${cartSignature(cart)}`)) return;
    const eventId = generateEventId();
    fbTrack('InitiateCheckout', {
      content_ids: cart.map((i) => i.id),
      contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
      value: total,
      currency: 'USD',
      num_items: cart.reduce((s, i) => s + i.quantity, 0),
    }, eventId);
    fetch('/api/track/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'checkout_start',
        eventId,
        value: total,
        contentIds: cart.map((i) => i.id),
        contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
        url: window.location.href,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
        ...getIdentity(),
      }),
      keepalive: true,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const addressEntered = addressComplete(shipping);
  // Free shipping on every order.
  const shippingCost = 0;
  const grandTotal = discountedTotal + shippingCost;
  const subtotal = cart.reduce((sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity, 0);
  const discountTotal = subtotal - total;

  // Wallet/Afterpay handlers can fire long after the render that made them —
  // they read the current form through this ref.
  const latestRef = React.useRef({});
  latestRef.current = { email, shipping, cart, grandTotal };

  // Square's card form mounts into #square-card-container, which only
  // exists on Step 2 — remounted fresh each time Step 2 is entered.
  React.useEffect(() => {
    if (!SQUARE_ENABLED || step !== 2 || !hydrated || cart.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const sqCard = await createSquareCard('square-card-container');
        if (cancelled) { await sqCard.destroy(); return; }
        squareCardRef.current = sqCard;
        setSquareReady(true);
      } catch (err) {
        console.error('Square card setup failed:', err);
        if (!cancelled) setSquareError('Payment form failed to load — please refresh and try again.');
      }
    })();
    return () => {
      cancelled = true;
      squareCardRef.current?.destroy?.().catch(() => {});
      squareCardRef.current = null;
      setSquareReady(false);
    };
  }, [step, hydrated, cart.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2 Apple Pay / Google Pay — recreated when the total changes so the
  // wallet sheet always shows the amount actually charged.
  React.useEffect(() => {
    if (!squareReady) return undefined;
    let cancelled = false;
    const cleanups = [];
    (async () => {
      const amount = latestRef.current.grandTotal;
      const apple = await createApplePayButton(amount);
      if (!cancelled) {
        appleMethodRef.current = apple;
        setAppleAvailable(Boolean(apple));
      }
      const google = await createGooglePayButton(amount, 'google-pay-button');
      if (cancelled) {
        google?.destroy?.().catch(() => {});
      } else if (google) {
        googleMethodRef.current = google;
        setGoogleAvailable(true);
        const btn = document.getElementById('google-pay-button');
        const onClick = (event) => { event.preventDefault(); handleWalletPay(googleMethodRef, 'Google Pay'); };
        btn?.addEventListener('click', onClick);
        cleanups.push(() => btn?.removeEventListener('click', onClick));
      }
    })();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      googleMethodRef.current?.destroy?.().catch(() => {});
      appleMethodRef.current = null;
      googleMethodRef.current = null;
      setAppleAvailable(false);
      setGoogleAvailable(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squareReady, grandTotal]);

  // Step 1 express Apple Pay (requestContact: the wallet sheet collects the
  // address). Recreated when the total changes, same as above.
  React.useEffect(() => {
    if (!SQUARE_ENABLED || step !== 1 || !hydrated || cart.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      const apple = await createApplePayButton(latestRef.current.grandTotal, undefined, { requestContact: true });
      if (!cancelled) {
        setExpressAppleAvailable(Boolean(apple));
        if (apple) expressAppleMethodRef.current = apple;
      }
    })();
    return () => {
      cancelled = true;
      expressAppleMethodRef.current = null;
      setExpressAppleAvailable(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hydrated, grandTotal]);

  // Afterpay and Cash App Pay can't collect a shipping address themselves
  // (unlike the Apple Pay / Google Pay sheets), so on Step 1 they point the
  // shopper at the first empty field instead.
  const focusFirstMissingField = () => {
    const { email, shipping } = latestRef.current;
    const missing = [
      [!String(shipping.name || '').trim(), 'input[placeholder="Full name"]'],
      [!shipping.address.trim(), 'input[placeholder="Address"]'],
      [!shipping.zip.trim(), 'input[placeholder="ZIP code"]'],
      [!shipping.city.trim(), 'input[placeholder="City"]'],
      [!EMAIL_RE.test(email.trim()), 'input[type=email]'],
    ].find(([isMissing, sel]) => isMissing && document.querySelector(sel));
    const el = missing && document.querySelector(missing[1]);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => el?.focus(), 400);
  };

  const afterpayOrder = () => {
    const { email, shipping, cart, grandTotal } = latestRef.current;
    if (!EMAIL_RE.test(email.trim()) || !addressComplete(shipping) || !String(shipping.name || '').trim()) {
      focusFirstMissingField();
      return { error: 'Enter your shipping address and email below, then tap Afterpay again.' };
    }
    trackCart('pay_attempt', { method: 'Afterpay' });
    rememberIdentity({ email, phone: shipping.phone });
    return {
      amount: grandTotal, items: cart, email, shipping,
      eventId: generateEventId(), url: window.location.href, attribution: getStoredAttribution(), sessionId: getSessionId(),
    };
  };
  const cashAppOrder = EMAIL_RE.test(email.trim()) && addressEntered && String(shipping.name || '').trim() ? {
    amount: grandTotal, items: cart, email, shipping,
    eventId: cashAppEventId, url: typeof window !== 'undefined' ? window.location.href : null,
    attribution: getStoredAttribution(), sessionId: getSessionId(),
  } : null;

  // Saves the shopper's contact to the store's list (admin → Subscribers)
  // so an abandoned checkout can still be followed up. Listens three ways,
  // since leaving a field misses autofill and shoppers who jump straight to
  // a wallet: on leaving a field, a moment after typing stops, and when the
  // tab is hidden or closed. Only sent when something changed.
  const lastSavedContactRef = React.useRef('');
  const contactRef = React.useRef({});
  contactRef.current = { email, shipping, newsletter, cart };
  const saveContact = React.useCallback(() => {
    const { email, shipping, newsletter, cart } = contactRef.current;
    const cleanEmail = email.trim();
    const emailOk = EMAIL_RE.test(cleanEmail);
    const phoneOk = String(shipping.phone || '').replace(/\D/g, '').length >= 10;
    if (!emailOk && !phoneOk) return;
    const name = String(shipping.name || '').trim();
    const sig = JSON.stringify([emailOk ? cleanEmail.toLowerCase() : '', shipping.phone, name, shipping.city, shipping.state, newsletter, cartSignature(cart)]);
    if (sig === lastSavedContactRef.current) return;
    lastSavedContactRef.current = sig;
    rememberIdentity({ email: emailOk ? cleanEmail : '', phone: shipping.phone });
    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: emailOk ? cleanEmail : '', phone: shipping.phone, name, consent: newsletter, source: 'checkout',
        address: { city: shipping.city, state: shipping.state },
        cart: cart.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const handleIdentityBlur = () => {
    if (!email.trim() && !shipping.phone) return;
    rememberIdentity({ email, phone: shipping.phone });
    refreshPixelIdentity(process.env.NEXT_PUBLIC_META_PIXEL_ID);
    saveContact();
  };

  React.useEffect(() => {
    const t = setTimeout(saveContact, 1500);
    return () => clearTimeout(t);
  }, [email, shipping.phone, shipping.name, shipping.city, shipping.state, newsletter, saveContact]);

  React.useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') saveContact(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', saveContact);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', saveContact);
    };
  }, [saveContact]);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    setDiscountMessage('Checking…');
    const data = await applyDiscount(discountCode);
    if (data.valid) {
      setDiscountMessage(`Code "${data.code}" applied.`);
    } else if (data.error) {
      setDiscountMessage('Could not check that code — please try again.');
    } else {
      setDiscountMessage('That code isn’t valid.');
      trackCart('discount_rejected', { code: discountCode });
    }
  };

  const goToStep = (n) => {
    setError('');
    setExpressError('');
    setStep(n);
  };

  const finishOrder = async (purchase) => {
    sessionStorage.setItem('si-purchase', JSON.stringify(purchase));
    clearCheckoutProgress();
    await router.push('/success');
    clear();
  };

  // Shared by the Square card form and every Apple Pay / Google Pay button.
  const completeSquareOrder = async (token, paymentMethodLabel, overrides = {}) => {
    const { email, shipping, cart, grandTotal } = { ...latestRef.current, ...overrides };
    rememberIdentity({ email, phone: shipping?.phone });
    const purchaseEventId = generateEventId();
    const res = await fetch('/api/square-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        amount: grandTotal,
        items: cart,
        email,
        shipping,
        eventId: purchaseEventId,
        url: window.location.href,
        paymentMethod: paymentMethodLabel,
        attribution: getStoredAttribution(),
        sessionId: getSessionId(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Payment failed');
    await finishOrder({
      eventId: purchaseEventId,
      orderId: data.id,
      amount: grandTotal,
      contentIds: cart.map((i) => i.id),
      contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
    });
  };

  // Step 2 wallets — the address was already entered in Step 1.
  const handleWalletPay = async (methodRef, label) => {
    setError('');
    const { email, shipping } = latestRef.current;
    if (!email.trim() || !addressComplete(shipping)) {
      setError(`Enter your email and shipping address before paying with ${label}.`);
      return;
    }
    if (!methodRef.current) return;
    setSubmitting(true);
    try {
      const token = await tokenizeWallet(methodRef.current);
      trackCart('pay_attempt', { method: label });
      await completeSquareOrder(token, label);
    } catch (err) {
      if (!err.cancelled) {
        setError(err.message || 'Something went wrong. Please try again.');
        trackCart('pay_failed', { method: label, message: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1 express wallets — the wallet sheet supplies the address.
  const handleExpressWalletPay = async (methodRef, label) => {
    setError('');
    if (!methodRef.current) return;
    setSubmitting(true);
    try {
      const { token, contact } = await tokenizeWalletWithContact(methodRef.current);
      if (!contact) {
        setError(`${label} didn’t return a shipping address. Please continue with the form below.`);
        return;
      }
      trackCart('pay_attempt', { method: label });
      await completeSquareOrder(token, label, { email: contact.email, shipping: contact });
    } catch (err) {
      if (!err.cancelled) {
        setError(err.message || 'Something went wrong. Please try again.');
        trackCart('pay_failed', { method: label, message: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStepSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      if (!addressComplete(shipping)) {
        setError('Enter your ZIP code so we can fill in your city and state.');
        return;
      }
      saveContact();
      trackCart('address');
      goToStep(2);
      return;
    }

    setSubmitting(true);
    trackCart('pay_attempt', { method: 'Card' });
    try {
      if (SQUARE_ENABLED) {
        if (!squareReady || !squareCardRef.current) {
          throw new Error('Payment form is still loading — please wait a moment and try again.');
        }
        const token = await tokenizeSquareCard(squareCardRef.current);
        await completeSquareOrder(token, 'Card');
        return;
      }

      // QuickBooks Payments backup — billing address is the shipping address.
      const purchaseEventId = generateEventId();
      const [expMonth, expYear] = card.expiry.split('/').map((s) => s.trim());
      const token = await tokenizeCard(
        {
          number: card.number,
          expMonth,
          expYear: expYear && expYear.length === 2 ? `20${expYear}` : expYear,
          cvc: card.cvc,
          name: shipping.name,
          street: shipping.address,
          city: shipping.city,
          region: shipping.state,
          postalCode: shipping.zip,
        },
        process.env.NEXT_PUBLIC_QB_ENVIRONMENT || 'sandbox'
      );
      const orderShipping = { ...shipping, ...splitName(shipping.name) };
      const res = await fetch('/api/qb-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          amount: grandTotal,
          items: cart,
          email,
          shipping: orderShipping,
          billing: orderShipping,
          eventId: purchaseEventId,
          url: window.location.href,
          paymentMethod: detectCardBrand(card.number.replace(/\D/g, '')),
          attribution: getStoredAttribution(),
          sessionId: getSessionId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');
      await finishOrder({
        eventId: purchaseEventId,
        orderId: data.id,
        amount: grandTotal,
        contentIds: cart.map((i) => i.id),
        contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
      });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      trackCart('pay_failed', { method: 'Card', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaypalSuccess = async (result) => {
    await finishOrder({
      eventId: result.eventId,
      orderId: result.id,
      amount: result.amount,
      contentIds: cart.map((i) => i.id),
      contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
    });
  };

  const handlePaypalError = (message) => {
    setError(message || 'PayPal checkout failed. Please try again.');
    trackCart('pay_failed', { method: 'PayPal', message });
  };

  if (!hydrated || cart.length === 0) return null;

  const totalsProps = { subtotal, discountTotal, codeDiscountAmount, appliedDiscount, shippingCost, addressEntered, grandTotal };
  const discountProps = { discountCode, setDiscountCode, discountMessage, setDiscountMessage, appliedDiscount, clearDiscount, handleApplyDiscount };
  const otherWaysReady = appleAvailable || googleAvailable || afterpayReady || cashAppReady;

  return (
    <div>
      <header className="desktop-topbar" style={topbar}>
        <div style={{ ...S.wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 112 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: T.display, fontSize: 26, color: T.ink }}>SMELLS — ICONIC</span>
          </Link>
        </div>
      </header>

      <header className="mobile-topbar" style={mobileTopbar}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: T.display, fontSize: 18, color: T.ink }}>SMELLS — ICONIC</span>
        </Link>
      </header>

      <div className="checkout-grid" style={checkoutGrid}>
        <div className="form-col" style={formCol}>
          <div ref={formTopRef} />
          <div className="mobile-order-summary">
            <button
              type="button"
              onClick={() => setOrderSummaryOpen((o) => !o)}
              style={orderSummaryToggle}
              aria-expanded={orderSummaryOpen}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{orderSummaryOpen ? 'Hide' : 'Show'} order summary</span>
                <span style={{ fontSize: 10, transform: orderSummaryOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>▾</span>
              </span>
              <span style={{ fontFamily: T.sans, fontSize: 16, fontWeight: 700 }}>${grandTotal.toFixed(2)}</span>
            </button>
            {orderSummaryOpen && (
              <div style={{ marginTop: 12 }}>
                <OrderItemsPanel cart={cart} {...totalsProps} {...discountProps} />
              </div>
            )}
          </div>

          <form
            onSubmit={handleStepSubmit}
            onKeyDown={(e) => {
              if (step === 2 && e.key === 'Enter' && e.target.type !== 'submit') e.preventDefault();
            }}
          >
            {step === 1 && (
              <section style={{ marginTop: 28 }}>
                <div style={{ display: (expressAppleAvailable || afterpayReady || cashAppShown) ? 'block' : 'none' }}>
                  <p style={{ ...fieldGroupLabel, textAlign: 'center' }}>Express checkout</p>
                  {expressAppleAvailable && (
                    <button
                      type="button"
                      className="apple-pay-button"
                      aria-label="Apple Pay"
                      disabled={submitting}
                      onClick={() => handleExpressWalletPay(expressAppleMethodRef, 'Apple Pay')}
                    />
                  )}
                  <div>
                    <AfterpayButton
                      total={grandTotal}
                      getOrder={afterpayOrder}
                      onError={setExpressError}
                      onReady={setAfterpayReady}
                    />
                    <CashAppPayButton
                      order={cashAppOrder}
                      purchaseKey="si-purchase"
                      onError={setExpressError}
                      onReady={setCashAppReady}
                      onShown={setCashAppShown}
                      onNeedDetails={focusFirstMissingField}
                    />
                  </div>
                  {expressError && <p style={{ ...errorText, textAlign: 'center', marginTop: 10 }}>{expressError}</p>}
                  <div style={orDivider}>
                    <span style={orDividerLine} />
                    <span style={orDividerText}>or</span>
                    <span style={orDividerLine} />
                  </div>
                </div>

                <div style={{ marginTop: 30 }} onBlur={handleIdentityBlur}>
                  <p style={fieldGroupLabel}>Shipping address</p>
                  <AddressFields value={shipping} onChange={setShipping} idPrefix="ship" inputStyle={bigInput} simplified />
                </div>

                {addressEntered && (
                  <div style={{ marginTop: 26 }}>
                    <p style={fieldGroupLabel}>Shipping method</p>
                    <div style={shipMethod}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Standard Shipping</div>
                        <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>3–5 business days after order placed</div>
                      </div>
                      <span style={{ fontWeight: 700 }}>{shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`}</span>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: 26 }}>
                  <p style={fieldGroupLabel}>Country</p>
                  <select value="United States" readOnly style={{ ...bigInput, color: T.soft }}>
                    <option>United States</option>
                  </select>
                </div>

                <h1 style={{ ...stepTitle, marginTop: 30 }}>Contact</h1>

                <div style={{ marginTop: 18 }}>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={handleIdentityBlur}
                    style={bigInput}
                    autoComplete="email"
                    required
                  />
                  <label style={checkboxLabel}>
                    <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
                    Email me with news and offers
                  </label>
                </div>

                {error && <p ref={errorRef} style={errorText}>{error}</p>}

                <button type="submit" style={{ ...bigButton, marginTop: 24 }} disabled={submitting}>
                  Continue to final step
                </button>

                <div className="mobile-reviews-carousel">
                  <ReviewsCarousel reviews={featuredReviews} />
                </div>
              </section>
            )}

            {step === 2 && (
              <section style={{ marginTop: 28 }}>
                <h1 style={stepTitle}>How do you want to pay?</h1>
                <p style={{ fontSize: 13, color: T.soft, marginTop: 10 }}>All transactions are secure and encrypted.</p>

                {/* Every way to pay other than typing a card, stacked above
                    the card box — each shows only when it's available.
                    Google Pay's container stays in the DOM (hidden) because
                    Square's attach() needs it by id. */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: (appleAvailable || googleAvailable) ? 'grid' : 'none', gridTemplateColumns: (appleAvailable && googleAvailable) ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 10 }}>
                    <div style={{ display: appleAvailable ? 'block' : 'none' }}>
                      <button
                        type="button"
                        className="apple-pay-button"
                        aria-label="Apple Pay"
                        disabled={submitting}
                        onClick={() => handleWalletPay(appleMethodRef, 'Apple Pay')}
                      />
                    </div>
                    <div style={{ display: googleAvailable ? 'block' : 'none' }}>
                      <div id="google-pay-button" style={walletButtonContainer} />
                    </div>
                  </div>
                  <AfterpayButton total={grandTotal} getOrder={afterpayOrder} onError={setError} onReady={setAfterpayReady} />
                  <CashAppPayButton
                    order={cashAppOrder}
                    purchaseKey="si-purchase"
                    onError={setError}
                    onReady={setCashAppReady}
                    onShown={setCashAppShown}
                    onNeedDetails={() => goToStep(1)}
                  />
                  <div style={{ marginTop: 10 }}>
                    <PayPalButton
                      amount={grandTotal}
                      items={cart}
                      url={typeof window !== 'undefined' ? window.location.href : ''}
                      disabled={submitting}
                      onSuccess={handlePaypalSuccess}
                      onError={handlePaypalError}
                    />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <PayPalButton
                      fundingSource="venmo"
                      amount={grandTotal}
                      items={cart}
                      url={typeof window !== 'undefined' ? window.location.href : ''}
                      disabled={submitting}
                      onSuccess={handlePaypalSuccess}
                      onError={handlePaypalError}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: T.soft, textAlign: 'center', margin: '12px 0 0' }}>
                    {otherWaysReady ? 'or pay by card' : ''}
                  </p>
                </div>

                <div style={{ ...paymentList, marginTop: 20 }}>
                  <div style={accordionRow}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>Credit or Debit Card</span>
                  </div>
                  <div style={accordionBody}>
                    {SQUARE_ENABLED ? (
                      <>
                        {/* Square renders its own number/expiry/CVC/ZIP fields here. */}
                        <div id="square-card-container" style={squareCardContainer} />
                        {!squareReady && !squareError && (
                          <p style={{ fontSize: 12, color: T.soft, marginTop: 8 }}>Loading payment form…</p>
                        )}
                        {squareError && <p style={{ fontSize: 12, color: '#a13d2b', marginTop: 8 }}>{squareError}</p>}
                      </>
                    ) : (
                      <>
                        <input
                          placeholder="Card number"
                          value={card.number}
                          onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16)) })}
                          style={bigInput}
                          inputMode="numeric"
                          autoComplete="cc-number"
                          required
                        />
                        <div className="row-2" style={{ marginTop: 8 }}>
                          <input
                            placeholder="Expiration (MM/YY)"
                            value={card.expiry}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setCard({ ...card, expiry: digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits });
                            }}
                            style={bigInput}
                            inputMode="numeric"
                            maxLength={5}
                            autoComplete="cc-exp"
                            required
                          />
                          <input
                            placeholder="Security code"
                            value={card.cvc}
                            onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                            style={bigInput}
                            type="password"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            required
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <p style={fieldGroupLabel}>Billing address</p>
                  <div style={billingRecap}>
                    <CheckIcon style={{ color: T.ink, flexShrink: 0, marginTop: 3 }} />
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Same as shipping address</div>
                      <div style={{ color: T.soft, fontSize: 13, lineHeight: 1.6 }}>
                        {shipping.name}<br />
                        {shipping.address}{shipping.apt ? `, ${shipping.apt}` : ''}<br />
                        {shipping.city}, {shipping.state} {shipping.zip}
                      </div>
                    </div>
                  </div>
                </div>

                {error && <p ref={errorRef} style={errorText}>{error}</p>}

                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button type="button" onClick={() => goToStep(1)} style={bigButtonSecondary} disabled={submitting}>
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || (SQUARE_ENABLED && !squareReady)}
                    style={{ ...bigButton, flex: 1, opacity: submitting || (SQUARE_ENABLED && !squareReady) ? 0.6 : 1 }}
                  >
                    {submitting ? 'Processing…' : `Place order — $${grandTotal.toFixed(2)}`}
                  </button>
                </div>

                <div className="mobile-reviews-carousel">
                  <ReviewsCarousel reviews={featuredReviews} />
                </div>

                <div style={secureNote}>
                  <LockIcon />
                  <span>256-bit SSL encrypted &middot; your card details never touch our servers</span>
                </div>
                <p style={{ fontSize: 11, color: T.soft, textAlign: 'center', marginTop: 8 }}>
                  {`Payments securely processed by ${SQUARE_ENABLED ? 'Square' : 'QuickBooks Payments (Intuit)'}`}
                </p>
              </section>
            )}
          </form>
        </div>

        <aside className="order-summary" style={summaryCol}>
          <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 20 }}>
            {cart.map((item) => (
              <div key={item.id} style={summaryItem}>
                <div style={summaryImgWrap}>
                  <ProductVisual id={item.id} images={item.images} alt={item.name} width={48} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{item.name}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</div>
                  <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>{item.size}</div>
                </div>
                <div style={{ fontSize: 14 }}>${(item.price * item.quantity).toFixed(2)}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <DiscountField {...discountProps} />
          </div>

          <Totals {...totalsProps} big />

          <FeaturedReviews reviews={featuredReviews} />
        </aside>
      </div>

      <div style={reassuranceWrap}>
        <div className="reassurance-grid" style={reassuranceGrid}>
          {[
            [ShipIcon, 'Free shipping', 'On every order. Ships within 1 business day.'],
            [ReturnIcon, '30-day returns', 'Unopened items, full refund within 30 days of delivery.'],
            [LockIcon, 'Secure checkout', `Payments encrypted and processed by ${SQUARE_ENABLED ? 'Square' : 'Intuit'}.`],
            [LeafIcon, 'Vegan & cruelty-free', 'Every formula, always.'],
          ].map(([Icon, title, copy]) => (
            <div key={title} style={reassuranceItem}>
              <Icon style={{ color: T.ink, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: T.ink }}>{title}</div>
                <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>{copy}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={legalLinks}>
        <Link href="/terms">Terms & Conditions</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/returns">Return Policy</Link>
        <Link href="/shipping">Shipping Policy</Link>
      </div>

      <style jsx>{`
        :global(.row-2) { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .mobile-topbar { display: none; }
        .checkout-grid { grid-template-columns: 1.35fr 1fr; }
        .form-col { padding: 32px 20px; }
        .reassurance-grid { grid-template-columns: repeat(4, 1fr); }
        @media (max-width: 860px) {
          .reassurance-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .reassurance-grid { grid-template-columns: 1fr; }
        }
        .order-summary { display: block; }
        @media (min-width: 861px) {
          .order-summary {
            position: sticky;
            top: 24px;
            align-self: start;
            max-height: calc(100vh - 48px);
            overflow-y: auto;
          }
        }
        .mobile-order-summary { display: block; }
        .mobile-reviews-carousel { display: none; }
        @media (max-width: 860px) {
          .checkout-grid { grid-template-columns: 1fr; }
          .desktop-topbar { display: none; }
          .mobile-topbar { display: flex; }
          .order-summary { display: none; }
          .form-col { padding: 32px 25px; }
          .mobile-reviews-carousel { display: block; margin-top: 20px; }
        }
        @media (min-width: 861px) {
          .mobile-order-summary { display: none; }
        }
        .apple-pay-button {
          display: inline-block;
          width: 100%;
          height: 48px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          -webkit-appearance: -apple-pay-button;
          -apple-pay-button-type: buy;
          -apple-pay-button-style: black;
        }
        @supports not (-webkit-appearance: -apple-pay-button) {
          .apple-pay-button { display: none; }
        }
      `}</style>
    </div>
  );
}

const topbar = { borderBottom: `1px solid ${T.line}`, textAlign: 'center' };
// display is deliberately not set inline — the media query shows it on mobile.
const mobileTopbar = {
  alignItems: 'center', justifyContent: 'center',
  padding: '18px 20px', borderBottom: `1px solid ${T.line}`, background: T.white,
};
const checkoutGrid = { display: 'grid', maxWidth: 1280, margin: '0 auto', columnGap: 40, rowGap: 20 };
const formCol = { borderRight: `1px solid ${T.line}` };
const summaryCol = { padding: '32px 40px', background: T.white };
const secureNote = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, fontSize: 12, color: T.soft };
const stepTitle = { fontFamily: T.sans, fontWeight: 700, fontSize: 22, margin: 0, color: T.ink, lineHeight: 1.25 };
const fieldGroupLabel = {
  fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.soft, fontWeight: 700, marginBottom: 10,
};
// 16px+ text so iOS Safari doesn't zoom the page when a field is tapped.
const bigInput = {
  width: '100%', height: 58, padding: '0 18px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 16, fontWeight: 400, color: T.ink, outline: 'none', boxSizing: 'border-box', borderRadius: 14,
};
const bigButton = {
  ...S.btnFill, width: '100%', height: 60, borderRadius: 14, justifyContent: 'center',
  fontSize: 15, letterSpacing: 'normal', textTransform: 'none', fontWeight: 700,
};
const bigButtonSecondary = {
  ...S.btnOutline, height: 60, borderRadius: 14, justifyContent: 'center', padding: '0 26px',
  fontSize: 15, letterSpacing: 'normal', textTransform: 'none', fontWeight: 700,
};
const smallOutlineButton = {
  ...S.btnOutline, height: 58, borderRadius: 14, justifyContent: 'center', padding: '0 22px',
  fontSize: 13, letterSpacing: 'normal', textTransform: 'none', fontWeight: 700,
};
const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 13, color: T.soft };
const paymentList = { border: `1.5px solid ${T.ink}`, borderRadius: 14, background: T.white, overflow: 'hidden' };
const accordionRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '18px 18px', borderBottom: `1px solid ${T.line}`, background: T.white,
};
const accordionBody = { padding: '16px 18px 20px', background: T.white };
const squareCardContainer = { minHeight: 48 };
const orDivider = { display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 0' };
const orDividerLine = { flex: 1, height: 1, background: T.line };
const orDividerText = { fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft };
const walletButtonContainer = { width: '100%', height: 48, border: 'none', overflow: 'hidden' };
const billingRecap = {
  display: 'flex', gap: 12, padding: 16, border: `1.5px solid ${T.line}`, borderRadius: 14, background: T.white, fontSize: 14,
};
const reviewCard = { padding: 16, border: `1.5px solid ${T.line}`, borderRadius: 14, background: T.white, fontSize: 14 };
const orderSummaryToggle = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 18px', border: `1.5px solid ${T.line}`, borderRadius: 14, background: T.white,
  cursor: 'pointer', fontFamily: T.sans, fontSize: 13, color: T.ink,
};
const featuredReviewsWrap = { marginTop: 28, paddingTop: 24, borderTop: `1px solid ${T.line}` };
const featuredReviewCard = { padding: 16, border: `1.5px solid ${T.line}`, borderRadius: 14, background: T.paper, marginTop: 12 };
const carouselDots = { display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 };
const carouselDot = { width: 6, height: 6, borderRadius: '50%' };
const shipMethod = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px',
  border: `1.5px solid ${T.ink}`, borderRadius: 14, fontSize: 14,
};
const errorText = { color: '#a13d2b', fontSize: 13, marginTop: 16 };
const summaryItem = { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' };
const summaryImgWrap = { position: 'relative', width: 48, height: 48, flexShrink: 0, overflow: 'hidden', border: `1px solid ${T.line}`, background: T.white };
const summaryRow = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 };
const reassuranceWrap = { borderTop: `1px solid ${T.line}`, background: T.paper };
const reassuranceGrid = { maxWidth: 1280, margin: '0 auto', padding: '32px 40px', display: 'grid', gap: 24 };
const reassuranceItem = { display: 'flex', alignItems: 'flex-start', gap: 12 };
const legalLinks = {
  display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20,
  maxWidth: 1280, margin: '0 auto', padding: '24px 40px 36px',
  fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft,
  borderTop: `1px solid ${T.line}`,
};
