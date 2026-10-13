// Contact/shipping progress saved from the checkout form so a shopper who's
// already filled it in once doesn't have to retype it — restored on a
// checkout refresh (pages/checkout.jsx). Never includes card data.
const CHECKOUT_PROGRESS_KEY = 'si-checkout-progress';

export function loadCheckoutProgress() {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCheckoutProgress(progress) {
  try {
    sessionStorage.setItem(CHECKOUT_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage can throw (private-browsing quota, etc.) — losing the
    // resume-on-refresh convenience isn't worth failing checkout over.
  }
}

export function clearCheckoutProgress() {
  try {
    sessionStorage.removeItem(CHECKOUT_PROGRESS_KEY);
  } catch {
    // Same as above — non-fatal either way.
  }
}

export function hasUsableShipping(progress) {
  const s = progress?.shipping;
  return Boolean(
    progress?.email?.trim() &&
    (s?.name?.trim() || (s?.firstName?.trim() && s?.lastName?.trim())) &&
    s?.address?.trim() && s?.city?.trim() && s?.state && s?.zip?.trim()
  );
}
