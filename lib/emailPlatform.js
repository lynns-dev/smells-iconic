// Browser-side hook from the storefront into this store's email system
// (lib/email/). Kept free of server-only imports since the cart bundles it.

// Cart contents for a shopper whose email this device already knows
// (lib/identity.js), for the add_to_cart automation. Fire-and-forget.
export function reportCartActivity({ email, items }) {
  if (typeof window === 'undefined' || !email) return;
  fetch('/api/email/cart-activity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      items: (items || []).map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
    }),
    keepalive: true,
  }).catch(() => {});
}
