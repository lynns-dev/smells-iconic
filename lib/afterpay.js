// Afterpay (pay in 4, API v2) — an alternative to the card form on
// /checkout and /offer3, alongside Amazon Pay. Server side only.
//
// Flow (standard redirect checkout):
//   1. Button click -> POST /api/afterpay/checkout stores the order as a
//      pending record (KV, keyed by a random ref), creates an Afterpay
//      checkout and returns its redirectCheckoutUrl; the browser goes there.
//   2. Afterpay sends the shopper back to
//      /afterpay/return?ref=…&orderToken=…&status=SUCCESS (or CANCELLED).
//   3. /api/afterpay/complete captures the payment and runs the same
//      fulfillOrder() pipeline as every other processor.
//
// Cash App Pay runs through the same Afterpay account and API: the
// checkout is created with isCashAppPay, Afterpay's own afterpay.js draws
// the Cash App Pay button for that checkout's token
// (components/CashAppPayButton.jsx), and the approved payment is captured
// exactly like an Afterpay one. On a phone the shopper comes back through
// /afterpay/return?cashapppay=1 instead.
//
// Hidden entirely unless AFTERPAY_MERCHANT_ID and AFTERPAY_SECRET_KEY are
// set. AFTERPAY_ENV=sandbox points at Afterpay's sandbox; anything else is
// live. The secret key only ever lives in Vercel — never commit it.

import crypto from 'crypto';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const PENDING_TTL_SECONDS = 24 * 60 * 60;
const LIMITS_TTL_MS = 60 * 60 * 1000;

export function afterpayConfig() {
  const merchantId = String(process.env.AFTERPAY_MERCHANT_ID || '').trim();
  const secretKey = String(process.env.AFTERPAY_SECRET_KEY || '').trim();
  const sandbox = String(process.env.AFTERPAY_ENV || '').trim().toLowerCase() === 'sandbox';
  return {
    enabled: Boolean(merchantId && secretKey),
    merchantId,
    secretKey,
    sandbox,
    // AFTERPAY_API_BASE only for pointing tests at a stand-in server.
    apiBase: process.env.AFTERPAY_API_BASE || (sandbox ? 'https://global-api-sandbox.afterpay.com' : 'https://global-api.afterpay.com'),
  };
}

async function afterpayFetch(path, { method = 'GET', body, storeUrl } = {}) {
  const { merchantId, secretKey, apiBase } = afterpayConfig();
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${merchantId}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Afterpay requires this exact shape on every request.
      'User-Agent': `StoreCheckout/1.0.0 (Next.js/14; Merchant/${merchantId}) ${storeUrl || process.env.NEXT_PUBLIC_BASE_URL || ''}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function money(amount) {
  return { amount: Number(amount).toFixed(2), currency: 'USD' };
}

async function kv(path, body) {
  if (!KV_URL || !KV_TOKEN) throw new Error('KV_REST_API_URL / KV_REST_API_TOKEN are not set.');
  const res = await fetch(`${KV_URL}/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return res.json();
}

export async function savePending(ref, record) {
  await kv(`set/afterpay:pending:${ref}?EX=${PENDING_TTL_SECONDS}`, record);
}

export async function loadPending(ref) {
  if (!/^[a-f0-9-]{36}$/.test(String(ref || ''))) return null;
  const data = await kv(`get/afterpay:pending:${ref}`);
  return data.result ? JSON.parse(data.result) : null;
}

export function newRef() {
  return crypto.randomUUID();
}

// The order-total range Afterpay will finance for this merchant
// (GET /v2/configuration), cached for an hour per server instance. The
// button only shows for totals inside it.
let limitsCache = null;
export async function getOrderLimits() {
  if (limitsCache && Date.now() - limitsCache.at < LIMITS_TTL_MS) return limitsCache.value;
  const { ok, data } = await afterpayFetch('/v2/configuration');
  if (!ok) throw new Error(data?.message || 'Could not read Afterpay configuration.');
  // Returned either as one object or as a list of payment types.
  const entry = Array.isArray(data) ? (data.find((c) => c.type === 'PAY_BY_INSTALLMENT') || data[0]) : data;
  const value = {
    min: Number(entry?.minimumAmount?.amount || 0),
    max: Number(entry?.maximumAmount?.amount || 0),
  };
  limitsCache = { at: Date.now(), value };
  return value;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { givenNames: '', surname: '' };
  if (parts.length === 1) return { givenNames: parts[0], surname: parts[0] };
  return { givenNames: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] };
}

function address(shipping) {
  if (!shipping) return undefined;
  const name = shipping.name || `${shipping.firstName || ''} ${shipping.lastName || ''}`.trim();
  return {
    name,
    line1: shipping.address || '',
    line2: shipping.apt || '',
    area1: shipping.city || '',
    region: shipping.state || '',
    postcode: shipping.zip || '',
    countryCode: 'US',
    phoneNumber: shipping.phone || '',
  };
}

// Creates the Afterpay checkout. Resolves to { token, redirectCheckoutUrl };
// throws with Afterpay's own message on failure.
export async function createCheckout({ ref, pending, baseUrl, cashAppPay = false }) {
  const ship = address(pending.shipping);
  const { givenNames, surname } = splitName(ship?.name);
  const { ok, data } = await afterpayFetch('/v2/checkouts', {
    method: 'POST',
    storeUrl: baseUrl,
    body: {
      amount: money(pending.amount),
      consumer: { email: pending.email, givenNames, surname, phoneNumber: ship?.phoneNumber || '' },
      billing: ship,
      shipping: ship,
      merchant: {
        redirectConfirmUrl: `${baseUrl}/afterpay/return?ref=${ref}${cashAppPay ? '&cashapppay=1' : ''}`,
        redirectCancelUrl: `${baseUrl}/afterpay/return?ref=${ref}`,
      },
      ...(cashAppPay ? { isCashAppPay: true } : {}),
      merchantReference: ref,
      items: (pending.items || []).map((i) => ({
        name: String(i.name || i.id || 'Item').slice(0, 255),
        sku: String(i.id || '').slice(0, 128),
        quantity: Number(i.quantity) || 1,
        price: money(i.price || 0),
      })),
    },
  });
  if (!ok || !data.token) throw new Error(data?.message || 'Afterpay could not start this checkout.');
  return { token: data.token, redirectCheckoutUrl: data.redirectCheckoutUrl };
}

// Captures the full payment. Resolves to Afterpay's payment object
// (status APPROVED); throws with a shopper-readable reason otherwise.
// requestId makes a retry of the same capture safe.
export async function capturePayment(token, ref) {
  const { ok, status, data } = await afterpayFetch('/v2/payments/capture', {
    method: 'POST',
    body: { token, merchantReference: ref, requestId: `capture-${ref}` },
  });
  if (ok && data.status === 'APPROVED') return data;
  if (status === 402 || data.status === 'DECLINED') {
    throw Object.assign(new Error('Afterpay declined this payment. Please try another payment method.'), { declined: true });
  }
  throw new Error(data?.message || 'Afterpay could not complete this payment.');
}

// Full refund of an Afterpay order, for admin's Refund button
// (pages/api/admin/orders/refund.js). The order id is Afterpay's order id.
export async function refundPayment(orderId, amount) {
  const { ok, data } = await afterpayFetch(`/v2/payments/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
    body: { requestId: `refund-${orderId}`, amount: money(amount) },
  });
  if (!ok) throw new Error(data?.message || 'Afterpay refund failed.');
  return data;
}
