// Heuristic spam scoring for ad comments. No external API call — just
// pattern matching, so moderation runs even without an LLM key configured.
// Score is 0-100; SPAM_THRESHOLD in adCommentsModerator decides the cutoff.

const URL_RE = /(https?:\/\/|www\.)\S+/i;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/;
const WHATSAPP_RE = /\bwhats\s?app\b/i;
const CRYPTO_RE = /\b(crypto|bitcoin|btc|forex|binary options|invest(ment)?|trading bot|mining rig)\b/i;
const PROMO_RE = /\b(dm me|click (the )?link|check my (bio|profile)|follow (me|for)|earn \$?\d|make money|work from home|free (gift|money|iphone))\b/i;
const REPEATED_CHARS_RE = /(.)\1{5,}/;
const EXCESSIVE_EMOJI_RE = /([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*){5,}/u;

export function scoreComment(message) {
  const text = String(message || '').trim();
  if (!text) return { score: 0, reasons: [] };

  const reasons = [];
  let score = 0;

  if (URL_RE.test(text)) {
    score += 30;
    reasons.push('contains a link');
  }
  if (PHONE_RE.test(text)) {
    score += 20;
    reasons.push('contains a phone number');
  }
  if (WHATSAPP_RE.test(text)) {
    score += 25;
    reasons.push('mentions WhatsApp contact');
  }
  if (CRYPTO_RE.test(text)) {
    score += 35;
    reasons.push('crypto/investment pitch');
  }
  if (PROMO_RE.test(text)) {
    score += 35;
    reasons.push('promotional call-to-action');
  }
  if (REPEATED_CHARS_RE.test(text)) {
    score += 10;
    reasons.push('repeated characters');
  }
  if (EXCESSIVE_EMOJI_RE.test(text)) {
    score += 10;
    reasons.push('excessive emoji');
  }
  if (text.length > 20 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    score += 10;
    reasons.push('all caps');
  }

  return { score: Math.min(score, 100), reasons };
}

export function isSpam(message, threshold) {
  const { score, reasons } = scoreComment(message);
  return { spam: score >= threshold, score, reasons };
}
