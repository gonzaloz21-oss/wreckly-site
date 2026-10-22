// Normalize a North American phone number to E.164 (+1XXXXXXXXXX). Returns null if it can't.
function toE164(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return null;
}
module.exports = { toE164 };
