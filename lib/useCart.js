import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { fbTrack, generateEventId } from './fbPixel';
import { getSessionId, getVisitorId } from './session';
import { getIdentity } from './identity';
import { getProductById, UPSELL_ID, UPSELL_PRICE } from './products';
import { trackCart } from './cartTracking';

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
const STORAGE_KEY = 'si-cart';
const DISCOUNT_STORAGE_KEY = 'si-discount';

export function CartProvider({ children }) {
  // Stored lines; `cart` below is the priced view everything else reads.
  const [lines, setCart] = useState([]);
  const cart = React.useMemo(() => priceCart(lines), [lines]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Applied discount code lives here (not in the cart drawer or checkout
  // page individually) so applying it in one place carries through to the
  // other — previously the cart drawer's "Apply" button had no handler at
  // all and the checkout page tracked its own separate, disconnected copy.
  const [appliedDiscount, setAppliedDiscount] = useState(null);

  useEffect(() => {
    try {
      // ?restore=id:qty,id:qty — the abandoned-checkout email's link
      // (lib/abandonedCheckout.js). Rebuilds that bag from the catalog so the
      // link works in any browser, then drops the parameter from the URL.
      const params = new URLSearchParams(window.location.search);
      const restore = params.get('restore');
      if (restore) {
        const restored = restore.split(',').map((part) => {
          const [id, qty] = part.split(':');
          const product = getProductById(id);
          const quantity = Math.min(Math.max(parseInt(qty, 10) || 1, 1), 20);
          return product ? { ...product, quantity } : null;
        }).filter(Boolean);
        if (restored.length) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        params.delete('restore');
        const query = params.toString();
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      }
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // Refresh saved items from the current catalog (name, size, images,
      // price), so a bag saved before a product or price change shows — and
      // charges — today's details.
      if (saved) {
        setCart(JSON.parse(saved).map((item) => {
          const current = getProductById(item.id);
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
      if (appliedDiscount) window.localStorage.setItem(DISCOUNT_STORAGE_KEY, JSON.stringify(appliedDiscount));
      else window.localStorage.removeItem(DISCOUNT_STORAGE_KEY);
    } catch (e) {
      // ignore storage write failures (e.g. private browsing quota)
    }
  }, [appliedDiscount, hydrated]);

  // { upsell: true } marks a line added from an upsell button (priceCart).
  const add = useCallback((product, quantity = 1, { upsell = false } = {}) => {
    setCart((prev) => {
      const found = prev.find((i) => i.id === product.id);
      if (found) return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + quantity, ...(upsell ? { upsell: true } : {}) } : i));
      return [...prev, { ...product, quantity, ...(upsell ? { upsell: true } : {}) }];
    });
    setOpen(true);

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
  const codeDiscountAmount = !appliedDiscount
    ? 0
    : appliedDiscount.type === 'percent'
    ? Math.round(total * (appliedDiscount.value / 100) * 100) / 100
    : Math.min(appliedDiscount.value, total);
  const discountedTotal = Math.max(total - codeDiscountAmount, 0);

  const value = {
    cart, open, setOpen, add, remove, setQty, clear, count, total, hydrated,
    appliedDiscount, applyDiscount, clearDiscount, codeDiscountAmount, discountedTotal,
  };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
