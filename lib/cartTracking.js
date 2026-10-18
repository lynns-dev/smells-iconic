// Browser side of the Cart drop-off report (lib/cartFunnel.js): one call per
// cart/checkout step or drop-off signal, fire-and-forget.
import { getSessionId, getVisitorId } from './session';

export function trackCart(kind, detail = {}) {
  if (typeof window === 'undefined') return;
  try {
    fetch('/api/track/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        detail,
        visitorId: getVisitorId(),
        sessionId: getSessionId(),
        path: window.location.pathname,
        device: window.matchMedia?.('(max-width: 760px)').matches ? 'Phone' : 'Desktop',
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Tracking never gets in the shopper's way.
  }
}
