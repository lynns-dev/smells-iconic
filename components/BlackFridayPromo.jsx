import React from 'react';
import Link from 'next/link';
import { activePromo } from '../lib/promos';
import { T, S } from '../lib/theme';
export default function BlackFridayPromo() {
  const [active,setActive]=React.useState(false);
  React.useEffect(()=>{const check=()=>setActive(activePromo()?.code==='BLACKFRIDAY20');check();const timer=setInterval(check,60000);return()=>clearInterval(timer);},[]);
  if(!active) return null;
  return <section className="bf-promo" aria-label="Black Friday sale">
    <div className="bf-photo"><img src="/images/si-black-friday-bows.jpg" alt="Babygirl body mists tied with blue, burgundy and pink bows" fetchPriority="high" /></div>
    <div className="bf-copy"><p style={{...S.label,color:'#fff'}}>The Black Friday sale</p><h1>Their next<br /><em>signature scent.</em></h1><p style={{fontSize:16,lineHeight:1.6,margin:'0 0 24px'}}>Give a scent they’ll love wearing.</p><p className="bf-saving">20% off sitewide.</p><p className="bf-code">Use code <strong>BLACKFRIDAY20</strong></p><Link href="/shop" className="bf-shop">Shop the sale →</Link><p className="bf-terms">Free shipping on every order. Cannot be combined with other offers.</p></div>
    <style jsx>{`
      .bf-promo{display:grid;grid-template-columns:1fr 1fr;background:#650F24;color:white}
      .bf-photo{height:650px;overflow:hidden}.bf-photo img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 48%}
      .bf-copy{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:64px clamp(28px,5vw,90px)}
      .bf-copy h1{font-family:${T.display};font-size:clamp(36px,4.3vw,66px);font-weight:300;line-height:1.08;margin:24px 0 30px;letter-spacing:-.025em}
      .bf-saving{font-size:clamp(24px,2.6vw,36px);margin:0 0 16px}.bf-code{font-size:15px;letter-spacing:.06em;margin:0 0 30px}
      .bf-copy :global(.bf-shop){display:inline-block;color:#650F24;background:#fff;text-decoration:none;padding:17px 28px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      .bf-copy :global(.bf-shop:focus-visible){outline:2px solid white;outline-offset:5px}
      .bf-terms{font-size:11px;line-height:1.6;margin:24px 0 0;max-width:36ch;color:#fff}
      @media(max-width:680px){.bf-promo{grid-template-columns:1fr}.bf-photo{height:420px}.bf-photo img{object-position:center 52%}.bf-copy{padding:38px 24px 42px}.bf-copy h1{font-size:40px;margin:18px 0 24px}}
    `}</style>
  </section>;
}
