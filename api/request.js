const db = require('../lib/db');
const { send, readJson, clip, limited } = require('../lib/util');
const { notifyAdmin } = require('../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const d = await readJson(req);
    if (d.website) return send(res, 200, { ok: true }); // honeypot: pretend success
    if (limited(req)) return send(res, 429, { error: 'Too many requests. Please try again later.' });

    const row = {
      part: clip(d.part, 160), year: clip(d.year, 4), make: clip(d.make, 40), model: clip(d.model, 60),
      vin: clip(d.vin, 17).toUpperCase(), postal: clip(d.postal, 7).toUpperCase(),
      name: clip(d.name, 80), email: clip(d.email, 120).toLowerCase(), phone: clip(d.phone, 30), notes: clip(d.notes, 800),
    };
    if (!row.part || !row.year || !row.make || !row.model || !row.name || !row.email)
      return send(res, 400, { error: 'Please fill in the required fields.' });
    if (!/^\S+@\S+\.\S+$/.test(row.email)) return send(res, 400, { error: 'Please enter a valid email.' });
    if (!/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/.test(row.postal)) return send(res, 400, { error: 'Please enter a valid Canadian postal code.' });

    const saved = await db.insert('requests', row);
    await notifyAdmin(
      'New part request: ' + row.part + ' - ' + row.year + ' ' + row.make + ' ' + row.model,
      `Part: ${row.part}\nVehicle: ${row.year} ${row.make} ${row.model}${row.vin ? ' (VIN ' + row.vin + ')' : ''}\nPostal: ${row.postal}\nBuyer: ${row.name} <${row.email}> ${row.phone}\nNotes: ${row.notes || '-'}\n\nOpen the panel: ${process.env.SITE_URL || 'https://wreckly.ca'}/admin.html`
    );
    return send(res, 200, { ok: true, id: saved.id });
  } catch (e) {
    console.error('request error', e);
    return send(res, 500, { error: 'Something went wrong. Please email info@wreckly.ca.' });
  }
};
