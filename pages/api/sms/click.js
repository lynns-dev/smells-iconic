// Short tracked links in texts: smellsiconic.com/t/<id> (rewritten here by
// next.config.js). Counts the click against the text's flow
// (lib/email/flowStats.js) and redirects to the stored site path. The
// redirect never waits on, or fails because of, the counting.
import { resolveTrackedLink } from '../../../lib/sms/smsAutomations';
import { bumpFlowStat, claimFirst } from '../../../lib/email/flowStats';

export default async function handler(req, res) {
  let target = '/';
  try {
    const link = await resolveTrackedLink(req.query.id);
    if (link) {
      target = link.path;
      await Promise.allSettled([
        bumpFlowStat(link.flowId, 0, 'clicks'),
        claimFirst('smsclick', String(req.query.id)).then((first) => first && bumpFlowStat(link.flowId, 0, 'clickers')),
      ]);
    }
  } catch (err) {
    console.error('SMS click tracking failed:', err.message);
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, target);
}
