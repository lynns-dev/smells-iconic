// Easyship: every paid order is created as a shipment in Easyship (no
// label bought — that's done in Easyship), and when a label is bought,
// Easyship's webhook (pages/api/easyship/webhook.js) brings the tracking
// number back, which marks the order shipped and emails the customer
// (lib/orderShipping.js).
//
// Env (Vercel): EASYSHIP_API_TOKEN — Easyship → Connect → API integration.
// Ships from the account's default address saved in Easyship (looked up
// through the API); EASYSHIP_ORIGIN_ADDRESS_ID picks a different one.
// Each product's packed weight/size and customs code: lib/shippingSpecs.js.
//
// Public API 2024-09 (https://public-api.easyship.com/2024-09), Bearer
// token. Shapes follow Easyship's API as used by its published
// integrations; responses are read defensively, and every failure is saved
// on the order for admin rather than thrown.
//
// The webhook body is treated as a hint, not proof: the shipment is looked
// up again through the API with this store's token before anything is
// marked shipped, so a forged request can't mark an order shipped.

import * as catalog from './products';
import { SPECS, hsCodeFor } from './shippingSpecs';

const BASE_URL = 'https://public-api.easyship.com/2024-09';
export const MAX_ATTEMPTS = 6;
const WEBHOOK_EVENTS = ['shipment_label_created'];
const WEBHOOK_VERSION = '2023-01';

function envValue(name) {
  return String(process.env[name] || '').trim().replace(/^["']|["']$/g, '');
}

export function easyshipConfig() {
  const token = envValue('EASYSHIP_API_TOKEN');
  return { token, originAddressId: envValue('EASYSHIP_ORIGIN_ADDRESS_ID'), configured: Boolean(token) };
}

async function request(method, path, body) {
  const { token } = easyshipConfig();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, text };
}

function errorMessage(result) {
  const e = result.data?.error || result.data?.errors || result.data?.message;
  if (typeof e === 'string') return e;
  if (e?.message) return [e.message, ...(Array.isArray(e.details) ? e.details : [])].join(' — ');
  if (Array.isArray(e)) return e.map((x) => (typeof x === 'string' ? x : x.message || JSON.stringify(x))).join('; ');
  if (e) return JSON.stringify(e).slice(0, 300);
  return `Easyship returned ${result.status}${result.text ? `: ${result.text.slice(0, 200)}` : ''}`;
}

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Product details for an order line, from the live catalogue, hidden
// products and gifts included (old orders can hold any of them).
function productFor(id) {
  const all = [...(catalog.PRODUCTS || []), ...(catalog.HIDDEN_PRODUCTS || []), catalog.FREE_GIFT, catalog.TASSEL_GIFT].filter(Boolean);
  return all.find((p) => p.id === id) || null;
}

// Lines whose product has no weight/size in lib/shippingSpecs.js yet.
export function missingSpecs(order) {
  return [...new Set((order.items || []).filter((i) => !SPECS[i.id]).map((i) => i.name || productFor(i.id)?.name || i.id))];
}

// The ship-from address: EASYSHIP_ORIGIN_ADDRESS_ID, else the account's
// default address in Easyship. Cached for the life of the server process.
let cachedOrigin = null;
async function originAddress() {
  const { originAddressId } = easyshipConfig();
  if (originAddressId) return { id: originAddressId, phone: null };
  if (cachedOrigin) return cachedOrigin;
  const result = await request('GET', '/addresses?per_page=100');
  if (!result.ok) throw new Error(`Couldn't read your Easyship addresses: ${errorMessage(result)}`);
  const list = result.data?.addresses || result.data?.data || (Array.isArray(result.data) ? result.data : []);
  const isDefault = (a) => a?.default_for?.pickup || a?.default_for?.sender || a?.is_default || a?.default === true;
  const pick = list.find(isDefault) || list[0];
  if (!pick?.id) throw new Error('No ship-from address in Easyship yet — add one in Easyship (Settings → Addresses), or set EASYSHIP_ORIGIN_ADDRESS_ID.');
  cachedOrigin = { id: pick.id, phone: pick.contact_phone || pick.phone_number || null };
  return cachedOrigin;
}

// Checkout only ships to the US, and the address form has no country field.
// A customer who left no phone gets the store's own (from the ship-from
// address): carriers need a contact number on every label.
export function buildShipmentPayload(order, origin) {
  const ship = order.shipping || {};
  const items = (order.items || []).map((i) => {
    const spec = SPECS[i.id];
    return {
      description: String(i.name || productFor(i.id)?.name || i.id || 'Item').slice(0, 200),
      sku: String(i.id || ''),
      quantity: Number(i.quantity) || 1,
      hs_code: hsCodeFor(productFor(i.id)),
      actual_weight: spec.weightKg,
      dimensions: { length: spec.lengthCm, width: spec.widthCm, height: spec.heightCm },
      declared_currency: 'USD',
      // Free gifts ring up at $0; customs value can't be zero.
      declared_customs_value: Math.max(money(i.price), 1),
    };
  });
  return {
    origin_address_id: origin.id,
    // The current API carries the store's order number under order_data
    // (it comes back on the label webhook); top-level, it's rejected.
    order_data: { platform_order_number: String(order.id) },
    destination_address: {
      contact_name: ship.name || order.email || 'Customer',
      contact_email: order.email || undefined,
      contact_phone: ship.phone || origin.phone || undefined,
      line_1: ship.address || '',
      ...(ship.apt ? { line_2: ship.apt } : {}),
      city: ship.city || '',
      state: ship.state || '',
      postal_code: ship.zip || '',
      country_alpha2: 'US',
    },
    parcels: [{ items }],
    shipping_settings: { buy_label: false },
  };
}

// Creates the order's shipment and returns its updated order.easyship
// record. Never throws.
export async function sendOrderToEasyship(order, previous = order.easyship || {}) {
  const attempt = { attempts: (previous.attempts || 0) + 1, lastAttemptAt: new Date().toISOString() };
  if (!easyshipConfig().configured) {
    return { ...previous, ...attempt, sent: false, lastError: 'Easyship is not set up — add EASYSHIP_API_TOKEN in Vercel and redeploy.' };
  }
  if (!order.shipping?.address) {
    return { ...previous, ...attempt, sent: false, lastError: 'This order has no shipping address.' };
  }
  const missing = missingSpecs(order);
  if (missing.length) {
    return { ...previous, ...attempt, sent: false, lastError: `Add the shipping weight and size for ${missing.join(', ')} (lib/shippingSpecs.js).` };
  }
  try {
    const origin = await originAddress();
    if (!order.shipping.phone && !origin.phone) {
      return { ...previous, ...attempt, sent: false, lastError: 'No phone number for this order, and your Easyship ship-from address has none to use instead — add a phone to that address in Easyship.' };
    }
    const payload = buildShipmentPayload(order, origin);
    let result = await request('POST', '/shipments', payload);
    // Easyship validates the body against its schema and names any property
    // it doesn't accept ("… does not define properties: x, y"). Drop exactly
    // those and try once more, so a field Easyship has renamed can't block
    // every order. The order is still matched later by its shipment id.
    const rejected = rejectedProperties(result);
    if (!result.ok && rejected.length) {
      result = await request('POST', '/shipments', withoutProperties(payload, rejected));
    }
    const shipmentId = result.data?.shipment?.easyship_shipment_id || null;
    if (result.ok && shipmentId) {
      return { ...previous, ...attempt, sent: true, sentAt: attempt.lastAttemptAt, shipmentId, lastError: null };
    }
    return { ...previous, ...attempt, sent: false, lastError: errorMessage(result) };
  } catch (err) {
    return { ...previous, ...attempt, sent: false, lastError: err.message };
  }
}

// null when Easyship has no such shipment; throws on any other failure.
function rejectedProperties(result) {
  if (result.ok) return [];
  const text = `${result.text || ''} ${errorMessage(result)}`;
  const names = [];
  for (const m of text.matchAll(/does not define propert(?:y|ies):\s*([\w,\s]+)/gi)) {
    names.push(...m[1].split(',').map((n) => n.trim()).filter((n) => /^\w+$/.test(n)));
  }
  return [...new Set(names)];
}

// A copy of the payload with the named properties removed wherever they
// appear (Easyship names the property, not always its path).
function withoutProperties(value, names) {
  if (Array.isArray(value)) return value.map((v) => withoutProperties(v, names));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !names.includes(k)).map(([k, v]) => [k, withoutProperties(v, names)]));
}

export async function getShipment(shipmentId) {
  const result = await request('GET', `/shipments/${encodeURIComponent(shipmentId)}`);
  if (result.status === 404) return null;
  if (!result.ok) throw new Error(errorMessage(result));
  return result.data?.shipment || null;
}

// Tracking details off a shipment from the API, read loosely.
export function trackingFromShipment(shipment) {
  const t = (Array.isArray(shipment?.trackings) && shipment.trackings[0]) || {};
  return {
    trackingNumber: t.tracking_number || shipment?.tracking_number || null,
    trackingUrl: shipment?.tracking_page_url || t.tracking_page_url || null,
    carrier: shipment?.courier_service?.umbrella_name || shipment?.courier?.umbrella_name
      || shipment?.courier_service?.name || shipment?.courier?.name || t.handler || null,
  };
}

// The webhook body: { event_type, resource_id, data: { easyship_shipment_id,
// platform_order_number, tracking_number, tracking_page_url, … } }.
export function parseWebhook(body) {
  const data = body?.data || {};
  return {
    eventType: String(body?.event_type || ''),
    shipmentId: String(data.easyship_shipment_id || body?.resource_id || ''),
    orderNumber: data.platform_order_number ? String(data.platform_order_number) : null,
    trackingNumber: data.tracking_number ? String(data.tracking_number) : null,
    trackingUrl: data.tracking_page_url || null,
  };
}

export function webhookUrl(host) {
  return `https://${String(host || '').replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/easyship/webhook`;
}

// Registers and activates the label webhook through the API (admin →
// Orders → "Connect tracking"), so nothing has to be set up by hand in the
// Easyship dashboard. Easyship allows one webhook per endpoint, so one
// that already points here (set up in the dashboard, or left by an earlier
// try) is reused — activated if it isn't yet — instead of creating another.
const normalizeEndpoint = (url) => String(url || '').trim().replace(/\/+$/, '').toLowerCase();
const isActive = (w) => w?.active === true || ['active', 'enabled'].includes(String(w?.status || w?.state || '').toLowerCase());
const isTakenError = (result) => /already been taken|already exists|already taken/i.test(`${errorMessage(result)} ${result.text || ''}`);

async function webhooksFor(endpoint) {
  const result = await request('GET', '/webhooks?per_page=100');
  if (!result.ok) return null;
  const list = result.data?.webhooks || result.data?.data || (Array.isArray(result.data) ? result.data : []);
  return list.filter((w) => normalizeEndpoint(w.endpoint || w.url) === normalizeEndpoint(endpoint));
}

export async function registerWebhook(endpoint) {
  const connected = (id, note) => ({ id: id || null, endpoint, events: WEBHOOK_EVENTS, connectedAt: new Date().toISOString(), ...(note ? { note } : {}) });

  const existing = await webhooksFor(endpoint);
  if (existing?.length) {
    const active = existing.find(isActive);
    if (active) return connected(active.id, 'Already set up in Easyship.');
    const activated = await request('POST', `/webhooks/${encodeURIComponent(existing[0].id)}/activate`);
    if (activated.ok || isTakenError(activated)) return connected(existing[0].id, 'Existing Easyship webhook reused.');
    throw new Error(`Found this site's webhook in Easyship but couldn't activate it: ${errorMessage(activated)}`);
  }

  const created = await request('POST', '/webhooks', { endpoint, event_types: WEBHOOK_EVENTS, version: WEBHOOK_VERSION });
  const id = created.data?.webhook?.id;
  if (!created.ok || !id) {
    if (isTakenError(created)) return connected(null, 'Already set up in Easyship.');
    throw new Error(errorMessage(created));
  }
  const activated = await request('POST', `/webhooks/${encodeURIComponent(id)}/activate`);
  if (activated.ok) return connected(id);
  if (isTakenError(activated)) {
    // Another webhook already delivers to this endpoint — that one stays
    // and the duplicate just created is removed.
    await request('DELETE', `/webhooks/${encodeURIComponent(id)}`).catch(() => {});
    return connected(null, 'Already set up in Easyship.');
  }
  throw new Error(`Webhook created but not activated: ${errorMessage(activated)}`);
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
