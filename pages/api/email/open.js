// Open-tracking pixel for automation emails (lib/email/automationSend.js,
// lib/abandonedCheckout.js). Counts one unique open per send. Apple Mail
// Privacy Protection preloads images, so open rate reads high — it's for
// spotting deliverability problems and comparing subject lines; judge
// content on click rate (lib/email/flowStats.js).
import { bumpFlowStat, claimFirst } from '../../../lib/email/flowStats';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const SEND_ID_RE = /^[0-9a-f-]{8,64}$/i;
const FLOW_ID_RE = /^[a-z0-9_]{1,64}$/;

export default async function handler(req, res) {
  const { f: flowId, st: stepIndex, s: sendId, t: testId, v: variant } = req.query;
  const stepIdx = Number(stepIndex);
  if (FLOW_ID_RE.test(String(flowId || '')) && Number.isInteger(stepIdx) && stepIdx >= 0 && stepIdx < 50 && SEND_ID_RE.test(String(sendId || ''))) {
    try {
      if (await claimFirst('open', String(sendId))) {
        const test = testId && (variant === 'a' || variant === 'b') ? { testId: String(testId).slice(0, 16), variant } : null;
        await bumpFlowStat(String(flowId), stepIdx, 'opened', test);
      }
    } catch (err) {
      console.error('Open tracking failed:', err.message);
    }
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Content-Length', GIF.length);
  return res.status(200).send(GIF);
}
