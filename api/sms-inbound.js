// Twilio "A message comes in" webhook: yards reply YES <price> / NO to a part request.
const db = require('../lib/db');
const { readRaw, money } = require('../lib/util');
const { verifyTwilio, toE164 } = require('../lib/sms');
const { notifyAdmin } = require('../lib/mail');
const { sendBestOffer } = require('../lib/offer');

const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
function twiml(res, message) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/xml');
  res.end('<?xml version="1.0" encoding="UTF-8"?><Response>' + (message ? '<Message>' + xmlEsc(message) + '</Message>' : '') + '</Response>');
}

const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|arret|arrêt)\s*$/i;
const NO_WORDS = /^\s*(no|n|nope|nah|sorry|non|don'?t|do not|not available|none|negative)\b/i;
const YES_WORDS = /^\s*(yes|y|yeah|yep|yup|si|sí|oui|ok|okay|have it|got it|available)\b/i;

// Returns { kind: 'stop'|'no'|'yes'|'unclear', priceCents, ref }
function parseReply(body) {
  const text = String(body || '').trim();
  if (STOP_WORDS.test(text)) return { kind: 'stop' };
  const refMatch = text.match(/#\s*([0-9A-F]{8})\b/i);
  const ref = refMatch ? refMatch[1].toLowerCase() : null;
  const rest = refMatch ? text.replace(refMatch[0], ' ') : text;
  if (NO_WORDS.test(rest)) return { kind: 'no', ref };
  // First number that looks like a price (skip years like 2015 unless written as $2015)
  let priceCents = null;
  for (const m of rest.replace(/,/g, '').matchAll(/(\$\s*)?(\d{2,6}(?:\.\d{1,2})?)/g)) {
    const v = parseFloat(m[2]);
    if (!m[1] && Number.isInteger(v) && v >= 1980 && v <= 2030) continue;
    priceCents = Math.round(v * 100);
    break;
  }
  if (YES_WORDS.test(rest) || (priceCents && /\$|\d/.test(rest) && rest.length < 60)) {
    return { kind: 'yes', priceCents: priceCents && priceCents >= 1000 ? priceCents : null, ref };
  }
  return { kind: 'unclear', ref };
}

module.exports = async (req, res) => {
  const raw = (await readRaw(req)).toString('utf8');
  const params = Object.fromEntries(new URLSearchParams(raw));
  const url = (process.env.SITE_URL || 'https://wreckly.ca').replace(/\/$/, '') + '/api/sms-inbound';
  if (!verifyTwilio(url, params, req.headers['x-twilio-signature'])) {
    console.warn('sms-inbound: bad Twilio signature');
    res.statusCode = 403; return res.end('Forbidden');
  }

  const from = toE164(params.From) || params.From;
  const body = String(params.Body || '').slice(0, 500);
  const reply = parseReply(body);

  try {
    // Opt-out: Twilio already confirms STOP to the sender; we stop texting that yard.
    if (reply.kind === 'stop') {
      await db.patchWhere('yards', 'phone=eq.' + encodeURIComponent(from), { sms_ok: false });
      await notifyAdmin('Yard opted out of SMS: ' + from, `${from} replied "${body}". They won't get request texts anymore.`);
      return twiml(res);
    }

    // Open quotes sent to this number in the last 7 days, newest first
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const open = await db.list('quotes', 'yard_phone=eq.' + encodeURIComponent(from) +
      '&status=in.(sent,unclear,yes,no)&created_at=gt.' + since + '&order=created_at.desc&limit=20');

    if (!open.length) {
      const yard = (await db.list('yards', 'phone=eq.' + encodeURIComponent(from) + '&limit=1'))[0];
      const who = yard ? `${yard.company} (${yard.city})` : 'Unknown number';
      await notifyAdmin('SMS from ' + who + ' ' + from, `Message:\n${body}\n\nNo open request for this number. Reply to them from Twilio or call them if needed.`);
      return twiml(res);
    }

    let q = open.find((x) => x.status === 'sent' || x.status === 'unclear') || open[0];
    if (reply.ref) q = open.find((x) => String(x.request_id).startsWith(reply.ref)) || q;
    const r = await db.get('requests', q.request_id);
    const refTxt = '#' + String(q.request_id).slice(0, 8).toUpperCase();
    const now = new Date().toISOString();

    if (reply.kind === 'no') {
      await db.update('quotes', q.id, { status: 'no', reply: body, replied_at: now });
      await maybeDispatchNow(q.request_id);
      return twiml(res, `Thanks for letting us know (${refTxt}). We'll text you on the next request.`);
    }

    if (reply.kind === 'yes' && reply.priceCents) {
      await db.update('quotes', q.id, { status: 'yes', price_cents: reply.priceCents, reply: body, replied_at: now });
      if (r && r.status !== 'paid' && !r.offer_sent_at) {
        await db.patchWhere('requests', 'id=eq.' + r.id + '&first_yes_at=is.null', { first_yes_at: now });
        await maybeDispatchNow(q.request_id);
        return twiml(res, `Got it: ${money(reply.priceCents)} for the ${r.part} (${refTxt}). If the buyer reserves it, they pay our 10% as a deposit and you collect ${money(reply.priceCents - Math.max(50, Math.round(reply.priceCents * 0.10)))} at pickup. We'll text you right away.`);
      }
      return twiml(res, `Thanks! Got your price for ${refTxt}. The buyer already has an offer; we'll keep you in mind for the next one.`);
    }

    if (reply.kind === 'yes') {
      await db.update('quotes', q.id, { status: 'unclear', reply: body, replied_at: now });
      return twiml(res, `Great! What's your price? Reply YES and the price in dollars, e.g. YES 250 (${refTxt}).`);
    }

    await db.update('quotes', q.id, { status: 'unclear', reply: body, replied_at: now });
    await notifyAdmin(`Unclear yard reply ${refTxt} from ${q.yard_name}`, `${q.yard_name} ${from} wrote:\n${body}\n\nRequest: ${r ? r.part + ' - ' + r.year + ' ' + r.make + ' ' + r.model : q.request_id}\nIf they quoted a price, add it in the admin panel.`);
    return twiml(res, `Sorry, we didn't get that. Reply YES and your price (e.g. YES 250) or NO (${refTxt}).`);
  } catch (e) {
    console.error('sms-inbound', e);
    await notifyAdmin('SMS reply error from ' + from, `Message:\n${body}\n\nError: ${e.message}`);
    return twiml(res);
  }
};

// If every contacted yard has answered, send the buyer the best offer right away.
async function maybeDispatchNow(requestId) {
  const pending = await db.list('quotes', 'request_id=eq.' + requestId + '&status=in.(sent,unclear)&limit=1');
  if (pending.length) return;
  try { await sendBestOffer(requestId); } catch (e) { console.error('dispatch now', e.message); }
}

module.exports.parseReply = parseReply;
