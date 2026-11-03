// Per-subscriber letter grade blending email engagement (click-based, see
// lib/emailEngagement.js for why not opens) with Shopify purchase
// behavior — a subscriber who never clicks an email but buys every month
// is still valuable and shouldn't be scored like a dead address, and vice
// versa. Computed on read, same as engagementTier() — no background job
// needed to keep it in sync.

import { engagementTier } from './emailEngagement';

const DAY_MS = 24 * 60 * 60 * 1000;

function scoreOf(subscriber, now) {
  if (subscriber.status !== 'subscribed') return null;

  let score = 0;
  const tier = engagementTier(subscriber, now);
  if (tier === 'engaged') score += 50;
  else if (tier === 'cooling') score += 20;

  if (subscriber.lastOrderAt) {
    const orderAgeDays = (now - subscriber.lastOrderAt) / DAY_MS;
    if (orderAgeDays < 90) score += 30;
    else if (orderAgeDays < 365) score += 15;
  }

  const ordersCount = subscriber.ordersCount || 0;
  if (ordersCount >= 3) score += 15;
  else if (ordersCount >= 1) score += 5;

  if ((subscriber.totalSpent || 0) >= 200) score += 5;

  return Math.min(score, 100);
}

function gradeFromScore(score) {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 35) return 'C';
  if (score >= 15) return 'D';
  return 'F';
}

export function computeGrade(subscriber, now = Date.now()) {
  const score = scoreOf(subscriber, now);
  if (score === null) return { grade: null, score: null };
  return { grade: gradeFromScore(score), score };
}

export function gradeSummary(subscribers, now = Date.now()) {
  const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let graded = 0;

  for (const s of subscribers) {
    const { grade } = computeGrade(s, now);
    if (!grade) continue;
    counts[grade] += 1;
    graded += 1;
  }

  return {
    counts,
    total: graded,
    percentages: Object.fromEntries(
      Object.entries(counts).map(([grade, count]) => [grade, graded ? Math.round((count / graded) * 100) : 0])
    ),
  };
}
