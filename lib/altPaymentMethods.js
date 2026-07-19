// The "or pay another way" methods offered at checkout, processed through
// Stripe under the hood — customers only ever see the method's own brand
// name (Cash App Pay, Klarna, ...), never the word "Stripe". Shared between
// the checkout UI (radio group) and the API routes (which Stripe payment
// method type to charge), so the two can't drift out of sync.
//
// All four are redirect-based BNPL/wallet methods with a dedicated
// `stripe.confirm<Method>Payment()` client call — deliberately not offering
// bank transfers here, since ACH requires a slower micro-deposit/Financial
// Connections flow that doesn't fit a single "place order" button.
export const ALT_PAYMENT_METHODS = [
  { id: 'cashapp', stripeType: 'cashapp', label: 'Cash App Pay', confirmMethod: 'confirmCashappPayment' },
  { id: 'klarna', stripeType: 'klarna', label: 'Klarna', confirmMethod: 'confirmKlarnaPayment' },
  { id: 'afterpay_clearpay', stripeType: 'afterpay_clearpay', label: 'Afterpay', confirmMethod: 'confirmAfterpayClearpayPayment' },
  { id: 'affirm', stripeType: 'affirm', label: 'Affirm', confirmMethod: 'confirmAffirmPayment' },
];

export const getAltPaymentMethod = (id) => ALT_PAYMENT_METHODS.find((m) => m.id === id);
