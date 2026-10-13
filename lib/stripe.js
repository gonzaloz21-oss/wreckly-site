// Minimal Stripe REST client (no SDK needed)
const crypto = require('crypto');

async function stripe(path, params) {
  const body = new URLSearchParams();
  const add = (k, v) => {
    if (v && typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => add(`${k}[${kk}]`, vv));
    else if (v !== undefined && v !== null) body.append(k, String(v));
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Stripe: ' + (j.error && j.error.message));
  return j;
}

// Create a one-time payment link for the deposit
async function createDepositLink({ requestId, part, depositCents, siteUrl }) {
  if (!process.env.STRIPE_SECRET_KEY) return { id: 'plink_dev', url: 'https://buy.stripe.com/test_dev_' + requestId }; // local dev only
  const product = await stripe('/products', { name: 'Reservation deposit (10%): ' + part.slice(0, 80), 'metadata[request_id]': requestId });
  const link = await stripe('/payment_links', {
    'line_items[0][price_data][currency]': 'cad',
    'line_items[0][price_data][product]': product.id,
    'line_items[0][price_data][unit_amount]': depositCents,
    'line_items[0][quantity]': 1,
    'metadata[request_id]': requestId,
    'payment_intent_data[metadata][request_id]': requestId,
    'payment_intent_data[description]': 'Wreckly deposit - ' + part.slice(0, 80),
    'restrictions[completed_sessions][limit]': 1,
    'after_completion[type]': 'redirect',
    'after_completion[redirect][url]': siteUrl + '/reserved.html',
  });
  return link; // { id, url }
}

async function deactivateLink(id) { return stripe('/payment_links/' + id, { active: 'false' }); }

function verifyWebhook(raw, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + raw.toString('utf8')).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { createDepositLink, deactivateLink, verifyWebhook };
