// Only this owner-approved return is automatic. Counts never decrease.
export const RETURN_PRODUCT = 'ginger-creme';
export const RETURN_VOTES = 50;
export function withBringBackAvailability(product, count = 0) {
  if (product?.id !== RETURN_PRODUCT || Number(count) < RETURN_VOTES) return product;
  return {...product, archived:false, broughtBack:true, badge:'Back by popular demand'};
}
