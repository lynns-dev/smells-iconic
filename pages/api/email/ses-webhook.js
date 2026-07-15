// Receives SES bounce/complaint notifications via an SNS topic (set up as
// part of an SES Configuration Set — see DEPLOYMENT.md). This is what
// keeps the complaint rate under Gmail/Yahoo's bulk-sender threshold
// automatically: a permanent bounce or a spam complaint suppresses that
// address immediately instead of relying on someone noticing later.
//
// SNS posts as text/plain with a JSON body, so the default Next.js JSON
// body parser (which only fires for application/json) is disabled and the
// raw body is read + parsed manually. Every message's signature is
// verified (lib/snsVerify.js) before it's trusted, since this endpoint is
// public and an unverified "Complaint" event would let anyone suppress an
// arbitrary subscriber.

import { suppressByEmail } from '../../../lib/subscribersStore';
import { verifySnsMessage } from '../../../lib/snsVerify';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  let msg;
  try {
    msg = JSON.parse(await readRawBody(req));
  } catch {
    return res.status(400).end();
  }

  const verified = await verifySnsMessage(msg).catch(() => false);
  if (!verified) return res.status(403).end();

  const expectedTopic = process.env.SES_SNS_TOPIC_ARN;
  if (expectedTopic && msg.TopicArn !== expectedTopic) return res.status(403).end();

  if (msg.Type === 'SubscriptionConfirmation') {
    // SNS requires visiting SubscribeURL once to activate the subscription.
    await fetch(msg.SubscribeURL).catch(() => {});
    return res.status(200).end();
  }

  if (msg.Type === 'Notification') {
    let event;
    try {
      event = JSON.parse(msg.Message);
    } catch {
      return res.status(200).end();
    }

    const recipients = event.mail?.destination || [];

    if (event.eventType === 'Bounce' && event.bounce?.bounceType === 'Permanent') {
      await Promise.all(recipients.map((email) => suppressByEmail(email, 'bounce')));
    } else if (event.eventType === 'Complaint') {
      const complained = (event.complaint?.complainedRecipients || []).map((r) => r.emailAddress);
      await Promise.all((complained.length ? complained : recipients).map((email) => suppressByEmail(email, 'complaint')));
    }
  }

  return res.status(200).end();
}
