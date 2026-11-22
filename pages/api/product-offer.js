import { issueOffer, verifyOffer } from '../../lib/productOfferServer';
import { OFFER_TEST, offerActive } from '../../lib/productOffer';
import { recordExposure } from '../../lib/experimentsStore';
import { isExcludedTraffic } from '../../lib/ipFilter';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).end();
  try {
    if(!offerActive()) return res.status(200).json({ended:true});
    if(req.body?.expose) {
      const saved=verifyOffer(req.body.token);
      if(!saved) return res.status(400).json({error:'Invalid offer'});
      if(!isExcludedTraffic(req)) await recordExposure(OFFER_TEST,saved.variant,saved.visitorId);
      return res.status(200).json({ok:true});
    }
    const assignment=issueOffer(req.body?.visitorId);
    return res.status(200).json(assignment || {ended:true});
  } catch { return res.status(503).json({error:'Offer unavailable'}); }
}
