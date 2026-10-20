import React from 'react';
import { T } from '../lib/theme';

// Thin reassurance strip above the nav on every storefront page: two
// columns with an icon each. Same icons as the checkout's reassurance row.
function ShipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7l9-4 9 4-9 4-9-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 7v10l9 4 9-4V7M12 11v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12a8 8 0 1 1 2.34 5.66" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 8v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function TopBanner() {
  return (
    <div className="top-banner" style={styles.bar}>
      <div className="top-banner-item" style={styles.item}><ShipIcon /><span>Ships in 1 Business Day</span></div>
      <div className="top-banner-item" style={styles.item}><ReturnIcon /><span>45-Day Money-Back Guarantee</span></div>
      <style jsx>{`
        @media (max-width: 680px) {
          .top-banner { gap: 12px !important; padding: 8px 12px !important; }
          .top-banner :global(.top-banner-item) { font-size: 10px !important; letter-spacing: 0.06em !important; gap: 6px !important; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  bar: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center',
    background: T.ink, color: T.white, padding: '9px 40px',
  },
  item: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontFamily: T.sans, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    textAlign: 'center', lineHeight: 1.3,
  },
};
