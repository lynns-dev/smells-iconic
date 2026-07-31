export const PRODUCTS = [
  {
    id: 'sculpt-wand',
    name: 'The Sculpt Wand',
    price: 89,
    size: '1 Sculpting Tool',
    images: [],
    category: 'tool',
    badge: 'Bestseller',
    tagline: 'Your 5-minute at-home ritual',
    description: 'A handheld sculpting tool designed to knead, glide, and massage — for smoother-looking, more confident skin, from the comfort of home.',
    longDescription: 'The Sculpt Wand is built for real routines: five minutes, warm skin, no appointment. Ergonomic rollers move with your hands to massage problem areas — thighs, hips, and stomach — helping skin look smoother and more toned with consistent use. No needles, no downtime, no clinic visit.',
    features: [
      { title: 'Deep-contour rollers', body: 'Dual sculpting heads glide and knead along the curve of your body for a targeted, spa-style massage.' },
      { title: 'Cordless & travel-ready', body: 'Rechargeable battery lasts weeks on a single charge — drop it in your bag, keep the ritual going anywhere.' },
      { title: 'Whisper-quiet motor', body: 'Three intensity settings, so your 5-minute wind-down stays exactly that — a wind-down.' },
      { title: 'Made for daily use', body: 'Lightweight, waterproof, and comfortable to hold — designed to actually fit into your evening, not fight it.' },
    ],
    wear: '5 minutes, most evenings',
    finish: 'Smoother-looking, firmer-feeling skin over time',
  },
  {
    id: 'sculpt-wand-duo',
    name: 'The Sculpt Wand + Contour Oil',
    price: 119,
    originalPrice: 138,
    size: 'Tool + 4oz Contour Oil',
    images: [],
    category: 'bundle',
    badge: 'Best Value',
    tagline: 'The full ritual, bundled and saved',
    description: 'The Sculpt Wand paired with our slip-enhancing Contour Oil, formulated to help the tool glide smoothly for a more comfortable massage.',
    longDescription: 'Everything you need to start your ritual tonight. The Sculpt Wand plus a bottle of our lightweight Contour Oil — formulated with shea and vitamin E to help the rollers glide smoothly and leave skin feeling soft, not sticky.',
    features: null,
    wear: '5 minutes, most evenings',
    finish: 'Smoother-looking, firmer-feeling skin over time',
  },
];

// A checkout-only gift-with-purchase offer — deliberately not part of
// PRODUCTS so it never shows up on the landing page; it's only ever added
// via the timed offer on the checkout page.
export const GIFT_WITH_PURCHASE = {
  id: 'travel-pouch',
  name: 'Sculpt Wand Travel Pouch',
  price: 15,
  size: 'One size',
  images: [],
  category: 'gift',
};

export const getProductById = (id) => PRODUCTS.find((p) => p.id === id);
export const getProductsByCategory = (category) => PRODUCTS.filter((p) => p.category === category);
export const getFeaturedProducts = () => PRODUCTS;
