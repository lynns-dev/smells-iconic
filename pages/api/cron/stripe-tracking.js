import { retryStripeTracking } from '../../../lib/stripeTracking';
export default async function handler(req,res) {
  if(req.method !== 'GET') return res.status(405).end();
  if(!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end();
  try {const results=await retryStripeTracking();return res.status(200).json({processed:results.length,pending:results.filter(r=>r.status !== 'synced').length});}
  catch {return res.status(500).json({error:'Tracking retry unavailable.'});}
}
