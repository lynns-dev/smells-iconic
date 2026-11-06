// Admin → Texts (pages/admin/email.jsx): ResendSMS connection + credits,
// the automated text flows, one-off broadcasts, test texts and opt-outs.
// Behind the admin login (middleware.js). Sends cost ResendSMS credits —
// every send here is an explicit admin action.
import { createHash } from 'crypto';
import { getSmsSubscribers, setSmsStatus, normalizeUsPhone } from '../../../lib/email/smsStore';
import { sendSms, getSmsBalance, smsConfigured, smsSegments } from '../../../lib/sms/resendSms';
import {
  getSmsAutomations, updateSmsAutomation, SMS_FLOW_DESCRIPTIONS, SEND_WINDOW, inSendWindow,
  createTrackedLink, fillMessage, logSmsEvent, getSmsLog, claimOnce,
} from '../../../lib/sms/smsAutomations';
import { getFlowStats, bumpFlowStat } from '../../../lib/email/flowStats';

const BATCH = 100;

async function overview() {
  const [flows, subs, log] = await Promise.all([getSmsAutomations(), getSmsSubscribers(), getSmsLog()]);
  let balance = null;
  let balanceError = null;
  if (smsConfigured()) {
    try { balance = await getSmsBalance(); } catch (err) { balanceError = err.message; }
  }
  const broadcasts = log.filter((e) => e.broadcastId).slice(0, 20);
  const statKeys = [...flows.map((f) => ({ flowId: f.id, stepIndex: 0 })), ...broadcasts.map((b) => ({ flowId: `sms_bc_${b.broadcastId}`, stepIndex: 0 }))];
  const stats = await getFlowStats(statKeys).catch(() => new Map());
  return {
    configured: smsConfigured(),
    balance,
    balanceError,
    sendWindow: SEND_WINDOW,
    inSendWindow: inSendWindow(),
    subscribed: subs.filter((s) => s.status === 'subscribed').length,
    unsubscribed: subs.filter((s) => s.status === 'unsubscribed').length,
    flows: flows.map((f) => ({ ...f, description: SMS_FLOW_DESCRIPTIONS[f.id] || '', segments: smsSegments(fillMessage(f.message, { link: 'https://smellsiconic.com/t/xxxxxxxx', product: 'Babygirl Body Mist' })), stats: stats.get(`${f.id}:0`) || null })),
    broadcasts: broadcasts.map((b) => ({ ...b, stats: stats.get(`sms_bc_${b.broadcastId}:0`) || null })),
    recent: log.filter((e) => !e.broadcastId).slice(0, 25),
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return res.status(200).json(await overview());

    if (req.method === 'PUT') {
      const { id, enabled, message, delayMinutes } = req.body || {};
      const flow = await updateSmsAutomation(String(id), { enabled, message, delayMinutes });
      return res.status(200).json({ flow });
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};

      if (action === 'status') {
        const sub = await setSmsStatus(req.body.phone, req.body.status);
        return res.status(200).json({ subscriber: sub });
      }

      if (action === 'test') {
        const phone = normalizeUsPhone(req.body.phone);
        if (!phone) return res.status(400).json({ error: 'Enter a valid US mobile number.' });
        const message = fillMessage(req.body.message || '', { link: 'https://smellsiconic.com/shop', product: 'Babygirl Body Mist' });
        const result = await sendSms(phone, message);
        await logSmsEvent({ flow: 'test', phone }).catch(() => {});
        return res.status(200).json({ ok: true, result });
      }

      if (action === 'broadcast') {
        const template = String(req.body.message || '').trim();
        if (!template) return res.status(400).json({ error: 'Write a message first.' });
        if (!/stop/i.test(template)) return res.status(400).json({ error: 'Add an opt-out line, e.g. "Reply STOP to opt out".' });
        if (!inSendWindow()) return res.status(400).json({ error: 'Texts only go out 11am–8pm Eastern. Try again then.' });
        const recipients = (await getSmsSubscribers()).filter((s) => s.status === 'subscribed' && s.consentAt).map((s) => s.phone);
        if (!recipients.length) return res.status(400).json({ error: 'Nobody is on the text list yet.' });
        // The page shows the count before the admin confirms; refuse if it changed since.
        if (Number(req.body.confirmCount) !== recipients.length) {
          return res.status(409).json({ error: `The list now has ${recipients.length} numbers — review and confirm again.`, count: recipients.length });
        }
        const lockKey = `sms_broadcast_lock:${createHash('sha256').update(template).digest('hex').slice(0, 16)}`;
        if (!(await claimOnce(lockKey, 10 * 60))) return res.status(429).json({ error: 'This exact message was just sent. Wait 10 minutes to send it again.' });

        const broadcastId = Date.now().toString(36);
        const path = String(req.body.link || '/shop');
        const link = template.includes('{{LINK}}')
          ? await createTrackedLink(`sms_bc_${broadcastId}`, `${path}${path.includes('?') ? '&' : '?'}utm_source=sms&utm_medium=sms&utm_campaign=broadcast_${broadcastId}`)
          : null;
        const message = fillMessage(template, { link: link?.url || '' });
        const { segments } = smsSegments(message);
        const balance = await getSmsBalance();
        const needed = recipients.length * segments;
        if (balance.credits < needed) {
          return res.status(402).json({ error: `Not enough ResendSMS credits: need about ${needed}, have ${balance.credits}. Top up at resendsms.com.` });
        }

        let sent = 0;
        const errors = [];
        for (let i = 0; i < recipients.length; i += BATCH) {
          const batch = recipients.slice(i, i + BATCH);
          try {
            await sendSms(batch, message);
            sent += batch.length;
          } catch (err) {
            errors.push(err.message);
            if (/credit/i.test(err.message)) break;
          }
        }
        if (sent) await bumpFlowStat(`sms_bc_${broadcastId}`, 0, 'sent', null, sent).catch(() => {});
        await logSmsEvent({ broadcastId, message, recipients: recipients.length, sent, errors: errors.slice(0, 3) }).catch(() => {});
        return res.status(errors.length && !sent ? 502 : 200).json({ ok: sent > 0, sent, errors });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    }

    res.setHeader('Allow', 'GET, PUT, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
