import React from 'react';
import Link from 'next/link';
import { T, S } from '../lib/theme';
import ProductVisual from './ProductVisual';
import PopularBadge from './PopularBadge';
import { rememberIdentity } from '../lib/identity';
import { getVisitorId } from '../lib/session';
import { trackCart } from '../lib/cartTracking';
import TopBanner from './TopBanner';
import SaleCallout, { useActivePromo } from './SaleCallout';
import { shippingFor } from '../lib/shipping';
import CartExitPopup, { shouldAskCartExit } from './CartExitPopup';
import { getProductById, UPSELL_ID, UPSELL_PRICE, thumbImages } from '../lib/products';

// Code revealed by the cart's email field (must exist in admin → Discounts).
const UNLOCK_CODE = 'ICONIC15';
const UNLOCKED_KEY = 'si-cart-code-unlocked';

export default function CartDrawer({
  cart, open, onClose, add, remove, setQty, total,
  appliedDiscount, applyDiscount, codeDiscountAmount, discountedTotal,
}) {
  // Babygirl Solid Perfume, offered under the items until it's in the bag —
  // at UPSELL_PRICE, since the cart always has another item when it shows
  // (lib/useCart.js priceCart).
  const upsell = getProductById(UPSELL_ID);
  const showUpsell = Boolean(upsell && add && cart.length > 0 && !cart.some((i) => i.id === upsell.id));
  // "Unlock 15% off": an email field that reveals and applies the code, and
  // adds them to the contact list (admin → Subscribers) as opted in.
  // Remembered on this device so it isn't offered again once used.
  const [unlockEmail, setUnlockEmail] = React.useState('');
  const [unlockState, setUnlockState] = React.useState('idle'); // idle | busy | done | error
  const [alreadyUnlocked, setAlreadyUnlocked] = React.useState(false);
  React.useEffect(() => {
    try { setAlreadyUnlocked(Boolean(window.localStorage.getItem(UNLOCKED_KEY))); } catch { /* storage blocked */ }
  }, []);
  const handleUnlock = async (e) => {
    e.preventDefault();
    const email = unlockEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setUnlockState('error'); return; }
    setUnlockState('busy');
    rememberIdentity({ email });
    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, consent: true, source: 'cart', journeyId: getVisitorId(), cart: cart.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })) }),
      keepalive: true,
    }).catch(() => {});
    await applyDiscount(UNLOCK_CODE).catch(() => ({}));
    try { window.localStorage.setItem(UNLOCKED_KEY, '1'); } catch { /* storage blocked */ }
    setUnlockState('done');
  };
  // During a holiday sale the cart (and its exit popup) offers the sale code
  // instead, so the 15% unlock can't swap a shopper's 20% code for a smaller one.
  const salePromo = useActivePromo();
  const showUnlock = !salePromo && cart.length > 0 && !alreadyUnlocked && !(appliedDiscount && unlockState !== 'done');

  const subtotal = cart.reduce((sum, item) => sum + (item.originalPrice ?? item.price) * item.quantity, 0);
  const discountTotal = subtotal - total;
  // Flat-rate shipping (lib/shipping.js). Read after mount: the free-
  // shipping perk lives in this browser's storage.
  const [shippingCost, setShippingCost] = React.useState(null);
  React.useEffect(() => { if (open) setShippingCost(shippingFor()); }, [open]);
  const freeShipping = shippingCost === 0;
  const orderTotal = discountedTotal + (shippingCost || 0);
  const [exitOpen, setExitOpen] = React.useState(false);


  // Cart drop-off report (lib/cartFunnel.js): opening the cart, and closing
  // it again without heading to checkout — with what they were looking at
  // (shipping charge, total, how long the cart was open).
  const openedAtRef = React.useRef(0);
  const checkoutClickedRef = React.useRef(false);
  const latestCartRef = React.useRef({});
  latestCartRef.current = { cart, freeShipping, discountedTotal };
  React.useEffect(() => {
    const { cart: items, freeShipping: free, discountedTotal: due } = latestCartRef.current;
    if (open && items.length > 0) {
      openedAtRef.current = Date.now();
      checkoutClickedRef.current = false;
      // A beat after the add-to-cart ping (adding opens the cart), so the
      // two don't race to update the visitor's trail.
      setTimeout(() => trackCart('cart_open'), 700);
    } else if (!open && openedAtRef.current) {
      if (!checkoutClickedRef.current && items.length > 0) {
        trackCart('cart_closed', {
          shipping: free ? 0 : shippingFor(),
          subtotal: due,
          dwellSec: (Date.now() - openedAtRef.current) / 1000,
          items: items.map((i) => i.name),
        });
        // "What's holding you back?" (components/CartExitPopup.jsx) — not
        // on checkout itself, and at most once every few days.
        if (!window.location.pathname.startsWith('/checkout') && shouldAskCartExit()) {
          setTimeout(() => setExitOpen(true), 350);
        }
      }
      openedAtRef.current = 0;
    }
  }, [open]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(21,17,13,0.4)', zIndex: 200,
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .3s',
        }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', zIndex: 201,
          background: T.white, borderLeft: `1px solid ${T.line}`, padding: '32px 30px',
          transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .35s ease',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* The page's banner sits under the overlay, so the drawer carries
            its own copy and the banner stays visible while it's open. */}
        <div style={{ margin: '-32px -30px 24px', flexShrink: 0 }}><TopBanner /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
          <span style={S.label}>Your cart</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.ink }}>×</button>
        </div>

        {cart.length > 0 && (
          <p style={{ fontSize: 12, color: T.ink, margin: '0 0 20px', flexShrink: 0 }}>Ships within 1 business day.</p>
        )}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {cart.length === 0 && <p style={{ color: T.soft, fontSize: 14 }}>Your cart is empty.</p>}
          {cart.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '18px 0', borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={itemImg}>
                  <ProductVisual id={item.id} images={thumbImages(item)} alt={item.name} width={56} />
                </div>
                <div>
                  <div style={{ fontFamily: T.display, fontWeight: 300, fontSize: 20 }}>{item.name}</div>
                  <PopularBadge />
                  {item.plan === 'subscribe' && (
                    <div style={subscribeNote}>Subscribe &amp; save · every 2 months</div>
                  )}
                  <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>${item.price} · {item.size}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    <button
                      onClick={() => {
                        if (item.quantity <= 1) trackCart('item_removed', { name: item.name });
                        setQty(item.id, item.quantity - 1);
                      }}
                      style={qtyBtn}
                    >−</button>
                    <span style={{ fontSize: 13 }}>{item.quantity}</span>
                    <button onClick={() => setQty(item.id, item.quantity + 1)} style={qtyBtn}>+</button>
                  </div>
                </div>
              </div>
              <button onClick={() => { trackCart('item_removed', { name: item.name }); remove(item.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, alignSelf: 'flex-start' }}>Remove</button>
            </div>
          ))}

        {showUpsell && (
          <div style={upsellBox}>
            <div style={upsellImg}><ProductVisual id={upsell.id} images={thumbImages(upsell)} alt={upsell.name} width={64} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...S.label, fontSize: 9 }}>Add the solid perfume</div>
              <div style={{ fontFamily: T.display, fontWeight: 300, fontSize: 17, marginTop: 4 }}>{upsell.name}</div>
              <div style={{ fontSize: 12, color: T.soft, marginTop: 2 }}>
                Babygirl to go · <strong style={{ color: T.ink }}>${UPSELL_PRICE}</strong> <s>${upsell.price}</s> with your order
              </div>
            </div>
            <button
              type="button"
              onClick={() => add({ ...upsell, price: UPSELL_PRICE }, 1, { upsell: true })}
              style={{ ...S.btnFill, height: 38, padding: '0 16px', flexShrink: 0 }}
            >
              Add · ${UPSELL_PRICE}
            </button>
          </div>
        )}

        {salePromo && cart.length > 0 && (
          <SaleCallout appliedDiscount={appliedDiscount} onApply={applyDiscount} style={{ marginTop: 16, flexShrink: 0 }} />
        )}

        {showUnlock && (
          <div style={unlockBox}>
            {unlockState === 'done' ? (
              <p style={{ margin: 0, fontSize: 13, color: T.ink }}>
                You're in — <strong>{UNLOCK_CODE}</strong> {appliedDiscount ? 'is applied to your bag (15% off).' : 'gets you 15% off at checkout.'}
              </p>
            ) : (
              <form onSubmit={handleUnlock}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: T.ink }}>Unlock 15% off your order</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    aria-label="Email for 15% off"
                    autoComplete="email"
                    value={unlockEmail}
                    onChange={(e) => { setUnlockEmail(e.target.value); if (unlockState === 'error') setUnlockState('idle'); }}
                    style={discountInput}
                  />
                  <button type="submit" style={{ ...S.btnFill, flexShrink: 0, padding: '0 18px' }} disabled={unlockState === 'busy'}>{unlockState === 'busy' ? '…' : 'Reveal code'}</button>
                </div>
                {unlockState === 'error' && <p style={{ fontSize: 12, color: '#a13d2b', margin: '6px 0 0' }}>Enter a valid email address.</p>}
                <p style={{ fontSize: 10, color: T.soft, margin: '6px 0 0' }}>By signing up you agree to receive emails from Smells Iconic. Unsubscribe anytime.</p>
              </form>
            )}
          </div>
        )}

        </div>

        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 20, marginTop: 16, flexShrink: 0 }}>
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
          {shippingCost !== null && (
            <div style={summaryRow}>
              <span style={{ color: T.soft }}>Shipping</span>
              <span>{freeShipping ? 'Free' : `$${shippingCost.toFixed(2)}`}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 18px' }}>
            <span style={S.label}>Total</span>
            <span style={{ fontFamily: T.display, fontWeight: 300, fontSize: 24 }}>${orderTotal.toFixed(2)}</span>
          </div>
          <Link
            href="/checkout"
            onClick={(e) => {
              if (cart.length === 0) { e.preventDefault(); return; }
              checkoutClickedRef.current = true;
              trackCart('checkout_click');
            }}
            style={{ ...S.btnFill, width: '100%', justifyContent: 'center', opacity: cart.length === 0 ? 0.4 : 1, textAlign: 'center' }}
          >
            Secure Checkout
          </Link>
        </div>
      </aside>
      <CartExitPopup
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        cart={cart}
        applyDiscount={applyDiscount}
        discountCode={salePromo ? salePromo.code : 'ICONIC15'}
        discountLabel={salePromo ? `${salePromo.value}% off` : '15% off'}
        payments="card, Apple Pay, Google Pay, PayPal or Venmo"
      />
    </>
  );
}

const qtyBtn = {
  width: 26, height: 26, border: `1px solid ${T.line}`, background: 'transparent',
  cursor: 'pointer', fontSize: 14, lineHeight: 1, color: '#15110D',
};

const itemImg = {
  width: 56, height: 56, flexShrink: 0, overflow: 'hidden',
  background: T.paper, border: `1px solid ${T.line}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const subscribeNote = { fontSize: 11, color: T.soft, marginTop: 3, letterSpacing: '0.02em' };


const discountInput = {
  minWidth: 0,
  flex: 1, height: 44, padding: '0 14px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 13, color: T.ink, outline: 'none', boxSizing: 'border-box',
};

const summaryRow = { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' };
const upsellBox = { display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${T.line}`, padding: 12, marginTop: 16 };
const upsellImg = { width: 64, height: 64, flexShrink: 0, overflow: 'hidden', background: T.paper };
const unlockBox = { background: T.paper, border: `1px solid ${T.line}`, padding: '14px 14px 12px', marginTop: 16, flexShrink: 0 };
