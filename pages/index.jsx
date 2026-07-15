import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Header from '../components/Header';
import CartDrawer from '../components/CartDrawer';
import ProductVisual from '../components/ProductVisual';
import Marquee from '../components/Marquee';
import Footer from '../components/Footer';
import { getFeaturedProducts, getProductById } from '../lib/products';
import { useCart } from '../lib/useCart';
import { useAllReviews } from '../lib/useReviews';
import { T, S } from '../lib/theme';

const BANNER_MESSAGES = ['Free shipping $40+', '15% off with code ICONIC15'];

export default function HomePage() {
  const router = useRouter();
  const c = useCart();
  const [newsEmail, setNewsEmail] = React.useState('');
  const [newsStatus, setNewsStatus] = React.useState('idle'); // idle | submitting | sent | error
  const [newsError, setNewsError] = React.useState('');

  const onNewsletterSubmit = async (e) => {
    e.preventDefault();
    if (newsStatus === 'submitting') return;
    setNewsStatus('submitting');
    setNewsError('');
    try {
      const res = await fetch('/api/email/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newsEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      setNewsStatus('sent');
    } catch (err) {
      setNewsStatus('error');
      setNewsError(err.message);
    }
  };
  const featured = getFeaturedProducts();
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
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => {
      setBannerIndex((i) => (i + 1) % BANNER_MESSAGES.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div>
      <div style={announce}>
        <div
          style={{
            display: 'flex',
            width: `${BANNER_MESSAGES.length * 100}%`,
            transform: `translateX(-${(100 / BANNER_MESSAGES.length) * bannerIndex}%)`,
            transition: 'transform 0.6s ease',
          }}
        >
          {BANNER_MESSAGES.map((msg, i) => (
            <span key={i} style={{ width: `${100 / BANNER_MESSAGES.length}%` }}>{msg}</span>
          ))}
        </div>
      </div>
      {/* HERO */}
      <section style={heroWrap}>
        <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} overlay scrolled={scrolled} />
        <div style={heroBg}>
          <div style={heroScrim} />
          <div style={heroContent}>
            <span style={{ ...S.label, display: 'block', marginBottom: 26, color: 'rgba(251,245,241,0.85)' }}>Body mist · an archive</span>
            <h1 style={heroH1}>Smell like <span style={S.it}>the main character.</span></h1>
            <p style={heroSub}>Body mists pulled from the cultural record — three characters, worn like a costume, remembered like a scent.</p>
            {siteReviews.count > 0 && (
              <div style={hrate}>
                <span style={{ letterSpacing: '2px', color: T.white }}>{'★'.repeat(Math.round(siteReviews.average))}{'☆'.repeat(5 - Math.round(siteReviews.average))}</span>
                {' '}{siteReviews.average.toFixed(1)} · {siteReviews.count} review{siteReviews.count === 1 ? '' : 's'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={heroBtn} onClick={() => c.add(featured[0])}>Shop — $28</button>
              <a href="#notes" style={heroLink}>The scents</a>
            </div>
          </div>
          <div style={heroHint}>
            <span style={heroHintLine} />
            <span style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(251,245,241,0.7)' }}>Scroll</span>
          </div>
        </div>
      </section>

      {/* COLLECTION */}
      <section id="shop" style={band}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={S.label}>The archive</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Three characters, <span style={S.it}>one closet.</span></h2>
          <div className="col-grid" style={colGrid}>
            {featured.map((p) => (
              <div key={p.id} className="col-item" style={pcard}>
                <Link href={`/product/${p.id}`} style={pimg}>
                  {p.badge && <span style={badge}>{p.badge}</span>}
                  <ProductVisual id={p.id} images={p.images} alt={p.name} width={104} />
                </Link>
                <div style={pcardText}>
                  <Link href={`/product/${p.id}`} style={{ fontFamily: T.display, fontWeight: 400, fontSize: 21 }}>{p.name}</Link>
                  <div style={pnotes}>{p.tagline}</div>
                  <div style={{ fontSize: 13 }}>${p.price} · {p.size}</div>
                  <button style={{ ...S.btnFill, width: '100%', justifyContent: 'center', marginTop: 18 }} onClick={() => c.add(p)}>Add to cart</button>
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
              <div style={{ ...vbig, color: T.white }}>$28</div>
              <ul style={vlist}>
                {['3 characters to choose from', 'Internet-coded, not overdone', 'It’s a mist — reapply anywhere', 'Milky, green, or clean — your era'].map((x, i) => (
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
          <h2 style={{ ...S.h2, color: T.white, marginTop: 12 }}>Three moods, <span style={S.it}>one archive.</span></h2>
          <div className="notes-grid" style={ncols}>
            {featured.map((p) => (
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
        <p style={{ color: T.soft, fontSize: 15, margin: '16px auto 28px', maxWidth: '40ch' }}>New characters, restocks, and 15% off your first mist.</p>
        {router.query.confirmed === '1' ? (
          <p style={{ fontSize: 13, color: T.soft }}>You're confirmed — welcome to the list.</p>
        ) : newsStatus === 'sent' ? (
          <p style={{ fontSize: 13, color: T.soft }}>Check your inbox to confirm — one click and you're in.</p>
        ) : (
          <form style={newsForm} onSubmit={onNewsletterSubmit}>
            <input
              type="email"
              placeholder="Email address"
              aria-label="email"
              style={newsInput}
              value={newsEmail}
              onChange={(e) => setNewsEmail(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={newsStatus === 'submitting'}
              style={{ background: 'none', border: 'none', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: T.sans }}
            >
              {newsStatus === 'submitting' ? 'Sending…' : 'Subscribe'}
            </button>
          </form>
        )}
        {newsStatus === 'error' && (
          <p style={{ fontSize: 12, color: T.soft, marginTop: 10 }}>{newsError}</p>
        )}
      </section>

      <Marquee />
      <Footer />

      <CartDrawer {...c} onClose={() => c.setOpen(false)} />

      <style jsx>{`
        .hm-grid { grid-template-columns: 1fr 1fr; }
        .hm-cell + .hm-cell { border-left: 1px solid ${T.line}; }
        .col-grid { grid-template-columns: repeat(3, 1fr); }
        .new-scent-grid { grid-template-columns: 1fr 1fr; }
        .rev-grid { grid-template-columns: repeat(3, 1fr); }
        .rev-item:nth-child(n + 2) { border-left: 1px solid ${T.line}; }
        .notes-grid { grid-template-columns: repeat(3, 1fr); }
        .notes-item:nth-child(n + 2) { border-left: 1px solid ${T.dline}; }
        .rit-grid { grid-template-columns: repeat(3, 1fr); }

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
const heroBg = {
  position: 'relative', height: '88vh', minHeight: 560,
  backgroundImage: 'url(/images/si-pilates-princess-lifestyle.png)', backgroundSize: 'cover', backgroundPosition: 'center 30%',
  display: 'flex', alignItems: 'flex-end',
};
const heroScrim = {
  position: 'absolute', inset: 0,
  background: 'linear-gradient(100deg, rgba(21,17,13,0.62) 0%, rgba(21,17,13,0.32) 42%, rgba(21,17,13,0.04) 68%)',
};
const heroContent = { position: 'relative', maxWidth: T.maxw, width: '100%', margin: '0 auto', padding: '0 40px 72px', color: T.white };
const heroH1 = { fontFamily: T.display, fontWeight: 400, fontSize: 'clamp(36px,5.2vw,64px)', lineHeight: 1.05, marginBottom: 22, color: T.white, maxWidth: '17ch' };
const heroSub = { fontSize: 16, color: 'rgba(251,245,241,0.85)', maxWidth: '38ch', marginBottom: 26 };
const hrate = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'rgba(251,245,241,0.82)', marginBottom: 30 };
const heroBtn = { ...S.btnFill, background: T.white, color: T.ink };
const heroLink = { ...S.link, color: T.white, borderBottom: '1px solid rgba(251,245,241,0.5)' };
const heroHint = { position: 'absolute', left: '50%', bottom: 28, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 };
const heroHintLine = { width: 1, height: 34, background: 'rgba(251,245,241,0.6)' };
const band = { padding: '64px 0' };
const vcell = { padding: '46px 44px' };
const vtag = { fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase', color: T.soft, marginBottom: 18 };
const vbig = { fontFamily: T.display, fontWeight: 400, fontSize: 42, lineHeight: 1, marginBottom: 18 };
const vlist = { listStyle: 'none', fontSize: 14, color: T.soft };
const vli = { padding: '8px 0' };
const colGrid = { display: 'grid', marginTop: 50, gap: 40 };
const newScentGrid = { ...S.wrap, display: 'grid', gap: 60, alignItems: 'center' };
const newScentImg = { aspectRatio: '4/5', overflow: 'hidden', border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper };
const pcard = { textAlign: 'center' };
const badge = { position: 'absolute', top: 14, left: 14, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: T.soft, background: 'rgba(251,245,241,0.9)', padding: '4px 8px', zIndex: 1 };
const pimg = { position: 'relative', aspectRatio: '1/1', display: 'block', overflow: 'hidden', width: '100%' };
const pcardText = { padding: '20px 30px 40px' };
const pnotes = { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, margin: '8px 0 6px' };
const revGrid = { display: 'grid', border: `1px solid ${T.line}`, marginTop: 48 };
const rev = { padding: '34px 30px', textAlign: 'left' };
const ncols = { display: 'grid', maxWidth: 820, margin: '48px auto 0', border: `1px solid ${T.dline}` };
const ncol = { padding: '38px 14px' };
const ritGrid = { display: 'grid', gap: 44, marginTop: 54 };
const newsForm = { display: 'flex', maxWidth: 420, margin: '0 auto', borderBottom: `1px solid ${T.ink}` };
const newsInput = { flex: 1, height: 48, border: 'none', background: 'transparent', color: T.ink, padding: '0 4px', fontSize: 14, fontFamily: T.sans, outline: 'none' };
