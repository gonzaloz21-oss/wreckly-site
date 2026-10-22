// Sends an SMS via Twilio REST API (no npm package needed — uses native fetch)
async function sendSms(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM; // e.g. +16471234567

  if (!sid || !token || !from) {
    console.warn('Twilio not configured — SMS skipped to', to);
    return { skipped: true };
  }

  const url    = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth   = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const r = await fetch(url, {
    method:  'POST',
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params.toString(),
  });

  if (!r.ok) throw new Error('Twilio ' + r.status + ': ' + (await r.text()));
  return r.json();
}

module.exports = { sendSms };
