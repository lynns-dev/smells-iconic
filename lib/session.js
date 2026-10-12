// One id per browser tab session (cleared when the tab closes), used to
// tell "the same visitor did this twice" apart from "two different
// visitors did this once" in admin analytics — e.g. adding 3 items to
// cart or reloading /checkout twice shouldn't count as 3/2 people.

const SESSION_STORAGE_KEY = 'si-session-id';

export function getSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

// One id per device/browser, kept across tabs and return visits
// (localStorage). Admin's funnel counts each person once per day by this,
// rather than once per tab: someone who adds to cart, closes the tab and
// later comes back to check out from their saved cart is still one person.
const VISITOR_STORAGE_KEY = 'si-visitor-id';

export function getVisitorId() {
  if (typeof window === 'undefined') return null;
  try {
    let id = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (!id) {
      id = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.localStorage.setItem(VISITOR_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return getSessionId();
  }
}
