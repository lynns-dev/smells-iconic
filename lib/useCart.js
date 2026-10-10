import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { fbTrack, generateEventId } from './fbPixel';
import { getSessionId } from './session';
import { getIdentity } from './identity';

const CartContext = createContext(null);
const STORAGE_KEY = 'si-cart';
const DISCOUNT_STORAGE_KEY = 'si-discount';

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Applied discount code lives here (not in the cart drawer or checkout
  // page individually) so applying it in one place carries through to the
  // other — previously the cart drawer's "Apply" button had no handler at
  // all and the checkout page tracked its own separate, disconnected copy.
  const [appliedDiscount, setAppliedDiscount] = useState(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setCart(JSON.parse(saved));
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      // ignore storage write failures (e.g. private browsing quota)
    }
  }, [cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (appliedDiscount) window.localStorage.setItem(DISCOUNT_STORAGE_KEY, JSON.stringify(appliedDiscount));
      else window.localStorage.removeItem(DISCOUNT_STORAGE_KEY);
    } catch (e) {
      // ignore storage write failures (e.g. private browsing quota)
    }
  }, [appliedDiscount, hydrated]);

  const add = useCallback((product, quantity = 1) => {
    setCart((prev) => {
      const found = prev.find((i) => i.id === product.id);
      if (found) return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i));
      return [...prev, { ...product, quantity }];
    });
    setOpen(true);

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
