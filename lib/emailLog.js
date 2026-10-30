// Every email sent about an order is recorded on it (order.emailLog) and
// listed under the order in admin's Orders tab — sent or failed.

export const EMAIL_TYPE_LABELS = {
  order_confirmation: 'Order confirmation',
  order_shipped: 'Shipped / tracking',
};

// One order.emailLog entry from a send result ({ ok, id, error }).
export function emailLogEntry(type, to, { ok, id, error } = {}) {
  return { type, to: to || '', ok: Boolean(ok), id: id || null, error: ok ? null : error || null, at: new Date().toISOString() };
}

// The order's email history. Orders from before emailLog existed only
// kept the shipped email's outcome (order.shippedEmail), so that stands in.
export function orderEmailLog(order) {
  if (order?.emailLog) return order.emailLog;
  if (!order?.shippedEmail) return [];
  const { ok, error, at } = order.shippedEmail;
  return [{ type: 'order_shipped', to: order.email || '', ok: Boolean(ok), id: null, error: error || null, at }];
}
