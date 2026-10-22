// Picks the best (lowest) yard quote for a request and sends the buyer the 10% deposit link.
const db = require('./db');
const { money } = require('./util');
const { createDepositLink } = require('./stripe');
const { sendMail, notifyAdmin } = require('./mail');
const { sendSms, toE164 } = require('./sms');

const ref = (id) => String(id).slice(0, 8).toUpperCase();
const siteUrl = () => (process.env.SITE_URL || 'https://wreckly.ca').replace(/\/$/, '');

async function sendBestOffer(requestId) {
  const r = await db.get('requests', requestId);
  if (!r || r.status === 'paid' || r.offer_sent_at) return { skipped: 'already handled' };

  const quotes = (await db.list('quotes', 'request_id=eq.' + requestId + '&status=eq.yes&order=price_cents.asc,replied_at.asc'))
    .filter((q) => q.price_cents >= 1000);
  if (!quotes.length) return { skipped: 'no valid quotes' };

  // Claim the request so a parallel run (SMS reply + scheduled job) can't send two offers.
  const claimed = await db.patchWhere('requests', 'id=eq.' + requestId + '&offer_sent_at=is.null', { offer_sent_at: new Date().toISOString() });
  if (!claimed.length) return { skipped: 'claimed by another run' };

  const best = quotes[0];
  const yard = best.yard_id ? await db.get('yards', best.yard_id) : null;
  const address = (yard && yard.address) || [yard && yard.city, 'ON', yard && yard.postal_code].filter(Boolean).join(', ');
  const price = best.price_cents;
  const deposit = Math.max(50, Math.round(price * 0.10));

  try {
    const link = await createDepositLink({ requestId: r.id, part: r.part, depositCents: deposit, siteUrl: siteUrl() });
    const url = link.url + '?prefilled_email=' + encodeURIComponent(r.email);

    await db.update('requests', r.id, {
      yard_id: best.yard_id, yard_name: best.yard_name || (yard && yard.company) || 'Yard',
      yard_phone: best.yard_phone || (yard && yard.phone) || '', yard_address: address,
      yard_email: (yard && yard.email) || null,
      price_cents: price, deposit_cents: deposit, link_url: url, link_id: link.id,
      status: 'quoted', quoted_at: new Date().toISOString(),
    });
    await db.update('quotes', best.id, { status: 'chosen' });

    const compared = quotes.length > 1 ? `We compared prices from ${quotes.length} yards and this is the best one we got.\n\n` : '';
    await sendMail({
      to: r.email,
      subject: 'Good news: a yard has your ' + r.part,
      text:
`Hi ${r.name.split(' ')[0]},

A yard near you has the part you asked for:

${r.part} - ${r.year} ${r.make} ${r.model}
Price quoted by the yard: ${money(price)}

${compared}To reserve it, pay a deposit of ${money(deposit)} (10% of the yard's price). The deposit counts toward the price: you pay the remaining ${money(price - deposit)} directly to the yard when you pick the part up.

Reserve it here:
${url}

What happens next:
- As soon as the deposit is paid, we email you the yard's name, address and phone.
- The part is held for you for 3 business days from payment.
- This quote is valid for 48 hours.
- Check the part before you pay the balance. The yard sells the part and any warranty is directly with the yard; Wreckly is an intermediary. Details: https://wreckly.ca/terms.html (see section 4 for refunds).

Questions? Just reply to this email.`,
    });

    if (toE164(r.phone)) {
      try {
        await sendSms(r.phone, `Wreckly: good news! A yard has your ${r.part} for ${money(price)}. Reserve it with a ${money(deposit)} deposit (10%): ${url}`);
      } catch (e) { console.error('buyer offer SMS', e.message); }
    }

    await notifyAdmin(`Offer sent automatically #${ref(r.id)}: ${r.part}`,
      `Buyer: ${r.name} <${r.email}> ${r.phone || ''}\nPart: ${r.part} - ${r.year} ${r.make} ${r.model}\nChosen yard: ${best.yard_name} ${best.yard_phone} (${money(price)})\nQuotes received: ${quotes.map((q) => q.yard_name + ' ' + money(q.price_cents)).join(', ')}\nDeposit link: ${url}\n\nNothing to do unless the buyer has questions.`);
    return { sent: true, url };
  } catch (e) {
    // Release the claim so the scheduled job can retry
    await db.update('requests', r.id, { offer_sent_at: null }).catch(() => {});
    throw e;
  }
}

module.exports = { sendBestOffer, ref };
