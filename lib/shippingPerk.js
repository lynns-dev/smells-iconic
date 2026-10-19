// Free shipping offered by the cart exit popup (components/CartExitPopup.jsx)
// to a shopper who said shipping was holding them back. Kept on this device
// for a day; checkout and the cart read it when working out shipping.
const KEY = 'free-ship-perk-until';
const DAY_MS = 24 * 60 * 60 * 1000;

export function grantFreeShipping(ms = DAY_MS) {
  try { window.localStorage.setItem(KEY, String(Date.now() + ms)); } catch { /* storage blocked */ }
}

export function hasFreeShipping() {
  if (typeof window === 'undefined') return false;
  try { return Number(window.localStorage.getItem(KEY)) > Date.now(); } catch { return false; }
}
