import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ProductVisual from '../components/ProductVisual';
import PayPalButton from '../components/PayPalButton';
// ApplePayButton is temporarily not rendered on checkout — see git history /
// components/ApplePayButton.jsx. Domain verification with PayPal isn't
// finished yet; re-add the <ApplePayButton /> usage once that's sorted.
import GooglePayButton from '../components/GooglePayButton';
import { useCart } from '../lib/useCart';
import { GIFT_WITH_PURCHASE } from '../lib/products';
import { tokenizeCard } from '../lib/qbPayments';
import { fbTrack, generateEventId } from '../lib/fbPixel';
import { getStoredAttribution } from '../lib/attribution';
import { getSessionId } from '../lib/session';
import { ALT_PAYMENT_METHODS, getAltPaymentMethod } from '../lib/altPaymentMethods';
import { getStripeClient } from '../lib/stripeClient';
import { T, S } from '../lib/theme';

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
  const { cart, total, hydrated, clear, add, appliedDiscount, applyDiscount, clearDiscount, codeDiscountAmount, discountedTotal } = useCart();

  const [email, setEmail] = React.useState('');
  const [newsletter, setNewsletter] = React.useState(true);
  const [shipping, setShipping] = React.useState(emptyAddress);
  const [billingSame, setBillingSame] = React.useState(true);
  const [billing, setBilling] = React.useState(emptyAddress);
  const [card, setCard] = React.useState({ number: '', expiry: '', cvc: '' });
  const [payMethod, setPayMethod] = React.useState('card');
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
  const [tasselSeconds, setTasselSeconds] = React.useState(5 * 60);

  React.useEffect(() => {
    const t = setInterval(() => setTasselSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (appliedDiscount) setDiscountCode(appliedDiscount.code);
  }, [appliedDiscount]);

  React.useEffect(() => {
    if (hydrated && cart.length === 0) router.replace('/');
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
      }),
      keepalive: true,
    }).catch(() => {});
    // Fire once per checkout page load, not on every cart mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const cardBrand = React.useMemo(() => detectCardBrand(card.number.replace(/\D/g, '')), [card.number]);

  const hasTassel = cart.some((i) => i.id === GIFT_WITH_PURCHASE.id);
  const tasselExpired = tasselSeconds <= 0;
  const tasselMins = Math.floor(tasselSeconds / 60);
  const tasselSecs = String(tasselSeconds % 60).padStart(2, '0');
  const handleAddTassel = () => add({ ...GIFT_WITH_PURCHASE, price: 0, originalPrice: GIFT_WITH_PURCHASE.price }, 1);

  const shippingCost = total >= 50 || cart.length === 0 ? 0 : 5;
  const addressEntered = Boolean(shipping.address.trim() && shipping.city.trim() && shipping.state && shipping.zip.trim());
  const subtotal = cart.reduce((sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity, 0);
  const discountTotal = subtotal - total;
  const grandTotal = discountedTotal + shippingCost;

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

  const handleAltPaySubmit = async () => {
    const methodDef = getAltPaymentMethod(payMethod);
    const purchaseEventId = generateEventId();
    const billingAddress = billingSame ? shipping : billing;

    const res = await fetch('/api/stripe-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: payMethod,
        amount: grandTotal,
        items: cart,
        email,
        shipping,
        eventId: purchaseEventId,
        url: window.location.href,
        attribution: getStoredAttribution(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start payment');

    const stripe = await getStripeClient();
    if (!stripe) throw new Error('That payment option isn’t available right now. Please try another.');

    // Written before the redirect, not after — a redirect-based method may
    // send the customer to an off-site authorization page and back, and
    // sessionStorage survives that round trip within the same tab.
    sessionStorage.setItem('si-purchase', JSON.stringify({
      eventId: purchaseEventId,
      amount: grandTotal,
      contentIds: cart.map((i) => i.id),
      contents: cart.map((i) => ({ id: i.id, quantity: i.quantity })),
    }));

    const billingDetails = {
      name: `${billingAddress.firstName} ${billingAddress.lastName}`.trim(),
      email,
      address: {
        line1: billingAddress.address,
        line2: billingAddress.apt || undefined,
        city: billingAddress.city,
        state: billingAddress.state,
        postal_code: billingAddress.zip,
        country: 'US',
      },
    };

    const { error: confirmError } = await stripe[methodDef.confirmMethod](data.clientSecret, {
      payment_method: { billing_details: billingDetails },
      return_url: `${window.location.origin}/success`,
    });

    // Success navigates the browser away entirely, so reaching this line
    // means the provider rejected it before ever leaving the page.
    if (confirmError) throw new Error(confirmError.message || 'Payment failed. Please try again.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (payMethod !== 'card') {
        await handleAltPaySubmit();
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment failed');

      sessionStorage.setItem('si-purchase', JSON.stringify({
        eventId: purchaseEventId,
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
          <span style={{ fontFamily: T.display, fontSize: 16, color: T.ink }}>The Sculpt Wand</span>
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
            <p style={{ ...S.label, marginBottom: 10 }}>Express checkout</p>
            <div style={expressStack}>
              <PayPalButton
                amount={grandTotal}
                items={cart}
                url={typeof window !== 'undefined' ? window.location.href : ''}
                disabled={submitting}
                onSuccess={handlePaypalSuccess}
                onError={handlePaypalError}
              />
              <PayPalButton
                fundingSource="venmo"
                amount={grandTotal}
                items={cart}
                url={typeof window !== 'undefined' ? window.location.href : ''}
                disabled={submitting}
                onSuccess={handlePaypalSuccess}
                onError={handlePaypalError}
              />
              <GooglePayButton
                amount={grandTotal}
                items={cart}
                url={typeof window !== 'undefined' ? window.location.href : ''}
                disabled={submitting}
                onSuccess={handlePaypalSuccess}
                onError={handlePaypalError}
              />
            </div>
            <div style={dividerRow}>
              <span style={dividerLine} />
              <span style={dividerText}>OR PAY WITH CARD</span>
              <span style={dividerLine} />
            </div>
          </section>

          {!tasselExpired && (
            <section style={{ marginTop: 24 }}>
              <div style={tasselCard}>
                <p style={{ ...S.label, marginBottom: 10 }}>Get a free {GIFT_WITH_PURCHASE.name}</p>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={tasselImgWrap}>
                    <ProductVisual id={GIFT_WITH_PURCHASE.id} images={GIFT_WITH_PURCHASE.images} alt={GIFT_WITH_PURCHASE.name} width={48} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: T.sans, fontSize: 15, color: T.ink }}>{GIFT_WITH_PURCHASE.name}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 13, color: T.soft, textDecoration: 'line-through' }}>
                        ${GIFT_WITH_PURCHASE.price.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>$0.00</span>
                    </div>
                  </div>
                  {hasTassel ? (
                    <span style={{ fontSize: 12, color: T.ink, whiteSpace: 'nowrap' }}>✓ Added</span>
                  ) : (
                    <button type="button" onClick={handleAddTassel} style={S.btnOutline}>Add to cart</button>
                  )}
                </div>
                {!hasTassel && (
                  <p style={tasselTimer}>
                    Offer expires in {tasselMins}:{tasselSecs} — place your order before time runs out.
                  </p>
                )}
              </div>
            </section>
          )}

          <section style={{ marginTop: 24 }}>
            <div style={sectionHead}>
              <h2 style={sectionTitle}>Contact</h2>
            </div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <AddressFields value={shipping} onChange={setShipping} idPrefix="ship" />
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
            <div style={paymentBox}>
              <label style={payRadioRow}>
                <input type="radio" name="payMethod" checked={payMethod === 'card'} onChange={() => setPayMethod('card')} />
                <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, whiteSpace: 'nowrap' }}>Credit card</span>
                <span style={{ marginLeft: 'auto' }}><CardBrandBadges /></span>
              </label>

              {payMethod === 'card' && (
                <div style={{ marginTop: 14 }}>
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

              <div style={dividerRow}>
                <span style={dividerLine} />
                <span style={dividerText}>OR CHOOSE ANOTHER WAY TO PAY</span>
                <span style={dividerLine} />
              </div>

              {ALT_PAYMENT_METHODS.map((m) => (
                <label key={m.id} style={payRadioRow}>
                  <input type="radio" name="payMethod" checked={payMethod === m.id} onChange={() => setPayMethod(m.id)} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{m.label}</span>
                </label>
              ))}
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
            disabled={submitting}
            style={{
              ...S.btnFill, width: '100%', justifyContent: 'center', marginTop: 20,
              height: 58, fontSize: 13, opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting
              ? 'Processing…'
              : payMethod === 'card'
                ? `Place order — $${grandTotal.toFixed(2)}`
                : `Continue to ${getAltPaymentMethod(payMethod)?.label} — $${grandTotal.toFixed(2)}`}
          </button>
          <div style={secureNote}>
            <LockIcon />
            <span>256-bit SSL encrypted &middot; your card details never touch our servers</span>
          </div>
          <p style={{ fontSize: 11, color: T.soft, textAlign: 'center', marginTop: 8 }}>
            {payMethod === 'card'
              ? 'Payments securely processed by QuickBooks Payments (Intuit)'
              : `You’ll be redirected to complete payment with ${getAltPaymentMethod(payMethod)?.label}, then brought back here.`}
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
      </div>

      <style jsx>{`
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
const expressStack = { display: 'flex', flexDirection: 'column', gap: 10 };
const dividerRow = { display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0 0' };
const dividerLine = { flex: 1, height: 1, background: T.line };
const dividerText = { fontSize: 10, letterSpacing: '0.14em', color: T.soft, fontFamily: T.sans };
const secureNote = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, fontSize: 12, color: T.soft };
const sectionHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, flexWrap: 'wrap', gap: 8 };
const sectionTitle = { fontFamily: T.sans, fontWeight: 700, fontSize: 22, margin: 0 };
const input = {
  width: '100%', height: 44, padding: '0 14px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 14, fontWeight: 400, color: T.ink, outline: 'none', boxSizing: 'border-box', borderRadius: 4,
};
const checkboxLabel = { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13, color: T.soft };
const paymentBox = { border: `1px solid ${T.line}`, background: T.paper, padding: 16 };
const payRadioRow = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', cursor: 'pointer',
  fontFamily: T.sans,
};
const tasselCard = { border: `1px solid ${T.line}`, background: T.paper, padding: 16 };
const tasselImgWrap = {
  width: 48, height: 48, flexShrink: 0, overflow: 'hidden', background: T.white,
  border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const tasselTimer = { fontSize: 11, color: '#a13d2b', marginTop: 10, marginBottom: 0 };
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
