const db = require('../lib/db');
const { send, readJson, clip, limited } = require('../lib/util');
const { notifyAdmin } = require('../lib/mail');
const { postalToLatLng } = require('../lib/geo');
const { sendSms, toE164 } = require('../lib/sms');

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

    const saved = await db.insert('requests', row);
    const reqId = saved.id.toString().slice(0, 8).toUpperCase();
    const vehicle = `${row.year} ${row.make} ${row.model}`;

    let yards = [];
    let geoNote = '';
    try {
      const { lat, lng } = await postalToLatLng(row.postal);
      yards = await db.nearbyYards(lat, lng, 150, 5);
    } catch (geoErr) {
      geoNote = 'Geo/yard lookup failed: ' + geoErr.message;
      console.error(geoNote);
    }

    // Text each nearby yard and log it in quotes (their replies come back to /api/sms-inbound)
    const lines = [];
    for (const yard of yards) {
      const name = yard.company || 'Yard';
      const phone = toE164(yard.phone);
      const q = { request_id: saved.id, yard_id: yard.id, yard_name: name, yard_phone: phone || yard.phone, distance_km: yard.distance_km };
      if (!phone) {
        await db.insert('quotes', { ...q, status: 'failed', error: 'no valid phone' }).catch((e) => console.error('quote insert', e.message));
        lines.push(`  ✗ ${name} (${yard.city}, ~${yard.distance_km} km) ${yard.phone || '-'}: no valid phone, CALL`);
        continue;
      }
      const msg = [
        `Wreckly: a buyer near you needs a part. Ref #${reqId}`,
        `Part: ${row.part}`,
        `Vehicle: ${vehicle}${row.vin ? ' (VIN ' + row.vin + ')' : ''}`,
        row.notes ? `Notes: ${row.notes.slice(0, 120)}` : '',
        `Buyer area: ${row.postal.slice(0, 3)}`,
        `Have it? Reply YES and your price (e.g. YES 250). Reply NO if not.`,
      ].filter(Boolean).join('\n');
      try {
        const out = await sendSms(phone, msg);
        await db.insert('quotes', { ...q, status: 'sent', sms_sid: out.sid || null });
        lines.push(`  ✓ ${name} (${yard.city}, ~${yard.distance_km} km) ${phone}`);
      } catch (e) {
        console.error('SMS failed for', name, e.message);
        await db.insert('quotes', { ...q, status: 'failed', error: e.message.slice(0, 300) }).catch(() => {});
        lines.push(`  ✗ ${name} (${yard.city}, ~${yard.distance_km} km) ${phone}: SMS failed, CALL`);
      }
    }

    // Let the buyer know we're on it (only if they gave a phone)
    if (toE164(row.phone)) {
      try {
        await sendSms(row.phone, `Wreckly: we got your request for ${row.part} (${vehicle}). We're checking yards near you and will text and email you the price. Ref #${reqId}`);
      } catch (e) { console.error('buyer ack SMS', e.message); }
    }

    const yardsSummary = yards.length
      ? lines.join('\n') + '\n\nYard replies are handled automatically. The buyer gets the best price by email/text ~1 hour after the first YES (or sooner if all yards answer). Call the ✗ yards only if you want more quotes.'
      : '  No yards found near ' + row.postal + '. ' + (geoNote || 'Check the yards table (lat/lng, active).') + '\n  Find a yard manually and use the admin panel to send the quote.';

    await notifyAdmin(
      `Request #${reqId}: ${row.part} - ${vehicle}`,
      `Part: ${row.part}\nVehicle: ${vehicle}${row.vin ? ' (VIN ' + row.vin + ')' : ''}\nPostal: ${row.postal}\nBuyer: ${row.name} <${row.email}>${row.phone ? ' ' + row.phone : ''}\nNotes: ${row.notes || '-'}\n\nYards texted (${yards.length}):\n${yardsSummary}\n\nPanel: ${process.env.SITE_URL || 'https://wreckly.ca'}/admin.html`
    );

    return send(res, 200, { ok: true, id: saved.id });
  } catch (e) {
    console.error('request error', e);
    return send(res, 500, { error: 'Something went wrong. Please email info@wreckly.ca.' });
  }
};
