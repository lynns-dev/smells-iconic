import React from 'react';
import { useCart } from '../lib/useCart';
import { MIST_IDS, offerActive } from '../lib/productOffer';
import { PRODUCTS } from '../lib/products';
import { T } from '../lib/theme';
export default function ProductOffer({product}) {
  const c=useCart();
  const eligible=MIST_IDS.includes(product.id) && !product.archived;
  React.useEffect(()=>{if(eligible) c.startProductOffer();},[eligible,c.startProductOffer]);
  if(!eligible || !c.offer || !offerActive() || c.offer.variant==='control') return null;
  const mix=c.offer.variant==='mix_match';
  const mists=PRODUCTS.filter(p=>MIST_IDS.includes(p.id)).map(c.resolveProduct).filter(p=>!p.archived);
  const units=c.cart.filter(i=>MIST_IDS.includes(i.id)).reduce((n,i)=>n+i.quantity,0);
  const target=mix?3:4;
  const selected=c.cart.filter(i=>MIST_IDS.includes(i.id)).flatMap(i=>Array.from({length:i.quantity},()=>i));
  const saving=c.offerDiscountAmount;
  const qualified=saving>0;
  const add=p=>{c.add(p);c.setOpen(false);};
  const gross=selected.reduce((sum,i)=>sum+i.price,0);
  return <section className="offer-builder" aria-label="Build your body mist set">
    <div className="offer-heading"><span>TODAY’S OFFER</span><span className="offer-value">{mix?'3 FOR $64':'FREE $32 MIST'}</span></div>
    <h2>{mix?'Your scents. Your set.':'Build your bag. Pick your gift.'}</h2>
    <p className="offer-intro">{mix?'Pick any three body mists. The cheapest one is on us.':'Spend over $75 on paid body mists, then choose an extra mist free. At $32 each, add three paid mists and a fourth as your gift.'}</p>
    <div className="set-slots" aria-label="Your selected bottles">{Array.from({length:target},(_,index)=>{
      const item=selected[index];const free=index===target-1;
      return <div key={index} className={`set-slot ${free?'free-slot':''}`}>
        {item?<img src={item.images?.[0]} alt={item.name}/>:<span className="empty-slot" aria-hidden="true">+</span>}
        <span>{free?(item?'FREE MIST':'YOUR FREE MIST'):item?'SELECTED':`PICK ${index+1}`}</span>
      </div>;
    })}</div>
    <div className="offer-progress" role="progressbar" aria-label="Progress toward your free mist" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(units,target)}><div style={{width:`${Math.min(100,units/target*100)}%`}}/></div>
    <p className="progress-copy" aria-live="polite">{qualified?'Your free mist is unlocked!':`${Math.max(0,target-units)} more ${target-units===1?'bottle':'bottles'} to complete your set`}{units>target?` · ${units} bottles in your bag`:''}</p>
    <div className="scent-picker">{mists.map(p=>{
      const qty=c.cart.find(i=>i.id===p.id)?.quantity||0;
      return <article key={p.id} className="scent-choice"><img src={p.images[0]} alt="" loading="lazy"/><div className="scent-info"><h3>{p.name.replace(' Body Mist','')}</h3><p>{p.tagline}</p><span>$32{qty>0?` · ${qty} in bag`:''}</span></div><div className="scent-controls">{qty>0&&<button type="button" aria-label={`Remove one ${p.name}`} onClick={()=>c.setQty(p.id,qty-1)}>−</button>}<button type="button" aria-label={`Add ${p.name} to set`} onClick={()=>add(p)}>+</button></div></article>;
    })}</div>
    <div key={qualified?'unlocked':'building'} className={`set-total ${qualified?'discount-unlocked':''}`} aria-live="polite">
      {qualified?<><span className="unlock-title">✓ FREE MIST UNLOCKED</span><div className="saving-line"><span>Set savings</span><strong>−${saving.toFixed(2)}</strong></div><div className="saving-line"><span>Body mist total</span><span><s>${gross.toFixed(2)}</s> <strong>${(gross-saving).toFixed(2)}</strong></span></div></>:<><strong>{mix?'Your third mist = $0.':'Your gift = $0.'}</strong><span>Complete your set to unlock the savings.</span></>}
    </div>
    <button className="view-set" type="button" disabled={!units} onClick={()=>c.setOpen(true)}>View your bag{units?` · ${units} ${units===1?'mist':'mists'}`:''} →</button>
    <p className="offer-terms">Body mists only. {mix?'Cheapest eligible mist free for each set of three.':'One free mist per order; paid body-mist spend must exceed $75, excluding the gift.'} No stacking: checkout applies the larger saving from this offer or your code. Free shipping.</p>
    <style jsx>{`
      .offer-builder{border:1px solid #dfc5c9;background:#fff9f7;padding:22px;margin:24px 0;color:#251a1d}
      .offer-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;font-weight:700;letter-spacing:.1em}
      .offer-value{background:#650f24;color:white;padding:8px 10px;white-space:nowrap}
      h2{font-family:${T.display};font-weight:400;font-size:28px;line-height:1.15;margin:20px 0 12px}.offer-intro{font-size:13px;line-height:1.6;margin:0 0 22px}
      .set-slots{display:flex;gap:8px}.set-slot{flex:1;min-width:0;border:1px solid #dfc5c9;background:white;display:flex;flex-direction:column;align-items:center;padding:6px 3px}.free-slot{border:2px solid #650f24;background:#f5e4e7}
      .set-slot img{width:100%;height:92px;object-fit:contain}.empty-slot{height:92px;display:grid;place-items:center;font-size:28px;color:#a77c85}.set-slot>span:last-child{font-size:8px;font-weight:700;letter-spacing:.04em;padding:8px 0;text-align:center}
      .offer-progress{height:5px;background:#eadadd;margin-top:18px;overflow:hidden}.offer-progress>div{height:100%;background:#650f24;transition:width .4s ease}.progress-copy{font-size:12px;font-weight:600;margin:10px 0 22px}
      .scent-picker{display:grid;gap:8px}.scent-choice{display:flex;align-items:center;gap:10px;background:white;border:1px solid #eadadd;padding:8px}.scent-choice>img{width:52px;height:65px;object-fit:contain}.scent-info{flex:1;min-width:0}.scent-info h3{font-size:13px;margin:0 0 4px;font-weight:600}.scent-info p{font-size:10px;line-height:1.4;color:#746368;margin:0 0 5px}.scent-info span{font-size:11px}.scent-controls{display:flex;gap:4px}.scent-controls button{width:32px;height:32px;border:1px solid #bda1a7;background:white;border-radius:50%;font-size:20px;line-height:1;display:grid;place-items:center;padding:0;cursor:pointer}
      .set-total{display:grid;gap:8px;background:#f1e5e7;padding:18px;margin-top:18px;font-size:13px}.set-total>span{font-size:12px}.discount-unlocked{background:#650f24;color:white;animation:offer-unlock .65s ease both}.unlock-title{font-size:11px!important;font-weight:700;letter-spacing:.09em}.saving-line{display:flex;justify-content:space-between;gap:10px;align-items:center}.saving-line s{opacity:.65;font-size:12px;margin-right:8px}.saving-line strong{font-size:20px}
      .view-set{width:100%;padding:15px 10px;border:0;background:#251a1d;color:white;font-size:12px;font-weight:700;margin-top:12px;cursor:pointer}.view-set:disabled{opacity:.5}.offer-terms{font-size:10px;line-height:1.6;margin:14px 0 0}.offer-builder button:focus-visible{outline:2px solid #650f24;outline-offset:3px}
      @keyframes offer-unlock{0%{transform:scale(.96);box-shadow:0 0 0 0 #d9a8b3}55%{transform:scale(1.025);box-shadow:0 0 0 8px transparent}100%{transform:scale(1);box-shadow:none}}
      @media(prefers-reduced-motion:reduce){.discount-unlocked{animation:none}.offer-progress>div{transition:none}}
      @media(max-width:400px){.offer-builder{padding:16px}.set-slot img,.empty-slot{height:70px}.set-slots{gap:5px}h2{font-size:25px}}
    `}</style>
  </section>;
}
