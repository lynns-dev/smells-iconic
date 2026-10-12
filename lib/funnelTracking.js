// Keeps Meta's funnel events honest: InitiateCheckout (and offer3's
// AddToCart) fire once per cart per browser session instead of on every
// page load. The cart is saved across visits, so firing on each load made
// one add-to-cart look like several checkouts — every refresh, every
// return visit, every back-and-forth counted again.

export function firstTimeThisSession(key) {
  if (typeof window === 'undefined') return false;
  try {
    const storageKey = `funnel:${key}`;
    if (window.sessionStorage.getItem(storageKey)) return false;
    window.sessionStorage.setItem(storageKey, '1');
    return true;
  } catch {
    // Storage blocked (private mode): fall back to the old per-load firing
    // rather than never tracking at all.
    return true;
  }
}

// Once per key per device per calendar day (localStorage), across tabs and
// return visits — used for Meta's InitiateCheckout so a shopper returning
// to their saved cart in a new tab later the same day isn't another
// checkout. Entries from earlier days are cleared as new ones are written.
export function firstTimeToday(key) {
  if (typeof window === 'undefined') return false;
  try {
    const today = new Date().toLocaleDateString('en-CA');
    const prefix = 'funnel-day:';
    const storageKey = `${prefix}${today}:${key}`;
    if (window.localStorage.getItem(storageKey)) return false;
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(prefix) && !k.startsWith(`${prefix}${today}:`)) window.localStorage.removeItem(k);
    }
    window.localStorage.setItem(storageKey, '1');
    return true;
  } catch {
    return firstTimeThisSession(key);
  }
}

// Paid items only — the free gift added silently on /checkout would
// otherwise make a reload look like a different cart.
export function cartSignature(cart) {
  return cart
    .filter((i) => Number(i.price) > 0)
    .map((i) => `${i.id}x${i.quantity}`)
    .sort()
    .join(',');
}
