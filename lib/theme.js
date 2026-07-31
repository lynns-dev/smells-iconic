// The Sculpt Wand — design tokens: soft rose/blush, warm ivory, modern & trustworthy
export const T = {
  white: '#FFFDFB',
  paper: '#FBF0EC',
  blush: '#F4D9D2',
  rose: '#C97C74',
  roseDeep: '#B15F58',
  ink: '#3B2A2E',
  soft: '#8B7274',
  line: 'rgba(59,42,46,0.12)',
  dline: 'rgba(255,253,251,0.24)',
  maxw: '1280px',
  display: "'Cormorant Garamond', serif",
  sans: "'Inter', system-ui, sans-serif",
};

// Shared style fragments reused across pages
export const S = {
  label: {
    fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
    color: T.rose, fontWeight: 600,
  },
  h2: {
    fontFamily: T.sans, fontWeight: 600,
    fontSize: 'clamp(28px,3.4vw,42px)', lineHeight: 1.2, letterSpacing: '-0.01em',
    color: T.ink,
  },
  it: { fontFamily: T.display, fontWeight: 500, fontStyle: 'italic', color: T.roseDeep },
  btnFill: {
    display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 32px',
    background: T.roseDeep, color: T.white, border: 'none', cursor: 'pointer',
    fontFamily: T.sans, fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
    borderRadius: 999, boxShadow: '0 8px 20px rgba(177,95,88,0.28)',
    transition: 'transform .2s ease, box-shadow .2s ease',
  },
  btnOutline: {
    display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 32px',
    background: 'transparent', color: T.roseDeep, border: `1.5px solid ${T.roseDeep}`, cursor: 'pointer',
    fontFamily: T.sans, fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
    borderRadius: 999, transition: 'all .2s ease',
  },
  link: {
    fontSize: 13, fontWeight: 600, letterSpacing: '0.01em',
    borderBottom: `1.5px solid ${T.rose}`, paddingBottom: 3, cursor: 'pointer', color: T.ink,
  },
  wrap: { maxWidth: T.maxw, margin: '0 auto', padding: '0 32px' },
};
