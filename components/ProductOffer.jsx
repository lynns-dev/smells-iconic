import React from 'react';
import Link from 'next/link';
import { useCart } from '../lib/useCart';
import { OFFER_TEST, MIST_IDS, offerActive } from '../lib/productOffer';
import { PRODUCTS } from '../lib/products';
import { T } from '../lib/theme';
export default function ProductOffer({product}) {
  const c=useCart();
  const [chosen,setChosen]=React.useState('babygirl');
  const eligible=MIST_IDS.includes(product.id) && !product.archived;
  React.useEffect(()=>{if(eligible) c.startProductOffer();},[eligible,c.startProductOffer]);
  React.useEffect(()=>{
    if(!eligible || !c.offer || !offerActive()) return;
    // Record only after the assigned product-page experience has rendered.
    try {localStorage.setItem(`si-exp-seen:${OFFER_TEST}`,c.offer.variant);} catch {}
    fetch('/api/product-offer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expose:true,token:c.offer.token}),keepalive:true}).catch(()=>{});
  },[eligible,c.offer]);
  if(!eligible || !c.offer || !offerActive() || c.offer.variant==='control') return null;
  const mix=c.offer.variant==='mix_match';
  const mists=PRODUCTS.filter(p=>MIST_IDS.includes(p.id)).map(c.resolveProduct).filter(p=>!p.archived);
  const units=c.cart.filter(i=>MIST_IDS.includes(i.id)).reduce((n,i)=>n+i.quantity,0);
  return <section aria-label="Today's body mist offer" style={{border:`1px solid ${T.line}`,padding:20,margin:'24px 0',background:'#faf8f6'}}>
    <p style={{fontSize:11,letterSpacing:1,margin:'0 0 10px'}}>TODAY ONLY · ENDS NOV 22, 11:59 PM PACIFIC</p>
    <h2 style={{fontSize:22,lineHeight:1.25,margin:'0 0 12px'}}>{mix?'Buy 2, get 1 free. Mix your moods.':'A free body mist, worth $32, when you spend over $75.'}</h2>
    <p style={{fontSize:13,lineHeight:1.6}}>{mix?'Mix and match any available $32 body mists. Add three to your bag; the cheapest mist is free. Repeats for each set of three.':'Spend over $75 on paid body mists, then add one more mist of your choice as your gift. One free mist per order.'}</p>
    <Link href="/shop" style={{fontSize:13,textUnderlineOffset:4}}>Mix &amp; match body mists →</Link>
    {!mix && <div style={{marginTop:16}}><label style={{display:'block',fontSize:13,marginBottom:8}} htmlFor="offer-gift-choice">Choose your gift</label><select id="offer-gift-choice" value={chosen} onChange={e=>setChosen(e.target.value)} style={{width:'100%',padding:10,border:`1px solid ${T.line}`,background:'white'}}>{mists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button type="button" disabled={units<3 || c.offerDiscountAmount>0} onClick={()=>{const p=mists.find(p=>p.id===chosen);if(p)c.add(p);}} style={{marginTop:10,padding:'12px 16px',background:T.ink,color:'white',border:0,cursor:'pointer',opacity:units<3 || c.offerDiscountAmount>0 ? .5:1}}>{c.offerDiscountAmount>0?'Gift included in your bag':units<3?'Add 3 paid mists to unlock your gift':'Add my free gift'}</button></div>}
    {c.offerDiscountAmount>0 && <p style={{fontSize:13}}>Your bag qualifies for ${c.offerDiscountAmount.toFixed(2)} off.</p>}
    <p style={{fontSize:11,lineHeight:1.6,marginBottom:0}}>Body mists only. Add every bottle, including the free one, to your bag. No stacking: checkout applies the larger of this offer or your discount code. Free shipping. Offer pricing is reserved when payment starts before midnight; new checkouts after midnight use current pricing.</p>
  </section>;
}
