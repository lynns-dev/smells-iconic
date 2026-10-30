// Marks an order shipped from Easyship's label webhook
// (pages/api/easyship/webhook.js) and emails the customer their
// tracking (lib/orderShippedEmail.js). The email's outcome is added to the
// order's emailLog (lib/emailLog.js) so admin can see whether it went out;
// a failed email doesn't undo the tracking.

import { updateOrderStatus } from './analyticsStore';
import { sendOrderShippedEmail } from './orderShippedEmail';
import { emailLogEntry, orderEmailLog } from './emailLog';

export async function markOrderShipped(orderId, { carrier, trackingNumber, trackingUrl, source = 'admin' }) {
  const updated = await updateOrderStatus(orderId, {
    trackingNumber,
    carrier: carrier || null,
    trackingUrl: trackingUrl || null,
    shippedAt: new Date().toISOString(),
    shippedVia: source,
  });
  if (!updated) return null;

  const result = await sendOrderShippedEmail({ order: updated, carrier: updated.carrier, trackingNumber, trackingUrl: updated.trackingUrl });
  const logged = await updateOrderStatus(orderId, {
    emailLog: [...orderEmailLog(updated), emailLogEntry('order_shipped', updated.email, result)],
  });
  return { order: logged || updated, emailSent: result.ok, emailError: result.error || null };
}
