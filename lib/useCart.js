import { RETURN_PRODUCT, withBringBackAvailability } from './bringBackAvailability';
import { OFFER_TEST, OFFER_END, offerActive, offerSavings, offerLabel } from './productOffer';
import { setPaymentOffer } from './paymentFetch';
import { setPaymentDiscount } from './paymentFetch';
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { fbTrack, generateEventId } from './fbPixel';
import { getSessionId, getVisitorId } from './session';
import { getIdentity } from './identity';
import { getProductById, HIDDEN_PRODUCTS, UPSELL_ID, UPSELL_PRICE, BABYGIRL_PERFUME_ID, BABYGIRL_PERFUME_TEST_PRICE, BABYGIRL_PRICE_TEST } from './products';
import { trackCart } from './cartTracking';
import { reportCartActivity } from './emailPlatform';

import { getVariant, exposeExperiment } from './experiments';

function withPerfumePrice(product, variant) {
  return product?.id === BABYGIRL_PERFUME_ID && variant === 'price_59'
    ? { ...product, price: BABYGIRL_PERFUME_TEST_PRICE }
    : product;
}

const CartContext = createContext(null);

// The upsell price (lib/products.js UPSELL_PRICE): the solid perfume, added
// from an upsell button (line.upsell), costs UPSELL_PRICE while anything
// else is in the cart, and its own price otherwise. Worked out from the
// stored lines on every render, so removing the other items puts it straight
// back to full price. originalPrice makes the cart and checkout show the
// saving as a discount line, the same way the set does.
export function priceCart(lines) {
  const hasOther = lines.some((i) => i.id !== UPSELL_ID);
  return lines.map((i) => {
    if (i.id !== UPSELL_ID) return i;
    const full = getProductById(UPSELL_ID)?.price ?? i.price;
    const { originalPrice, ...rest } = i;
    return i.upsell && hasOther ? { ...rest, price: UPSELL_PRICE, originalPrice: full } : { ...rest, price: full };
  });
}
const HIDDEN_PRODUCT_IDS = new Set(HIDDEN_PRODUCTS.map(({ id }) => id));
const STORAGE_KEY = 'si-cart';
const DISCOUNT_STORAGE_KEY = 'si-discount';

export function CartProvider({ children }) {
  // Stored lines; `cart` below is the priced view everything else reads.
  const [returnCount, setReturnCount] = useState(0);
  const [perfumeVariant, setPerfumeVariant] = useState(null);
  const resolveProduct = useCallback(product => withPerfumePrice(withBringBackAvailability(product, returnCount), perfumeVariant), [returnCount, perfumeVariant]);
  const [lines, setCart] = useState([]);
  const cart = React.useMemo(() => priceCart(lines), [lines]);
  const [offer, setOffer] = useState(null);
  const [offerNow, setOfferNow] = useState(Date.now());
  setPaymentOffer(offer?.token);
  const startProductOffer = useCallback(async () => {
    if (!offerActive()) return;
    try {
      const r = await fetch('/api/product-offer', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:getVisitorId()})});
      const data=await r.json();
      if (!r.ok || !data.token) return;
      setOffer(data);
      try { localStorage.setItem('si-product-offer',JSON.stringify(data)); } catch {}
    } catch {}
  }, []);
  useEffect(()=>{
    try {const saved=JSON.parse(localStorage.getItem('si-product-offer')); if(saved?.token && offerActive()) setOffer(saved);} catch {}
    if(!offerActive() || !OFFER_END) return;
    const timer=setTimeout(()=>{setOffer(null);setOfferNow(Date.now());try{localStorage.removeItem('si-product-offer');}catch{}},Math.max(0,OFFER_END-Date.now()));
    return ()=>clearTimeout(timer);
  },[]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Applied discount code lives here (not in the cart drawer or checkout
  // page individually) so applying it in one place carries through to the
  // other — previously the cart drawer's "Apply" button had no handler at
  // all and the checkout page tracked its own separate, disconnected copy.
  const [couponDiscount, setAppliedDiscount] = useState(null);
  setPaymentDiscount(couponDiscount);

  useEffect(() => {
    let cancelled = false;
    const acceptCount = count => { if (!cancelled && Number.isFinite(count)) setReturnCount(current => Math.max(current, count)); };
    const onVote = event => { if (event.detail?.id === RETURN_PRODUCT) acceptCount(event.detail.count); };
    window.addEventListener('si-bringback', onVote);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const availability = fetch(`/api/bring-back?productId=${RETURN_PRODUCT}`, {signal:controller.signal,cache:'no-store'})
      .then(r=>r.ok?r.json():null).then(data=>{const count=Number(data?.count)||0;acceptCount(count);return count;}).catch(()=>0).finally(()=>clearTimeout(timeout));
    async function hydrate() {
    // Only carts containing the returning scent wait for its availability.
    let count = 0;
    try {
      if ((window.localStorage.getItem(STORAGE_KEY) || '').includes(RETURN_PRODUCT) || window.location.search.includes(RETURN_PRODUCT)) count = await availability;
    } catch {}
    if (cancelled) return;
    const variant = getVariant(BABYGIRL_PRICE_TEST);
    setPerfumeVariant(variant);
    const lookup = id => withPerfumePrice(withBringBackAvailability(getProductById(id), count), variant);
    try {
      // ?restore=id:qty,id:qty — the abandoned-checkout email's link
      // (lib/abandonedCheckout.js). Rebuilds that bag from the catalog so the
      // link works in any browser, then drops the parameter from the URL.
      const params = new URLSearchParams(window.location.search);
      const restore = params.get('restore');
      if (restore) {
        const restored = restore.split(',').map((part) => {
          const [id, qty] = part.split(':');
          const product = lookup(id);
          const quantity = Math.min(Math.max(parseInt(qty, 10) || 1, 1), 20);
          return product && !product.archived ? { ...product, quantity } : null;
        }).filter(Boolean);
        if (restored.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        params.delete('restore');
        const query = params.toString();
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      }
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // Refresh saved items from the current catalog (name, size, images,
      // price), so a bag saved before a product or price change shows — and
      // charges — today's details. Archived products drop out of the bag.
      if (saved) {
        setCart(JSON.parse(saved).filter((item) => !HIDDEN_PRODUCT_IDS.has(item.id) && !lookup(item.id)?.archived).map((item) => {
          const current = lookup(item.id);
          if (!current) return item;
          const { originalPrice, ...rest } = item;
          return {
            ...rest,
            name: current.name, size: current.size, images: current.images, price: current.price,
            ...(current.originalPrice ? { originalPrice: current.originalPrice } : {}),
          };
        }));
      }
      const savedDiscount = window.localStorage.getItem(DISCOUNT_STORAGE_KEY);
      if (savedDiscount) setAppliedDiscount(JSON.parse(savedDiscount));
    } catch (e) {
      // ignore malformed/inaccessible storage
    }
    setHydrated(true);
    }
    hydrate();
    return () => {cancelled=true;controller.abort();clearTimeout(timeout);window.removeEventListener('si-bringback',onVote);};
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch (e) {
      // ignore storage write failures (e.g. private browsing quota)
    }
  }, [lines, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (couponDiscount) window.localStorage.setItem(DISCOUNT_STORAGE_KEY, JSON.stringify(couponDiscount));
      else window.localStorage.removeItem(DISCOUNT_STORAGE_KEY);
    } catch (e) {
      // ignore storage write failures (e.g. private browsing quota)
    }
  }, [couponDiscount, hydrated]);

  // Tells the email system what's in the cart when this device knows who
  // the shopper is (lib/identity.js), so the add_to_cart automation can
  // follow up if they never check out. Debounced, only on real changes —
  // not the cart being restored from localStorage on page load.
  const reportedCartRef = React.useRef(null);
  useEffect(() => {
    if (!hydrated) return undefined;
    const paid = cart.filter((i) => Number(i.price) > 0);
    const signature = JSON.stringify(paid.map((i) => [i.id, i.quantity]));
    if (reportedCartRef.current === null) {
      reportedCartRef.current = signature;
      return undefined;
    }
    if (signature === reportedCartRef.current) return undefined;
    const timer = setTimeout(() => {
      reportedCartRef.current = signature;
      const { email } = getIdentity();
      if (email) reportCartActivity({ email, items: paid });
    }, 1500);
    return () => clearTimeout(timer);
  }, [cart, hydrated]);

  // { upsell: true } marks a line added from an upsell button (priceCart).
  const add = useCallback((product, quantity = 1, { upsell = false } = {}) => {
    setCart((prev) => {
      const found = prev.find((i) => i.id === product.id);
      if (found) return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + quantity, ...(upsell ? { upsell: true } : {}) } : i));
      return [...prev, { ...product, quantity, ...(upsell ? { upsell: true } : {}) }];
    });
    setOpen(true);

    if (product.id === BABYGIRL_PERFUME_ID) exposeExperiment(BABYGIRL_PRICE_TEST);
    trackCart('added', { name: product.name });
    const eventId = generateEventId();
    fbTrack('AddToCart', {
      content_ids: [product.id],
      content_name: product.name,
      content_type: 'product',
      value: product.price * quantity,
      currency: 'USD',
    }, eventId);
    fetch('/api/track/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'addtocart',
        productName: product.name,
        eventId,
        contentId: product.id,
        value: product.price * quantity,
        url: window.location.href,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
        ...getIdentity(),
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const remove = useCallback((id) => setCart((prev) => prev.filter((i) => i.id !== id)), []);

  const setQty = useCallback((id, quantity) => {
    setCart((prev) =>
      quantity <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, quantity } : i))
    );
  }, []);

  // A cleared cart (post-purchase) shouldn't leave a stale applied code
  // sitting around for the next shopping session.
  const clear = useCallback(() => {
    setCart([]);
    setAppliedDiscount(null);
  }, []);

  const applyDiscount = useCallback(async (code) => {
    const trimmed = (code || '').trim();
    if (!trimmed) return { valid: false };
    try {
      const res = await fetch('/api/validate-discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      setAppliedDiscount(data.valid ? { code: data.code, type: data.type, value: data.value } : null);
      return data;
    } catch {
      setAppliedDiscount(null);
      return { valid: false, error: true };
    }
  }, []);

  const clearDiscount = useCallback(() => setAppliedDiscount(null), []);

  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const couponDiscountAmount = !couponDiscount
    ? 0
    : couponDiscount.type === 'percent'
    ? Math.round(total * (couponDiscount.value / 100) * 100) / 100
    : Math.min(couponDiscount.value, total);
  const offerDiscountAmount = offerSavings(cart, offer?.variant, Math.max(offerNow, Date.now()));
  const offerWins = offerDiscountAmount > couponDiscountAmount;
  const codeDiscountAmount = Math.max(couponDiscountAmount, offerDiscountAmount);
  const appliedDiscount = offerWins ? {code:offerLabel(offer.variant),type:'fixed',value:offerDiscountAmount} : couponDiscount;
  const discountedTotal = Math.max(total - codeDiscountAmount, 0);

  const value = {
    cart, open, setOpen, add, remove, setQty, clear, count, total, hydrated, resolveProduct, perfumeVariant,
    appliedDiscount, applyDiscount, clearDiscount, codeDiscountAmount, discountedTotal, offer, startProductOffer, offerDiscountAmount, checkoutDiscountCode: couponDiscount?.code || '',
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
