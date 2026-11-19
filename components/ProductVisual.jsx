import React from 'react';

const fillStyle = { width: '100%', height: '100%', display: 'block', objectFit: 'cover', transition: 'opacity 0.6s ease' };

// Renders real product photography when available, falling back to a CSS/SVG
// stand-in bottle for products without one.
// Accepts an `images` array; when a second image exists, swaps to it on
// hover (used on collection/grid cards, not the single-image PDP gallery,
// which reads the full array itself for its thumbnail strip).
export default function ProductVisual({ id = 'babygirl', width = 150, images, alt, framing }) {
  const [showSecond, setShowSecond] = React.useState(false);
  const [image, image2] = images || [];
  const catalogStyle = framing === 'catalog' ? {objectFit:'contain',padding:0,boxSizing:'border-box',background:'#f5efea'} : {};

  if (image) {
    return (
      <div
        style={{ position: 'relative', width: '100%', height: '100%', background: framing === 'catalog' ? '#f5efea' : undefined }}
        onMouseEnter={() => image2 && setShowSecond(true)}
        onMouseLeave={() => image2 && setShowSecond(false)}
      >
        <img src={image} alt={alt || id} style={{ ...fillStyle, ...catalogStyle, opacity: showSecond ? 0 : 1 }} />
        {image2 && (
          <img
            src={image2}
            alt={alt || id}
            style={{ ...fillStyle, ...catalogStyle, objectFit:'cover', padding:0, position: 'absolute', top: 0, left: 0, opacity: showSecond ? 1 : 0 }}
          />
        )}
      </div>
    );
  }
  if (id === 'puff') {
    return (
      <svg width={width} viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="110" cy="110" r="82" fill="none" stroke="#15110D" strokeWidth="2" />
        <path d="M110 108 q-30 -18 -40 6 q-4 16 16 12 q16 -4 24 -18Z" fill="none" stroke="#15110D" strokeWidth="1.6" />
        <path d="M110 108 q30 -18 40 6 q4 16 -16 12 q-16 -4 -24 -18Z" fill="none" stroke="#15110D" strokeWidth="1.6" />
      </svg>
    );
  }
  const label = (id || 'smells iconic').replace(/-/g, ' ').toUpperCase();
  return (
    <svg width={width} viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      style={{ filter: 'drop-shadow(0 22px 34px rgba(21,17,13,.12))' }}>
      <rect x="42" y="78" width="156" height="196" rx="8" fill="none" stroke="#15110D" strokeWidth="2" />
      <rect x="42" y="52" width="156" height="46" rx="10" fill="none" stroke="#15110D" strokeWidth="2" />
      <ellipse cx="120" cy="52" rx="78" ry="12" fill="none" stroke="#15110D" strokeWidth="2" />
      <rect x="66" y="122" width="108" height="124" rx="1" fill="#F1E4DC" />
      <text x="120" y="188" textAnchor="middle" fontFamily="Archivo Black, sans-serif" fontSize={13} letterSpacing="1" fill="#15110D">{label}</text>
    </svg>
  );
}
