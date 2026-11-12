import { getCheckoutLayoutTest, changeCheckoutLayoutTest } from '../../../../lib/email/checkoutLayoutTest';
import { getFlowStats } from '../../../../lib/email/flowStats';
import { renderAbandonedEmail } from '../../../../lib/abandonedCheckout';
import { getFeaturedProducts } from '../../../../lib/products';
export default async function handler(req,res) {
  if (!['GET','POST'].includes(req.method)) {res.setHeader('Allow','GET, POST');return res.status(405).end();}
  try {
    const test = req.method === 'POST' ? await changeCheckoutLayoutTest(req.body?.action, req.body?.winner) : await getCheckoutLayoutTest();
    const stats = (await getFlowStats([{flowId:'abandoned_checkout',stepIndex:0}])).get('abandoned_checkout:0');
    const cart = getFeaturedProducts().slice(0,2).map(p=>({id:p.id,name:p.name,price:p.price,quantity:1}));
    const sample = {key:'preview-only',name:'',cart};
    return res.status(200).json({test,results:stats?.tests?.[test.testId] || null,previews:{a:renderAbandonedEmail({...sample,variant:'a'}).html,b:renderAbandonedEmail({...sample,variant:'b'}).html}});
  } catch(e) {return res.status(400).json({error:e.message});}
}
