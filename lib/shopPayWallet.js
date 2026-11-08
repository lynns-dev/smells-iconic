// Shop Pay Wallet, Storefront/Admin API 2026-10. Secrets stay server-side.
import crypto from 'crypto';
import { quoteShopPayCart, STORE_KEY } from './shopPayQuote';
import { getBrowserContext } from './metaCapi';
import { fulfillOrder } from './orderFulfillment';
import { getOrders, todayKey } from './analyticsStore';

export const SHOP_ID = 79302197414;
export const CLIENT_ID = '2c05e8f9-a1dc-4456-a735-4868741d8c61';
const VERSION = '2026-10';
const PENDING = `shop-pay-wallet:${STORE_KEY}:pending`;
const key = (id) => `shop-pay-wallet:${STORE_KEY}:${id}`;
const money = (n) => ({ amount: Number(n.toFixed(2)), currencyCode: 'USD' });

export function walletConfigured() {
  return process.env.SHOP_PAY_WALLET_ENABLED === 'true'
    && Boolean(process.env.SHOP_PAY_STORE_DOMAIN && process.env.SHOP_PAY_STOREFRONT_TOKEN
      && process.env.SHOP_PAY_ADMIN_TOKEN && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function redis(...command) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) throw new Error('Order storage is not configured.');
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error('Shop Pay order storage failed.');
  return data.result;
}

export async function shopify(query, variables, admin = false) {
  const domain = process.env.SHOP_PAY_STORE_DOMAIN;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain || '')) throw new Error('Shop Pay store domain is not configured.');
  const token = admin ? process.env.SHOP_PAY_ADMIN_TOKEN : process.env.SHOP_PAY_STOREFRONT_TOKEN;
  if (!token) throw new Error('Shop Pay API credentials are not configured.');
  const res = await fetch(`https://${domain}/${admin ? 'admin/api' : 'api'}/${VERSION}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      [admin ? 'X-Shopify-Access-Token' : 'X-Shopify-Storefront-Access-Token']: token },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (!res.ok || data.errors?.length) {
    // GraphQL diagnostics contain no payment token or contact information.
    console.error('Shop Pay API rejected request', res.status, data.errors?.map(e => e.message));
    throw new Error('Shop Pay could not process the request. Please try again.');
  }
  return data.data;
}

function checkErrors(result) {
  if (result?.userErrors?.length || !result) throw new Error('Shop Pay could not process the request. Please try again.');
  return result;
}

export function paymentRequest(quote) {
  const shipping = { label: quote.shipping === 0 ? 'Free shipping' : 'Standard shipping', code: 'STANDARD', amount: money(quote.shipping) };
  return {
    locale: 'en', presentmentCurrency: 'USD', selectedDeliveryMethodType: 'SHIPPING', supportedDeliveryMethodTypes: ['SHIPPING'],
    discountCodes: quote.discountCode ? [quote.discountCode] : [],
    discounts: quote.discount > 0 ? [{ label: quote.discountCode, amount: money(quote.discount) }] : [],
    lineItems: quote.items.map(i => ({
      label: i.name, sku: i.id, quantity: i.quantity, requiresShipping: true,
      originalItemPrice: money(i.price), finalItemPrice: money(i.price),
      originalLinePrice: money(i.price * i.quantity), finalLinePrice: money(i.price * i.quantity),
    })),
    shippingLines: [shipping], deliveryMethods: [{ ...shipping, deliveryExpectationLabel: 'Standard shipping' }],
    totalShippingPrice: { originalTotal: money(quote.shipping), finalTotal: money(quote.shipping) },
    subtotal: money(quote.subtotal), totalTax: money(0), total: money(quote.total),
  };
}

export function toStorefrontInput(request, paymentMethod) {
  // The backend input excludes frontend-only fields (supported methods,
  // images, delivery estimates). MoneyInput uses decimal strings.
  const convertMoney = m => ({ amount: Number(m.amount).toFixed(2), currencyCode: m.currencyCode });
  const lines = request.lineItems.map(({ label, sku, quantity, requiresShipping, originalItemPrice, finalItemPrice, originalLinePrice, finalLinePrice }) => ({
    label, sku, quantity, requiresShipping,
    originalItemPrice: convertMoney(originalItemPrice), finalItemPrice: convertMoney(finalItemPrice),
    originalLinePrice: convertMoney(originalLinePrice), finalLinePrice: convertMoney(finalLinePrice),
  }));
  return {
    locale: request.locale, presentmentCurrency: request.presentmentCurrency, selectedDeliveryMethodType: 'SHIPPING', paymentMethod,
    lineItems: lines, discountCodes: request.discountCodes,
    discounts: request.discounts.map(d => ({ label: d.label, amount: convertMoney(d.amount) })),
    subtotal: convertMoney(request.subtotal), total: convertMoney(request.total), totalTax: convertMoney(request.totalTax),
    shippingLines: request.shippingLines.map(s => ({ label: s.label, code: s.code, amount: convertMoney(s.amount) })),
    totalShippingPrice: { originalTotal: convertMoney(request.totalShippingPrice.originalTotal), finalTotal: convertMoney(request.totalShippingPrice.finalTotal) },
  };
}

export async function loadCheckout(id, access) {
  if (!new RegExp(`^${STORE_KEY}-[0-9a-f-]{36}$`).test(String(id || ''))) throw new Error('Invalid checkout.');
  const raw = await redis('GET', key(id));
  const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!record || (access !== undefined && !safeEqual(record.access, access))) throw new Error('Checkout expired. Please reopen Shop Pay.');
  return record;
}

export async function saveCheckout(record) {
  await redis('SET', key(record.id), JSON.stringify(record), 'EX', 60 * 60 * 24 * 45);
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function normalizeAddress(address) {
  if (!address || address.countryCode !== 'US' || !address.address1 || !address.city || !address.postalCode || !address.provinceCode) {
    throw new Error('Select a complete US shipping address.');
  }
  return {
    name: `${address.firstName || ''} ${address.lastName || ''}`.trim(),
    address: String(address.address1).slice(0, 250), apt: String(address.address2 || '').slice(0, 100),
    city: String(address.city).slice(0, 100), state: address.provinceCode, zip: address.postalCode,
    country: 'US', phone: String(address.phone || '').slice(0, 40),
  };
}

export async function createCheckout(body, req) {
  const email = String(body.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Enter your email before using Shop Pay.');
  const quote = await quoteShopPayCart(body.cart, body.discountCode, body.freeShipping === true);
  if (!Number.isFinite(body.expectedAmount) || Math.abs(body.expectedAmount - quote.total) > 0.011) throw new Error('Your cart has changed. Refresh checkout before using Shop Pay.');
  const id = `${STORE_KEY}-${crypto.randomUUID()}`;
  const record = {
    id, access: crypto.randomBytes(32).toString('hex'), quote,
    cart: body.cart.map(i => ({ id: i.id, quantity: i.quantity, upsell: i.upsell === true })),
    freeShipping: body.freeShipping === true, email,
    sessionId: String(body.sessionId || '').slice(0, 120), eventId: crypto.randomUUID(),
    attribution: body.attribution || null, browser: getBrowserContext(req),
    url: body.url, createdAt: Date.now(), status: 'created', attempt: 0,
  };
  const data = await shopify(`mutation WalletCreate($sourceIdentifier: String!) {
    shopPayPaymentRequestSessionCreate(sourceIdentifier: $sourceIdentifier) {
      shopPayPaymentRequestSession { token checkoutUrl sourceIdentifier } userErrors { field message }
    }
  }`, { sourceIdentifier: id });
  const result = checkErrors(data.shopPayPaymentRequestSessionCreate);
  if (!result.shopPayPaymentRequestSession?.token) throw new Error('Shop Pay did not return a session.');
  record.session = result.shopPayPaymentRequestSession;
  await saveCheckout(record);
  return { id, access: record.access, session: record.session, eventId: record.eventId, paymentRequest: paymentRequest(quote) };
}

export async function submitCheckout(record, body) {
  if (record.receiptToken) {
    const result = await reconcileCheckout(record);
    if (result.status !== 'failed') return { accepted: true };
    record = await loadCheckout(record.id);
  }
  if (Date.now() - record.createdAt > 30 * 60 * 1000) throw new Error('Checkout expired. Please reopen Shop Pay.');
  record.shipping = normalizeAddress(body.shippingAddress);
  if (!body.paymentMethod || typeof body.paymentMethod !== 'string') throw new Error('Shop Pay payment authorization is missing.');
  if (body.deliveryMethod?.code !== 'STANDARD') throw new Error('Select Standard shipping.');
  const fresh = await quoteShopPayCart(record.cart, record.quote.discountCode, record.freeShipping);
  if (JSON.stringify(fresh) !== JSON.stringify(record.quote)) throw new Error('Your cart pricing changed. Close Shop Pay and refresh checkout.');
  const incoming = body.displayedPaymentRequest;
  if (!incoming || Number(incoming.total?.amount) !== fresh.total || incoming.presentmentCurrency !== 'USD') throw new Error('Your total changed. Please reopen Shop Pay.');
  // Persist the recovery index BEFORE calling Shopify, so a timeout after
  // Shopify accepted payment is recovered by sourceIdentifier, not recharged.
  record.status = 'submitted';
  record.idempotencyKey ||= crypto.randomUUID();
  await saveCheckout(record);
  await redis('ZADD', PENDING, Date.now(), record.id);
  const data = await shopify(`mutation WalletSubmit($token: String!, $paymentRequest: ShopPayPaymentRequestInput!, $idempotencyKey: String!) {
    shopPayPaymentRequestSessionSubmit(token: $token, paymentRequest: $paymentRequest, idempotencyKey: $idempotencyKey) {
      paymentRequestReceipt { token processingStatusType } userErrors { field message }
    }
  }`, { token: record.session.token, idempotencyKey: record.idempotencyKey,
    paymentRequest: toStorefrontInput(paymentRequest(fresh), body.paymentMethod) });
  const result = checkErrors(data.shopPayPaymentRequestSessionSubmit);
  if (!result.paymentRequestReceipt?.token) throw new Error('Shop Pay has not confirmed the payment request.');
  record.receiptToken = result.paymentRequestReceipt.token;
  await saveCheckout(record);
  return { accepted: true };
}

export async function reconcileCheckout(record) {
  if (record.status === 'paid') return { status: 'paid', purchase: record.purchase };
  if (!['submitted', 'processing'].includes(record.status)) return { status: record.status };
  const data = await shopify(`query WalletReceipt($query: String!) {
    shopPayPaymentRequestReceipts(first: 10, query: $query) { nodes {
      sourceIdentifier token processingStatus { state }
      order { id displayFinancialStatus test email shippingAddress { name address1 address2 city provinceCode zip phone countryCodeV2 }
        totalPriceSet { presentmentMoney { amount currencyCode } } }
    } }
  }`, { query: `source_identifier:'${record.id}'` }, true);
  const receipts = (data.shopPayPaymentRequestReceipts?.nodes || []).filter(r => r.sourceIdentifier === record.id);
  const receipt = receipts.find(r => r.processingStatus.state === 'COMPLETED' && r.order);
  if (!receipt) {
    // A new card can be retried ONLY after Shopify explicitly reports all
    // attempts failed; timeouts/unknown status always retain the same key.
    if (receipts.length && receipts.every(r => r.processingStatus.state === 'FAILED')) {
      record.status = 'failed'; record.receiptToken = null; record.idempotencyKey = null;
      await saveCheckout(record);
      await redis('ZREM', PENDING, record.id);
      return { status: 'failed' };
    }
    return { status: 'processing' };
  }
  const order = receipt.order;
  if (order.displayFinancialStatus !== 'PAID') return { status: 'processing' };
  if (order.test && process.env.SHOP_PAY_TEST_MODE !== 'true') throw new Error('Test order received in live mode.');
  const actual = order.totalPriceSet.presentmentMoney;
  if (actual.currencyCode !== 'USD' || Math.abs(Number(actual.amount) - record.quote.total) > 0.011) throw new Error('Shop Pay order amount mismatch.');
  const lock = await redis('SET', `${key(record.id)}:fulfilling`, '1', 'NX', 'EX', 120);
  if (!lock) return { status: 'processing' };
  try {
    const id = order.id.split('/').pop();
    // Recover a crash between ledger write and marking this record paid.
    const days = [...new Set([todayKey(), record.ledgerDay].filter(Boolean))];
    let existing = false;
    for (const day of days) {
      if ((await getOrders(day)).some(o => o.id === id && o.processor === 'shopify')) { existing = true; break; }
    }
    if (!existing && !order.test) {
      record.ledgerDay = todayKey();
      await saveCheckout(record);
      const address = order.shippingAddress;
      if (!address?.address1 || address.countryCodeV2 !== 'US') throw new Error('Shop Pay order shipping address is missing.');
      await fulfillOrder({
        id, amount: record.quote.total, items: record.quote.items, paymentMethod: 'Shop Pay', processor: 'shopify',
        eventId: record.eventId, sessionId: record.sessionId, attribution: record.attribution, url: record.url,
        browser: record.browser, email: order.email || record.email,
        shipping: { name: address.name, address: address.address1, apt: address.address2 || '', city: address.city,
          state: address.provinceCode, zip: address.zip, country: 'US', phone: address.phone || '' },
      });
      const stored = await getOrders();
      if (!stored.some(o => o.id === id && o.processor === 'shopify')) throw new Error('Paid order is waiting for local recording.');
    }
    record.status = 'paid';
    record.purchase = { orderId: id, amount: record.quote.total, eventId: record.eventId, test: order.test,
      contentIds: record.quote.items.map(i => i.id), contents: record.quote.items.map(i => ({ id: i.id, quantity: i.quantity, item_price: i.price })) };
    await saveCheckout(record);
    await redis('ZREM', PENDING, record.id);
    return { status: 'paid', purchase: record.purchase };
  } finally { await redis('DEL', `${key(record.id)}:fulfilling`); }
}

export async function reconcilePending() {
  const ids = await redis('ZRANGE', PENDING, 0, 19);
  const results = [];
  for (const id of ids) {
    try {
      const record = await loadCheckout(id);
      results.push({ id, ...(await reconcileCheckout(record)) });
      // Rotate unresolved records so one delayed receipt can't starve others.
      if (record.status !== 'paid') await redis('ZADD', PENDING, Date.now(), id);
    } catch (err) { console.error('Shop Pay reconciliation failed', id, err.message); results.push({ id, error: true }); }
  }
  return results.map(({ id, status, error }) => ({ id, status, error }));
}

function orderGid(id) {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid Shopify order ID.');
  return `gid://shopify/Order/${id}`;
}

export async function refundWalletOrder(id, amount) {
  const orderId = orderGid(id);
  const data = await shopify(`query WalletRefundOrder($id: ID!) { order(id: $id) {
    sourceIdentifier transactions(first: 100) { id kind status gateway amountSet { presentmentMoney { amount currencyCode } } }
  } }`, { id: orderId }, true);
  if (!data.order?.sourceIdentifier?.startsWith(`${STORE_KEY}-`)) throw new Error('This Shopify order belongs to a different checkout.');
  const parent = data.order.transactions.find(t => ['SALE', 'CAPTURE'].includes(t.kind) && t.status === 'SUCCESS');
  if (!parent || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > Number(parent.amountSet.presentmentMoney.amount)) throw new Error('No matching captured payment is available to refund.');
  const result = await shopify(`mutation WalletRefund($input: RefundInput!) {
    refundCreate(input: $input) { refund { id } userErrors { field message } }
  }`, { input: { orderId, notify: false, transactions: [{ orderId, parentId: parent.id, gateway: parent.gateway,
    kind: 'REFUND', amount: Number(amount).toFixed(2) }] } }, true);
  return checkErrors(result.refundCreate).refund;
}

export async function syncWalletTracking(order) {
  if (order.processor !== 'shopify') return;
  const data = await shopify(`query WalletFulfillment($id: ID!) { order(id: $id) {
    sourceIdentifier fulfillments(first: 10) { id status }
    fulfillmentOrders(first: 50) { nodes { id status } }
  } }`, { id: orderGid(order.id) }, true);
  if (!data.order?.sourceIdentifier?.startsWith(`${STORE_KEY}-`)) throw new Error('This Shopify order belongs to a different checkout.');
  const trackingInfo = { number: order.trackingNumber,
    ...(order.carrier ? { company: order.carrier } : {}), ...(order.trackingUrl ? { url: order.trackingUrl } : {}) };
  const existing = data.order.fulfillments.find(f => f.status === 'SUCCESS');
  if (existing) {
    const result = await shopify(`mutation WalletTrackingUpdate($id: ID!, $tracking: FulfillmentTrackingInput!) {
      fulfillmentTrackingInfoUpdate(fulfillmentId: $id, trackingInfoInput: $tracking, notifyCustomer: false) {
        fulfillment { id } userErrors { field message }
      }
    }`, { id: existing.id, tracking: trackingInfo }, true);
    checkErrors(result.fulfillmentTrackingInfoUpdate);
  } else {
    const open = data.order.fulfillmentOrders.nodes.filter(f => ['OPEN', 'IN_PROGRESS'].includes(f.status));
    if (!open.length) throw new Error('No open Shopify fulfillment order was found.');
    const result = await shopify(`mutation WalletFulfill($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id } userErrors { field message } }
    }`, { fulfillment: { lineItemsByFulfillmentOrder: open.map(f => ({ fulfillmentOrderId: f.id })), trackingInfo, notifyCustomer: false } }, true);
    checkErrors(result.fulfillmentCreate);
  }
}
