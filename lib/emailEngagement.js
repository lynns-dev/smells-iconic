// Engagement tiering based on click-through + confirm date, not opens.
// Apple Mail Privacy Protection (Sept 2021) pre-fetches every image in
// every email through Apple's proxy the instant it lands, so "opened" is
// true for a huge share of any list within seconds regardless of whether
// a human looked — open rate is not a usable signal anymore. Clicks and
// confirmed sign-up date are real user actions, so segmentation and the
// sunset/winback flow key off those instead.

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINBACK_AFTER_DAYS = 90;
export const SUPPRESS_AFTER_DAYS = 180;

export function lastActivityAt(subscriber) {
  return Math.max(subscriber.lastClickAt || 0, subscriber.confirmedAt || 0, subscriber.createdAt || 0);
}

// engaged: clicked/confirmed within the winback window.
// cooling: past the winback window but not yet suppress-eligible — the
//   sunset automation should have already sent (or be about to send) a
//   win-back email to this tier.
// cold: past the suppress window with no click since — the sunset
//   automation should have already suppressed these; this tier existing
//   at read time just means the cron hasn't caught up yet.
export function engagementTier(subscriber, now = Date.now()) {
  if (subscriber.status !== 'subscribed') return subscriber.status;
  const ageDays = (now - lastActivityAt(subscriber)) / DAY_MS;
  if (ageDays < WINBACK_AFTER_DAYS) return 'engaged';
  if (ageDays < SUPPRESS_AFTER_DAYS) return 'cooling';
  return 'cold';
}

export function daysSinceActivity(subscriber, now = Date.now()) {
  return (now - lastActivityAt(subscriber)) / DAY_MS;
}

export function resolveSegment(subscribers, segment, now = Date.now()) {
  const subscribed = subscribers.filter((s) => s.status === 'subscribed');
  if (segment === 'engaged') return subscribed.filter((s) => engagementTier(s, now) === 'engaged');
  if (segment === 'all') return subscribed;
  // Anything else is treated as a tag name.
  return subscribed.filter((s) => (s.tags || []).includes(segment));
}
