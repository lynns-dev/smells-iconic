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
      {!product.archived && <button type="button" aria-label={`Add ${product.name} to cart`} title={`Add ${product.name} to cart`} onClick={onAdd} style={{flex:'0 0 44px',width:44,height:44,borderRadius:'50%',border:'1px solid #B8B8B8',background:'#FFFFFF',color:'#707070',display:'grid',placeItems:'center',fontSize:25,lineHeight:1,fontFamily:T.sans,cursor:'pointer',padding:0}}><span aria-hidden="true">+</span></button>}
    </div>
    {product.archived && <BringBackButton product={product} style={{marginTop:12,textAlign:'left'}} />}
  </>;
}
