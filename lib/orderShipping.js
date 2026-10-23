// Marks an order shipped from Easyship's label webhook
// (pages/api/easyship/webhook.js) and emails the customer their
// tracking (lib/orderShippedEmail.js). The email's outcome is saved on the
// order (shippedEmail) so admin can see whether it went out; a failed email
// doesn't undo the tracking.

import { updateOrderStatus } from './analyticsStore';
import { sendOrderShippedEmail } from './orderShippedEmail';

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
    shippedEmail: { ok: result.ok, at: new Date().toISOString(), error: result.ok ? null : result.error || null },
  });
  return { order: logged || updated, emailSent: result.ok, emailError: result.error || null };
}
