import React from 'react';
import { T } from '../lib/theme';

const DEFAULT_MESSAGES = ['30-day money-back guarantee', 'Free shipping over $89'];

// Seamless scrolling marquee — repeats the message set 4x and animates
// exactly one set-width of translation so the loop point is invisible.
export default function Marquee({ messages = DEFAULT_MESSAGES }) {
  const loop = [...messages, ...messages, ...messages, ...messages];
  return (
    <div style={wrap}>
      <div className="marquee-track" style={track}>
        {loop.map((m, i) => (
          <span key={i} style={item}>
            {m}
            <span style={dot}>•</span>
          </span>
        ))}
      </div>
      <style jsx>{`
        .marquee-track { animation: si-marquee 24s linear infinite; }
        @keyframes si-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-25%); }
        }
      `}</style>
    </div>
  );
}

const wrap = { overflow: 'hidden', background: T.ink, borderTop: `1px solid ${T.dline}` };
const track = { display: 'flex', width: 'max-content', whiteSpace: 'nowrap', padding: '16px 0' };
const item = {
  display: 'inline-flex', alignItems: 'center', color: T.white, fontFamily: T.sans,
  fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '0 24px',
};
const dot = { marginLeft: 24, color: T.soft };
