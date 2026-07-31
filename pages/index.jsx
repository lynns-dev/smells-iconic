import React from 'react';
import Head from 'next/head';
import Header from '../components/Header';
import CartDrawer from '../components/CartDrawer';
import ProductVisual from '../components/ProductVisual';
import Marquee from '../components/Marquee';
import Footer from '../components/Footer';
import { PRODUCTS, getProductById } from '../lib/products';
import { useCart } from '../lib/useCart';
import { useAllReviews } from '../lib/useReviews';
import { T, S } from '../lib/theme';

const FAQS = [
  {
    q: 'How is this different from a regular massager?',
    a: 'The Sculpt Wand’s dual rollers are shaped specifically to contour along thighs, hips, and stomach — the areas most women want to focus on — rather than a general-purpose vibration massager.',
  },
  {
    q: 'How long until I notice a difference?',
    a: 'Most women tell us they notice skin looking and feeling smoother within 2–3 weeks of using it 5 minutes a day, most days. Consistency is what makes the difference.',
  },
  {
    q: 'Is it safe to use every day?',
    a: 'Yes — it’s designed for daily use as part of a short evening routine. Start with the lowest intensity and increase as your skin gets used to it.',
  },
  {
    q: 'Does it hurt?',
    a: 'It shouldn’t. It’s a firm, kneading massage, not a painful treatment — most people find it relaxing, similar to a deep-tissue hand massage.',
  },
  {
    q: 'What’s your return policy?',
    a: 'Try it for 30 days. If you’re not happy with how your skin looks and feels, email us and we’ll make it right — no complicated forms.',
  },
  {
    q: 'How long does the battery last?',
    a: 'A single charge lasts roughly 3–4 weeks of daily 5-minute sessions. It charges fully in about 2 hours over USB-C.',
  },
];

const TESTIMONIALS = [
  { text: 'Five minutes before bed and I actually stick with it. My skin looks so much smoother — I feel like I can wear shorts again without thinking twice.', author: 'Denise, 52' },
  { text: 'I was skeptical about another gadget, but this one earned its spot on my nightstand. It feels like a little at-home spa moment.', author: 'Marianne, 47' },
  { text: 'Simple to use, quiet, and it actually fits into my evening routine instead of becoming one more thing I never do.', author: 'Renee, 58' },
];

export default function HomePage() {
  const c = useCart();
  const single = getProductById('sculpt-wand');
  const duo = getProductById('sculpt-wand-duo');
  const reviewsByProduct = useAllReviews();
  const siteReviews = React.useMemo(() => {
    const all = Object.values(reviewsByProduct).flatMap((r) => r.reviews || []);
    const count = all.length;
    const average = count === 0 ? 0 : Math.round((all.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;
    return { all, count, average };
  }, [reviewsByProduct]);
  const [scrolled, setScrolled] = React.useState(false);
  const [openFaq, setOpenFaq] = React.useState(0);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToBuy = () => document.getElementById('buy')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div>
      <Head>
        <title>The Sculpt Wand — At-Home Cellulite Sculpting Tool</title>
        <meta name="description" content="A handheld sculpting tool for smoother-looking, more confident skin — a 5-minute ritual you can do at home. 30-day money-back guarantee." />
        <meta property="og:title" content="The Sculpt Wand — At-Home Cellulite Sculpting Tool" />
        <meta property="og:description" content="A 5-minute at-home ritual for smoother-looking, more confident skin. No needles, no downtime." />
        <meta property="og:type" content="website" />
      </Head>

      <div style={announce}>Free shipping on orders $89+ &nbsp;·&nbsp; 30-day money-back guarantee</div>

      {/* HERO */}
      <section style={heroWrap}>
        <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} overlay scrolled={scrolled} />
        <div style={heroBg}>
          <div style={heroBlobA} />
          <div style={heroBlobB} />
          <div style={heroContent}>
            <span style={{ ...S.label, display: 'block', marginBottom: 20 }}>For women 40+ who want to feel like themselves again</span>
            <h1 style={heroH1}>Smoother-looking skin<br /><span style={S.it}>starts with five minutes.</span></h1>
            <p style={heroSub}>The Sculpt Wand is a handheld sculpting and massage tool built for a short, soothing at-home ritual — so you can feel more confident in your skin, on your own schedule.</p>
            {siteReviews.count > 0 && (
              <div style={hrate}>
                <span style={{ letterSpacing: '2px', color: T.roseDeep }}>{'★'.repeat(Math.round(siteReviews.average))}{'☆'.repeat(5 - Math.round(siteReviews.average))}</span>
                {' '}{siteReviews.average.toFixed(1)} · {siteReviews.count} review{siteReviews.count === 1 ? '' : 's'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={S.btnFill} onClick={scrollToBuy}>Shop The Sculpt Wand — ${single?.price}</button>
              <a href="#how-it-works" style={S.link}>See how it works</a>
            </div>
          </div>
          <div style={heroVisual}>
            <ProductVisual id={single?.id} images={single?.images} alt={single?.name} width={220} />
          </div>
        </div>
      </section>

      {/* EMPATHY */}
      <section style={band}>
        <div style={{ ...S.wrap, textAlign: 'center', maxWidth: 720 }}>
          <p style={S.label}>You already know the drill</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Creams that promise everything. <span style={S.it}>Delivered nothing.</span></h2>
          <p style={{ color: T.soft, fontSize: 16, marginTop: 18, lineHeight: 1.75 }}>
            You’ve tried the serums, the wraps, the expensive jars that sit half-used in a drawer. Somewhere between work,
            family, and everything else, self-care got pushed to “someday.” The Sculpt Wand isn’t a miracle — it’s a
            five-minute ritual that’s easy enough to actually keep, so the skin you see in the mirror can start to
            reflect how you feel on your best days.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS / FEATURES */}
      <section id="how-it-works" style={{ ...band, background: T.paper, borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
        <div style={S.wrap}>
          <div style={{ textAlign: 'center' }}>
            <p style={S.label}>How it works</p>
            <h2 style={{ ...S.h2, marginTop: 12 }}>Built for real routines, <span style={S.it}>not extra effort.</span></h2>
          </div>
          <div className="feat-grid" style={featGrid}>
            {(single?.features || []).map((f, i) => (
              <div key={i} style={featCard}>
                <div style={featNum}>0{i + 1}</div>
                <h3 style={featTitle}>{f.title}</h3>
                <p style={featBody}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RITUAL STEPS */}
      <section style={band}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={S.label}>The ritual</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Three simple steps.</h2>
          <div className="rit-grid" style={ritGrid}>
            {[
              ['1', 'Warm skin, clean hands', 'Use after a shower or with a little Contour Oil for the smoothest glide.'],
              ['2', 'Glide, don’t rush', 'Move the rollers in slow, sweeping motions over thighs, hips, or stomach for 5 minutes.'],
              ['3', 'Make it a habit', 'Most evenings, most weeks — consistency is what skin responds to.'],
            ].map(([n, h, p], i) => (
              <div key={i}>
                <div style={ritNum}>{n}</div>
                <h4 style={ritTitle}>{h}</h4>
                <p style={{ fontSize: 14, color: T.soft, maxWidth: '30ch', margin: '0 auto' }}>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section id="reviews" style={{ ...band, background: T.ink, color: T.white }}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={{ ...S.label, color: T.blush }}>What women are saying</p>
          <h2 style={{ ...S.h2, color: T.white, marginTop: 12 }}>Real routines. <span style={{ ...S.it, color: T.blush }}>Real confidence.</span></h2>
          <div className="rev-grid" style={revGrid}>
            {(siteReviews.count > 0
              ? siteReviews.all.slice().reverse().slice(0, 3).map((r) => ({ text: r.text, author: r.author }))
              : TESTIMONIALS
            ).map((r, i) => (
              <div key={i} style={revCard}>
                <div style={{ color: T.blush, letterSpacing: '1.5px', fontSize: 13, marginBottom: 14 }}>★★★★★</div>
                <p style={revText}>&ldquo;{r.text}&rdquo;</p>
                <cite style={revAuthor}>{r.author}</cite>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,253,251,0.55)', marginTop: 28 }}>
            Individual results vary. The Sculpt Wand is a massage and skincare tool, not a medical device.
          </p>
        </div>
      </section>

      {/* TRUST BADGES */}
      <section style={{ ...band, paddingTop: 48, paddingBottom: 48 }}>
        <div className="trust-grid" style={trustGrid}>
          {[
            ['30-Day Guarantee', 'Not right for you? We’ll make it right, no hassle.'],
            ['Secure Checkout', 'Your payment details are encrypted end to end.'],
            ['Cordless & Rechargeable', 'Weeks of use on a single USB-C charge.'],
            ['Discreet Shipping', 'Plain packaging, no branding on the outside.'],
          ].map(([h, p], i) => (
            <div key={i} style={trustCard}>
              <div style={trustDot} />
              <h4 style={{ fontFamily: T.sans, fontWeight: 700, fontSize: 14, margin: '10px 0 6px', color: T.ink }}>{h}</h4>
              <p style={{ fontSize: 13, color: T.soft, margin: 0 }}>{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ ...band, background: T.paper, borderTop: `1px solid ${T.line}` }}>
        <div style={{ ...S.wrap, maxWidth: 760 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={S.label}>Questions</p>
            <h2 style={{ ...S.h2, marginTop: 12 }}>Frequently asked.</h2>
          </div>
          <div style={{ marginTop: 40 }}>
            {FAQS.map((f, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} style={faqRow}>
                  <button
                    onClick={() => setOpenFaq(isOpen ? -1 : i)}
                    style={faqBtn}
                    aria-expanded={isOpen}
                  >
                    <span style={{ fontFamily: T.sans, fontWeight: 600, fontSize: 15, color: T.ink }}>{f.q}</span>
                    <span style={{ fontSize: 18, color: T.rose, flexShrink: 0, marginLeft: 12 }}>{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && <p style={faqBody}>{f.a}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* BUY BOX */}
      <section id="buy" style={band}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <p style={S.label}>Choose your set</p>
          <h2 style={{ ...S.h2, marginTop: 12 }}>Start your ritual <span style={S.it}>tonight.</span></h2>
          <div className="buy-grid" style={buyGrid}>
            {PRODUCTS.map((p) => (
              <div key={p.id} style={{ ...buyCard, ...(p.badge === 'Best Value' ? buyCardHighlight : {}) }}>
                {p.badge && <span style={buyBadge}>{p.badge}</span>}
                <div style={buyImgWrap}>
                  <ProductVisual id={p.id} images={p.images} alt={p.name} width={140} />
                </div>
                <h3 style={{ fontFamily: T.sans, fontWeight: 700, fontSize: 19, color: T.ink, marginTop: 18 }}>{p.name}</h3>
                <p style={{ fontSize: 13, color: T.soft, margin: '8px 0 16px' }}>{p.description}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
                  {p.originalPrice && <span style={{ fontSize: 14, color: T.soft, textDecoration: 'line-through' }}>${p.originalPrice}</span>}
                  <span style={{ fontFamily: T.display, fontStyle: 'italic', fontWeight: 600, fontSize: 30, color: T.roseDeep }}>${p.price}</span>
                </div>
                <button style={{ ...S.btnFill, width: '100%', justifyContent: 'center' }} onClick={() => c.add(p)}>Add to cart</button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: T.soft, marginTop: 28 }}>Backed by our 30-day money-back guarantee.</p>
        </div>
      </section>

      <Marquee />
      <Footer />

      <CartDrawer {...c} onClose={() => c.setOpen(false)} />

      <style jsx>{`
        .feat-grid { grid-template-columns: repeat(4, 1fr); }
        .rit-grid { grid-template-columns: repeat(3, 1fr); }
        .rev-grid { grid-template-columns: repeat(3, 1fr); }
        .trust-grid { grid-template-columns: repeat(4, 1fr); }
        .buy-grid { grid-template-columns: repeat(2, 1fr); }

        @media (max-width: 900px) {
          .feat-grid { grid-template-columns: 1fr 1fr; }
          .trust-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 680px) {
          .feat-grid { grid-template-columns: 1fr; }
          .rit-grid { grid-template-columns: 1fr; gap: 34px; }
          .rev-grid { grid-template-columns: 1fr; gap: 20px; }
          .trust-grid { grid-template-columns: 1fr; }
          .buy-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

const announce = { textAlign: 'center', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: T.roseDeep, background: T.blush, padding: '10px 20px' };
const heroWrap = { position: 'relative', background: `linear-gradient(180deg, ${T.blush} 0%, ${T.paper} 100%)`, overflow: 'hidden' };
const heroBg = {
  position: 'relative', minHeight: '82vh', display: 'flex', alignItems: 'center',
  maxWidth: T.maxw, margin: '0 auto', padding: '120px 32px 80px', gap: 40, flexWrap: 'wrap',
};
const heroBlobA = { position: 'absolute', top: '-10%', right: '-8%', width: 420, height: 420, borderRadius: '50%', background: 'rgba(201,124,116,0.18)', filter: 'blur(10px)' };
const heroBlobB = { position: 'absolute', bottom: '-15%', left: '-10%', width: 360, height: 360, borderRadius: '50%', background: 'rgba(244,217,210,0.55)', filter: 'blur(10px)' };
const heroContent = { position: 'relative', flex: '1 1 420px', maxWidth: 560 };
const heroH1 = { fontFamily: T.sans, fontWeight: 700, fontSize: 'clamp(34px,4.6vw,54px)', lineHeight: 1.12, marginBottom: 22, color: T.ink };
const heroSub = { fontSize: 16, color: T.soft, maxWidth: '46ch', marginBottom: 26, lineHeight: 1.7 };
const hrate = { display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: T.soft, marginBottom: 24 };
const heroVisual = {
  position: 'relative', flex: '1 1 280px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  minHeight: 320,
};
const band = { padding: '72px 0' };
const featGrid = { display: 'grid', gap: 28, marginTop: 48 };
const featCard = { background: T.white, border: `1px solid ${T.line}`, borderRadius: 20, padding: '28px 24px' };
const featNum = { fontFamily: T.display, fontStyle: 'italic', fontSize: 26, color: T.rose, marginBottom: 10 };
const featTitle = { fontFamily: T.sans, fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 8 };
const featBody = { fontSize: 13.5, color: T.soft, lineHeight: 1.6, margin: 0 };
const ritGrid = { display: 'grid', gap: 44, marginTop: 54 };
const ritNum = { fontFamily: T.display, fontStyle: 'italic', fontWeight: 600, fontSize: 34, color: T.rose };
const ritTitle = { fontFamily: T.sans, fontWeight: 700, fontSize: 17, margin: '10px 0 6px', color: T.ink };
const revGrid = { display: 'grid', gap: 24, marginTop: 48 };
const revCard = { background: 'rgba(255,253,251,0.06)', border: `1px solid ${T.dline}`, borderRadius: 20, padding: '30px 26px', textAlign: 'left' };
const revText = { fontFamily: T.display, fontStyle: 'italic', fontWeight: 500, fontSize: 17, lineHeight: 1.5, marginBottom: 16, color: T.white };
const revAuthor = { fontStyle: 'normal', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.blush };
const trustGrid = { ...S.wrap, display: 'grid', gap: 24, textAlign: 'center' };
const trustCard = { padding: '10px 12px' };
const trustDot = { width: 10, height: 10, borderRadius: '50%', background: T.rose, margin: '0 auto' };
const faqRow = { borderBottom: `1px solid ${T.line}`, padding: '18px 0' };
const faqBtn = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' };
const faqBody = { fontSize: 14, color: T.soft, lineHeight: 1.7, marginTop: 12, paddingRight: 30 };
const buyGrid = { display: 'grid', gap: 28, marginTop: 48 };
const buyCard = { background: T.white, border: `1px solid ${T.line}`, borderRadius: 24, padding: '32px 28px', textAlign: 'center', position: 'relative' };
const buyCardHighlight = { border: `1.5px solid ${T.rose}`, boxShadow: '0 16px 40px rgba(201,124,116,0.18)' };
const buyBadge = { position: 'absolute', top: 18, right: 18, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.white, background: T.roseDeep, padding: '6px 12px', borderRadius: 999 };
const buyImgWrap = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 };
