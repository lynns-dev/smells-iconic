import { verifyOffer } from './productOfferServer';
import { offerSavings, offerLabel, offerEconomics } from './productOffer';
import { getBringBackCount } from './bringBackStore';
import { RETURN_PRODUCT, withBringBackAvailability } from './bringBackAvailability';
import { getProductById, UPSELL_ID, UPSELL_PRICE, BABYGIRL_PERFUME_ID, BABYGIRL_PERFUME_TEST_PRICE } from './products';
import { shippingFor } from './shipping';
import { getDiscounts } from './discountsStore';
import { findPromo } from './promos';

export const STORE_KEY = 'smells-iconic';
const cents = n => Math.round(Number(n) * 100);

export async function quoteShopPayCart(cart, code, offerToken) {
  if (!Array.isArray(cart) || !cart.length || cart.length > 30) throw new Error('Your cart is empty or too large.');
  const returnCount = cart.some(line => line?.id === RETURN_PRODUCT) ? await getBringBackCount(RETURN_PRODUCT) : 0;
  const seen = new Set();
  const items = cart.map(line => {
    const product = withBringBackAvailability(getProductById(line.id), returnCount);
    if (!product || product.archived || seen.has(line.id)) throw new Error('An item is no longer available. Refresh your cart.');
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw new Error('Invalid item quantity.');
    seen.add(line.id);
    const upsell = product.id === UPSELL_ID && line.upsell === true && cart.some(i => i.id !== UPSELL_ID);
    let price = upsell ? UPSELL_PRICE : product.price;
    if (product.id === BABYGIRL_PERFUME_ID && line.price === BABYGIRL_PERFUME_TEST_PRICE) price = BABYGIRL_PERFUME_TEST_PRICE;
    return { id: product.id, name: product.name, price, quantity: line.quantity };
  });
  const subtotalCents = items.reduce((n, i) => n + cents(i.price) * i.quantity, 0);
  let match = null;
  if (code != null && typeof code !== 'string') throw new Error('Use one discount code per order.');
  const cleanCode = (code || '').trim().toUpperCase();
  if (cleanCode) {
    match = findPromo(cleanCode) || (await getDiscounts()).find(d => d.code.toUpperCase() === cleanCode);
    if (!match) throw new Error('That discount code is no longer valid.');
  }
  const assignment = verifyOffer(offerToken);
  const offerCents = Math.round(offerSavings(items, assignment?.variant) * 100);
  const paidCents = subtotalCents - offerCents;
  const couponCents = match ? Math.min(paidCents, Math.max(0, match.type === 'percent'
    ? Math.round(paidCents * Number(match.value) / 100) : cents(match.value))) : 0;
  const discountCents = offerCents + couponCents;
  const offerApplied = offerCents > 0;
  const shippingCents = cents(shippingFor(subtotalCents / 100));
  const total = (subtotalCents - discountCents + shippingCents) / 100;
  if (!Number.isFinite(total) || total <= 0) throw new Error('Shop Pay requires a positive order total.');
  return { items, subtotal: subtotalCents / 100, discount: discountCents / 100, discountCode: offerApplied ? [match?.code,offerLabel(assignment.variant)].filter(Boolean).join(' + ') : match?.code || '', ...(assignment ? {offerVariant: assignment.variant, offerExperiment: {...assignment, ...offerEconomics(items,total)}} : {}), shipping: shippingCents / 100, total };
}
