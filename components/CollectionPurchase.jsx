import React from 'react';
import { BringBackButton } from './Archived';
import { T } from '../lib/theme';

export default function CollectionPurchase({ product, onAdd }) {
  return <>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:12}}>
      <div style={{fontSize:13,lineHeight:1.5,minWidth:0}}>
        <span>${product.price}{product.originalPrice > product.price && <s style={{color:T.soft,marginLeft:6}}>${product.originalPrice}</s>}</span>
        {product.size && <span style={{display:'block',fontSize:12,color:T.soft}}>{product.size}</span>}
      </div>
      {!product.archived && <button type="button" aria-label={`Add ${product.name} to cart`} title={`Add ${product.name} to cart`} onClick={onAdd} style={{flex:'0 0 32px',width:32,height:32,borderRadius:'50%',border:'1px solid #B8B8B8',background:'#FFFFFF',color:'#707070',display:'grid',placeItems:'center',fontSize:25,lineHeight:1,fontFamily:T.sans,cursor:'pointer',padding:0}}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" style={{display:'block'}}><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg></button>}
    </div>
    {product.archived && <BringBackButton product={product} style={{marginTop:12,textAlign:'left'}} />}
  </>;
}
