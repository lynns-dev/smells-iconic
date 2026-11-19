import React from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import CartDrawer from '../components/CartDrawer';
import ProductVisual from '../components/ProductVisual';
import Marquee from '../components/Marquee';
import Footer from '../components/Footer';
import { ArchivedX, BringBackButton } from '../components/Archived';
import { PRODUCTS, archivedLast, BABYGIRL_PERFUME_ID, BABYGIRL_PRICE_TEST } from '../lib/products';
import { useCart } from '../lib/useCart';
import { useAllReviews } from '../lib/useReviews';
import { T, S } from '../lib/theme';

import { exposeExperiment, getVariant } from '../lib/experiments';

export default function ShopPage() {
  const c = useCart();
  const reviews = useAllReviews();
  const [mobileGrid, setMobileGrid] = React.useState('control');
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 560px)');
    const enroll = () => {
      if (!media.matches) return;
      setMobileGrid(getVariant('shop_mobile_grid_v1'));
      exposeExperiment('shop_mobile_grid_v1');
    };
    enroll(); media.addEventListener('change', enroll);
    return () => media.removeEventListener('change', enroll);
  }, []);
  React.useEffect(() => {
    if (c.perfumeVariant) exposeExperiment(BABYGIRL_PRICE_TEST);
  }, [c.perfumeVariant]);
  return (
    <div>
      <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} />

      {/* BANNER */}
      <section className="collection-intro" style={banner}>
        <div style={{ ...S.wrap, position: 'relative', textAlign: 'center' }}>
          <p style={{ ...S.label, color: T.ink }}>The collection</p>
          <h1 style={{ ...S.h2, color: T.ink, fontSize: 'clamp(38px,5.6vw,64px)', marginTop: 14 }}>
            Find your <span style={S.it}>scent.</span>
          </h1>
          <p style={{ color: T.ink, fontSize: 15, marginTop: 14, maxWidth: '46ch', marginLeft: 'auto', marginRight: 'auto' }}>
            Creamy, fruity, smoky or fresh. Find the one that feels like you.
          </p>
        </div>
      </section>

      <section className="collection-products" style={{ ...S.wrap, padding: '50px 0 64px' }}>
        <div className={`shop-grid ${mobileGrid === 'two_columns' ? 'two-columns' : ''}`} style={grid}>
          {archivedLast(PRODUCTS.filter((p) => p.id !== 'the-archive-trio' && (p.id !== BABYGIRL_PERFUME_ID || c.perfumeVariant)).map(c.resolveProduct)).map((p) => (
            <div key={p.id} className="collection-card" style={card}>
              <Link href={`/product/${p.id}`} className="collection-image" style={imgWrap}>
                {p.badge && !p.archived && <span className="collection-badge" style={badge}>{p.badge}</span>}
                <ProductVisual id={p.id} images={p.images} alt={p.name} width={120} framing="catalog" />
                {p.archived && <ArchivedX />}
              </Link>
              <div className="collection-card-text" style={cardText}>
                <Link className="collection-title" href={`/product/${p.id}`} style={{ fontFamily: T.display, fontWeight: 300, fontSize: 22 }}>{p.name}</Link>
                {reviews[p.id]?.count > 0 && (
                  <div style={ratingRow}>
                    <span style={{ letterSpacing: '1.5px', color: T.ink }}>{'★'.repeat(Math.round(reviews[p.id].average))}{'☆'.repeat(5 - Math.round(reviews[p.id].average))}</span>
                    {' '}{reviews[p.id].average.toFixed(1)} ({reviews[p.id].count})
                  </div>
                )}
                <div className="collection-notes" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, margin: '8px 0 10px' }}>{p.tagline}</div>
                <div style={{ fontSize: 13, marginBottom: 14 }}>
                  ${p.price}
                  {p.originalPrice > p.price && <s style={{ color: T.soft, marginLeft: 6 }}>${p.originalPrice}</s>}
                  {' '}· {p.size}
                </div>
                {p.archived
                  ? <BringBackButton product={p} />
                  : <button className="collection-add" style={{ ...S.btnFill, width: '100%', justifyContent: 'center' }} onClick={() => c.add(p)}>Add to cart</button>}
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
          .collection-intro { min-height: 150px !important; padding: 22px 0; }
          .collection-intro h1 { font-size: 34px !important; margin-top: 8px !important; }
          .collection-intro p { margin-top: 8px !important; }
          .collection-products { padding:20px 16px 48px !important; }
          .shop-grid { grid-template-columns: minmax(0,1fr); gap: 28px 12px !important; }
          .shop-grid.two-columns { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .two-columns :global(.collection-title) { font-size: 16px !important; line-height: 1.25; display:block; }
          .two-columns .collection-card-text { padding:12px 0 0 !important; }
          .two-columns .collection-badge { top:6px !important; right:6px !important; left:6px; font-size:8px !important; letter-spacing:0.04em !important; padding:5px !important; }
          .two-columns .collection-notes { font-size:9px !important; letter-spacing:0.05em !important; }
          .two-columns .collection-add { padding:12px 6px !important; font-size:10px !important; letter-spacing:0.08em !important; min-height:44px; }
          .two-columns .collection-card { min-width:0; }
          .two-columns .collection-card-text :global(button) { max-width:100%; white-space:normal; }

        }
      `}</style>
    </div>
  );
}

// White banner, black text.
const banner = {
  position: 'relative', minHeight: 190, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#FFFFFF', borderBottom: `1px solid ${T.line}`,
};
const grid = { display: 'grid', gap: 28 };
const card = { textAlign: 'center' };
const badge = { position: 'absolute', top: 14, right: 14, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.ink, background: 'rgba(251,245,241,0.92)', padding: '6px 10px', zIndex: 1 };
const imgWrap = { position: 'relative', aspectRatio: '1/1', display: 'block', overflow: 'hidden', width: '100%' };
const cardText = { padding: '20px 6px 0' };
const ratingRow = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: T.soft, marginTop: 8, fontFamily: T.sans };
