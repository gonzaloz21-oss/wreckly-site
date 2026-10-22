// Sends an SMS via Twilio REST API (no npm package needed: uses native fetch)
const crypto = require('crypto');
const { toE164 } = require('./phone');

async function sendSms(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM;
  const dest  = toE164(to);
  if (!dest) throw new Error('Invalid phone number: ' + to);
  if (!sid || !token || !from) {
    console.warn('Twilio not configured: SMS skipped to', dest);
    return { skipped: true };
  }
  const url    = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth   = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: dest, From: from, Body: body });
  const r = await fetch(url, {
    method:  'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });
  if (!r.ok) throw new Error('Twilio ' + r.status + ': ' + (await r.text()).slice(0, 300));
  return r.json(); // { sid, status, ... }
}

// Check the X-Twilio-Signature header of an incoming webhook.
function verifyTwilio(url, params, signature) {
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { sendSms, verifyTwilio, toE164 };
