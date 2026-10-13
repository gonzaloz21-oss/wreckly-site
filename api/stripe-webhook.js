const db = require('../lib/db');
const { send, readRaw, money } = require('../lib/util');
const { verifyWebhook, deactivateLink } = require('../lib/stripe');
const { sendMail, notifyAdmin } = require('../lib/mail');

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
          await sendMail({
            to: r.email,
            subject: 'Reserved: your ' + r.part + ' - yard details inside',
            text:
`Hi ${r.name.split(' ')[0]},

Your deposit of ${money(s.amount_total)} was received. The part is reserved for you for 3 business days.

${r.part} - ${r.year} ${r.make} ${r.model}
Yard: ${r.yard_name}
Address: ${r.yard_address}
Phone: ${r.yard_phone}
Price quoted by the yard: ${money(r.price_cents)}
Balance to pay the yard at pickup: ${money(r.price_cents - r.deposit_cents)}

Before you go:
- Call the yard first to confirm the part is ready and their hours. Tell them it is reserved through Wreckly.
- Inspect the part before paying the balance, and ask the yard for its warranty terms in writing.
- If the yard no longer has the part or it does not match what was described, email us at info@wreckly.ca for your deposit back (see section 4 of https://wreckly.ca/terms.html).`,
          });
          await notifyAdmin('PAID: ' + r.part + ' (' + money(s.amount_total) + ')',
            `${r.name} <${r.email}> reserved ${r.part} (${r.year} ${r.make} ${r.model}) at ${r.yard_name}.\nDeposit: ${money(s.amount_total)}\nNotify the yard: ${r.yard_name} ${r.yard_phone}${r.yard_email ? ' <' + r.yard_email + '>' : ''}\nBuyer contact to give the yard: ${r.name}, ${r.phone || r.email}.`);
        }
      }
    }
    return send(res, 200, { received: true });
  } catch (e) { console.error('webhook', e); return send(res, 500, { error: 'handler error' }); }
};
module.exports.config = { api: { bodyParser: false } };
