import React from 'react';
import Link from 'next/link';
import Header from '../components/Header';
import CartDrawer from '../components/CartDrawer';
import ProductVisual from '../components/ProductVisual';
import Marquee from '../components/Marquee';
import Footer from '../components/Footer';
import { ArchivedX, BringBackButton } from '../components/Archived';
import { PRODUCTS, archivedLast, getFeaturedProducts, getProductById } from '../lib/products';
import { useCart } from '../lib/useCart';
import { useAllReviews } from '../lib/useReviews';
import { T, S } from '../lib/theme';
import { activePromo } from '../lib/promos';

const DEFAULT_MESSAGES = ['15% off with code ICONIC15'];

export default function HomePage() {
  const c = useCart();
  // Newsletter signup → the store's contact list (admin → Subscribers).
  const [newsEmail, setNewsEmail] = React.useState('');
  const [newsBusy, setNewsBusy] = React.useState(false);
  const [newsDone, setNewsDone] = React.useState(false);
  const handleNewsletter = async (e) => {
    e.preventDefault();
    if (!newsEmail.trim()) return;
    setNewsBusy(true);
    try {
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsEmail, consent: true, source: 'newsletter' }),
      });
    } catch {
      // still thank them; nothing they can do differently
    }
    setNewsBusy(false);
    setNewsDone(true);
  };

  const featured = getFeaturedProducts();
  const heroProduct = getProductById('daddy-is-a-state-of-mind');
  const babygirl = getProductById('babygirl');
  const reviewsByProduct = useAllReviews();
  const siteReviews = React.useMemo(() => {
    const all = Object.values(reviewsByProduct).flatMap((r) => r.reviews || []);
    const count = all.length;
    const average = count === 0 ? 0 : Math.round((all.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;
    const recommendPct = count === 0 ? 0 : Math.round((all.filter((r) => r.rating >= 4).length / count) * 100);
    return { all, count, average, recommendPct };
  }, [reviewsByProduct]);
  const [bannerIndex, setBannerIndex] = React.useState(0);
  // While a holiday sale is running (lib/promos.js) the bar shows only the
  // sale, so a smaller code never sits next to it. Checked after mount since
  // this page is statically built.
  const [promo, setPromo] = React.useState(null);
  React.useEffect(() => { setPromo(activePromo()); setBannerIndex(0); }, []);
  const bannerMessages = promo ? [promo.banner] : DEFAULT_MESSAGES;

  React.useEffect(() => {
    const id = setInterval(() => {
      setBannerIndex((i) => (i + 1) % bannerMessages.length);
    }, 3500);
    return () => clearInterval(id);
  }, [bannerMessages.length]);

  return (
    <div>
      <div style={announce}>
        <div
          style={{
            display: 'flex',
            width: `${bannerMessages.length * 100}%`,
            transform: `translateX(-${(100 / bannerMessages.length) * bannerIndex}%)`,
            transition: 'transform 0.6s ease',
          }}
        >
          {bannerMessages.map((msg, i) => (
            <span key={i} style={{ width: `${100 / bannerMessages.length}%` }}>{msg}</span>
          ))}
        </div>
      </div>
      <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} />
      {/* HERO */}
      <section style={heroWrap}>
        <div className="hero-grid" style={heroBg}>
          <div className="hero-text" style={heroContent}>
            <div>
              <span style={{ ...S.label, display: 'block', marginBottom: 26, color: T.ink }}>New · Body mist · Scent 04</span>
              <h1 style={heroH1}>Daddy is a <span style={S.it}>state of mind.</span></h1>
              <p style={heroSub}>Saffron, tobacco, burnt vanilla. Made in small batches — when this batch sells out, it&rsquo;s gone.</p>
              {siteReviews.count > 0 && (
                <div style={hrate}>
                  <span style={{ letterSpacing: '2px', color: T.ink }}>{'★'.repeat(Math.round(siteReviews.average))}{'☆'.repeat(5 - Math.round(siteReviews.average))}</span>
                  {' '}{siteReviews.average.toFixed(1)} · {siteReviews.count} review{siteReviews.count === 1 ? '' : 's'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* The hero photos are Daddy Is a State of Mind, so the button goes there. */}
                {heroProduct && <Link href={`/product/${heroProduct.id}`} style={heroBtn}>Shop — ${heroProduct.price}</Link>}
                <a href="#notes" style={heroLink}>The scents</a>
              </div>
            </div>
          </div>
          <div className="hero-img" style={heroImgs}>
            <div style={{ ...heroImg, backgroundImage: 'url(/images/si-daddy-hero-spray.webp)' }} role="img" aria-label="Spraying Daddy Is a State of Mind Body Mist on the neck" />
            <div style={{ ...heroImg, backgroundImage: 'url(/images/si-daddy-hero-glove.webp)' }} role="img" aria-label="A black leather glove over the eyes" />
          </div>
        </div>
      </section>

      {/* COLLECTION */}
      <section id="shop" style={band}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={S.label}>The archive</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Every character, <span style={S.it}>one closet.</span></h2>
          <div className="col-grid" style={colGrid}>
            {featured.map((p) => (
              <div key={p.id} className="col-item" style={pcard}>
                <Link href={`/product/${p.id}`} style={pimg}>
                  {p.badge && !p.archived && <span style={badge}>{p.badge}</span>}
                  <ProductVisual id={p.id} images={p.images} alt={p.name} width={104} />
                  {p.archived && <ArchivedX />}
                </Link>
                <div style={pcardText}>
                  <Link href={`/product/${p.id}`} style={{ fontFamily: T.display, fontWeight: 400, fontSize: 21 }}>{p.name}</Link>
                  <div style={pnotes}>{p.tagline}</div>
                  <div style={{ fontSize: 13 }}>
                    ${p.price}
                    {p.originalPrice > p.price && <s style={{ color: T.soft, marginLeft: 6 }}>${p.originalPrice}</s>}
                    {' '}· {p.size}
                  </div>
                  {p.archived
                    ? <BringBackButton product={p} style={{ marginTop: 18 }} />
                    : <button style={{ ...S.btnFill, width: '100%', justifyContent: 'center', marginTop: 18 }} onClick={() => c.add(p)}>Add to cart</button>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40 }}><Link href="/shop" style={S.link}>View all</Link></div>
        </div>
      </section>

      {/* SPOTLIGHT — BABYGIRL */}
      {babygirl && (
        <section style={{ ...band, borderTop: `1px solid ${T.line}` }}>
          <div className="new-scent-grid" style={newScentGrid}>
            <div style={newScentImg}>
              <ProductVisual id={babygirl.id} images={babygirl.images} alt={babygirl.name} width={320} />
            </div>
            <div>
              <p style={S.label}>No. 01 — the reference</p>
              <h2 style={{ ...S.h2, marginTop: 12, textAlign: 'left' }}>Babygirl <span style={S.it}>is the moment.</span></h2>
              <p style={{ color: T.soft, fontSize: 15, margin: '18px 0 26px', maxWidth: '42ch' }}>{babygirl.description}</p>
              <Link href={`/product/${babygirl.id}`} style={S.btnFill}>Shop Babygirl</Link>
            </div>
          </div>
        </section>
      )}

      {/* HONEST MATH */}
      <section style={{ ...band, background: T.paper, borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={S.label}>The honest math</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Smells iconic. <span style={S.it}>Costs like a snack.</span></h2>
          <div className="hm-grid" style={{ display: 'grid', marginTop: 46, border: `1px solid ${T.line}`, textAlign: 'left' }}>
            <div className="hm-cell" style={vcell}>
              <div style={vtag}>Designer fragrance</div>
              <div style={vbig}>$150–300</div>
              <ul style={vlist}>
                {['One bottle', 'Smells like everyone else’s TikTok', 'Gone by lunch', 'Sits heavy on the skin'].map((x, i) => (
                  <li key={i} style={{ ...vli, borderTop: i === 0 ? 'none' : `1px solid ${T.line}` }}>{x}</li>
                ))}
              </ul>
            </div>
            <div className="hm-cell" style={{ ...vcell, background: T.ink, color: T.white }}>
              <div style={{ ...vtag, color: 'rgba(251,245,241,0.6)' }}>One SMELLS — ICONIC mist</div>
              <div style={{ ...vbig, color: T.white }}>${babygirl.price}</div>
              <ul style={vlist}>
                {['A character, not a cologne', 'Internet-coded, not overdone', 'It’s a mist — reapply anywhere', 'Milky, spiced, or cherry-sweet — your era'].map((x, i) => (
                  <li key={i} style={{ ...vli, color: 'rgba(251,245,241,0.78)', borderTop: i === 0 ? 'none' : `1px solid ${T.dline}` }}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" style={{ ...band, background: T.paper, borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={S.label}>The verdict</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Worn once, <span style={S.it}>worn forever.</span></h2>
          {siteReviews.count === 0 ? (
            <p style={{ color: T.soft, fontSize: 14, marginTop: 42 }}>No reviews yet — be the first to share yours on any product page.</p>
          ) : (
            <>
              <div style={{ marginTop: 42 }}>
                <div style={{ fontFamily: T.display, fontWeight: 400, fontSize: 56, lineHeight: 1 }}>{siteReviews.average.toFixed(1)}</div>
                <div style={{ color: T.ink, letterSpacing: '3px', fontSize: 14, margin: '6px 0 4px' }}>{'★'.repeat(Math.round(siteReviews.average))}{'☆'.repeat(5 - Math.round(siteReviews.average))}</div>
                <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.soft }}>{siteReviews.count} review{siteReviews.count === 1 ? '' : 's'} · {siteReviews.recommendPct}% recommend</div>
              </div>
              <div className="rev-grid" style={revGrid}>
                {siteReviews.all.slice().reverse().slice(0, 3).map((r) => (
                  <div key={r.id} className="rev-item" style={rev}>
                    <div style={{ color: T.ink, letterSpacing: '1.5px', fontSize: 12, marginBottom: 14 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                    <p style={{ fontFamily: T.display, fontWeight: 400, fontSize: 17, lineHeight: 1.4, marginBottom: 16 }}>“{r.text}”</p>
                    <cite style={{ fontStyle: 'normal', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.soft }}>{r.author}</cite>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* THE FORMULA */}
      <section id="notes" style={{ ...band, background: T.ink, color: T.white, textAlign: 'center' }}>
        <div style={S.wrap}>
          <p style={{ ...S.label, color: 'rgba(251,245,241,0.6)' }}>The formula</p>
          <h2 style={{ ...S.h2, color: T.white, marginTop: 12 }}>Every mood, <span style={S.it}>one archive.</span></h2>
          <div className="notes-grid" style={ncols}>
            {archivedLast(PRODUCTS.filter((p) => p.category !== 'set')).map((p) => (
              <div key={p.id} className="notes-item" style={ncol}>
                <div style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(251,245,241,0.55)', marginBottom: 14 }}>{p.name}</div>
                <div style={{ fontFamily: T.display, fontWeight: 400, fontSize: 18, lineHeight: 1.5, textTransform: 'capitalize' }}>{p.tagline}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RITUAL */}
      <section style={band}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={S.label}>The ritual</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Three soft motions.</h2>
          <div className="rit-grid" style={ritGrid}>
            {[['i', 'Fresh out the shower', 'Mist onto clean, warm skin — that’s when it holds longest.'],
              ['ii', 'Where you’d get kissed', 'Collarbones, neck, wrists, the backs of the knees.'],
              ['iii', 'Reapply whenever', 'It’s a mist, not a perfume — spray as often as the moment calls for it.']].map(([n, h, p], i) => (
              <div key={i}>
                <div style={{ fontFamily: T.display, fontWeight: 400, fontSize: 24 }}>{n}</div>
                <h4 style={{ fontFamily: T.display, fontWeight: 400, fontSize: 19, margin: '12px 0 6px' }}>{h}</h4>
                <p style={{ fontSize: 13, color: T.soft, maxWidth: '30ch', margin: '0 auto' }}>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section style={{ ...band, textAlign: 'center', borderTop: `1px solid ${T.line}` }}>
        <p style={S.label}>The list</p>
        <h2 style={{ ...S.h2, marginTop: 12 }}>Get access <span style={S.it}>before it drops.</span></h2>
        <p style={{ color: T.soft, fontSize: 15, margin: '16px auto 28px', maxWidth: '40ch' }}>Get first access to new drops before they sell out, plus 15% off your first mist.</p>
        {newsDone ? (
          <p style={{ fontSize: 15, color: T.ink }}>You're on the list — use code <strong>ICONIC15</strong> for 15% off.</p>
        ) : (
          <form style={newsForm} onSubmit={handleNewsletter}>
            <input type="email" required placeholder="Email address" aria-label="email" style={newsInput} value={newsEmail} onChange={(e) => setNewsEmail(e.target.value)} />
            <button type="submit" disabled={newsBusy} style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans, opacity: newsBusy ? 0.5 : 1 }}>Subscribe</button>
          </form>
        )}
      </section>

      <Marquee />
      <Footer />

      <CartDrawer {...c} onClose={() => c.setOpen(false)} />

      <style jsx>{`
        .hero-grid { grid-template-columns: minmax(0, 42fr) minmax(0, 58fr); height: 82vh; min-height: 560px; }
        .hero-text { padding: 0 40px 72px; }
        .hm-grid { grid-template-columns: 1fr 1fr; }
        .hm-cell + .hm-cell { border-left: 1px solid ${T.line}; }
        .col-grid { grid-template-columns: repeat(4, 1fr); }
        .new-scent-grid { grid-template-columns: 1fr 1fr; }
        .rev-grid { grid-template-columns: repeat(3, 1fr); }
        .rev-item:nth-child(n + 2) { border-left: 1px solid ${T.line}; }
        .notes-grid { grid-template-columns: repeat(4, 1fr); }
        .notes-item:nth-child(n + 2) { border-left: 1px solid ${T.dline}; }
        .rit-grid { grid-template-columns: repeat(3, 1fr); }

        @media (max-width: 960px) {
          .hero-grid { grid-template-columns: 1fr; height: auto; min-height: 0; }
          .hero-img { order: -1; aspect-ratio: 2174 / 1449; }
          .hero-text { padding: 40px 24px 48px; }
          .col-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 680px) {
          .hm-grid { grid-template-columns: 1fr; }
          .hm-cell + .hm-cell { border-left: none; border-top: 1px solid ${T.line}; }
          .col-grid { grid-template-columns: 1fr; }
          .new-scent-grid { grid-template-columns: 1fr; gap: 34px; }
          .rev-grid { grid-template-columns: 1fr; }
          .rev-item { border-left: none; }
          .rev-item:nth-child(n + 2) { border-left: none; border-top: 1px solid ${T.line}; }
          .notes-grid { grid-template-columns: 1fr; }
          .notes-item { border-left: none; }
          .notes-item:nth-child(n + 2) { border-left: none; border-top: 1px solid ${T.dline}; }
          .rit-grid { grid-template-columns: 1fr; gap: 34px; }
        }
      `}</style>
    </div>
  );
}

const announce = { textAlign: 'center', fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: T.white, background: T.ink, padding: '14px 20px', borderBottom: `1px solid ${T.dline}`, overflow: 'hidden' };
const heroWrap = { position: 'relative' };
// Split hero: copy on a white panel, two photos side by side next to it
// (stacked above it on small screens). Text is never laid over the photos.
const heroBg = { position: 'relative', display: 'grid', background: T.white, borderBottom: `1px solid ${T.line}` };
const heroImgs = { display: 'grid', gridTemplateColumns: '1fr 1fr' };
const heroImg = { backgroundSize: 'cover', backgroundPosition: 'center 30%' };
const heroContent = { display: 'flex', alignItems: 'flex-end', color: T.ink };
const heroH1 = { fontFamily: T.display, fontWeight: 400, fontSize: 'clamp(34px,3.6vw,60px)', lineHeight: 1.05, marginBottom: 22, color: T.ink, maxWidth: '17ch' };
const heroSub = { fontSize: 16, color: T.ink, maxWidth: '38ch', marginBottom: 26 };
const hrate = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: T.ink, marginBottom: 30 };
const heroBtn = S.btnFill;
const heroLink = S.link;
const band = { padding: '64px 0' };
const vcell = { padding: '46px 44px' };
const vtag = { fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.soft, marginBottom: 18 };
const vbig = { fontFamily: T.display, fontWeight: 400, fontSize: 42, lineHeight: 1, marginBottom: 18 };
const vlist = { listStyle: 'none', fontSize: 14, color: T.soft };
const vli = { padding: '8px 0' };
const colGrid = { display: 'grid', margin: '50px auto 0', gap: 24 };
const newScentGrid = { ...S.wrap, display: 'grid', gap: 60, alignItems: 'center' };
const newScentImg = { aspectRatio: '4/5', overflow: 'hidden', border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper };
const pcard = { textAlign: 'center' };
const badge = { position: 'absolute', top: 14, left: 14, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.soft, background: 'rgba(251,245,241,0.9)', padding: '4px 8px', zIndex: 1 };
const pimg = { position: 'relative', aspectRatio: '1/1', display: 'block', overflow: 'hidden', width: '100%' };
const pcardText = { padding: '20px 30px 40px' };
const pnotes = { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, margin: '8px 0 6px' };
const revGrid = { display: 'grid', border: `1px solid ${T.line}`, marginTop: 48 };
const rev = { padding: '34px 30px', textAlign: 'left' };
const ncols = { display: 'grid', margin: '48px auto 0', border: `1px solid ${T.dline}` };
const ncol = { padding: '38px 14px' };
const ritGrid = { display: 'grid', gap: 44, marginTop: 54 };
const newsForm = { display: 'flex', maxWidth: 420, margin: '0 auto', borderBottom: `1px solid ${T.ink}` };
const newsInput = { flex: 1, height: 48, border: 'none', background: 'transparent', color: T.ink, padding: '0 4px', fontSize: 14, fontFamily: T.sans, outline: 'none' };
