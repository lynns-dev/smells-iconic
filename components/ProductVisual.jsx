import React from 'react';

const fillStyle = { width: '100%', height: '100%', display: 'block', objectFit: 'cover', transition: 'opacity 0.6s ease' };

// Renders real product photography when available, falling back to a soft
// CSS/SVG stand-in for the sculpting tool when no photo has been supplied
// yet. Accepts an `images` array; when a second image exists, swaps to it
// on hover (used on collection/grid cards).
export default function ProductVisual({ id = 'sculpt-wand', width = 150, images, alt }) {
  const [showSecond, setShowSecond] = React.useState(false);
  const [image, image2] = images || [];

  if (image) {
    return (
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onMouseEnter={() => image2 && setShowSecond(true)}
        onMouseLeave={() => image2 && setShowSecond(false)}
      >
        <img src={image} alt={alt || id} style={{ ...fillStyle, opacity: showSecond ? 0 : 1 }} />
        {image2 && (
          <img
            src={image2}
            alt={alt || id}
            style={{ ...fillStyle, position: 'absolute', top: 0, left: 0, opacity: showSecond ? 1 : 0 }}
          />
        )}
      </div>
    );
  }

  if (id === 'travel-pouch') {
    return (
      <svg width={width} viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="40" y="70" width="140" height="120" rx="18" fill="#FBF0EC" stroke="#B15F58" strokeWidth="2" />
        <path d="M70 70 v-14 a40 40 0 0 1 80 0 v14" fill="none" stroke="#B15F58" strokeWidth="2" />
        <circle cx="110" cy="130" r="4" fill="#B15F58" />
      </svg>
    );
  }

  // Generic sculpting-wand silhouette placeholder.
  return (
    <svg width={width} viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
      style={{ filter: 'drop-shadow(0 18px 30px rgba(59,42,46,.14))' }}>
      <rect x="70" y="0" width="240" height="240" rx="30" fill="#FBF0EC" transform="rotate(35 70 0)" opacity="0" />
      <g transform="translate(120 150) rotate(-30)">
        <rect x="-96" y="-26" width="192" height="52" rx="26" fill="#F4D9D2" stroke="#B15F58" strokeWidth="2" />
        <circle cx="-60" cy="0" r="30" fill="#FFFDFB" stroke="#B15F58" strokeWidth="2" />
        <circle cx="60" cy="0" r="30" fill="#FFFDFB" stroke="#B15F58" strokeWidth="2" />
        <rect x="-14" y="-8" width="28" height="16" rx="8" fill="#B15F58" />
      </g>
    </svg>
  );
}
