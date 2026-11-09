// Text messages Wreckly sends to yards. Short and casual so they read like a person, not a bot.
// Signed "– Wreckly" so the sender is identified (CASL). Twilio handles STOP opt-outs.
const { moneyShort } = require('./util');

const SIGN = '\n– Wreckly';

// "Rear bumper chromed, no cut out for exhaust." -> "rear bumper chromed, no cut out for exhaust"
function partText(part) {
  let p = String(part || '').trim().replace(/[.!\s]+$/, '');
  if (/^[A-Z][a-z]/.test(p)) p = p[0].toLowerCase() + p.slice(1); // "Tail light" -> "tail light"; keeps "ABS"
  p = p.replace(/\b(abs|ecu|ecm|pcm|bcm|tcm|tipm|a\/c|ac|led|hid)\b/gi, (m) => m.toUpperCase());
  return p || 'a part';
}

const vehicleText = (r) => [r.year, r.make, r.model].filter(Boolean).join(' ');

// First message to a yard about a new request
function askText(r) {
  const extras = [];
  if (r.vin) extras.push('VIN ' + r.vin);
  const notes = String(r.notes || '').trim();
  if (notes && notes !== '-' && notes.length <= 100) extras.push(notes);
  return `Hi! Looking for a used part for a ${vehicleText(r)}: ${partText(r.part)}.` +
    (extras.length ? '\n' + extras.join(' · ') : '') +
    `\nGot one? How much?` + SIGN;
}

const gotPriceText = () => `Perfect, thanks! I'll check with my customer and get back to you.`;
const alreadyFoundText = () => `Thanks! My customer already found one, but I'll keep you in mind for the next one.`;
const askPriceText = () => `Great! How much for it?`;
const noText = () => `No worries, thanks for checking!`;

// Sent when the buyer pays the reservation fee. yardCents = what the yard collects at pickup.
function reservedText(r, yardCents) {
  const first = String(r.name || '').trim().split(/\s+/)[0] || 'my customer';
  return `Good news, my customer wants the ${partText(r.part)} (${vehicleText(r)}) at ${moneyShort(yardCents)}. ` +
    `Can you hold it? They'll pick it up within 3 business days and pay you then. Name: ${first}` +
    (r.phone ? `, ${r.phone}` : '') + `.` + SIGN;
}

module.exports = { askText, gotPriceText, alreadyFoundText, askPriceText, noText, reservedText, partText, vehicleText };
