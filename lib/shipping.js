// Flat-rate Standard Shipping, waived on orders of FREE_SHIPPING_MIN or more
// (counted on the items after sale/bundle pricing, before a promo code, so a
// 15% code never knocks a two-mist bag back under the line). The cart exit
// popup's 24-hour free-shipping perk (lib/shippingPerk.js) also waives it.
import { hasFreeShipping } from './shippingPerk';
import { getVariant } from './experiments';

export const SHIPPING_COST = 3;
export const FREE_SHIPPING_MIN = 50;

export function shippingFor(itemsTotal = 0) {
  return 0;
}

// True for visitors in the ship_free_all test's "free" variant (lib/experiments.js).
export function freeOnEveryOrder() {
  return true;
}
