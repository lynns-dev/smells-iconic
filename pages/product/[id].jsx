import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '../../components/Header';
import CartDrawer from '../../components/CartDrawer';
import ProductVisual from '../../components/ProductVisual';
import Marquee from '../../components/Marquee';
import Footer from '../../components/Footer';
import DropsOffer from '../../components/DropsOffer';
import { PRODUCTS, getProductById } from '../../lib/products';
import { useCart } from '../../lib/useCart';
import { fbTrack } from '../../lib/fbPixel';
import { T, S } from '../../lib/theme';

// The bundle offered under each body mist ("Save with sets").
const SET_ID = 'current-drops-set';

const INGREDIENTS = 'Aqua, alcohol denat., fragrance (parfum), glycerin, skin-safe conditioning agents.';

const HOW_TO_USE = [
  ['Fresh out the shower', 'Mist onto clean, warm skin — that’s when it holds longest.'],
  ['Where you’d get kissed', 'Collarbones, neck, wrists, the backs of the knees.'],
  ['Reapply whenever', 'It’s a mist, not a perfume — spray as often as the moment calls for it.'],
];

const BENEFITS = [
  ['Internet-coded, not overdone', 'Built around a character everyone already knows — worn like a costume, not a cologne.'],
  ['Lightweight, all-day mist', 'A fine, even mist that layers into skin instead of sitting on top of it.'],
  ['100ml, made to be used up', 'A full bottle sized for daily reapplication — this isn’t a special-occasion scent.'],
  ['Clean, simple formula', 'Vegan and cruelty-free, made without unnecessary filler ingredients.'],
  ['Made to layer', 'Wear one alone or mix characters — Babygirl and Clean Rich play well together.'],
  ['Vegan-friendly formula', 'Cruelty-free, made without animal-derived ingredients.'],
];

// Drop video files into public/videos and list them here (or per-product, if
// you'd rather curate which reels show on which page) to populate the reel
// carousel below. Section hides while empty.
const REEL_VIDEOS = [];

const FAQS = [
  ['Will it stain clothing?', 'No — it’s a fine, quick-drying mist that won’t mark fabric.'],
  ['How long does one bottle last?', 'Most wearers get 150+ spritzes per 100ml bottle with daily application.'],
  ['Can I wear it with perfume?', 'Yes. Many wear it alone; others layer it under or over perfume to extend the scent.'],
  ['Is it safe for sensitive skin?', 'Yes. The formula is fragrance-forward but gentle enough for daily use.'],
  ['Is it vegan and cruelty-free?', 'Yes — every SMELLS — ICONIC formula is vegan-friendly and never tested on animals.'],
  ['How do I apply it?', 'Mist onto clean skin from about 6 inches away — collarbones, neck, wrists, and behind the knees.'],
];

export async function getStaticPaths() {
  return { paths: PRODUCTS.map((p) => ({ params: { id: p.id } })), fallback: false };
}
export async function getStaticProps({ params }) {
  return { props: { product: getProductById(params.id) || null } };
}

function AccordionRow({ title, open, onToggle, children }) {
  return (
    <div style={accordionRow}>
      <button onClick={onToggle} style={accordionHeader} aria-expanded={open}>
        <span>{title}</span>
        <span style={accordionIcon}>{open ? '−' : '+'}</span>
      </button>
      <div style={{ ...accordionBody, maxHeight: open ? 600 : 0, opacity: open ? 1 : 0, paddingBottom: open ? 24 : 0 }}>
        {children}
      </div>
    </div>
  );
}

export default function ProductPage({ product }) {
  const c = useCart();
  const router = useRouter();
  const [quantity, setQuantity] = React.useState(1);
  const [openSection, setOpenSection] = React.useState('scent-story');
  const [openFaq, setOpenFaq] = React.useState(null);
  const images = React.useMemo(() => product?.images || [], [product]);
  const [activeImage, setActiveImage] = React.useState(images[0] || '');
  const [reviewData, setReviewData] = React.useState({ reviews: [], average: 0, count: 0 });
  const [reviewForm, setReviewForm] = React.useState({ rating: 5, text: '', author: '' });
  const [reviewSubmitting, setReviewSubmitting] = React.useState(false);
  const [reviewError, setReviewError] = React.useState('');
  const [reviewSubmitted, setReviewSubmitted] = React.useState(false);

  React.useEffect(() => {
    setActiveImage(images[0] || '');
  }, [images]);

  React.useEffect(() => {
    if (!product) return;
    fetch(`/api/reviews?productId=${product.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // A failed request (e.g. the reviews store being unreachable)
        // still resolves here with an error body, not a rejection — only
        // adopt it if it actually has the shape the rest of the page
        // expects, otherwise keep the empty default already in state.
        if (data && Array.isArray(data.reviews)) setReviewData(data);
      })
      .catch(() => {});
  }, [product]);

  React.useEffect(() => {
    if (!product) return;
    fbTrack('ViewContent', {
      content_ids: [product.id],
      content_name: product.name,
      content_type: 'product',
      value: product.price,
      currency: 'USD',
    });
  }, [product]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setReviewError('');
    setReviewSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, ...reviewForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit review.');
      // Pending customer reviews don't show up here until approved in
      // /admin — reviewData isn't updated, just the thank-you state.
      setReviewForm({ rating: 5, text: '', author: '' });
      setReviewSubmitted(true);
    } catch (err) {
      setReviewError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (router.isFallback || !product) return null;

  const related = PRODUCTS.filter((p) => p.id !== product.id && p.id !== SET_ID).slice(0, 4);
  const trio = getProductById(SET_ID);
  const toggleSection = (key) => setOpenSection((cur) => (cur === key ? null : key));
  const toggleFaq = (i) => setOpenFaq((cur) => (cur === i ? null : i));

  const unitPrice = product.price;

  const handleAdd = () => {
    c.add({ ...product, price: unitPrice }, quantity);
    setQuantity(1);
  };

  const handleAddTrio = () => trio && c.add(trio, 1);

  return (
    <div style={{ paddingBottom: 76 }}>
      <Head>
        <title key="title">{`${product.name} — Smells Iconic`}</title>
      </Head>
      <Header cartCount={c.count} onCartClick={() => c.setOpen(true)} />

      <section style={{ maxWidth: T.maxw, margin: '0 auto', padding: '22px 40px 0' }}>
        <Link href="/shop" style={{ ...S.label, display: 'inline-block', marginBottom: 30 }}>← Back to shop</Link>
      </section>

      {/* MAIN */}
      <section style={{ maxWidth: T.maxw, margin: '0 auto', padding: '0 40px 60px' }}>
        <div className="pdp-grid" style={grid}>
          <div className="pdp-gallery" style={gallery}>
            <div style={imgSide}>
              {product.badge && <span style={imageBadge}>{product.badge}</span>}
              {activeImage ? (
                <img src={activeImage} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <ProductVisual id={product.id} width={230} />
              )}
            </div>
            {images.length > 1 && (
              <div className="thumb-col" style={thumbCol}>
                {images.map((src, i) => (
                  <button
                    key={src}
                    onClick={() => setActiveImage(src)}
                    style={{ ...thumbBtn, borderColor: activeImage === src ? T.ink : T.line }}
                    aria-label={`Show image ${i + 1}`}
                    aria-current={activeImage === src}
                  >
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={infoCol}>
            <a href="#reviews" style={pdpRating}>
              {reviewData.count > 0 ? (
                <>
                  <span style={{ color: T.ink, letterSpacing: '2px' }}>{'★'.repeat(Math.round(reviewData.average))}{'☆'.repeat(5 - Math.round(reviewData.average))}</span>
                  {' '}{reviewData.average.toFixed(1)} · {reviewData.count} review{reviewData.count === 1 ? '' : 's'}
                </>
              ) : (
                'Be the first to review'
              )}
            </a>
            <h1 style={pdpTitle}>{product.name}</h1>
            <p style={pdpValueProp}>{VALUE_PROP}</p>
            <div style={pdpTagline}>{product.tagline}</div>
            <p style={pdpDesc}>{product.description}</p>

            <div style={pdpPrice}>
              ${unitPrice}
              {product.originalPrice > unitPrice && <s style={{ fontSize: 16, color: T.soft, marginLeft: 8 }}>${product.originalPrice}</s>}
              {' '}<span style={{ fontSize: 14, color: T.soft }}>· {product.size}</span>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap', marginBottom: 20 }}>
              <div style={qtyWrap}>
                <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} style={qtyBtn} aria-label="Decrease quantity">−</button>
                <span style={qtyValue}>{quantity}</span>
                <button onClick={() => setQuantity((q) => q + 1)} style={qtyBtn} aria-label="Increase quantity">+</button>
              </div>
              <button style={{ ...S.btnFill, flex: 1, justifyContent: 'center' }} onClick={handleAdd}>Add to bag</button>
            </div>

            <div style={badgeRow}>Ships in 2–4 days · 45-day guarantee + free returns · Vegan-friendly · Cruelty-free</div>

            {trio && product.id !== SET_ID && product.category === 'body-mist' && (
              <div style={trioCard}>
                <div style={trioVisual}><ProductVisual id={SET_ID} images={trio.images} alt={trio.name} width={54} /></div>
                <div style={{ flex: 1 }}>
                  <div style={S.label}>Save with sets</div>
                  <div style={{ fontFamily: T.display, fontWeight: 300, fontSize: 18, marginTop: 4 }}>{trio.name}</div>
                  <div style={{ fontSize: 12, color: T.soft, marginTop: 2, textTransform: 'capitalize' }}>{trio.tagline}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: T.display, fontSize: 17, marginBottom: 8 }}>
                    ${trio.price}
                    {trio.originalPrice > trio.price && <s style={{ fontSize: 13, color: T.soft, marginLeft: 6 }}>${trio.originalPrice}</s>}
                  </div>
                  <button onClick={handleAddTrio} style={trioAddBtn}>Add</button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 24 }}>
              {product.notes && (
                <AccordionRow title="Scent story" open={openSection === 'scent-story'} onToggle={() => toggleSection('scent-story')}>
                  {Object.entries(product.notes).map(([k, v]) => (
                    <div key={k} style={noteRow}>
                      <span style={noteKey}>{k}</span>
                      <ul style={noteList}>
                        {v.split('·').map((item, i) => (
                          <li key={i} style={noteListItem}>{item.trim()}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </AccordionRow>
              )}
              <AccordionRow title="How to use" open={openSection === 'how-to-use'} onToggle={() => toggleSection('how-to-use')}>
                {(product.howToUse || HOW_TO_USE).map(([h, p], i) => (
                  <div key={i} style={{ marginBottom: i < (product.howToUse || HOW_TO_USE).length - 1 ? 18 : 0 }}>
                    <div style={{ fontFamily: T.display, fontWeight: 300, fontSize: 17, marginBottom: 4 }}>{h}</div>
                    <p style={{ fontSize: 13, color: T.soft, margin: 0 }}>{p}</p>
                  </div>
                ))}
              </AccordionRow>
              <AccordionRow title="Ingredients" open={openSection === 'ingredients'} onToggle={() => toggleSection('ingredients')}>
                <p style={{ fontSize: 14, color: T.soft, margin: 0 }}>{product.ingredients || INGREDIENTS}</p>
              </AccordionRow>
            </div>
          </div>
        </div>
      </section>

      {/* NARRATIVE — dark pull quote */}
      <section style={{ ...narrowBand, background: T.ink, borderTop: `1px solid ${T.line}` }}>
        <div style={narrowWrap}>
          <p style={{ ...S.label, color: 'rgba(251,245,241,0.6)' }}>The scent, in full</p>
          <h2 style={{ ...narrativeHeadline, color: T.white }}>Smell like your favorite obsession.</h2>
          <p style={{ ...narrativeBody, color: 'rgba(251,245,241,0.82)' }}>{product.longDescription}</p>
          <div className="narrative-features" style={featureRow}>
            {BRAND_FEATURES.map(([title, copy]) => (
              <div key={title} style={featureItem}>
                <div style={{ ...featureTitle, color: T.white }}>{title}</div>
                <div style={{ ...featureCopy, color: 'rgba(251,245,241,0.65)' }}>{copy}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REEL */}
      {REEL_VIDEOS.length > 0 && (
        <section style={{ ...band, borderTop: `1px solid ${T.line}` }}>
          <div style={{ ...S.wrap, textAlign: 'center' }}>
            <p style={S.label}>As worn</p>
            <h2 style={{ ...S.h2, marginTop: 12 }}>Real women, <span style={S.it}>smelling incredible.</span></h2>
            <div className="reel-track" style={reelTrack}>
              {REEL_VIDEOS.map((v, i) => (
                <video
                  key={i}
                  className="reel-item"
                  style={reelItem}
                  src={v.src}
                  poster={v.poster}
                  muted
                  loop
                  playsInline
                  autoPlay
                  controls
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* BENEFITS */}
      <section style={{ ...narrowBand, background: T.paper, borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
        <div style={narrowWrap}>
          <p style={S.label}>Why you’ll love it</p>
          {(product.benefits || BENEFITS).map(([h, p], i) => (
            <div key={i} style={benefitRow}>
              <span style={benefitNum}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div style={{ fontFamily: T.display, fontWeight: 300, fontSize: 19, marginBottom: 6 }}>{h}</div>
                <p style={{ fontSize: 14, color: T.ink, margin: 0, maxWidth: '52ch' }}>{p}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* LIMITED TIME OFFER — The Current Drops Set, until its deadline (components/DropsOffer.jsx). */}
      <div style={{ borderTop: `1px solid ${T.line}` }}>
        <DropsOffer />
      </div>

      {/* UGC — real customers with their bottles. */}
      <section style={{ ...band, borderTop: `1px solid ${T.line}` }}>
        <div style={{ ...S.wrap, textAlign: 'center' }}>
          <h2 style={{ ...S.h2, fontFamily: T.display, fontSize: 'clamp(26px,3vw,38px)' }}>Iconic People, Iconic Scents</h2>
          <div className="ugc-grid" style={ugcGrid}>
            {UGC_PHOTOS.map((photo) => (
              <div key={photo.src} className="ugc-item" style={ugcItem}>
                <img src={photo.src} alt={photo.alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REVIEWS */}
      <section id="reviews" style={narrowBand}>
        <div style={{ ...narrowWrap, textAlign: 'center' }}>
          <p style={S.label}>The verdict</p>
          {reviewData.count > 0 && (
            <div style={{ marginTop: 20, fontSize: 12, color: T.soft, letterSpacing: '0.04em' }}>
              <span style={{ color: T.ink, letterSpacing: '1.5px' }}>{'★'.repeat(Math.round(reviewData.average))}{'☆'.repeat(5 - Math.round(reviewData.average))}</span>
              {' '}{reviewData.average.toFixed(1)} average · {reviewData.count} review{reviewData.count === 1 ? '' : 's'}
            </div>
          )}
          <div style={{ marginTop: 30 }}>
            {reviewData.count === 0 && (
              <p style={{ color: T.soft, fontSize: 14, padding: '20px 0' }}>No reviews yet — be the first.</p>
            )}
            {reviewData.reviews.slice().reverse().map((r, i) => (
              <div key={r.id} style={{ ...reviewRow, borderTop: i === 0 ? 'none' : `1px solid ${T.line}` }}>
                <div style={{ color: T.ink, letterSpacing: '1.5px', fontSize: 12, marginBottom: 10 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                <p style={{ fontFamily: T.display, fontWeight: 300, fontSize: 18, lineHeight: 1.4, marginBottom: 10 }}>“{r.text}”</p>
                <cite style={{ fontStyle: 'normal', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.soft }}>{r.author}</cite>
              </div>
            ))}
          </div>

          <div style={reviewFormWrap}>
            <p style={{ ...S.label, marginBottom: 16 }}>Write a review</p>
            {reviewSubmitted ? (
              <p style={{ color: T.ink, fontSize: 14 }}>Thank you — your review has been submitted and will appear once it's approved.</p>
            ) : (
              <form onSubmit={handleReviewSubmit} style={{ textAlign: 'left', maxWidth: 420, margin: '0 auto' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 16 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                      style={starBtn}
                      aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    >
                      {n <= reviewForm.rating ? '★' : '☆'}
                    </button>
                  ))}
                </div>
                <textarea
                  placeholder="Share your experience with this scent…"
                  value={reviewForm.text}
                  onChange={(e) => setReviewForm({ ...reviewForm, text: e.target.value })}
                  style={reviewTextarea}
                  required
                />
                <input
                  placeholder="Your name"
                  value={reviewForm.author}
                  onChange={(e) => setReviewForm({ ...reviewForm, author: e.target.value })}
                  style={{ ...reviewInput, marginTop: 12 }}
                />
                {reviewError && <p style={{ color: '#a13d2b', fontSize: 13, marginTop: 12 }}>{reviewError}</p>}
                <button type="submit" disabled={reviewSubmitting} style={{ ...S.btnFill, width: '100%', justifyContent: 'center', marginTop: 16, opacity: reviewSubmitting ? 0.6 : 1 }}>
                  {reviewSubmitting ? 'Submitting…' : 'Submit review'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={narrowBand}>
        <div style={narrowWrap}>
          <p style={S.label}>Questions</p>
          <h2 style={{ ...S.h2, marginTop: 12, fontSize: 'clamp(26px,3vw,36px)' }}>Before you order.</h2>
          <div style={{ marginTop: 30 }}>
            {(product.faqs || FAQS).map(([q, a], i) => (
              <AccordionRow key={i} title={q} open={openFaq === i} onToggle={() => toggleFaq(i)}>
                <p style={{ fontSize: 14, color: T.soft, margin: 0 }}>{a}</p>
              </AccordionRow>
            ))}
          </div>
        </div>
      </section>

      {/* RELATED */}
      {related.length > 0 && (
        <section style={{ ...band, borderTop: `1px solid ${T.line}` }}>
          <div style={{ ...S.wrap, textAlign: 'center' }}>
            <p style={S.label}>Shop the full collection</p>
            <h2 style={{ ...S.h2, marginTop: 12 }}>More to <span style={S.it}>discover.</span></h2>
            <div className="related-grid" style={relatedGrid}>
              {related.map((p) => (
                <Link key={p.id} href={`/product/${p.id}`} className="related-item" style={relatedCard}>
                  <div style={relatedImg}><ProductVisual id={p.id} images={p.images} alt={p.name} width={104} /></div>
                  <div style={relatedText}>
                    <div style={{ fontFamily: T.display, fontWeight: 300, fontSize: 18 }}>{p.name}</div>
                    <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>${p.price}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Marquee />
      <Footer />

      <CartDrawer {...c} onClose={() => c.setOpen(false)} />

      {/* Floating add-to-cart bar */}
      <div style={stickyBar}>
        <div style={stickyBarInner}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.display, fontWeight: 300, fontSize: 18, color: T.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(251,245,241,0.7)', marginTop: 2 }}>${unitPrice}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={stickyQtyWrap}>
              <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} style={stickyQtyBtn} aria-label="Decrease quantity">−</button>
              <span style={{ ...qtyValue, color: T.white }}>{quantity}</span>
              <button onClick={() => setQuantity((q) => q + 1)} style={stickyQtyBtn} aria-label="Increase quantity">+</button>
            </div>
            <button onClick={handleAdd} style={stickyAddBtn}>Add to bag</button>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 760px) {
          .ugc-grid { grid-template-columns: none !important; grid-auto-flow: column; grid-auto-columns: 72%; overflow-x: auto; scroll-snap-type: x mandatory; gap: 10px !important; }
          .ugc-item { scroll-snap-align: start; }
        }
        @media (max-width: 640px) {
          .narrative-features { grid-template-columns: 1fr !important; gap: 16px !important; }
        }
        .pdp-grid { grid-template-columns: 1fr 1fr; }
        .related-grid { grid-template-columns: repeat(4, 1fr); }
        .related-item:nth-child(n + 2) { border-left: 1px solid ${T.line}; }
        .reel-track { scroll-snap-type: x mandatory; }
        .reel-item { scroll-snap-align: start; flex: 0 0 22%; }
        .thumb-col { flex-direction: column; }
        @media (max-width: 860px) {
          .reel-item { flex: 0 0 calc((100% - 40px) / 3); }
        }
        @media (max-width: 680px) {
          .pdp-grid { grid-template-columns: 1fr; }
          .pdp-gallery { flex-direction: column; }
          .thumb-col { flex-direction: row; }
          .related-grid { grid-template-columns: 1fr; }
          .related-item { border-left: none; }
          .related-item:nth-child(n + 2) { border-left: none; border-top: 1px solid ${T.line}; }
        }
      `}</style>
    </div>
  );
}

const grid = { display: 'grid', gap: 60, alignItems: 'start' };
const gallery = { display: 'flex', gap: 14 };
const imgSide = { position: 'relative', background: T.paper, aspectRatio: '4/5', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.line}`, overflow: 'hidden', flex: 1, minWidth: 0 };
const imageBadge = {
  position: 'absolute', top: 14, right: 14, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
  color: T.ink, background: 'rgba(251,245,241,0.92)', padding: '6px 10px', zIndex: 1, fontFamily: T.sans,
};
const thumbCol = { display: 'flex', gap: 10, flexShrink: 0 };
const thumbBtn = { width: 64, height: 64, padding: 0, border: '1px solid', cursor: 'pointer', overflow: 'hidden', background: 'none', flexShrink: 0 };
const infoCol = { position: 'sticky', top: 110 };
const pdpRating = {
  display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: T.soft, marginBottom: 14,
  fontFamily: T.sans, width: 'fit-content', borderBottom: `1px solid ${T.line}`, paddingBottom: 2,
};
// Brand value proposition, shown under every product's title.
const VALUE_PROP = 'Scents inspired by the places, flavors and culture you’re obsessed with, in small-batch body mists made to collect.';
const pdpValueProp = { fontSize: 15, lineHeight: 1.55, color: T.ink, maxWidth: '44ch', margin: '0 0 14px' };
const pdpTitle = { fontFamily: T.display, fontWeight: 300, fontSize: 'clamp(34px,4.4vw,54px)', lineHeight: 1.02, marginBottom: 10 };
const pdpTagline = { fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.soft, marginBottom: 14 };
const pdpDesc = { fontSize: 15, color: '#4a453c', maxWidth: '46ch', marginBottom: 22, lineHeight: 1.6 };
const pdpPrice = { fontFamily: T.display, fontWeight: 300, fontSize: 28, marginBottom: 22 };
const qtyWrap = { display: 'flex', alignItems: 'center', border: `1px solid ${T.line}`, height: 48 };
const qtyBtn = { width: 40, height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15, color: T.ink };
const qtyValue = { width: 30, textAlign: 'center', fontSize: 13 };
const badgeRow = { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.soft, marginTop: 4 };

const trioCard = {
  display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${T.line}`,
  padding: '16px', marginTop: 24,
};
const trioVisual = { width: 54, height: 54, flexShrink: 0, overflow: 'hidden', background: T.paper };
const trioAddBtn = {
  fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', border: 'none', background: 'none',
  borderBottom: `1px solid ${T.ink}`, padding: '0 0 4px', cursor: 'pointer', fontFamily: T.sans,
};

const band = { padding: '64px 0' };
const UGC_PHOTOS = [
  { src: '/images/si-ugc-1.webp', alt: 'Holding a bottle of Babygirl body mist' },
  { src: '/images/si-ugc-2.webp', alt: 'Babygirl body mist on the floor beside a cream handbag' },
  { src: '/images/si-ugc-3.webp', alt: 'Lying in the grass with a bottle of Babygirl' },
];
const ugcGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 32 };
const ugcItem = { aspectRatio: '9/16', overflow: 'hidden', background: T.paper, minWidth: 0 };
const narrowBand = { padding: '48px 0' };
const narrowWrap = { maxWidth: 720, margin: '0 auto', padding: '0 40px' };
const narrativeHeadline = { fontFamily: T.display, fontWeight: 400, fontSize: 'clamp(28px,3.4vw,40px)', lineHeight: 1.1, margin: '14px 0 0' };
const narrativeBody = { fontSize: 16, lineHeight: 1.7, margin: '16px 0 0', maxWidth: '58ch' };
// Brand promises shown under the narrative on every product page.
const BRAND_FEATURES = [
  ['Limited drops', 'Small batches, released in waves.'],
  ['Inspired by the culture', 'Places, flavors and moments you can’t stop thinking about.'],
  ['Made to collect', 'Every scent is a numbered drop in the archive.'],
];
const featureRow = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 24, marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(251,245,241,0.18)' };
const featureItem = { minWidth: 0 };
const featureTitle = { fontFamily: T.display, fontSize: 15, letterSpacing: '0.02em' };
const featureCopy = { fontSize: 13, lineHeight: 1.5, marginTop: 6 };

const accordionRow = { borderBottom: `1px solid ${T.line}` };
const accordionHeader = { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.ink, textAlign: 'left' };
const accordionIcon = { fontSize: 16, color: T.soft, fontFamily: T.display };
const accordionBody = { overflow: 'hidden', transition: 'max-height 0.35s ease, opacity 0.3s ease, padding-bottom 0.35s ease' };

const noteRow = { padding: '10px 0', borderBottom: `1px solid ${T.line}` };
const noteKey = { display: 'block', marginBottom: 6, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: T.soft };
const noteList = { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 };
const noteListItem = { fontFamily: T.display, fontWeight: 300, fontSize: 16, color: T.ink };

const benefitRow = { display: 'flex', gap: 24, padding: '28px 0', borderTop: `1px solid ${T.line}` };
const benefitNum = { fontFamily: T.display, fontWeight: 400, fontSize: 20, color: T.soft, flex: '0 0 40px' };

const reviewRow = { padding: '26px 0', textAlign: 'left' };
const reviewFormWrap = { marginTop: 40, paddingTop: 40, borderTop: `1px solid ${T.line}` };
const starBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, color: T.ink, lineHeight: 1, padding: 4 };
const reviewInput = {
  width: '100%', height: 46, padding: '0 14px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box',
};
const reviewTextarea = {
  width: '100%', minHeight: 100, padding: '12px 14px', border: `1px solid ${T.line}`, background: T.white,
  fontFamily: T.sans, fontSize: 14, color: T.ink, outline: 'none', boxSizing: 'border-box', resize: 'vertical',
};

const relatedGrid = { display: 'grid', marginTop: 50, border: `1px solid ${T.line}` };
const relatedCard = { textAlign: 'center', display: 'block', textDecoration: 'none', color: 'inherit' };
const relatedImg = { aspectRatio: '1/1', display: 'block', width: '100%', overflow: 'hidden' };
const relatedText = { padding: '16px 20px 40px' };

const reelTrack = { display: 'flex', gap: 20, overflowX: 'auto', marginTop: 44, paddingBottom: 6 };
const reelItem = { aspectRatio: '9/16', objectFit: 'cover', background: T.paper, border: `1px solid ${T.line}`, minWidth: 0, borderRadius: 10 };

const stickyBar = {
  position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 150,
  background: T.ink, borderTop: `1px solid ${T.ink}`, boxShadow: '0 -1px 0 rgba(0,0,0,0.6)',
  padding: '14px 0',
};
const stickyBarInner = {
  maxWidth: T.maxw, margin: '0 auto', padding: '0 40px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
};
const stickyQtyWrap = { display: 'flex', alignItems: 'center', border: `1px solid ${T.dline}`, height: 40 };
const stickyQtyBtn = { width: 32, height: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: T.white };
const stickyAddBtn = {
  ...S.btnFill, background: T.white, color: T.ink, height: 40, padding: '0 22px',
};
