import { quoteShopPayCart } from './shopPayQuote';
export async function validateCheckout(body = {}) {
  const quote = await quoteShopPayCart(body.items || body.cart, body.discountCode, body.freeShipping === true);
  const protection = Number(body.shippingProtection || 0);
  if (![0, 2.79].includes(protection)) throw new Error('Invalid shipping protection.');
  const expected = Math.round((quote.total + protection) * 100);
  if (!Number.isFinite(Number(body.amount)) || Math.round(Number(body.amount) * 100) !== expected) {
    throw new Error('Your order total changed. Refresh checkout and reapply your discount before paying.');
  }
  return { ...quote, total: expected / 100 };
}
