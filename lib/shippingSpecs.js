// What Easyship needs to know about each product to create a shipment
// (lib/easyship.js): its packed weight and size, and its customs code.
//
// SPECS — fill in per product id (lib/products.js): weight in kilograms,
// size in centimetres, each as packed for shipping. Until a product has
// one, orders containing it aren't sent to Easyship; they show "add the
// shipping weight and size for …" in admin instead. (1 oz = 0.0283 kg,
// 1 lb = 0.4536 kg, 1 in = 2.54 cm.)
export const SPECS = {
  // 'babygirl': { weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0 },
};

// Harmonized System codes by product category: 3303.00 perfumes and body
// mists (the Mini Spritz gift is one too), 3304.91 powders. Easyship needs a
// category or an HS code per item; the HS code is the standard one and
// needs no Easyship lookup.
const HS_BY_CATEGORY = {
  'body-mist': '330300', 'solid-perfume': '330300', set: '330300',
  'body-powder': '330491', gift: '330300',
};

export function hsCodeFor(product) {
  return HS_BY_CATEGORY[product?.category] || '330300';
}
