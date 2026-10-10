export const PRODUCTS = [
  {
    id: 'babygirl',
    name: 'Babygirl',
    price: 28,
    size: '100ml / 3.4 fl.oz.',
    images: ['/images/si-babygirl-main.png'],
    category: 'body-mist',
    badge: 'Bestseller',
    tagline: 'milk · skin musk · marshmallow',
    description: 'Milk, skin musk, marshmallow. A scent from the cultural record, worn like a costume.',
    longDescription: 'The one everyone asks about. Babygirl is soft, milky, and a little too sweet on purpose — skin musk warmed by marshmallow and a splash of cream. It reads exactly like the character it borrows its name from: a little bit performance, a little bit comfort, entirely on purpose.',
    notes: {
      top: 'Milk · Cream accord',
      middle: 'Marshmallow · Soft musk',
      base: 'Skin musk · Warm sugar',
    },
    wear: 'Close-to-skin, all day',
    finish: 'Milky, sweet, a little bit much — in a good way',
  },
  {
    id: 'vanilla-body-powder',
    name: 'Fragrance Body Powder',
    price: 42,
    size: 'Powder jar + puff',
    images: ['/images/si-body-powder-main.png'],
    category: 'body-powder',
    badge: 'New',
    tagline: 'vanilla · milk · hinoki wood',
    description: 'Vanilla, milk, hinoki wood. A scent from the cultural record, pressed into powder.',
    longDescription: 'The soft-focus finish. A silky fragrance body powder that smells of warm vanilla and milk, grounded by the clean, quiet woodiness of hinoki. Pat it on with the puff for a just-out-of-the-bath glow that lingers close to skin — the scent of someone who always looks put-together.',
    notes: {
      top: 'Milk',
      middle: 'Vanilla',
      base: 'Hinoki wood',
    },
    wear: 'Soft, skin-close, all day',
    finish: 'Silky, powdery, quietly warm',
    ingredients: 'Talc-free powder base (corn starch, kaolin), fragrance (parfum), skin-conditioning agents.',
    howToUse: [
      ['Fresh out the shower', 'Pat onto clean, dry skin — that’s when the scent settles in best.'],
      ['Where you’d get kissed', 'Collarbones, décolletage, shoulders, the backs of the knees.'],
      ['Layer it', 'Dust over your favourite SMELLS — ICONIC mist to soften and extend the scent.'],
    ],
    benefits: [
      ['Internet-coded, not overdone', 'Built around a character everyone already knows — worn like a costume, not a cologne.'],
      ['Silky, soft-focus finish', 'A fine powder that leaves skin smooth with a subtle, velvety glow.'],
      ['Puff included', 'Comes with a plush SMELLS — ICONIC puff for an even, no-mess application.'],
      ['Made to layer', 'Pairs especially well with Babygirl for a full milky-vanilla moment.'],
      ['Vegan-friendly formula', 'Cruelty-free, made without animal-derived ingredients.'],
    ],
    faqs: [
      ['Will it mark clothing?', 'Pat in lightly and let it settle — a little goes a long way and it won’t cake onto fabric.'],
      ['Can I wear it with a body mist?', 'Yes — mist first, then dust the powder over the top to lock the scent in.'],
      ['Is it safe for sensitive skin?', 'Yes. The formula is gentle enough for daily use. Patch test if you’re unsure.'],
      ['Is it vegan and cruelty-free?', 'Yes — every SMELLS — ICONIC formula is vegan-friendly and never tested on animals.'],
      ['How do I apply it?', 'Press the puff into the powder, tap off the excess, and pat onto skin.'],
    ],
  },
];

// Off the site for now — move an entry back into PRODUCTS to relist it.
export const HIDDEN_PRODUCTS = [
  {
    id: 'pilates-princess',
    name: 'Pilates Princess',
    price: 28,
    size: '100ml / 3.4 fl.oz.',
    images: [
      '/images/si-pilates-princess-main.png',
      '/images/si-pilates-princess-alt.png',
      '/images/si-pilates-princess-matcha.png',
      '/images/si-pilates-princess-lifestyle.png',
      '/images/si-pilates-princess-lifestyle-2.jpg',
    ],
    category: 'body-mist',
    badge: '',
    tagline: 'matcha · lily · musk',
    description: 'Matcha, lily, musk. A scent from the cultural record, worn like a costume.',
    longDescription: 'Green juice, 6am reformer class, matching set. Pilates Princess opens with bittersweet matcha and cool lily, settling into a clean musk that reads more "wellness girl on the way to brunch" than actual gym. It is the scent of a routine you post about.',
    notes: {
      top: 'Matcha · Green tea leaf',
      middle: 'Lily · White petals',
      base: 'Clean musk',
    },
    wear: 'Close-to-skin, all day',
    finish: 'Crisp, green, effortlessly put-together',
  },
  {
    id: 'clean-rich',
    name: 'Clean Rich',
    price: 28,
    size: '100ml / 3.4 fl.oz.',
    images: ['/images/si-clean-rich-main.png'],
    category: 'body-mist',
    badge: 'New',
    tagline: 'bergamot · white tea · iris · musk',
    description: 'Bergamot, white tea, iris, musk. A scent from the cultural record, worn like a costume.',
    longDescription: 'Quiet luxury, but make it a body mist. Bergamot and white tea open bright and soaped-clean, iris and musk settle in soft and expensive-smelling. Clean Rich is the money that doesn’t shout — just lingers a little longer than everyone else’s.',
    notes: {
      top: 'Bergamot · White tea',
      middle: 'Iris',
      base: 'Soft musk',
    },
    wear: 'Close-to-skin, all day',
    finish: 'Soaped-clean, softly expensive',
  },
  {
    id: 'the-archive-trio',
    name: 'The Archive Trio',
    price: 72,
    size: '3 × 100ml',
    images: ['/images/si-archive-trio.svg'],
    category: 'set',
    badge: 'Save $12',
    tagline: 'babygirl · pilates princess · clean rich',
    description: 'All three characters, bundled and saved.',
    longDescription: 'Babygirl, Pilates Princess, and Clean Rich — the full archive in one set, so you’ve always got the right character for the day.',
    notes: null,
    wear: 'Three moods, one bag',
    finish: 'A scent for every era',
  },
];

// A checkout-only free-gift offer — deliberately not part of PRODUCTS so it
// never shows up in the shop grid or search; it's only ever added via the
// timed offer on the checkout page.
export const TASSEL_GIFT = {
  id: 'mini-spritz',
  name: 'Mini Spritz Keychain',
  price: 12,
  size: '10ml',
  images: ['/images/si-mini-spritz.svg'],
  category: 'gift',
};

export const getProductById = (id) => PRODUCTS.find((p) => p.id === id);
export const getProductsByCategory = (category) => PRODUCTS.filter((p) => p.category === category);
export const getFeaturedProducts = () => PRODUCTS.filter((p) => ['babygirl', 'vanilla-body-powder'].includes(p.id));
