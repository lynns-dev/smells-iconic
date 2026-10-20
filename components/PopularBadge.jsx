// Green "popular" pill shown under item names in the cart drawer and at checkout.
export default function PopularBadge() {
  return <span style={popularBadge}>This item is popular with users!</span>;
}

const popularBadge = {
  display: 'inline-block', marginTop: 5, padding: '3px 8px', borderRadius: 999,
  background: '#E3F1E4', color: '#1F6B2E', fontSize: 11, fontWeight: 600, lineHeight: 1.3,
};
