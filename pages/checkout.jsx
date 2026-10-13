import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ProductVisual from '../components/ProductVisual';
import PayPalButton from '../components/PayPalButton';
import AfterpayButton from '../components/AfterpayButton';
import CashAppPayButton from '../components/CashAppPayButton';
import {
  createSquareCard, tokenizeSquareCard,
  createApplePayButton, createGooglePayButton, tokenizeWalletWithContact,
} from '../lib/squareClient';
import { useCart } from '../lib/useCart';
import { tokenizeCard } from '../lib/qbPayments';
import { fbTrack, generateEventId, refreshPixelIdentity } from '../lib/fbPixel';
import { firstTimeToday, cartSignature } from '../lib/funnelTracking';
import { getIdentity, rememberIdentity } from '../lib/identity';
import { getStoredAttribution } from '../lib/attribution';
import { getSessionId, getVisitorId } from '../lib/session';
import { T, S } from '../lib/theme';

// Cards, Apple Pay and Google Pay go through Square (lib/squareClient.js,
// /api/square-checkout), same as veil-ecommerce and Anese. Until the Square
// keys are set in Vercel the page keeps its QuickBooks card form, so card
// checkout never goes dark during the switch.
const SQUARE_ENABLED = Boolean(process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID && process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID);

function addressComplete(a) {
  return Boolean(a?.address?.trim() && a?.city?.trim() && a?.state && a?.zip?.trim());
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const emptyAddress = { firstName: '', lastName: '', address: '', apt: '', city: '', state: '', zip: '', phone: '' };

function LockIcon(props) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function QuestionIcon(props) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

// IIN-range brand detection — good enough to give the user visual
// confirmation their card is recognized, not used for validation.
function detectCardBrand(digits) {
  if (/^4/.test(digits)) return 'visa';
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6(?:011|5)/.test(digits)) return 'discover';
  return null;
}

function formatCardNumber(digits) {
  if (/^3[47]/.test(digits)) {
    // Amex: 4-6-5
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

// Small, recognizable renderings of each network's real mark (not a
// colored text pill) so the "we accept" row reads as legitimate rather
// than placeholder-ish.
function CardLogoBadge({ children, bg = '#fff' }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 20, borderRadius: 3, background: bg,
        border: `1px solid ${T.line}`, overflow: 'hidden', flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

function VisaLogo() {
  return (
    <CardLogoBadge>
      <svg width="24" height="10" viewBox="0 0 48 18" aria-label="Visa">
        <text x="0" y="14" fontFamily="Arial, sans-serif" fontStyle="italic" fontWeight="800" fontSize="16" fill="#1434CB" letterSpacing="-0.5">VISA</text>
      </svg>
    </CardLogoBadge>
  );
}

function MastercardLogo() {
  return (
    <CardLogoBadge>
      <svg width="22" height="14" viewBox="0 0 40 26" aria-label="Mastercard">
        <circle cx="15" cy="13" r="11" fill="#EB001B" />
        <circle cx="25" cy="13" r="11" fill="#F79E1B" style={{ mixBlendMode: 'multiply' }} />
      </svg>
    </CardLogoBadge>
  );
}

function AmexLogo() {
  return (
    <CardLogoBadge bg="#006FCF">
      <svg width="26" height="13" viewBox="0 0 52 22" aria-label="American Express">
        <text x="1" y="16" fontFamily="Arial, sans-serif" fontWeight="800" fontSize="13" fill="#fff" letterSpacing="0.5">AMEX</text>
      </svg>
    </CardLogoBadge>
  );
}

function DiscoverLogo() {
  return (
    <CardLogoBadge>
      <svg width="28" height="11" viewBox="0 0 66 20" aria-label="Discover">
        <text x="0" y="14" fontFamily="Arial, sans-serif" fontWeight="700" fontStyle="italic" fontSize="11" fill="#1B1B1B" letterSpacing="-0.3">Discover</text>
        <circle cx="62" cy="14" r="4" fill="#FF6600" />
      </svg>
    </CardLogoBadge>
  );
}

const CARD_BRANDS = [
  { id: 'visa', label: 'Visa', Logo: VisaLogo },
  { id: 'mastercard', label: 'Mastercard', Logo: MastercardLogo },
  { id: 'amex', label: 'Amex', Logo: AmexLogo },
  { id: 'discover', label: 'Discover', Logo: DiscoverLogo },
];

// Shows a couple of the most recognizable brands plus a "+N" count for the
// rest — the point is signaling "we take lots of card types," not listing
// every logo (which also doesn't reliably fit next to the "Credit card"
// label on a phone screen).
const VISIBLE_CARD_BRANDS = CARD_BRANDS.slice(0, 2);
const HIDDEN_CARD_BRAND_COUNT = CARD_BRANDS.length - VISIBLE_CARD_BRANDS.length;

function CardBrandBadges() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {VISIBLE_CARD_BRANDS.map((b) => <b.Logo key={b.id} />)}
      {HIDDEN_CARD_BRAND_COUNT > 0 && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 20, borderRadius: 3,
            fontFamily: T.sans, fontSize: 8, fontWeight: 700,
            color: T.soft, background: T.white, border: `1px solid ${T.line}`,
          }}
        >
          +{HIDDEN_CARD_BRAND_COUNT}
        </span>
      )}
    </div>
  );
}

function CardBrandIcon({ brand }) {
  const b = CARD_BRANDS.find((x) => x.id === brand);
  if (!b) return null;
  return <b.Logo />;
}

function AddressFields({ value, onChange, idPrefix }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  const section = idPrefix === 'bill' ? 'billing' : 'shipping';
  return (
    <>
      <div className="row-2">
        <input placeholder="First name" value={value.firstName} onChange={set('firstName')} style={input} autoComplete={`${section} given-name`} required />
        <input placeholder="Last name" value={value.lastName} onChange={set('lastName')} style={input} autoComplete={`${section} family-name`} required />
      </div>
      <input placeholder="Address" value={value.address} onChange={set('address')} style={{ ...input, marginTop: 8 }} autoComplete={`${section} address-line1`} required />
      <input placeholder="Apartment, suite, etc. (optional)" value={value.apt} onChange={set('apt')} style={{ ...input, marginTop: 8 }} autoComplete={`${section} address-line2`} />
      <div className="row-3" style={{ marginTop: 8 }}>
        <input placeholder="City" value={value.city} onChange={set('city')} style={input} autoComplete={`${section} address-level2`} required />
        <select value={value.state} onChange={set('state')} style={input} autoComplete={`${section} address-level1`} required>
          <option value="">State</option>
          {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input placeholder="ZIP code" value={value.zip} onChange={set('zip')} style={input} autoComplete={`${section} postal-code`} required />
      </div>
      <input
        placeholder="Phone (optional)"
        value={value.phone}
        onChange={set('phone')}
        style={{ ...input, marginTop: 8 }}
        autoComplete={`${section} tel`}
        id={idPrefix ? `${idPrefix}-phone` : undefined}
      />
    </>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, total, hydrated, clear, appliedDiscount, applyDiscount, clearDiscount, codeDiscountAmount, discountedTotal } = useCart();

  const [email, setEmail] = React.useState('');
  const [newsletter, setNewsletter] = React.useState(true);
  const [shipping, setShipping] = React.useState(emptyAddress);
  const [billingSame, setBillingSame] = React.useState(true);
  const [billing, setBilling] = React.useState(emptyAddress);
  const [card, setCard] = React.useState({ number: '', expiry: '', cvc: '' });
  const [cvcTipOpen, setCvcTipOpen] = React.useState(false);
  const cvcTipRef = React.useRef(null);

  React.useEffect(() => {
    if (!cvcTipOpen) return;
    const handler = (e) => {
      if (cvcTipRef.current && !cvcTipRef.current.contains(e.target)) setCvcTipOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cvcTipOpen]);
  const [discountCode, setDiscountCode] = React.useState('');
  const [discountMessage, setDiscountMessage] = React.useState('');
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  // Square card form — Square renders its own number/expiry/CVC/ZIP fields
  // into #square-card-container; the Card instance is kept for tokenize().
  const squareCardRef = React.useRef(null);
  const [squareReady, setSquareReady] = React.useState(false);
  const [squareError, setSquareError] = React.useState('');
  // Apple Pay / Google Pay (Square). null = still checking, so the
  // containers exist for Square's attach(); false = not offered here.
  const appleMethodRef = React.useRef(null);
  const googleMethodRef = React.useRef(null);
  const [appleAvailable, setAppleAvailable] = React.useState(SQUARE_ENABLED ? null : false);
  const [googleAvailable, setGoogleAvailable] = React.useState(SQUARE_ENABLED ? null : false);
  const [afterpayReady, setAfterpayReady] = React.useState(false);
  const [cashAppReady, setCashAppReady] = React.useState(false);
  const cashAppEventId = React.useMemo(() => generateEventId(), []);

  React.useEffect(() => {
    if (appliedDiscount) setDiscountCode(appliedDiscount.code);
  }, [appliedDiscount]);

  React.useEffect(() => {
    if (hydrated && cart.length === 0) router.replace('/shop');
  }, [hydrated, cart.length, router]);

  // Bounced back here from /success after a declined or abandoned "or pay
  // another way" redirect (Cash App Pay, Klarna, Afterpay, Affirm) — the
  // cart was never cleared for that path, so there's something to return to.
  React.useEffect(() => {
    if (!router.isReady || !router.query.payment_error) return;
    setError('That payment didn’t go through — please try again or use a different method.');
    router.replace('/checkout', undefined, { shallow: true });
  }, [router.isReady, router.query.payment_error, router]);

  React.useEffect(() => {
    if (!hydrated || cart.length === 0) return;
    // Once per distinct cart per device per day (lib/funnelTracking.js), not
    // per tab — the cart is saved across visits, so a shopper reopening the
    // site in a new tab and going back to checkout was counted again.
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
    // Fire once per checkout page load, not on every cart mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  React.useEffect(() => {
    if (!SQUARE_ENABLED || !hydrated || cart.length === 0) return undefined;
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
  }, [hydrated, cart.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Express Apple Pay / Google Pay sit above the form, so the wallet sheet
  // also collects name, email and address — used when the form below
  // hasn't been filled in yet. The total shown in the sheet is the one at
  // mount; the amount charged is always read fresh from latestRef.
  React.useEffect(() => {
    if (!squareReady) return undefined;
    let cancelled = false;
    const cleanups = [];
    (async () => {
      const amount = latestRef.current.grandTotal;
      const apple = await createApplePayButton(amount, undefined, { requestContact: true });
      if (!cancelled) {
        appleMethodRef.current = apple;
        setAppleAvailable(Boolean(apple));
      }
      const google = await createGooglePayButton(amount, 'google-pay-button', undefined, { requestContact: true });
      if (cancelled) {
        google?.destroy?.().catch(() => {});
      } else if (google) {
        googleMethodRef.current = google;
        setGoogleAvailable(true);
        const btn = document.getElementById('google-pay-button');
        const onClick = (event) => { event.preventDefault(); handleWalletPay(googleMethodRef, 'Google Pay'); };
        btn?.addEventListener('click', onClick);
        cleanups.push(() => btn?.removeEventListener('click', onClick));
      } else {
        setGoogleAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      appleMethodRef.current?.destroy?.().catch(() => {});
      googleMethodRef.current?.destroy?.().catch(() => {});
      appleMethodRef.current = null;
      googleMethodRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squareReady]);

  const cardBrand = React.useMemo(() => detectCardBrand(card.number.replace(/\D/g, '')), [card.number]);


  const shippingCost = total >= 50 || cart.length === 0 ? 0 : 5;
  const addressEntered = Boolean(shipping.address.trim() && shipping.city.trim() && shipping.state && shipping.zip.trim());
  const subtotal = cart.reduce((sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity, 0);
  const discountTotal = subtotal - total;
  const grandTotal = discountedTotal + shippingCost;

  // Wallet click handlers are attached once and can fire much later — read
  // the current form through this ref, not a stale closure.
  const latestRef = React.useRef({});
  latestRef.current = { email, shipping, cart, grandTotal };

  const afterpayOrder = () => {
    const { email, shipping, cart, grandTotal } = latestRef.current;
    if (!email.trim() || !addressComplete(shipping)) {
      return { error: 'Enter your email and delivery address first.' };
    }
    return {
      amount: grandTotal, items: cart, email, shipping,
      eventId: generateEventId(), url: window.location.href, attribution: getStoredAttribution(), sessionId: getSessionId(),
    };
  };
  const cashAppOrder = email.trim() && addressEntered ? {
    amount: grandTotal, items: cart, email, shipping,
    eventId: cashAppEventId, url: typeof window !== 'undefined' ? window.location.href : null,
    attribution: getStoredAttribution(), sessionId: getSessionId(),
  } : null;

  // Remember the shopper's email/phone for ad matching once they've typed
  // them, and re-init the Pixel so the rest of this visit's events carry
  // them (lib/identity.js, lib/fbPixel.js).
  // Also saves them to the store's contact list (admin → Subscribers), so an
  // abandoned checkout can still be followed up. Only sent when something
  // they typed changed.
  const lastSavedContactRef = React.useRef('');
  const handleIdentityBlur = () => {
    if (!email.trim() && !shipping.phone) return;
    rememberIdentity({ email, phone: shipping.phone });
    refreshPixelIdentity(process.env.NEXT_PUBLIC_META_PIXEL_ID);
    const name = `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim();
    const sig = JSON.stringify([email.trim(), shipping.phone, name, shipping.city, shipping.state, newsletter]);
    if (sig === lastSavedContactRef.current) return;
    lastSavedContactRef.current = sig;
    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, phone: shipping.phone, name, consent: newsletter, source: 'checkout',
        address: { city: shipping.city, state: shipping.state },
        cart: cart.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
      }),
      keepalive: true,
    }).catch(() => {});
  };

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
    }
  };

  // Shared by the Square card form and Apple Pay / Google Pay — every Square
  // method produces the same single-use token, charged by /api/square-checkout.
  const completeSquareOrder = async (token, paymentMethodLabel, override = {}) => {
    const { cart, grandTotal } = latestRef.current;
    const orderEmail = override.email ?? latestRef.current.email;
    const orderShipping = override.shipping ?? latestRef.current.shipping;
    rememberIdentity({ email: orderEmail, phone: orderShipping?.phone });
    const purchaseEventId = generateEventId();
    const res = await fetch('/api/square-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        amount: grandTotal,
        items: cart,
        email: orderEmail,
        shipping: orderShipping,
        eventId: purchaseEventId,
        url: window.location.href,
        paymentMethod: paymentMethodLabel,
        attribution: getStoredAttribution(),
        sessionId: getSessionId(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Payment failed');

    sessionStorage.setItem('si-purchase', JSON.stringify({
      eventId: purchaseEventId,
      orderId: data.id,
      amount: grandTotal,
      contentIds: cart.map((i) => i.id),
      contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
    }));
    await router.push('/success');
    clear();
  };

  // Apple Pay / Google Pay: use the form if it's filled in, otherwise the
  // name/email/address the wallet sheet collected.
  const handleWalletPay = async (methodRef, label) => {
    setError('');
    if (!methodRef.current) return;
    setSubmitting(true);
    try {
      const { token, contact } = await tokenizeWalletWithContact(methodRef.current);
      const { email, shipping } = latestRef.current;
      const formOk = email.trim() && addressComplete(shipping);
      const override = formOk ? {} : {
        email: email.trim() || contact?.email || '',
        shipping: addressComplete(shipping) ? shipping : contact,
      };
      if (!formOk && (!override.email || !addressComplete(override.shipping))) {
        throw new Error(`Enter your email and delivery address below, then pay with ${label}.`);
      }
      await completeSquareOrder(token, label, override);
    } catch (err) {
      if (!err.cancelled) setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (SQUARE_ENABLED) {
        if (!squareReady || !squareCardRef.current) {
          throw new Error('Payment form is still loading — please wait a moment and try again.');
        }
        if (!addressComplete(shipping)) throw new Error('Enter your delivery address.');
        const token = await tokenizeSquareCard(squareCardRef.current);
        await completeSquareOrder(token, 'Card');
        return;
      }

      const purchaseEventId = generateEventId();
      const [expMonth, expYear] = card.expiry.split('/').map((s) => s.trim());
      const billingAddress = billingSame ? shipping : billing;
      const token = await tokenizeCard(
        {
          number: card.number,
          expMonth,
          expYear: expYear && expYear.length === 2 ? `20${expYear}` : expYear,
          cvc: card.cvc,
          name: `${billingAddress.firstName} ${billingAddress.lastName}`.trim(),
          street: billingAddress.address,
          city: billingAddress.city,
          region: billingAddress.state,
          postalCode: billingAddress.zip,
        },
        process.env.NEXT_PUBLIC_QB_ENVIRONMENT || 'sandbox'
      );

      const res = await fetch('/api/qb-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          amount: grandTotal,
          items: cart,
          email,
          shipping,
          billing: billingSame ? shipping : billing,
          eventId: purchaseEventId,
          url: window.location.href,
          paymentMethod: CARD_BRANDS.find((b) => b.id === cardBrand)?.label || 'Card',
          attribution: getStoredAttribution(),
          sessionId: getSessionId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      sessionStorage.setItem('si-purchase', JSON.stringify({
        eventId: purchaseEventId,
        orderId: data.id,
        amount: grandTotal,
        contentIds: cart.map((i) => i.id),
        contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
      }));

      await router.push('/success');
      clear();
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaypalSuccess = async (result) => {
    sessionStorage.setItem('si-purchase', JSON.stringify({
      eventId: result.eventId,
      orderId: result.id,
      amount: result.amount,
      contentIds: cart.map((i) => i.id),
      contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
    }));
    await router.push('/success');
    clear();
  };

  const handlePaypalError = (message) => {
    setError(message || 'PayPal checkout failed. Please try again.');
  };

  if (!hydrated || cart.length === 0) return null;

  return (
    <div>
      <header style={topbar}>
        <Link href="/" style={{ ...S.wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64, textDecoration: 'none' }}>
          <span style={{ fontFamily: T.display, fontSize: 16, color: T.ink }}>SMELLS — ICONIC</span>
        </Link>
      </header>

      <button className="summary-toggle" style={summaryToggle} onClick={() => setSummaryOpen((o) => !o)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{summaryOpen ? 'Hide' : 'Show'} order summary</span>
          <span style={{ fontSize: 10 }}>{summaryOpen ? '▲' : '▼'}</span>
        </span>
        <span style={{ fontFamily: T.sans, fontSize: 17 }}>${grandTotal.toFixed(2)}</span>
      </button>

      <div className="checkout-grid" style={checkoutGrid}>
        <form onSubmit={handleSubmit} style={formCol}>
          <section>
            <div style={sectionHead}>
              <h2 style={sectionTitle}>Contact</h2>
            </div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={handleIdentityBlur}
              style={input}
              autoComplete="email"
              required
            />
            <label style={checkboxLabel}>
              <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
              Email me with news and offers
            </label>
          </section>

          <section style={{ marginTop: 24 }}>
            <div style={sectionHead}>
              <h2 style={sectionTitle}>Delivery</h2>
            </div>
            <select value="United States" readOnly style={{ ...input, marginBottom: 12, color: T.soft }}>
              <option>United States</option>
            </select>
            <div onBlur={handleIdentityBlur}><AddressFields value={shipping} onChange={setShipping} idPrefix="ship" /></div>
          </section>

          <section style={{ marginTop: 24 }}>
            <div style={sectionHead}>
              <h2 style={sectionTitle}>Shipping method</h2>
            </div>
            {addressEntered ? (
              <div style={shipMethod}>
                <div>
                  <div>Standard Shipping</div>
                  <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>3–5 business days after order placed</div>
                </div>
                <span>{shippingCost === 0 ? 'Free' : `$${shippingCost.toFixed(2)}`}</span>
              </div>
            ) : (
              <p style={{ color: T.soft, fontSize: 14 }}>Enter your delivery address to see shipping options.</p>
            )}
          </section>

          <section style={{ marginTop: 24 }}>
            <div style={sectionHead}>
              <h2 style={sectionTitle}>Payment</h2>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.soft }}>
                <LockIcon />
                All transactions are secure and encrypted.
              </span>
            </div>
            {/* Same layout as veil-ecommerce / Anese: every way to pay other
                than typing a card stacked first — Square's Apple Pay / Google
                Pay, Afterpay, Cash App Pay, then PayPal / Venmo — with one "or
                pay by card" line, then the card form in its own rounded box.
                Google Pay's container stays in the DOM (hidden once confirmed
                unavailable) because Square's attach() needs it by id. */}
            <div>
              {appleAvailable !== false && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="apple-pay-button"
                    aria-label="Apple Pay"
                    disabled={submitting}
                    onClick={() => handleWalletPay(appleMethodRef, 'Apple Pay')}
                  />
                </div>
              )}
              {SQUARE_ENABLED && (
                <div style={{ marginTop: 10, display: googleAvailable === false ? 'none' : 'block' }}>
                  <div id="google-pay-button" style={{ width: '100%', minHeight: 44 }} />
                </div>
              )}
              <AfterpayButton total={grandTotal} getOrder={afterpayOrder} onError={setError} onReady={setAfterpayReady} />
              <CashAppPayButton
                order={cashAppOrder}
                purchaseKey="si-purchase"
                onError={setError}
                onReady={setCashAppReady}
                onNeedDetails={() => {
                  const el = document.querySelector('input[type=email]');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => el?.focus(), 400);
                }}
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
              <p style={{ fontSize: 12, color: T.soft, textAlign: 'center', margin: '14px 0 0' }}>or pay by card</p>
            </div>

            <div style={{ ...paymentList, marginTop: 16 }}>
              <div style={accordionRow}>
                <span style={{ fontWeight: 700, fontSize: 16, color: T.ink }}>Credit or Debit Card</span>
                <CardBrandBadges />
              </div>

              {SQUARE_ENABLED && (
                <div style={accordionBody}>
                  {/* Square renders its own number/expiry/CVC/ZIP fields here. */}
                  <div id="square-card-container" style={{ minHeight: 48 }} />
                  {!squareReady && !squareError && (
                    <p style={{ fontSize: 12, color: T.soft, marginTop: 8 }}>Loading payment form…</p>
                  )}
                  {squareError && <p style={{ fontSize: 12, color: '#a13d2b', marginTop: 8 }}>{squareError}</p>}
                  <p style={{ fontSize: 12, color: T.soft, margin: '10px 0 0' }}>Billing address: same as shipping address.</p>
                </div>
              )}

              {!SQUARE_ENABLED && (
                <div style={accordionBody}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.soft, display: 'flex' }}>
                      <LockIcon />
                    </span>
                    <input
                      placeholder="Card number"
                      value={card.number}
                      onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16)) })}
                      style={{ ...input, paddingLeft: 34, paddingRight: cardBrand ? 70 : 14 }}
                      inputMode="numeric"
                      autoComplete="cc-number"
                      required
                    />
                    {cardBrand && (
                      <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                        <CardBrandIcon brand={cardBrand} />
                      </div>
                    )}
                  </div>
                  <div className="row-2" style={{ marginTop: 8 }}>
                    <input
                      placeholder="Expiration date (MM/YY)"
                      value={card.expiry}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                        const formatted = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
                        setCard({ ...card, expiry: formatted });
                      }}
                      style={input}
                      inputMode="numeric"
                      maxLength={5}
                      autoComplete="cc-exp"
                      required
                    />
                    <div style={{ position: 'relative' }} ref={cvcTipRef}>
                      <input
                        placeholder="Security code"
                        value={card.cvc}
                        onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        style={{ ...input, paddingRight: 34 }}
                        type="password"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setCvcTipOpen((o) => !o)}
                        aria-label="What is the security code?"
                        style={{
                          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                          color: T.soft, cursor: 'pointer', background: 'none', border: 'none', padding: 0, display: 'flex',
                        }}
                      >
                        <QuestionIcon />
                      </button>
                      {cvcTipOpen && (
                        <div style={cvcTooltip}>
                          The 3-digit code on the back of your card (4 digits on the front for Amex).
                        </div>
                      )}
                    </div>
                  </div>
                  <label style={checkboxLabel}>
                    <input type="checkbox" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} />
                    Use shipping address as billing address
                  </label>
                  {!billingSame && (
                    <div style={{ marginTop: 10 }}>
                      <AddressFields value={billing} onChange={setBilling} idPrefix="bill" />
                    </div>
                  )}
                </div>
              )}

            </div>
          </section>

          <section style={{ marginTop: 24 }}>
            <div style={sectionHead}>
              <h2 style={sectionTitle}>Discount code</h2>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                placeholder="Discount code"
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value);
                  if (appliedDiscount) clearDiscount();
                  setDiscountMessage('');
                }}
                style={{ ...input, flex: 1 }}
              />
              <button type="button" style={S.btnOutline} onClick={handleApplyDiscount}>Apply</button>
            </div>
            {discountMessage && (
              <p style={{ fontSize: 12, color: appliedDiscount ? T.ink : '#a13d2b', marginTop: 8 }}>{discountMessage}</p>
            )}
          </section>

          {error && <p style={errorText}>{error}</p>}

          <button
            type="submit"
            disabled={submitting || (SQUARE_ENABLED && !squareReady)}
            style={{ ...bigButton, marginTop: 20, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting
              ? 'Processing…'
              : `Complete Order — $${grandTotal.toFixed(2)}`}
          </button>
          <div style={secureNote}>
            <LockIcon />
            <span>256-bit SSL encrypted &middot; your card details never touch our servers</span>
          </div>
          <p style={{ fontSize: 11, color: T.soft, textAlign: 'center', marginTop: 8 }}>
            {`Payments securely processed by ${SQUARE_ENABLED ? 'Square' : 'QuickBooks Payments (Intuit)'}`}
          </p>
        </form>

        <aside className={`order-summary ${summaryOpen ? 'open' : ''}`} style={summaryCol}>
          <div style={{ maxHeight: 340, overflowY: 'auto', marginBottom: 20 }}>
            {cart.map((item) => (
              <div key={item.id} style={summaryItem}>
                <div style={summaryImgWrap}>
                  <ProductVisual id={item.id} images={item.images} alt={item.name} width={48} />
                  <span style={qtyBadge}>{item.quantity}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>{item.size}</div>
                </div>
                <div style={{ fontSize: 14 }}>${(item.price * item.quantity).toFixed(2)}</div>
              </div>
            ))}
          </div>

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
          <div style={{ ...summaryRow, borderTop: `1px solid ${T.line}`, paddingTop: 16, marginTop: 6 }}>
            <span style={{ fontFamily: T.sans, fontSize: 18 }}>Total</span>
            <span style={{ fontFamily: T.sans, fontSize: 24 }}>${grandTotal.toFixed(2)}</span>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <input
              placeholder="Discount code"
              value={discountCode}
              onChange={(e) => {
                setDiscountCode(e.target.value);
                if (appliedDiscount) clearDiscount();
                setDiscountMessage('');
              }}
              style={{ ...input, flex: 1 }}
            />
            <button type="button" style={S.btnOutline} onClick={handleApplyDiscount}>Apply</button>
          </div>
          {discountMessage && (
            <p style={{ fontSize: 12, color: appliedDiscount ? T.ink : '#a13d2b', marginTop: 8 }}>{discountMessage}</p>
          )}
        </aside>
      </div>

      <div style={legalLinks}>
        <Link href="/terms">Terms & Conditions</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/returns">Return Policy</Link>
        <Link href="/shipping">Shipping Policy</Link>
      </div>

      <style jsx>{`
        .apple-pay-button {
          display: inline-block;
          width: 100%;
          min-height: 44px;
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
        :global(.row-2) { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        :global(.row-3) { display: grid; grid-template-columns: 1.4fr 0.8fr 1fr; gap: 10px; }
        .summary-toggle { display: none; }
        .checkout-grid { grid-template-columns: 1.35fr 1fr; }
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
        @media (max-width: 860px) {
          .checkout-grid { grid-template-columns: 1fr; }
          .summary-toggle { display: flex; }
          .order-summary { display: none; order: -1; border-bottom: 1px solid ${T.line}; }
          .order-summary.open { display: block; }
        }
        @media (max-width: 520px) {
          :global(.row-3) { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

const topbar = { borderBottom: `1px solid ${T.line}`, textAlign: 'center' };
const summaryToggle = {
  width: '100%', border: 'none', borderBottom: `1px solid ${T.line}`, background: T.paper,
  padding: '16px 24px', alignItems: 'center', justifyContent: 'space-between',
  cursor: 'pointer', fontFamily: T.sans, fontSize: 13, color: T.ink,
};
const checkoutGrid = { display: 'grid', maxWidth: 1280, margin: '0 auto', columnGap: 40, rowGap: 20 };
const formCol = { padding: '32px 10px', borderRight: `1px solid ${T.line}` };
const summaryCol = { padding: '32px 40px', background: T.paper };
const secureNote = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 12, color: T.soft };
const sectionHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 };
const sectionTitle = { fontFamily: T.sans, fontWeight: 700, fontSize: 22, margin: 0 };
const input = {
  width: '100%', height: 44, padding: '0 14px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 14, fontWeight: 400, color: T.ink, outline: 'none', boxSizing: 'border-box', borderRadius: 4,
};
const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: T.soft };
const paymentList = { border: `1.5px solid ${T.ink}`, borderRadius: 14, background: T.white, overflow: 'hidden' };
const accordionRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
  padding: '18px 18px', borderBottom: `1px solid ${T.line}`, background: T.white, margin: 0,
};
const accordionBody = { padding: '16px 18px 20px', background: T.white };
const bigButton = {
  ...S.btnFill, width: '100%', height: 60, borderRadius: 14, justifyContent: 'center',
  fontSize: 15, letterSpacing: 'normal', textTransform: 'none', fontWeight: 700,
};
const cvcTooltip = {
  position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, width: 200,
  background: T.ink, color: T.white, fontSize: 11, lineHeight: 1.4,
  padding: '8px 10px', borderRadius: 4, zIndex: 5,
};
const shipMethod = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 14px',
  border: `1px solid ${T.ink}`, fontSize: 14,
};
const errorText = { color: '#a13d2b', fontSize: 13, marginTop: 20 };
const summaryItem = { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0' };
const summaryImgWrap = { position: 'relative', width: 48, height: 48, flexShrink: 0, overflow: 'hidden', border: `1px solid ${T.line}`, background: T.white };
const qtyBadge = {
  position: 'absolute', top: -8, right: -8, background: T.soft, color: T.white, borderRadius: '50%',
  width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const summaryRow = { display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 };
const legalLinks = {
  display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 20,
  maxWidth: 1280, margin: '0 auto', padding: '24px 40px 36px',
  fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.soft,
  borderTop: `1px solid ${T.line}`,
};
