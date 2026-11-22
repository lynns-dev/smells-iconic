import { shippingFor } from './shipping';
let selectedCode = '';
let selectedOfferToken = '';
export function setPaymentOffer(token) { selectedOfferToken = token || ''; }
export function setPaymentDiscount(discount) { selectedCode = discount?.code || ''; }
export function paymentFetch(url, options) {
  const body = JSON.parse(options.body);
  const items = body.items || body.cart || [];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return fetch(url, { ...options, body: JSON.stringify({ ...body,
    offerToken: selectedOfferToken,
    discountCode: selectedOfferToken ? selectedCode : (body.discountCode ?? selectedCode),
    freeShipping: shippingFor(subtotal) === 0,
  }) });
}
