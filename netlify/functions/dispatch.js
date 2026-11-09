// Scheduled every 15 minutes (see netlify.toml):
// 0) texts yards for requests that came in outside business hours (nights, weekends, holidays)
// 1) sends the best offer once the wait after the first YES has passed
// 2) 3 hours after texting with no price yet: emails the admin who to call
// 3) tells buyers when no yard had the part after one full business day
const db = require('../../lib/db');
const { sendMail, notifyAdmin } = require('../../lib/mail');
const { sendSms, toE164 } = require('../../lib/sms');
const { sendBestOffer, ref } = require('../../lib/offer');
const { addressToLatLng, postalToLatLng } = require('../../lib/geo');
const { textYards } = require('../../lib/yardsend');
const { isBusinessHours, nextBusinessDay } = require('../../lib/hours');
const { valueNote } = require('../../lib/value');

const WAIT_MIN = Number(process.env.OFFER_WAIT_MIN || 60);
const CALL_AFTER_HOURS = 3;

exports.handler = async () => {
  const log = [];
  const open = isBusinessHours();
  try {
    // 0) Requests held outside business hours: text the yards now
    if (open) {
      const held = await db.list('requests', 'sms_hold=is.true&status=eq.new&limit=10');
      for (const r of held) {
        const claimed = await db.patchWhere('requests', 'id=eq.' + r.id + '&sms_hold=is.true', { sms_hold: false });
        if (!claimed.length) continue;
        try {
          const out = await textYards(r);
          await notifyAdmin(`Yards texted #${ref(r.id)}: ${r.part} - ${r.year} ${r.make} ${r.model}`,
            `This request came in outside yard hours. Yards were texted now.\n\nPart value: ${valueNote(r.part)}\n\nYards texted (${out.texted}):\n${out.summary}`);
          log.push(ref(r.id) + ' held request texted');
        } catch (e) { log.push(ref(r.id) + ' held text error ' + e.message); await notifyAdmin('Held request failed #' + ref(r.id), e.message); }
      }
    }

    const cutoff = new Date(Date.now() - WAIT_MIN * 60e3).toISOString();
    const ready = await db.list('requests', 'status=in.(new,no_stock)&offer_sent_at=is.null&first_yes_at=lt.' + cutoff + '&limit=20');
    for (const r of ready) {
      try { log.push(ref(r.id) + ' ' + JSON.stringify(await sendBestOffer(r.id))); }
      catch (e) { log.push(ref(r.id) + ' offer error ' + e.message); await notifyAdmin('Auto-offer failed #' + ref(r.id), e.message); }
    }

    // 2) No price 3 hours after texting: tell the admin who to call (business hours only)
    if (open) {
      const callCut = new Date(Date.now() - CALL_AFTER_HOURS * 3600e3).toISOString();
      const quiet = await db.list('requests', 'status=eq.new&first_yes_at=is.null&offer_sent_at=is.null&call_reminder_at=is.null&yards_texted_at=lt.' + callCut + '&limit=10');
      for (const r of quiet) {
        const claimed = await db.patchWhere('requests', 'id=eq.' + r.id + '&call_reminder_at=is.null', { call_reminder_at: new Date().toISOString() });
        if (!claimed.length) continue;
        const qs = await db.list('quotes', 'request_id=eq.' + r.id + '&order=distance_km.asc').catch(() => []);
        const list = qs.filter((q) => !q.replied_at || q.status === 'unclear')
          .map((q) => `  📞 ${q.yard_name} (~${q.distance_km} km) ${q.yard_phone || '-'}${q.status === 'failed' ? ' (no SMS)' : q.status === 'unclear' ? ' (replied, unclear)' : ''}`);
        const noes = qs.filter((q) => q.status === 'no').length;
        await notifyAdmin(`Call yards #${ref(r.id)}: ${r.part} - ${r.year} ${r.make} ${r.model}`,
          `No price yet, 3 hours after texting the yards.\n\nPart value: ${valueNote(r.part)}\nBuyer: ${r.name} <${r.email}>${r.phone ? ' ' + r.phone : ''}${r.vin ? '\nVIN: ' + r.vin : ''}\nPostal: ${r.postal}\n\nAnswered NO: ${noes}\nNo answer yet, call if worth it:\n${list.join('\n') || '  (none)'}\n\nAlso check car-part.com: ${r.year} ${r.make} ${r.model}, ${r.part}, postal ${r.postal}\nIf you get a price, send it from the admin panel: ${process.env.SITE_URL || 'https://wreckly.ca'}/admin.html`);
        log.push(ref(r.id) + ' call reminder sent');
      }
    }

    // 3) No price after one full business day of waiting: tell the buyer we're still looking
    const staleCand = open ? await db.list('requests', 'status=eq.new&offer_sent_at=is.null&first_yes_at=is.null&noresult_sent_at=is.null&yards_texted_at=not.is.null&limit=20') : [];
    const stale = staleCand.filter((r) => nextBusinessDay(new Date(r.yards_texted_at)) <= new Date());
    for (const r of stale) {
      const claimed = await db.patchWhere('requests', 'id=eq.' + r.id + '&noresult_sent_at=is.null', { noresult_sent_at: new Date().toISOString(), status: 'no_stock' });
      if (!claimed.length) continue;
      await sendMail({
        to: r.email,
        subject: 'Update on your ' + r.part + ' request',
        text:
`Hi ${r.name.split(' ')[0]},

Quick update: the yards closest to you don't have the ${r.part} for your ${r.year} ${r.make} ${r.model} in stock right now.

We're still checking more yards across Ontario and Quebec. If we find one, we'll email you the price and photos before you pay anything.

You don't owe anything. If you'd like to add details that help us find the exact part (like your VIN), just reply to this email.

Thanks,
The Wreckly Team`,
      }).catch((e) => console.error('noresult mail', e.message));
      if (toE164(r.phone)) {
        await sendSms(r.phone, `Wreckly: the yards closest to you don't have the ${r.part} right now. We're still checking more yards and will email you if we find one. You owe nothing.`).catch((e) => console.error('noresult sms', e.message));
      }
      await notifyAdmin('No yard found #' + ref(r.id) + ': ' + r.part, `${r.name} <${r.email}> was told nearby yards don't have it and we're still looking (${r.year} ${r.make} ${r.model}, ${r.postal}). If you find one, send a quote from the admin panel.`);
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
