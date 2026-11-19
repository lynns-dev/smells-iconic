// SMELLS — ICONIC design tokens — blush/cream, bold grotesk archive aesthetic
export const T = {
  white: '#FFFFFF',
  paper: '#FFFFFF',
  blush: '#E4CEC4',
  ink: '#15110D',
  soft: '#8F7C72',
  line: 'rgba(21,17,13,0.14)',
  dline: 'rgba(251,245,241,0.24)',
  maxw: '1400px',
  display: "'Archivo Black', sans-serif",
  sans: "'Inter', sans-serif",
};

// Shared style fragments reused across pages
export const S = {
  label: {
    fontSize: 10, letterSpacing: '0.32em', textTransform: 'uppercase',
    color: T.soft, fontWeight: 700,
  },
  h2: {
    fontFamily: T.sans, fontWeight: 400,
    fontSize: 'clamp(28px,3.4vw,44px)', lineHeight: 1.15, letterSpacing: '-0.005em',
    color: T.ink,
  },
  it: { fontFamily: T.display, fontWeight: 400 },
  btnFill: {
    display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 30px',
    background: T.ink, color: T.white, border: 'none', cursor: 'pointer',
    fontFamily: T.sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
  },
  btnOutline: {
    display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 30px',
    background: 'transparent', color: T.ink, border: `1px solid ${T.ink}`, cursor: 'pointer',
    fontFamily: T.sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
    transition: 'all .2s',
  },
  link: {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
    borderBottom: `1px solid ${T.ink}`, paddingBottom: 5, cursor: 'pointer',
  },
  wrap: { maxWidth: T.maxw, margin: '0 auto', padding: '0 40px' },
};
