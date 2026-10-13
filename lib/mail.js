const { esc } = require('./util');

const FROM = () => process.env.MAIL_FROM || 'Wreckly <info@wreckly.ca>';
const SIGN_TXT = '\n\nThe Wreckly Team\nwreckly.ca | info@wreckly.ca\n9 St. Stevens Court, Toronto, ON M9A 0E9';

async function sendMail({ to, subject, text, replyTo }) {
  if (!process.env.RESEND_API_KEY) { console.warn('RESEND_API_KEY missing; email skipped:', subject); return { skipped: true }; }
  const body = text + SIGN_TXT;
  const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a18">' +
    esc(body).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>') + '</div>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM(), to: [to], subject, text: body, html, reply_to: replyTo || 'info@wreckly.ca' }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()));
  return r.json();
}

const notifyAdmin = (subject, text) =>
  sendMail({ to: process.env.ADMIN_EMAIL || 'info@wreckly.ca', subject, text }).catch((e) => console.error('notifyAdmin', e.message));

module.exports = { sendMail, notifyAdmin };
