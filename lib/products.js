export const PRODUCTS = [
  {
    id: 'babygirl',
    name: 'Babygirl Body Mist',
    price: 28,
    size: '100ml / 3.4 fl.oz.',
    images: ['/images/si-babygirl-main.png', '/images/si-babygirl-2.webp', '/images/si-babygirl-3.webp'],
    category: 'body-mist',
    badge: 'Going fast!',
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
    id: 'ginger-creme',
    name: 'Ginger Crème Body Mist',
    price: 28,
    size: '100ml / 3.4 fl.oz.',
    images: ['/images/si-ginger-creme-main.png'],
    category: 'body-mist',
    badge: 'New',
    tagline: 'ginger · orange blossom · vanilla · sandalwood',
    description: 'Ginger, bergamot, orange blossom, vanilla, sandalwood, skin musk. A scent from the cultural record, worn like a costume.',
    longDescription: 'Candied ginger dusted in sugar, softened with cream. Ginger Crème opens bright and a little spicy with ginger and bergamot, warms through orange blossom, and settles into vanilla, sandalwood and skin musk. Cosy, glowy, and a little bit golden — the scent of a sweater you never give back.',
    notes: {
      top: 'Ginger · Bergamot',
      middle: 'Orange blossom',
      base: 'Vanilla · Sandalwood · Skin musk',
    },
    wear: 'Close-to-skin, all day',
    finish: 'Warm, creamy, softly spiced',
  },
  {
    id: 'cherry-afterglow',
    name: 'Cherry Afterglow Body Mist',
    price: 28,
    size: '100ml / 3.4 fl.oz.',
    images: ['/images/si-cherry-afterglow-main.png'],
    category: 'body-mist',
    badge: 'New',
    tagline: 'black cherry · almond · tonka bean',
    description: 'Black cherry, almond, tonka bean. A scent from the cultural record, worn like a costume.',
    longDescription: 'Glossy lips, a cherry stem, the night still going. Cherry Afterglow is dark, juicy black cherry rounded out with sweet almond and the warm, gourmand hum of tonka bean. It is the scent of the after-party, not the party — a little flirty, a little sticky-sweet, impossible to forget.',
    notes: {
      top: 'Black cherry',
      middle: 'Almond',
      base: 'Tonka bean',
    },
    wear: 'Close-to-skin, all day',
    finish: 'Juicy, sweet, a little dangerous',
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
  {
    // The upsell on every other product page and in the cart
    // (UPSELL_ID below). No size or ingredient list yet — add `size`
    // details and `ingredients` here once confirmed (the Ingredients
    // section is hidden while it's null).
    id: 'babygirl-solid-perfume',
    name: 'Babygirl Solid Perfume',
    price: 25,
    size: 'Solid perfume · gold compact',
    images: ['/images/si-babygirl-solid-perfume.webp'],
    category: 'solid-perfume',
    badge: 'New',
    tagline: 'milk · skin musk · marshmallow',
    description: 'Babygirl, pressed into a pocket-sized solid perfume. Milk, skin musk, marshmallow — in a gold compact made to live in your bag.',
    longDescription: 'The one everyone asks about, now in your pocket. Babygirl Solid Perfume is the same soft, milky scent — skin musk warmed by marshmallow and a splash of cream — pressed into a balm that melts on contact. Swipe it on wrists and neck between mists, touch up on the go, and never be caught without your signature.',
    notes: {
      top: 'Milk · Cream accord',
      middle: 'Marshmallow · Soft musk',
      base: 'Skin musk · Warm sugar',
    },
    wear: 'Close-to-skin, touch up anytime',
    finish: 'Soft, milky, melts into skin',
    ingredients: null,
    howToUse: [
      ['Warm it up', 'Glide a fingertip across the balm — it melts on contact.'],
      ['Where your pulse is', 'Wrists, behind the ears, base of the throat, inner elbows.'],
      ['Layer it', 'Dab over Babygirl Body Mist to lock the scent in and make it last.'],
    ],
    benefits: [
      ['Babygirl, on the go', 'The same milky, marshmallow-soft scent as the body mist — sized for your bag.'],
      ['No spray, no spill', 'A solid balm in a gold compact. Nothing to leak in your bag, nothing to pack in your liquids.'],
      ['Made to layer', 'Swipe it over the body mist to deepen the scent and help it last longer.'],
      ['Touch-up friendly', 'A quick swipe between meetings, before dinner, after the gym.'],
      ['Vegan-friendly formula', 'Cruelty-free, made without animal-derived ingredients.'],
    ],
    faqs: [
      ['How is it different from the body mist?', 'Same Babygirl scent, different format: a solid balm you dab on, made for touch-ups and travel.'],
      ['Can I wear it with the body mist?', 'Yes — mist first, then swipe the solid perfume on your pulse points to lock it in.'],
      ['Can I take it on a plane?', 'Yes — it’s a solid, so it doesn’t go in your liquids bag.'],
      ['Is it vegan and cruelty-free?', 'Yes — every SMELLS — ICONIC formula is vegan-friendly and never tested on animals.'],
      ['How do I apply it?', 'Rub a fingertip over the balm and press it onto your pulse points.'],
    ],
  },
  {
    // All three current body mists. originalPrice is the three bought
    // separately (3 × $28); price is $12 off that. The cart and checkout
    // show the difference as a discount line.
    id: 'current-drops-set',
    name: 'The Current Drops Set',
    price: 72,
    originalPrice: 84,
    size: '3 × 100ml / 3.4 fl.oz.',
    images: ['/images/si-current-drops-set.png'],
    category: 'set',
    badge: 'Save $12',
    tagline: 'babygirl · ginger crème · cherry afterglow',
    description: 'All three current drops — Babygirl, Ginger Crème and Cherry Afterglow — in one set, $12 less than buying them separately.',
    longDescription: 'Every character from the current drop, together: milky, marshmallow-soft Babygirl, warm and golden Ginger Crème, and dark, juicy Cherry Afterglow. Three full-size body mists, one for every mood — for $12 less than buying them one by one.',
    notes: {
      'Babygirl': 'Milk · Marshmallow · Skin musk',
      'Ginger Crème': 'Ginger · Orange blossom · Vanilla · Sandalwood',
      'Cherry Afterglow': 'Black cherry · Almond · Tonka bean',
    },
    wear: 'Three moods, one bag',
    finish: 'A scent for every era',
  },
];

// Off the site for now — move an entry back into PRODUCTS to relist it.
export const HIDDEN_PRODUCTS = [
  {
    id: 'pilates-princess',
    name: 'Pilates Princess Body Mist',
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
    name: 'Clean Rich Body Mist',
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
// Offered on every other product page and in the cart (pages/product/[id].jsx,
// components/CartDrawer.jsx). Added from one of those upsell buttons, it's
// UPSELL_PRICE instead of its own price for as long as the cart has at
// least one other item — lib/useCart.js priceCart().
export const UPSELL_ID = 'babygirl-solid-perfume';
export const UPSELL_PRICE = 19;
export const getProductsByCategory = (category) => PRODUCTS.filter((p) => p.category === category);
// Homepage product row, in this order. Cherry Afterglow is in the set, so
// it's left to the shop page.
export const getFeaturedProducts = () => ['babygirl', 'ginger-creme', 'current-drops-set', 'vanilla-body-powder'].map(getProductById).filter(Boolean);
