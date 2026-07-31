// Sends Web Push notifications to every admin device subscribed via
// /admin (see pages/api/admin/push-subscribe.js). Expired/unsubscribed
// endpoints (404/410 from the push service) are pruned automatically.

import webpush from 'web-push';
import { getSubscriptions, removeSubscription } from './pushStore';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set.');
  }
  webpush.setVapidDetails('mailto:admin@thesculptwand.com', publicKey, privateKey);
  configured = true;
}

export async function sendPushToAdmins(payload) {
  ensureConfigured();
  const subs = await getSubscriptions();
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await removeSubscription(sub.endpoint).catch(() => {});
        } else {
          console.error('Push send failed:', err.message);
        }
      }
    })
  );
}
