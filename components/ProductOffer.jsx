import React from 'react';
import { useCart } from '../lib/useCart';
import { offerActive, MIST_IDS } from '../lib/productOffer';
import { PRODUCTS } from '../lib/products';
export default function ProductOffer({product}) {
 const c=useCart();
 const [chosen,setChosen]=React.useState('babygirl');
 const eligible=!product.archived;
 React.useEffect(()=>{if(eligible)c.startProductOffer();},[eligible,c.startProductOffer]);
 if(!eligible || !c.offer || !offerActive())return null;
 const mists=PRODUCTS.filter(p=>MIST_IDS.includes(p.id)).map(c.resolveProduct).filter(p=>!p.archived);
 const saving=c.offerDiscountAmount;
 const paid=c.total-saving;
 const ready=paid>=75;
 const selected=mists.find(p=>p.id===chosen)||mists[0];
 return <section className="gift-card" aria-label="Free body mist with $75 purchase">
  <img src={selected?.images[0]} alt={selected?.name||'Free body mist'}/>
  <div className="gift-content"><h2>Spend $75. Pick a free mist.</h2><p>Shop any products. Your gift is worth $32.</p>
   <div className="progress" role="progressbar" aria-label="Progress toward $75 purchase" aria-valuemin={0} aria-valuemax={75} aria-valuenow={Math.min(75,paid)}><span style={{width:`${Math.min(100,paid/75*100)}%`}}/></div>
   <p className="status" aria-live="polite">{saving?'✓ Free mist added · $32 saved':ready?'Your gift is unlocked—choose below.':`$${(75-paid).toFixed(2)} away from your free mist`}</p>
   {!saving&&<div className="gift-choice"><select aria-label="Choose your free mist" value={selected?.id||''} onChange={e=>setChosen(e.target.value)}>{mists.map(p=><option key={p.id} value={p.id}>{p.name.replace(' Body Mist','')}</option>)}</select><button type="button" disabled={!ready||!selected} onClick={()=>{c.add(selected);c.setOpen(false);}}>Add gift</button></div>}
   {saving>0&&<div className="saved" key="unlocked" role="status">Gift <s>$32</s> <strong>FREE</strong><button type="button" onClick={()=>c.setOpen(true)}>View bag →</button></div>}
   <details><summary>Offer details</summary><p>$75 in products before shipping, excluding the free gift. One free body mist per order. Stacks with one discount code on paid products. The $75 threshold is before code discounts.</p></details>
  </div>
  <style jsx>{`
   .gift-card{border-radius:16px;display:flex;gap:12px;padding:16px;border:1px solid #dedede;background:#ffffff;margin:20px 0;color:#111111}.gift-card>img{width:64px;height:90px;object-fit:contain;align-self:flex-start}.gift-content{flex:1;min-width:0}h2{font-size:17px;line-height:1.3;margin:0 0 5px}p{font-size:12px;line-height:1.5;margin:0 0 10px}.progress{border-radius:4px;overflow:hidden;height:4px;background:#eeeeee}.progress span{display:block;height:100%;background:#111111;transition:width .3s}.status{font-size:11px;font-weight:600;margin:8px 0}.gift-choice{display:flex;gap:6px}select{border-radius:8px;width:100%;min-width:0;font-size:12px;border:1px solid #dddddd;background:white;padding:8px}button{border-radius:8px;white-space:nowrap;border:0;background:#111111;color:white;padding:9px 12px;font-size:11px;cursor:pointer}button:disabled{opacity:.4;cursor:default}.saved{border-radius:8px;display:flex;gap:8px;align-items:center;background:#111111;color:white;padding:10px;font-size:12px;animation:unlock .5s ease}.saved button{margin-left:auto;padding:0;text-decoration:underline}.saved s{opacity:.6}details{margin-top:10px;font-size:10px}summary{cursor:pointer}details p{font-size:10px;margin:8px 0 0}@keyframes unlock{0%{transform:scale(.97)}60%{transform:scale(1.02)}100%{transform:scale(1)}}@media(prefers-reduced-motion:reduce){.saved{animation:none}.progress span{transition:none}}@media(max-width:400px){.gift-card{padding:12px;gap:8px}.gift-card>img{width:42px;height:64px}h2{font-size:16px}}
  `}</style>
 </section>;
}
