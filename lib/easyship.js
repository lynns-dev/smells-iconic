// Easyship: every paid order is created as a shipment in Easyship (no
// label bought — that's done in Easyship), and when a label is bought,
// Easyship's webhook (pages/api/easyship/webhook.js) brings the tracking
// number back, which marks the order shipped and emails the customer
// (lib/orderShipping.js).
//
// Env (Vercel): EASYSHIP_API_TOKEN — Easyship → Connect → API integration.
// Optional: EASYSHIP_ORIGIN_ADDRESS_ID to ship from an address other than
// the account's default.
//
// Public API 2024-09 (https://public-api.easyship.com/2024-09), Bearer
// token. Shapes follow Easyship's API as used by its published
// integrations; responses are read defensively, and every failure is saved
// on the order for admin rather than thrown.
//
// The webhook body is treated as a hint, not proof: the shipment is looked
// up again through the API with this store's token before anything is
// marked shipped, so a forged request can't mark an order shipped.

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

// Checkout only ships to the US, and the address form has no country field.
export function buildShipmentPayload(order) {
  const ship = order.shipping || {};
  const { originAddressId } = easyshipConfig();
  const items = (order.items || []).map((i) => ({
    description: String(i.name || i.id || 'Item').slice(0, 200),
    sku: String(i.id || ''),
    quantity: Number(i.quantity) || 1,
    declared_currency: 'USD',
    // Free gifts ring up at $0; customs value can't be zero.
    declared_customs_value: Math.max(money(i.price), 1),
  }));
  return {
    ...(originAddressId ? { origin_address_id: originAddressId } : {}),
    platform_order_number: String(order.id),
    destination_address: {
      contact_name: ship.name || order.email || 'Customer',
      contact_email: order.email || undefined,
      contact_phone: ship.phone || undefined,
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
  try {
    const result = await request('POST', '/shipments', buildShipmentPayload(order));
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
// Easyship dashboard.
export async function registerWebhook(endpoint) {
  const created = await request('POST', '/webhooks', { endpoint, event_types: WEBHOOK_EVENTS, version: WEBHOOK_VERSION });
  const id = created.data?.webhook?.id;
  if (!created.ok || !id) throw new Error(errorMessage(created));
  const activated = await request('POST', `/webhooks/${encodeURIComponent(id)}/activate`);
  if (!activated.ok) throw new Error(`Webhook created but not activated: ${errorMessage(activated)}`);
  return { id, endpoint, events: WEBHOOK_EVENTS, connectedAt: new Date().toISOString() };
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
