const db = require('../lib/db');
const { send, readJson, clip, limited } = require('../lib/util');
const { notifyAdmin } = require('../lib/mail');
const { sendSms, toE164 } = require('../lib/sms');
const { textYards } = require('../lib/yardsend');
const { isBusinessHours } = require('../lib/hours');
const { valueNote, needsVin } = require('../lib/value');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const d = await readJson(req);
    if (d.website) return send(res, 200, { ok: true }); // honeypot
    if (limited(req)) return send(res, 429, { error: 'Too many requests. Please try again later.' });

    const row = {
      part:   clip(d.part, 160),  year:  clip(d.year, 4),   make:  clip(d.make, 40),
      model:  clip(d.model, 60),  vin:   clip(d.vin, 17).toUpperCase(),
      postal: clip(d.postal, 7).toUpperCase(),
      name:   clip(d.name, 80),   email: clip(d.email, 120).toLowerCase(),
      phone:  clip(d.phone, 30),  notes: clip(d.notes, 800),
    };
    if (!row.part || !row.year || !row.make || !row.model || !row.name || !row.email)
      return send(res, 400, { error: 'Please fill in the required fields.' });
    if (!/^\S+@\S+\.\S+$/.test(row.email))
      return send(res, 400, { error: 'Please enter a valid email.' });
    if (!/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/.test(row.postal))
      return send(res, 400, { error: 'Please enter a valid Canadian postal code.' });
    if (needsVin(row.part) && row.vin.length !== 17)
      return send(res, 400, { error: 'For engines and transmissions we need your 17-character VIN to find the exact match.' });

    const open = isBusinessHours();
    const saved = await db.insert('requests', { ...row, sms_hold: !open });
    const reqId = saved.id.toString().slice(0, 8).toUpperCase();
    const vehicle = `${row.year} ${row.make} ${row.model}`;

    // Yards are only texted during business hours; otherwise dispatch texts them at 8:00 on the next business day
    let yardsBlock;
    if (open) {
      const out = await textYards(saved);
      yardsBlock = out.texted || out.toCall
        ? `Yards texted (${out.texted}):\n${out.summary}\n\nYard replies are handled automatically. The buyer gets the lowest quote ~1 hour after the first price. If no one has a price in 3 hours you'll get a reminder with who to call.`
        : `No yards found near ${row.postal}. ${out.geoNote || 'Check the yards table (lat/lng, active).'}\nFind a yard manually and send the quote from the admin panel.`;
    } else {
      yardsBlock = 'Received outside yard hours (Mon-Fri 8:00-17:00). Yards will be texted automatically at 8:00 on the next business day; you will get another email then.';
    }

    // Let the buyer know we're on it (only if they gave a phone)
    if (toE164(row.phone)) {
      const when = open ? "We're checking yards near you" : 'Yards are closed right now, so we will start checking them first thing next business morning';
      try {
        await sendSms(row.phone, `Wreckly: we got your request for ${row.part} (${vehicle}). ${when} and will text and email you the price. Ref #${reqId}`);
      } catch (e) { console.error('buyer ack SMS', e.message); }
    }

    await notifyAdmin(
      `Request #${reqId}: ${row.part} - ${vehicle}`,
      `Part: ${row.part}\nVehicle: ${vehicle}${row.vin ? ' (VIN ' + row.vin + ')' : ''}\nPostal: ${row.postal}\nBuyer: ${row.name} <${row.email}>${row.phone ? ' ' + row.phone : ''}\nNotes: ${row.notes || '-'}\n\nPart value: ${valueNote(row.part)}\n\n${yardsBlock}\n\nCheck stock on car-part.com: https://www.car-part.com\n  Search: ${row.year} ${row.make} ${row.model}, ${row.part}, postal ${row.postal}\n\nPanel: ${process.env.SITE_URL || 'https://wreckly.ca'}/admin.html`
    );

    return send(res, 200, { ok: true, id: saved.id });
  } catch (e) {
    console.error('request error', e);
    return send(res, 500, { error: 'Something went wrong. Please email info@wreckly.ca.' });
  }
};
