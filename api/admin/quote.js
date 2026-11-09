const db = require('../../lib/db');
const { send, readJson, isAdmin, clip, money } = require('../../lib/util');
const { createDepositLink } = require('../../lib/stripe');
const { sendMail } = require('../../lib/mail');
const { feeFor } = require('../../lib/pricing');
const { offerEmail } = require('../../lib/offer');

// Admin enters the yard's price + contact -> we add Wreckly's 10% fee on top, create the payment link for the fee
// (and optionally email it). The yard collects its full price at pickup.
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

    // Fee defaults to 10% of the yard price; the admin can set a custom fee (e.g. a negotiated markup).
    const customFee = d.fee !== undefined && d.fee !== '' ? Math.round(Number(d.fee) * 100) : null;
    if (customFee !== null && !(customFee >= 50)) return send(res, 400, { error: 'Fee must be at least $0.50.' });
    const deposit = customFee !== null ? customFee : feeFor(price);
    const siteUrl = (process.env.SITE_URL || 'https://wreckly.ca').replace(/\/$/, '');
    const link = await createDepositLink({ requestId: r.id, part: r.part, depositCents: deposit, siteUrl });
    const url = link.url + '?prefilled_email=' + encodeURIComponent(r.email);

    const updated = await db.update('requests', r.id, {
      ...yard, price_cents: price, deposit_cents: deposit, link_url: url, link_id: link.id,
      status: 'quoted', quoted_at: new Date().toISOString(),
    });

    let emailed = false;
    if (d.send) {
      await sendMail({ to: r.email, ...offerEmail(r, price, deposit, url) });
      emailed = true;
    }
    return send(res, 200, { row: updated, url, emailed, fee_cents: deposit, total_cents: price + deposit });
  } catch (e) { console.error(e); return send(res, 500, { error: e.message }); }
};
