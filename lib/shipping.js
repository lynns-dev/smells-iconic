// Shared standard shipping rate and free-shipping threshold.
export const SHIPPING_COST = 3;
export const FREE_SHIPPING_MIN = 50;

export function shippingFor(itemsTotal = 0) {
  return Number(itemsTotal) >= FREE_SHIPPING_MIN ? 0 : SHIPPING_COST;
}
