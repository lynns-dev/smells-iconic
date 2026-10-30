// Short, sequential order numbers (#1001, #1002, …) for admin, customer
// emails and support. order.id stays the payment processor's own id (what
// refunds and Easyship look orders up by); order.orderNumber is just the
// friendly label. Numbers come from one counter key in the same Upstash KV
// store as the order ledger, so they never repeat.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const COUNTER_KEY = 'order-number';
// The counter starts at 0, so the first order is #1001.
const OFFSET = 1000;

async function incrementBy(n) {
  const res = await fetch(`${KV_URL}/incrby/${COUNTER_KEY}/${n}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  const data = await res.json();
  if (!res.ok || typeof data.result !== 'number') throw new Error(data.error || 'Could not get an order number.');
  return data.result;
}

// The next number, or null if the counter can't be reached — an order is
// never held up for its label; the Orders tab numbers it on its next load.
export async function nextOrderNumber() {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    return OFFSET + (await incrementBy(1));
  } catch (err) {
    console.error('Order number failed:', err.message);
    return null;
  }
}

// Numbers every order in `orders` that doesn't have one yet, oldest first,
// with one counter call for the whole batch. Mutates and returns the ids
// it numbered.
export async function numberOrders(orders) {
  const missing = orders.filter((o) => !o.orderNumber).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!missing.length) return [];
  const last = OFFSET + (await incrementBy(missing.length));
  missing.forEach((o, i) => { o.orderNumber = last - missing.length + 1 + i; });
  return missing.map((o) => o.id);
}

// "#1001" — falls back to the end of the processor id for an order that
// somehow has no number yet.
export function orderLabel(order) {
  if (order?.orderNumber) return `#${order.orderNumber}`;
  return order?.id ? `…${String(order.id).slice(-6)}` : '';
}
