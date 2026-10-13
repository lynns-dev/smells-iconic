// Server-side PayPal Orders v2 API client. Client credentials (client ID +
// secret) exchange for a short-lived OAuth token via the standard
// client_credentials grant; that token authorizes order create/capture
// calls. No refresh-token persistence needed like QuickBooks — a fresh
// token is requested per checkout, PayPal's own rate limits are generous
// enough for this traffic volume.

const API_BASE = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  production: 'https://api-m.paypal.com',
};

function base() {
  return API_BASE[process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox'];
}

async function getAccessToken() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) {
    throw new Error('NEXT_PUBLIC_PAYPAL_CLIENT_ID / PAYPAL_SECRET are not set.');
  }

  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Failed to authenticate with PayPal.');
  return data.access_token;
}

// amount: number in USD. Returns the created order's id.
export async function createOrder(amount) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${base()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: Number(amount).toFixed(2) } }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.details?.[0]?.description || 'Failed to create PayPal order.');
  return data.id;
}

// Returns the full capture response — includes the captured amount, payer
// email, and shipping address as PayPal recorded them, which is the source
// of truth for express-checkout orders (the on-page form may be empty/unused
// when a customer pays via the PayPal button instead of filling it in).
export async function captureOrder(orderId) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${base()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.details?.[0]?.description || 'Failed to capture PayPal order.');
  return data;
}

// Full refund of a captured PayPal / Venmo payment, for admin's Refund
// button (pages/api/admin/orders/refund.js). captureId is saved on the
// order at checkout (order.captureId).
export async function refundCapture(captureId) {
  const accessToken = await getAccessToken();
  const res = await fetch(`${base()}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.details?.[0]?.description || 'Failed to refund PayPal capture.');
  return data;
}
