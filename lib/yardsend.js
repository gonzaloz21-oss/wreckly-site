// Text the nearest yards about a request and log each one in `quotes`.
// Used by /api/request (business hours) and by dispatch (requests held overnight / weekends).
const db = require('./db');
const { postalToLatLng } = require('./geo');
const { sendSms, toE164 } = require('./sms');
const { askText } = require('./yardsms');
const { fitsYard } = require('./yardfit');

const MAX_TEXTED = 10;

async function textYards(r) {
  let yards = [];
  let geoNote = '';
  try {
    const { lat, lng } = await postalToLatLng(r.postal);
    // Ask for extra so specialist yards that don't fit this make can be dropped
    yards = await db.nearbyYards(lat, lng, 150, 20);
  } catch (e) {
    geoNote = 'Geo/yard lookup failed: ' + e.message;
    console.error(geoNote);
  }
  const fit = yards.filter((y) => fitsYard(y.company, r.make));
  const textable = fit.filter((y) => !y.landline).slice(0, MAX_TEXTED);
  const landlines = fit.filter((y) => y.landline);

  const lines = [];
  const calls = [];
  const msg = askText(r);
  for (const yard of textable) {
    const name = yard.company || 'Yard';
    const phone = toE164(yard.phone);
    const q = { request_id: r.id, yard_id: yard.id, yard_name: name, yard_phone: phone || yard.phone, distance_km: yard.distance_km };
    if (!phone) {
      await db.insert('quotes', { ...q, status: 'failed', error: 'no valid phone' }).catch((e) => console.error('quote insert', e.message));
      calls.push(`  📞 ${name} (${yard.city}, ~${yard.distance_km} km) ${yard.phone || '-'}: no valid mobile number`);
      continue;
    }
    try {
      const out = await sendSms(phone, msg);
      await db.insert('quotes', { ...q, status: 'sent', sms_sid: out.sid || null });
      lines.push(`  ✓ ${name} (${yard.city}, ~${yard.distance_km} km) ${phone}`);
    } catch (e) {
      console.error('SMS failed for', name, e.message);
      await db.insert('quotes', { ...q, status: 'failed', error: e.message.slice(0, 300) }).catch(() => {});
      calls.push(`  📞 ${name} (${yard.city}, ~${yard.distance_km} km) ${phone}: SMS failed`);
    }
  }
  for (const yard of landlines) {
    const name = yard.company || 'Yard';
    // Landline: texts never arrive (Twilio 30006). Log it so it can be called.
    await db.insert('quotes', { request_id: r.id, yard_id: yard.id, yard_name: name, yard_phone: yard.phone, distance_km: yard.distance_km, status: 'failed', error: 'landline: call' })
      .catch((e) => console.error('quote insert', e.message));
    calls.push(`  📞 ${name} (${yard.city}, ~${yard.distance_km} km) ${yard.phone || '-'}: landline`);
  }
  await db.update('requests', r.id, { yards_texted_at: new Date().toISOString(), sms_hold: false }).catch((e) => console.error('mark texted', e.message));

  const summary = (lines.length ? lines.join('\n') : '  (none)') +
    (calls.length ? '\n\nCALL these (no SMS):\n' + calls.join('\n') : '') +
    (geoNote ? '\n\n' + geoNote : '');
  return { texted: lines.length, toCall: calls.length, summary, geoNote };
}

module.exports = { textYards };
