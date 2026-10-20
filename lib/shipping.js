// Flat-rate Standard Shipping, charged on every order. The cart exit
// popup's 24-hour free-shipping perk (lib/shippingPerk.js) waives it.
import { hasFreeShipping } from './shippingPerk';

export const SHIPPING_COST = 3;

export function shippingFor() {
  return hasFreeShipping() ? 0 : SHIPPING_COST;
}
