// Yard business hours (Toronto time). Yards are closed nights, weekends and stat holidays,
// so we only text them, and only start the "no result" clock, during these hours.
const TZ = 'America/Toronto';
const OPEN_HOUR = 8;   // 8:00
const CLOSE_HOUR = 17; // 17:00

// Ontario stat holidays (YYYY-MM-DD). Extend each year.
const HOLIDAYS = new Set([
  '2026-12-25', '2026-12-26', '2026-12-28', // Christmas, Boxing Day (observed Mon 28)
  '2027-01-01', '2027-02-15', '2027-03-26', '2027-05-24', '2027-07-01',
  '2027-08-02', '2027-09-06', '2027-10-11', '2027-12-27', '2027-12-28',
]);

// Toronto wall-clock parts for a Date
function parts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: p.weekday };
}

const isBusinessDay = (d) => { const p = parts(d); return !['Sat', 'Sun'].includes(p.weekday) && !HOLIDAYS.has(p.date); };

function isBusinessHours(d = new Date()) {
  const p = parts(d);
  return isBusinessDay(d) && p.hour >= OPEN_HOUR && p.hour < CLOSE_HOUR;
}

// Same time on the next business day (used for the "no result" notice: one full business day of waiting)
function nextBusinessDay(d) {
  let t = new Date(d.getTime() + 24 * 3600e3);
  for (let i = 0; i < 10 && !isBusinessDay(t); i++) t = new Date(t.getTime() + 24 * 3600e3);
  return t;
}

module.exports = { isBusinessHours, isBusinessDay, nextBusinessDay, parts };
