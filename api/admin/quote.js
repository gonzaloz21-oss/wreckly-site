const db = require('../../lib/db');
const { send, readJson, isAdmin, clip, money } = require('../../lib/util');
const { createDepositLink } = require('../../lib/stripe');
const { sendMail } = require('../../lib/mail');

// Admin enters the yard's price + contact -> we create the 10% deposit link (and optionally email it).
module.exports = async (req, res) => {
  if (!isAdmin(req)) return send(res, 401, { error: 'Unauthorized' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const d = await readJson(req);
    const r = await db.get('requests', d.id);
    if (!r) return send(res, 404, { error: 'Request not found' });
    if (r.status === 'paid') return send(res, 400, { error: 'This request is already paid.' });

    const price = Math.round(Number(d.price) * 100);
    if (!(price >= 1000)) return send(res, 400, { error: 'Enter the yard price in dollars (minimum $10).' });
    const yard = { yard_name: clip(d.yard_name, 120), yard_phone: clip(d.yard_phone, 30), yard_address: clip(d.yard_address, 200), yard_email: clip(d.yard_email, 120) };
    if (!yard.yard_name || !yard.yard_phone || !yard.yard_address) return send(res, 400, { error: 'Yard name, phone and address are required.' });

    const deposit = Math.max(50, Math.round(price * 0.10));
    const siteUrl = (process.env.SITE_URL || 'https://wreckly.ca').replace(/\/$/, '');
    const link = await createDepositLink({ requestId: r.id, part: r.part, depositCents: deposit, siteUrl });
    const url = link.url + '?prefilled_email=' + encodeURIComponent(r.email);

    const updated = await db.update('requests', r.id, {
      ...yard, price_cents: price, deposit_cents: deposit, link_url: url, link_id: link.id,
      status: 'quoted', quoted_at: new Date().toISOString(),
    });

    let emailed = false;
    if (d.send) {
      await sendMail({
        to: r.email,
        subject: 'Good news: a yard has your ' + r.part,
        text:
`Hi ${r.name.split(' ')[0]},

A yard near you has the part you asked for:

${r.part} - ${r.year} ${r.make} ${r.model}
Price quoted by the yard: ${money(price)}

To reserve it, pay a deposit of ${money(deposit)} (10% of the yard's price). The deposit counts toward the price: you pay the remaining ${money(price - deposit)} directly to the yard when you pick the part up.

Reserve it here:
${url}

What happens next:
- As soon as the deposit is paid, we email you the yard's name, address and phone.
- The part is held for you for 3 business days from payment.
- This quote is valid for 48 hours.
- Check the part before you pay the balance. The yard sells the part and any warranty is directly with the yard; Wreckly is an intermediary. Details: https://wreckly.ca/terms.html (see section 4 for refunds).

Questions? Just reply to this email.`,
      });
      emailed = true;
    }
    return send(res, 200, { row: updated, url, emailed });
  } catch (e) { console.error(e); return send(res, 500, { error: e.message }); }
};
