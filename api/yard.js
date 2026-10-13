const db = require('../lib/db');
const { send, readJson, clip, limited } = require('../lib/util');
const { notifyAdmin } = require('../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  try {
    const d = await readJson(req);
    if (d.website) return send(res, 200, { ok: true });
    if (limited(req)) return send(res, 429, { error: 'Too many requests. Please try again later.' });
    const row = {
      name: clip(d.yard, 120), contact: clip(d.contact, 80), email: clip(d.email, 120).toLowerCase(),
      phone: clip(d.phone, 30), address: clip(d.address, 200), city: clip(d.city, 60),
      vehicle_types: clip(d.types, 200), notes: clip(d.notes, 600),
    };
    if (!row.name || !row.email || !row.phone || !row.address || !row.city)
      return send(res, 400, { error: 'Please fill in the required fields.' });
    if (!/^\S+@\S+\.\S+$/.test(row.email)) return send(res, 400, { error: 'Please enter a valid email.' });
    await db.insert('yards', row);
    await notifyAdmin('New yard signup: ' + row.name,
      `Yard: ${row.name} (${row.city})\nContact: ${row.contact} ${row.phone} <${row.email}>\nAddress: ${row.address}\nCarries: ${row.vehicle_types || '-'}\nNotes: ${row.notes || '-'}`);
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error('yard error', e);
    return send(res, 500, { error: 'Something went wrong. Please email info@wreckly.ca.' });
  }
};
