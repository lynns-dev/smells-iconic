// Browser helpers shared by the Afterpay and Cash App Pay buttons and the
// return page (server side and flow: lib/afterpay.js).

let configPromise = null;
export function loadAfterpayConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/afterpay/config')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .catch(() => ({ enabled: false }));
  }
  return configPromise;
}

// Afterpay's own afterpay.js — it draws the Cash App Pay button.
let scriptPromise = null;
export function loadAfterpayScript(src) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.AfterPay) return Promise.resolve(window.AfterPay);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => (window.AfterPay ? resolve(window.AfterPay) : reject(new Error('Afterpay failed to load')));
      s.onerror = () => { scriptPromise = null; reject(new Error('Afterpay failed to load')); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// Captures an approved Afterpay / Cash App Pay checkout and hands off to
// /success the same way the card checkout does — including the browser
// Pixel Purchase, which shares its event id with the server-side one.
export async function finishAfterpayOrder({ ref, orderToken, purchaseKey, router, clearCart, clearProgress }) {
  const res = await fetch('/api/afterpay/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, orderToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Payment failed');
  sessionStorage.setItem(purchaseKey, JSON.stringify({
    eventId: data.eventId,
    orderId: data.orderId,
    amount: data.amount,
    contentIds: (data.items || []).map((i) => i.id),
    contents: (data.items || []).map((i) => ({ id: i.id, quantity: i.quantity, item_price: i.price })),
  }));
  clearProgress?.();
  await router.replace('/success');
  clearCart();
}
