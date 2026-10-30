// Admin-only design tokens: a clean black-and-white look styled after
// Claude — DM Sans for the interface, a serif for page titles, near-white
// canvas, white rounded cards, black as the only accent, pill buttons. Same
// keys as lib/theme.js (anything not overridden falls through), so admin
// screens import T/S from here and the storefront's brand theme is left
// alone. Global admin CSS (rounded inputs, focus rings) lives in
// components/AdminFonts.jsx.

import { T as BRAND_T, S as BRAND_S } from './theme';

// Claude's own fonts (Anthropic Sans / Tiempos-style serif) are licensed;
// DM Sans and Source Serif 4 are the closest free matches (loaded in
// components/AdminFonts.jsx).
const SANS = "'DM Sans', ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Source Serif 4', 'Tiempos Headline', Georgia, 'Times New Roman', serif";

export const T = {
  ...BRAND_T,
  white: '#FFFFFF',
  paper: '#F7F7F7',
  oat: '#F7F7F7',
  shell: '#FFFFFF',
  // Soft fill for highlights and their side of an Inbox conversation.
  blush: '#EFEFEF',
  ink: '#141414',
  soft: '#6B6B6B',
  line: 'rgba(0,0,0,0.08)',
  // Black is the accent: active menu item, primary buttons, our chat bubbles.
  accent: '#141414',
  accentSoft: 'rgba(0,0,0,0.06)',
  danger: '#D70015',
  success: '#141414',
  sans: SANS,
  serif: SERIF,
  display: SANS,
  radius: 16,
  // A hairline plus a whisper of shadow, so white cards read on the near-white canvas.
  shadow: '0 0 0 1px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
};

const pill = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, padding: '0 18px',
  borderRadius: 980, border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 14, fontWeight: 500,
  letterSpacing: 0, textTransform: 'none', whiteSpace: 'nowrap', transition: 'background .15s, opacity .15s',
};

export const S = {
  ...BRAND_S,
  label: { fontSize: 13, fontWeight: 600, color: T.soft, letterSpacing: 0, textTransform: 'none' },
  h2: { fontFamily: T.serif, fontWeight: 400, fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.01em', color: T.ink },
  it: { fontFamily: T.sans, fontWeight: 600 },
  // Primary action: black pill. Secondary: light gray pill.
  btnFill: { ...pill, background: T.accent, color: '#FFFFFF' },
  btnOutline: { ...pill, background: 'rgba(0,0,0,0.05)', color: T.ink },
  link: { fontSize: 14, fontWeight: 500, color: T.ink, textDecoration: 'underline', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 },
};
