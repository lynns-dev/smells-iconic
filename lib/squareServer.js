// Server-side Square Payments API client — charge (used by
// /api/square-checkout) and refund (used by /api/admin/orders/refund).
//
// Rebuilt to use Square's official Node SDK (`square` on npm) instead of a
// hand-rolled fetch() wrapper around the raw REST API. The request/response
// shapes here (SquareClient constructor, payments.create(),
// refunds.refundPayment(), field names like amountMoney/sourceId/
// idempotencyKey, and SquareError's .errors[].detail/.code shape) are
// confirmed directly against the installed SDK's own TypeScript
// definitions (node_modules/square/**/*.d.ts) and cross-checked against
// Square's official square/web-payments-quickstart example server, not
// guessed — unlike the previous version of this file. Amounts are BigInt
// cents per the SDK's Money type.
//
// Directly applying the lesson from the QuickBooks capture bug (an HTTP
// 200 response whose own status field indicated a failed payment, treated
// as success because only the HTTP status was checked): chargeCard below
// explicitly checks payment.status and throws on anything but COMPLETED,
// rather than trusting a successful SDK call alone.

import { SquareClient, SquareEnvironment } from 'square';

let client = null;

function getClient() {
  if (client) return client;
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN is not set.');
  client = new SquareClient({
    environment: process.env.SQUARE_ENVIRONMENT === 'sandbox' ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
    token,
  });
  return client;
}

// The SDK throws a SquareError (a real Error subclass with .errors, an
// array of { category, code, detail, field }) on a non-2xx response,
// rather than returning an errors array in a normal-looking result the
// way the old fetch()-based version had to parse by hand.
function errorDetail(err) {
  return err?.errors?.[0]?.detail || err?.errors?.[0]?.code || err?.message || 'Request failed';
}

function toCents(amount) {
  return BigInt(Math.round(Number(amount) * 100));
}

// token: single-use payment token from lib/squareClient.js's
// tokenizeSquareCard()/tokenizeWallet(). amount: dollars (converted to
// integer cents here, same convention as the QuickBooks/Stripe
// integrations this replaces). Resolves to the payment object
// ({ id, status, ... }) — id is used as the order's id, same convention as
// every other processor on this site.
export async function chargeCard(token, amount, { idempotencyKey, buyerEmail } = {}) {
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) throw new Error('SQUARE_LOCATION_ID is not set.');
  const square = getClient();

  let payment;
  try {
    const response = await square.payments.create({
      sourceId: token,
      idempotencyKey: idempotencyKey || `si-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      amountMoney: { amount: toCents(amount), currency: 'USD' },
      locationId,
      ...(buyerEmail ? { buyerEmailAddress: buyerEmail } : {}),
    });
    payment = response.payment;
  } catch (err) {
    console.error('Square charge failed:', JSON.stringify(err?.errors || err?.message || err));
    // Square's own classification rides along (PAYMENT_METHOD_ERROR is a
    // problem with the shopper's card; anything else is a problem on our
    // side of the charge) so the caller can tell a decline from an outage.
    const failure = new Error(errorDetail(err));
    failure.squareCategory = err?.errors?.[0]?.category || null;
    failure.squareCode = err?.errors?.[0]?.code || null;
    throw failure;
  }

  console.log('Square charge:', { id: payment?.id, status: payment?.status });

  if (!payment || payment.status !== 'COMPLETED') {
    throw new Error(`Payment ${(payment?.status || 'failed').toLowerCase()}`);
  }
  return payment;
}

// paymentId: the id returned by chargeCard() (stored as the order's id).
export async function refundCharge(paymentId, amount, { idempotencyKey } = {}) {
  const square = getClient();

  let refund;
  try {
    const response = await square.refunds.refundPayment({
      idempotencyKey: idempotencyKey || `si-refund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      paymentId,
      amountMoney: { amount: toCents(amount), currency: 'USD' },
    });
    refund = response.refund;
  } catch (err) {
    console.error('Square refund failed:', JSON.stringify(err?.errors || err?.message || err));
    throw new Error(errorDetail(err));
  }

  console.log('Square refund:', { id: refund?.id, status: refund?.status });
  return refund;
}
