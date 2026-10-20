// The "or pay another way" methods offered at checkout, processed through
// Stripe under the hood — customers only ever see the method's own brand
// name (Klarna, Affirm), never the word "Stripe". Shared between
// the checkout UI (radio group) and the API routes (which Stripe payment
// method type to charge), so the two can't drift out of sync.
//
// Both are redirect-based BNPL/wallet methods with a dedicated
// `stripe.confirm<Method>Payment()` client call — deliberately not offering
// bank transfers here, since ACH requires a slower micro-deposit/Financial
// Connections flow that doesn't fit a single "place order" button.
export const ALT_PAYMENT_METHODS = [
  { id: 'klarna', stripeType: 'klarna', label: 'Klarna', confirmMethod: 'confirmKlarnaPayment' },
  { id: 'affirm', stripeType: 'affirm', label: 'Affirm', confirmMethod: 'confirmAffirmPayment' },
];

export const getAltPaymentMethod = (id) => ALT_PAYMENT_METHODS.find((m) => m.id === id);
