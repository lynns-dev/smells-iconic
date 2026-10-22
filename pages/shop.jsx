import React from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import CartDrawer from '../components/CartDrawer';
import ProductVisual from '../components/ProductVisual';
import Marquee from '../components/Marquee';
import Footer from '../components/Footer';
import { PRODUCTS } from '../lib/products';
import { useCart } from '../lib/useCart';
import { useAllReviews } from '../lib/useReviews';
import { T, S } from '../lib/theme';

export default function ShopPage() {
  const c = useCart();
  const reviews = useAllReviews();
  return (
    <div>
      <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} />

      {/* BANNER */}
      <section style={banner}>
        <div style={{ ...S.wrap, position: 'relative', textAlign: 'center' }}>
          <p style={{ ...S.label, color: T.ink }}>The collection</p>
          <h1 style={{ ...S.h2, color: T.ink, fontSize: 'clamp(38px,5.6vw,64px)', marginTop: 14 }}>
            Shop the <span style={S.it}>archive.</span>
          </h1>
          <p style={{ color: T.ink, fontSize: 15, marginTop: 14, maxWidth: '46ch', marginLeft: 'auto', marginRight: 'auto' }}>
            A small, considered wardrobe of scent — body mists pulled from the cultural record, worn like a costume.
          </p>
        </div>
      </section>

      <section style={{ ...S.wrap, padding: '50px 0 64px' }}>
        <div className="shop-grid" style={grid}>
          {PRODUCTS.filter((p) => p.id !== 'the-archive-trio').map((p) => (
            <div key={p.id} style={card}>
              <Link href={`/product/${p.id}`} style={imgWrap}>
                {p.badge && <span style={badge}>{p.badge}</span>}
                <ProductVisual id={p.id} images={p.images} alt={p.name} width={120} />
              </Link>
              <div style={cardText}>
                <Link href={`/product/${p.id}`} style={{ fontFamily: T.display, fontWeight: 300, fontSize: 22 }}>{p.name}</Link>
                {reviews[p.id]?.count > 0 && (
                  <div style={ratingRow}>
                    <span style={{ letterSpacing: '1.5px', color: T.ink }}>{'★'.repeat(Math.round(reviews[p.id].average))}{'☆'.repeat(5 - Math.round(reviews[p.id].average))}</span>
                    {' '}{reviews[p.id].average.toFixed(1)} ({reviews[p.id].count})
                  </div>
                )}
                <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, margin: '8px 0 10px' }}>{p.tagline}</div>
                <div style={{ fontSize: 13, marginBottom: 14 }}>
                  ${p.price}
                  {p.originalPrice > p.price && <s style={{ color: T.soft, marginLeft: 6 }}>${p.originalPrice}</s>}
                  {' '}· {p.size}
                </div>
                <button style={{ ...S.btnFill, width: '100%', justifyContent: 'center' }} onClick={() => c.add(p)}>Add to cart</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Marquee />
      <Footer />

      <CartDrawer {...c} onClose={() => c.setOpen(false)} />

      <style jsx>{`
        .shop-grid { grid-template-columns: repeat(4, 1fr); }
        @media (max-width: 960px) {
          .shop-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .shop-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

// White banner, black text.
const banner = {
  position: 'relative', minHeight: 340, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#FFFFFF', borderBottom: `1px solid ${T.line}`,
};
const grid = { display: 'grid', gap: 40 };
const card = { textAlign: 'center' };
const badge = { position: 'absolute', top: 14, right: 14, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.ink, background: 'rgba(251,245,241,0.92)', padding: '6px 10px', zIndex: 1 };
const imgWrap = { position: 'relative', aspectRatio: '1/1', display: 'block', overflow: 'hidden', width: '100%' };
const cardText = { padding: '20px 6px 0' };
const ratingRow = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: T.soft, marginTop: 8, fontFamily: T.sans };
