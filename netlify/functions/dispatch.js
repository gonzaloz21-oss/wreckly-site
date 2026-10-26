// Scheduled every 15 minutes (see netlify.toml):
// 1) sends the best offer once the wait after the first YES has passed
// 2) tells buyers when no yard had the part after 24 hours
const db = require('../../lib/db');
const { sendMail, notifyAdmin } = require('../../lib/mail');
const { sendSms, toE164 } = require('../../lib/sms');
const { sendBestOffer, ref } = require('../../lib/offer');
const { addressToLatLng, postalToLatLng } = require('../../lib/geo');

const WAIT_MIN = Number(process.env.OFFER_WAIT_MIN || 60);
const NO_RESULT_HOURS = Number(process.env.NO_RESULT_HOURS || 24);

exports.handler = async () => {
  const log = [];
  try {
    const cutoff = new Date(Date.now() - WAIT_MIN * 60e3).toISOString();
    const ready = await db.list('requests', 'status=in.(new,no_stock)&offer_sent_at=is.null&first_yes_at=lt.' + cutoff + '&limit=20');
    for (const r of ready) {
      try { log.push(ref(r.id) + ' ' + JSON.stringify(await sendBestOffer(r.id))); }
      catch (e) { log.push(ref(r.id) + ' offer error ' + e.message); await notifyAdmin('Auto-offer failed #' + ref(r.id), e.message); }
    }

    const old = new Date(Date.now() - NO_RESULT_HOURS * 3600e3).toISOString();
    const stale = await db.list('requests', 'status=eq.new&offer_sent_at=is.null&first_yes_at=is.null&noresult_sent_at=is.null&created_at=lt.' + old + '&limit=20');
    for (const r of stale) {
      const claimed = await db.patchWhere('requests', 'id=eq.' + r.id + '&noresult_sent_at=is.null', { noresult_sent_at: new Date().toISOString(), status: 'no_stock' });
      if (!claimed.length) continue;
      await sendMail({
        to: r.email,
        subject: 'Update on your ' + r.part + ' request',
        text:
`Hi ${r.name.split(' ')[0]},

We checked the yards near you, and none of them has the ${r.part} for your ${r.year} ${r.make} ${r.model} right now.

You don't owe anything. If a yard gets one in, we'll email you. You can also send a new request anytime at https://wreckly.ca/request.html (for example, with a different part or a wider area).

Sorry we couldn't find it this time.`,
      }).catch((e) => console.error('noresult mail', e.message));
      if (toE164(r.phone)) {
        await sendSms(r.phone, `Wreckly: sorry, no yard near you has the ${r.part} right now. You owe nothing. We'll email you if one turns up.`).catch((e) => console.error('noresult sms', e.message));
      }
      await notifyAdmin('No yard found #' + ref(r.id) + ': ' + r.part, `${r.name} <${r.email}> was told no yard has it (${r.year} ${r.make} ${r.model}, ${r.postal}). If you find one, send a quote from the admin panel.`);
      log.push(ref(r.id) + ' no-result sent');
    }
  } catch (e) {
    console.error('dispatch', e);
    return { statusCode: 500 };
  }

  // 3) Put yards on the map, a few per run (free geocoders allow ~1 request per second)
  try {
    const todo = await db.list('yards', 'lat=is.null&active=is.true&geo_failed_at=is.null&order=id.asc&limit=8');
    for (const y of todo) {
      let pos = null;
      if (y.address) pos = await addressToLatLng(y.address, y.city).catch(() => null);
      if (!pos && y.postal_code) pos = await postalToLatLng(y.postal_code).catch(() => null);
      if (!pos && y.city) pos = await addressToLatLng('', y.city).catch(() => null);
      if (pos) { await db.update('yards', y.id, pos); log.push('geo ok ' + y.id); }
      else { await db.update('yards', y.id, { geo_failed_at: new Date().toISOString() }); log.push('geo failed ' + y.id); }
      await new Promise((r) => setTimeout(r, 1100));
    }
  } catch (e) { console.error('geo backfill', e.message); }
  if (log.length) console.log('dispatch:', log.join(' | '));
  return { statusCode: 200 };
};
