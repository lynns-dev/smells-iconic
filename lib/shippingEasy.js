// ShippingEasy: every paid order is sent over as an "awaiting shipment"
// order on this store's API store, and when a label is printed there,
// ShippingEasy calls back (pages/api/shippingeasy/callback.js) with the
// tracking number, which marks the order shipped and emails the customer
// (lib/orderShipping.js).
//
// Env (Vercel):
//   SHIPPINGEASY_API_KEY / SHIPPINGEASY_API_SECRET — Settings → API Credentials
//   SHIPPINGEASY_STORE_API_KEY — the API store's own key (Settings → Stores)
//
// Requests are signed the way ShippingEasy's official clients sign them
// (github.com/ShippingEasy/shipping_easy-ruby, lib/shipping_easy/signature.rb):
// HMAC-SHA256 hex, keyed with the API secret, over
//   METHOD & path & sorted, form-encoded query params & JSON body
// with api_key, api_timestamp and api_signature sent as query params.
// Callbacks are signed the same way, so the same function verifies them.

import crypto from 'crypto';

const BASE_URL = 'https://api.shippingeasy.com';
// ShippingEasy's own client rejects signed requests older than an hour.
const MAX_CALLBACK_AGE_S = 60 * 60;
export const MAX_ATTEMPTS = 6;

// Values pasted into Vercel sometimes carry stray quotes or spaces.
function envValue(name) {
  return String(process.env[name] || '').trim().replace(/^["']|["']$/g, '');
}

export function shippingEasyConfig() {
  const apiKey = envValue('SHIPPINGEASY_API_KEY');
  const apiSecret = envValue('SHIPPINGEASY_API_SECRET');
  const storeApiKey = envValue('SHIPPINGEASY_STORE_API_KEY');
  return { apiKey, apiSecret, storeApiKey, configured: Boolean(apiKey && apiSecret && storeApiKey) };
}

// Rack::Utils.build_query — form encoding, so a space is "+".
function formEncode(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, '+');
}

export function signature(secret, method, path, params, body) {
  const query = Object.keys(params)
    .filter((k) => k !== 'api_signature')
    .sort()
    .map((k) => `${formEncode(k)}=${formEncode(params[k])}`)
    .join('&');
  const parts = [method.toUpperCase(), path, query];
  if (body) parts.push(body);
  return crypto.createHmac('sha256', secret).update(parts.join('&')).digest('hex');
}

async function signedRequest(method, path, payload) {
  const { apiKey, apiSecret } = shippingEasyConfig();
  const body = payload ? JSON.stringify(payload) : '';
  const params = { api_key: apiKey, api_timestamp: Math.floor(Date.now() / 1000) };
  params.api_signature = signature(apiSecret, method, path, params, body);
  const query = Object.entries(params).map(([k, v]) => `${formEncode(k)}=${formEncode(v)}`).join('&');
  const res = await fetch(`${BASE_URL}${path}?${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body ? { body } : {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, text };
}

function errorMessage(result) {
  const errors = result.data?.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors.map((e) => (typeof e === 'string' ? e : e.message || JSON.stringify(e))).join('; ');
  }
  if (errors && typeof errors === 'object') return JSON.stringify(errors);
  return result.data?.message || result.data?.error || `ShippingEasy returned ${result.status}${result.text ? `: ${result.text.slice(0, 200)}` : ''}`;
}

function money(n) {
  return (Number(n) || 0).toFixed(2);
}

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// Checkout only ships to the US, and the address form has no country field.
export function buildOrderPayload(order) {
  const ship = order.shipping || {};
  const { first, last } = splitName(ship.name);
  const items = order.items || [];
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
  const address = {
    first_name: first,
    last_name: last,
    address: ship.address || '',
    address2: ship.apt || '',
    city: ship.city || '',
    state: ship.state || '',
    postal_code: ship.zip || '',
    country: 'US',
  };
  return {
    order: {
      external_order_identifier: String(order.id),
      ordered_at: order.createdAt,
      order_status: 'awaiting_shipment',
      subtotal_including_tax: money(subtotal),
      subtotal_excluding_tax: money(subtotal),
      total_including_tax: money(order.amount),
      total_excluding_tax: money(order.amount),
      total_tax: '0.00',
      billing_first_name: address.first_name,
      billing_last_name: address.last_name,
      billing_address: address.address,
      billing_address2: address.address2,
      billing_city: address.city,
      billing_state: address.state,
      billing_postal_code: address.postal_code,
      billing_country: address.country,
      billing_phone_number: ship.phone || '',
      billing_email: order.email || '',
      recipients: [{
        ...address,
        email: order.email || '',
        phone_number: ship.phone || '',
        residential: 'true',
        shipping_method: order.shippingProtection > 0 ? 'Standard (shipping protection)' : 'Standard',
        items_total: String(items.reduce((n, i) => n + (Number(i.quantity) || 1), 0)),
        line_items: items.map((i) => ({
          item_name: i.name || i.id || 'Item',
          sku: String(i.id || ''),
          unit_price: money(i.price),
          total_excluding_tax: money((Number(i.price) || 0) * (Number(i.quantity) || 1)),
          quantity: String(Number(i.quantity) || 1),
        })),
      }],
    },
  };
}

// Sends one order and returns its updated order.shippingEasy record. Never
// throws — the outcome (sent or the error) is saved on the order for admin.
// ShippingEasy refuses a second order with the same external id, so a
// "taken / already exists" answer means it's already there: counted as sent.
export async function sendOrderToShippingEasy(order, previous = order.shippingEasy || {}) {
  const attempt = { attempts: (previous.attempts || 0) + 1, lastAttemptAt: new Date().toISOString() };
  const config = shippingEasyConfig();
  if (!config.configured) {
    return { ...previous, ...attempt, sent: false, lastError: 'ShippingEasy is not set up — add SHIPPINGEASY_API_KEY, SHIPPINGEASY_API_SECRET and SHIPPINGEASY_STORE_API_KEY in Vercel.' };
  }
  if (!order.shipping?.address) {
    return { ...previous, ...attempt, sent: false, lastError: 'This order has no shipping address.' };
  }
  try {
    const result = await signedRequest('POST', `/api/stores/${encodeURIComponent(config.storeApiKey)}/orders`, buildOrderPayload(order));
    if (result.ok) {
      const id = result.data?.order?.id ?? result.data?.id ?? null;
      return { ...previous, ...attempt, sent: true, sentAt: attempt.lastAttemptAt, shippingEasyId: id, lastError: null };
    }
    const message = errorMessage(result);
    if (/already|taken|exists|duplicate/i.test(message)) {
      return { ...previous, ...attempt, sent: true, sentAt: previous.sentAt || attempt.lastAttemptAt, lastError: null, note: 'Already in ShippingEasy.' };
    }
    return { ...previous, ...attempt, sent: false, lastError: message };
  } catch (err) {
    return { ...previous, ...attempt, sent: false, lastError: err.message };
  }
}

// Verifies a callback ShippingEasy signed with this account's API secret.
// The body is checked as received and, as ShippingEasy's PHP client also
// allows, with JSON's escaped slashes ("\/") unescaped.
export function verifyCallback({ method, path, query, rawBody }) {
  const { apiSecret } = shippingEasyConfig();
  if (!apiSecret) return { ok: false, reason: 'SHIPPINGEASY_API_SECRET is not set.' };
  const supplied = String(query.api_signature || '');
  if (!supplied) return { ok: false, reason: 'No api_signature on the request.' };
  const ts = Number(query.api_timestamp);
  if (!ts || Math.floor(Date.now() / 1000) - ts > MAX_CALLBACK_AGE_S) return { ok: false, reason: 'Missing or expired api_timestamp.' };

  const params = Object.fromEntries(Object.entries(query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const bodies = [rawBody, rawBody.replace(/\\\//g, '/')];
  const matches = bodies.some((body) => {
    const expected = Buffer.from(signature(apiSecret, method, path, params, body));
    const given = Buffer.from(supplied);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  });
  return matches ? { ok: true } : { ok: false, reason: 'Signature did not match.' };
}

// The shipment notification: { shipment: { tracking_number, carrier_key,
// carrier_service_key, orders: [{ external_order_identifier, ... }] } }.
// Read loosely so a shape variation doesn't drop a shipment silently.
export function parseShipment(body) {
  const shipment = body?.shipment || body || {};
  const orders = Array.isArray(shipment.orders) ? shipment.orders : shipment.order ? [shipment.order] : [];
  return {
    trackingNumber: String(shipment.tracking_number || '').trim(),
    carrier: String(shipment.carrier_key || shipment.carrier || '').trim(),
    service: String(shipment.carrier_service_key || '').trim(),
    orderIds: orders
      .map((o) => o.external_order_identifier || o.ext_order_reference_id || o.external_id)
      .filter(Boolean)
      .map(String),
  };
}

export function trackingUrlFor(carrier, trackingNumber) {
  const c = String(carrier || '').toLowerCase();
  const n = encodeURIComponent(trackingNumber);
  if (c.includes('usps')) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (c.includes('dhl')) return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`;
  return null;
}

export function carrierLabel(carrier) {
  const c = String(carrier || '').toLowerCase();
  if (c.includes('usps')) return 'USPS';
  if (c.includes('ups')) return 'UPS';
  if (c.includes('fedex')) return 'FedEx';
  if (c.includes('dhl')) return 'DHL';
  return carrier || null;
}
