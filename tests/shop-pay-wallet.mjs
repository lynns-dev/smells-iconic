// Run: node --experimental-vm-modules tests/shop-pay-wallet.mjs
// Real quote/session/reconciliation code; mocked Shopify and Redis only.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const store = new Map(); const ledger = [];
let paid = false, testOrder = false, calls = 0, submitTimeout = false, fulfillmentCalls = 0;
const processEnv = { SHOP_PAY_WALLET_ENABLED: 'true', SHOP_PAY_STORE_DOMAIN: 'example.myshopify.com',
  SHOP_PAY_STOREFRONT_TOKEN: 'test-storefront', SHOP_PAY_ADMIN_TOKEN: 'test-admin', KV_REST_API_URL: 'https://redis.test', KV_REST_API_TOKEN: 'test-kv' };
const context = vm.createContext({ process: { env: processEnv }, console, Buffer, AbortSignal, URL, Date, Set, crypto,
  fetch: async (url, options) => {
    const data = JSON.parse(options.body);
    if (url === 'https://redis.test') {
      const [command, key, value, ...args] = data;
      let result;
      if (command === 'GET') result = store.get(key) ?? null;
      else if (command === 'SET') {
        if (args.includes('NX') && store.has(key)) result = null;
        else { store.set(key, value); result = 'OK'; }
      } else if (command === 'DEL') { store.delete(key); result = 1; }
      else result = 1;
      return { ok: true, json: async () => ({ result }) };
    }
    calls++;
    assert.match(String(url), /example\.myshopify\.com\/(admin\/)?api\/2026-10\/graphql.json/);
    let result;
    if (data.query.includes('WalletCreate')) result = { shopPayPaymentRequestSessionCreate: {
      shopPayPaymentRequestSession: { sourceIdentifier: data.variables.sourceIdentifier, token: 'session-token', checkoutUrl: 'https://shop.app/checkout/test' }, userErrors: [] } };
    else if (data.query.includes('WalletSubmit')) {
      assert.equal(data.variables.paymentRequest.total.amount, '53.00');
      assert.equal(data.variables.paymentRequest.lineItems[0].sku, fixture.id);
      assert.ok(!('supportedDeliveryMethodTypes' in data.variables.paymentRequest));
      if (submitTimeout) throw new Error('network timeout');
      result = { shopPayPaymentRequestSessionSubmit: { paymentRequestReceipt: { token: 'receipt', processingStatusType: 'ready' }, userErrors: [] } };
    } else result = { shopPayPaymentRequestReceipts: { nodes: paid ? [{ sourceIdentifier: data.variables.query.match(/'(.+)'/)[1],
      processingStatus: { state: 'COMPLETED' }, order: { id: 'gid://shopify/Order/123', displayFinancialStatus: 'PAID', test: testOrder,
        email: 'test@example.com', totalPriceSet: { presentmentMoney: { amount: '53.00', currencyCode: 'USD' } },
        shippingAddress: { address1: '1 Test St', city: 'Test', countryCodeV2: 'US', zip: '90001', provinceCode: 'CA' } } }] : [] } };
    return { ok: true, status: 200, json: async () => ({ data: result }) };
  },
});
const fixture = { id: 'fixture', name: 'Catalog product', price: 50 };
const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
const products = synthetic({ getProductById: id => id === fixture.id ? fixture : null,
  UPSELL_ID: 'upsell', UPSELL_PRICE: 19, TASSEL_GIFT: { id: 'gift', price: 15 }, FREE_GIFT: { id: 'gift', price: 20 }, FREE_GIFT_THRESHOLD: 50 });
const mocks = {
  crypto: synthetic({ default: crypto }), './products': products,
  './experimentsStore': synthetic({ recordExposure: async () => {}, recordExperimentStep: async () => {} }),
  './shipping': synthetic({ SHIPPING_COST: 3, FREE_SHIPPING_MIN: 100, STANDARD_SHIPPING: 3, FREE_SHIPPING_THRESHOLD: 100 }),
  './discountsStore': synthetic({ getDiscounts: async () => [{ code: 'TEN', type: 'percent', value: 10 }] }),
  './promos': synthetic({ findPromo: () => null }), './uniqueDiscounts': synthetic({ findUniqueDiscount: async () => null }),
  './metaCapi': synthetic({ getBrowserContext: () => ({}) }),
  './orderFulfillment': synthetic({ fulfillOrder: async order => { fulfillmentCalls++; ledger.push(order); } }),
  './analyticsStore': synthetic({ getOrders: async () => ledger, todayKey: () => '2026-11-08' }),
};
const cache = new Map();
async function moduleAt(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = new vm.SourceTextModule(await fs.readFile(path.join(root, file), 'utf8'), { context }); cache.set(file, mod);
  await mod.link(async spec => mocks[spec] || moduleAt(path.join(path.dirname(file), `${spec}.js`)));
  return mod;
}
const module = await moduleAt('lib/shopPayWallet.js'); await module.evaluate();
const wallet = module.namespace;
const quote = cache.get('lib/shopPayQuote.js').namespace;
assert.equal(wallet.walletConfigured(), true);
assert.equal(wallet.safeEqual('abc', 'abc'), true);
assert.equal(wallet.safeEqual('abc', ''), false);
await assert.rejects(quote.quoteShopPayCart([{ id: 'not-a-product', quantity: 1 }]), /no longer available/);
await assert.rejects(quote.quoteShopPayCart([{ id: fixture.id, quantity: -1 }]), /quantity/);
await assert.rejects(quote.quoteShopPayCart([{ id: fixture.id, quantity: 1 }], 'INVALID'), /no longer valid/);
const discounted = await quote.quoteShopPayCart([{ id: fixture.id, quantity: 1, price: 0.01 }], 'TEN');
assert.equal(discounted.total, 48); // server catalog 50 - 10% + shipping 3
await assert.rejects(wallet.createCheckout({ cart: [{ id: fixture.id, quantity: 1, price: 0.01 }], email: 'test@example.com', expectedAmount: 0.01 }, {}), /cart has changed/);
assert.equal(calls, 0, 'tampering rejected before Shopify is called');
const body = { cart: [{ id: fixture.id, quantity: 1, price: 0.01 }], email: 'test@example.com', expectedAmount: 53 };
const checkout = await wallet.createCheckout(body, {});
await assert.rejects(wallet.loadCheckout(checkout.id, 'bad-access'), /expired/);
const record = await wallet.loadCheckout(checkout.id, checkout.access);
assert.equal(record.quote.items[0].price, 50);
assert.equal((await wallet.reconcileCheckout(record)).status, 'created');
const submitBody = { paymentMethod: 'encrypted-payment-method', deliveryMethod: { code: 'STANDARD' },
  shippingAddress: { countryCode: 'US', address1: '1 Test St', city: 'Test', postalCode: '90001', provinceCode: 'CA' },
  displayedPaymentRequest: checkout.paymentRequest };
await assert.rejects(wallet.submitCheckout(record, { ...submitBody, shippingAddress: { countryCode: 'CA' } }), /US shipping/);
submitTimeout = true;
await assert.rejects(wallet.submitCheckout(record, submitBody), /network timeout/);
const recovery = await wallet.loadCheckout(checkout.id, checkout.access);
assert.equal(recovery.status, 'submitted', 'ambiguous submit remains recoverable');
const idempotencyKey = recovery.idempotencyKey;
assert.ok(idempotencyKey);
submitTimeout = false;
await wallet.submitCheckout(recovery, submitBody);
assert.equal((await wallet.loadCheckout(checkout.id, checkout.access)).idempotencyKey, idempotencyKey, 'retry uses the same idempotency key');
assert.equal((await wallet.reconcileCheckout(recovery)).status, 'processing');
assert.equal(fulfillmentCalls, 0, 'no order before authoritative payment confirmation');
paid = true;
const result = await wallet.reconcileCheckout(recovery);
assert.equal(result.status, 'paid'); assert.equal(fulfillmentCalls, 1);
assert.equal(ledger[0].processor, 'shopify'); assert.equal(ledger[0].amount, 53);
assert.equal((await wallet.reconcileCheckout(recovery)).status, 'paid'); assert.equal(fulfillmentCalls, 1, 'duplicate reconciliation is idempotent');
console.log('Shop Pay Wallet: pricing, authorization, API input, timeout recovery, payment verification and deduplication passed.');

const experiment = await moduleAt('lib/shopPayExperiment.js'); await experiment.evaluate();
const cohort = experiment.namespace.walletVariant;
assert.equal(cohort('stable-visitor'), cohort('stable-visitor'));
const treatmentCount = Array.from({length: 1000}, (_, i) => cohort(`visitor-${i}`)).filter(v => v === 'shop_pay').length;
assert.ok(treatmentCount > 450 && treatmentCount < 550, 'approximately 50/50 cohorts');
console.log(`Shop Pay A/B test: stable cohorts; ${treatmentCount}/1000 in treatment.`);
