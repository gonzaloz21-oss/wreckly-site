// Picks the lowest yard quote for a request and sends the buyer the reservation link.
// Margin model: the yard gets its full price at pickup; Wreckly's fee (10% of it) is paid online on top.
const db = require('./db');
const { money, moneyShort } = require('./util');
const { partText } = require('./yardsms');
const { createDepositLink } = require('./stripe');
const { sendMail, notifyAdmin } = require('./mail');
const { sendSms, toE164 } = require('./sms');
const { feeFor } = require('./pricing');

const ref = (id) => String(id).slice(0, 8).toUpperCase();
const siteUrl = () => (process.env.SITE_URL || 'https://wreckly.ca').replace(/\/$/, '');

// Buyer email with the reservation link. price = yard price (paid at pickup), fee = Wreckly's fee (paid now).
function offerEmail(r, price, fee, url, intro = '') {
  return {
    subject: 'Good news: we found your ' + r.part,
    text:
`Hi ${r.name.split(' ')[0]},

We found the part you asked for:

${r.part} - ${r.year} ${r.make} ${r.model}

Total: ${money(price + fee)}
- ${money(fee)} Wreckly fee for finding your part, paid now to reserve it
- ${money(price)} paid at pickup (plus HST)

Our fee is fully refundable: if anything goes wrong with the part (it's no longer available, it's damaged or it doesn't match what was described) and you don't buy it, we refund the ${money(fee)}.

${intro}Reserve it here:
${url}

What happens next:
- As soon as the Wreckly fee is paid, we email and text you the pickup address and phone.
- The part is held for you for 3 business days from payment.
- This quote is valid for 48 hours.
- Check the part before you pay at pickup. If there's a problem with it, don't buy it and email us for a refund of the fee. Details: https://wreckly.ca/terms.html

Questions? Just reply to this email.`,
  };
}

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
  const deposit = feeFor(price); // Wreckly's reservation fee, on top of the yard's price

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

    const compared = quotes.length > 1 ? `We compared prices from ${quotes.length} yards \n\n` : '';
    await sendMail({ to: r.email, ...offerEmail(r, price, deposit, url, compared) });

    if (toE164(r.phone)) {
      try {
        await sendSms(r.phone, `Wreckly: good news, we found your ${partText(r.part)}! ${moneyShort(price + deposit)} total: ${moneyShort(deposit)} to reserve it now, ${moneyShort(price)} at pickup. Reserve here: ${url}`);
      } catch (e) { console.error('buyer offer SMS', e.message); }
    }

    await notifyAdmin(`Offer sent automatically #${ref(r.id)}: ${r.part}`,
      `Buyer: ${r.name} <${r.email}> ${r.phone || ''}\nPart: ${r.part} - ${r.year} ${r.make} ${r.model}\nChosen yard: ${best.yard_name} ${best.yard_phone} (yard price ${money(price)}, our fee ${money(deposit)}, buyer total ${money(price + deposit)})\nQuotes received: ${quotes.map((q) => q.yard_name + ' ' + money(q.price_cents)).join(', ')}\nDeposit link: ${url}\n\nNothing to do unless the buyer has questions.`);
    return { sent: true, url };
  } catch (e) {
    // Release the claim so the scheduled job can retry
    await db.update('requests', r.id, { offer_sent_at: null }).catch(() => {});
    throw e;
  }
}

module.exports = { sendBestOffer, offerEmail, ref };
