const db = require('../lib/db');
const { send, readRaw, money, moneyShort } = require('../lib/util');
const { verifyWebhook, deactivateLink } = require('../lib/stripe');
const { sendMail, notifyAdmin } = require('../lib/mail');
const { sendSms, toE164 } = require('../lib/sms');
const { reservedText, partText } = require('../lib/yardsms');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const raw = await readRaw(req);
  if (!verifyWebhook(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET || ''))
    return send(res, 400, { error: 'Bad signature' });

  try {
    const event = JSON.parse(raw.toString('utf8'));
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const id = s.metadata && s.metadata.request_id;
      if (id && s.payment_status === 'paid') {
        const r = await db.get('requests', id);
        if (r && r.status !== 'paid') {
          await db.update('requests', id, { status: 'paid', paid_at: new Date().toISOString(), payment_intent: s.payment_intent || null });
          try { if (r.link_id) await deactivateLink(r.link_id); } catch (e) { console.warn('deactivate', e.message); }
          const mapUrl = 'https://maps.google.com/?q=' + encodeURIComponent(r.yard_address || r.yard_name || '');
          await sendMail({
            to: r.email,
            subject: 'Reserved: your ' + r.part + ' - pickup details inside',
            text:
`Hi ${r.name.split(' ')[0]},

Your Wreckly fee of ${money(s.amount_total)} was received and your part is reserved. It's held for you for 3 business days.

${r.part} - ${r.year} ${r.make} ${r.model}
Pick it up at: ${r.yard_name}
Address: ${r.yard_address}
Map: ${mapUrl}
Phone: ${r.yard_phone}
Pay at pickup: ${money(r.price_cents)}

Before you go:
- Call them when you're on the way and tell them it's reserved through Wreckly.
- Inspect the part before you pay, and ask about their warranty.
- If the part isn't there or doesn't match what was described, email us at info@wreckly.ca for a refund of the fee (see section 4 of https://wreckly.ca/terms.html).`,
          });
          // Text the yard and the buyer automatically
          let yardTexted = false;
          if (toE164(r.yard_phone)) {
            try {
              await sendSms(r.yard_phone, reservedText(r, r.price_cents));
              yardTexted = true;
            } catch (e) { console.error('yard paid SMS', e.message); }
          }
          if (toE164(r.phone)) {
            try {
              await sendSms(r.phone, `Wreckly: your ${partText(r.part)} is reserved! Pick it up at ${r.yard_name}, ${r.yard_address}. Call them when you're on the way: ${r.yard_phone}. Pay ${moneyShort(r.price_cents)} at pickup. Map: ${mapUrl}`);
            } catch (e) { console.error('buyer paid SMS', e.message); }
          }
          await notifyAdmin('PAID: ' + r.part + ' (' + money(s.amount_total) + ')' + (yardTexted ? ' - yard texted' : ' - CALL THE YARD'),
            `${r.name} <${r.email}> reserved ${r.part} (${r.year} ${r.make} ${r.model}) at ${r.yard_name}.\nOur fee (paid): ${money(s.amount_total)} · Yard collects at pickup: ${money(r.price_cents)}\n${yardTexted ? 'The yard was texted automatically.' : 'Could not text the yard. Call them:'} ${r.yard_name} ${r.yard_phone}${r.yard_email ? ' <' + r.yard_email + '>' : ''}\nBuyer contact to give the yard: ${r.name}, ${r.phone || r.email}.`);
        }
      }
    }
    return send(res, 200, { received: true });
  } catch (e) { console.error('webhook', e); return send(res, 500, { error: 'handler error' }); }
};
module.exports.config = { api: { bodyParser: false } };
