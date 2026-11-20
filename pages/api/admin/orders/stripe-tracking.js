import { queueExistingStripeTracking, retryStripeTracking, stripeTrackingSummary } from '../../../../lib/stripeTracking';
export default async function handler(req,res) {
  if(req.method === 'GET') {try{return res.status(200).json(await stripeTrackingSummary());}catch{return res.status(500).json({error:'Tracking summary unavailable.'});}}
  if(req.method !== 'POST') {res.setHeader('Allow','GET, POST');return res.status(405).end();}
  try {
    const queued = await queueExistingStripeTracking();
    const results = await retryStripeTracking();
    return res.status(200).json({queued,...await stripeTrackingSummary()});
  } catch {return res.status(500).json({error:'Could not finish queuing existing tracking. Retry safely; no payments or customer emails are triggered.'});}
}
