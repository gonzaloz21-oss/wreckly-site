// Rough value of a used part, so the admin knows whether it's worth chasing by hand (car-part.com, calls).
// HIGH: usually $250+ used. LOW: usually under $100, where a new aftermarket part is often the better buy.
const HIGH = /\b(engine|transmission|transaxle|gearbox|differential|transfer case|hood|bonnet|door|tail ?gate|liftgate|trunk lid|truck bed|pickup bed|pickup box|truck box|bed|fender|quarter|bumper|head ?light|headlamp|tail ?light|tail ?lamp|rear lights?|ecu|ecm|pcm|bcm|tcm|tipm|module|computer|catalytic|cat converter|turbo|airbag|air bag|dashboard|instrument cluster|cluster|radio|navigation|screen|seat|axle assembly|rear end|subframe|steering rack|rack and pinion|ac compressor|a\/c compressor|alternator|starter|wheel|rim|mirror|grille|radiator support|frame)\b/i;
const LOW = /\b(hose|line|lines|pipe|flex|sensor|bracket|clip|mount|gasket|seal|belt|filter|molding|moulding|trim|switch|relay|fuse|bulb|knob|handle|insulation|liner|splash|shield|bolt|nut|bushing|tie rod|knuckle|hinge|latch|cable|harness|wiring|wire|inner fender|fender liner|cap|caps|hub ?cap|center cap|centre cap|dust cover|hub cover|master cylinder|caliper|rotor|rotors|brake|brakes)\b/i;

function partValue(part) {
  const p = String(part || '');
  if (LOW.test(p)) return 'LOW'; // checked first: "hood insulation", "door handle" are cheap
  if (HIGH.test(p)) return 'HIGH';
  return '?';
}

const valueNote = (part) => ({
  HIGH: 'HIGH (usually $250+ used). Worth checking car-part.com and calling yards.',
  LOW: 'LOW (usually under $100). Probably not worth chasing by hand.',
  '?': 'Unknown. Check if it is a $250+ part before chasing it by hand.',
})[partValue(part)];

// Engines and transmissions come in many versions: the VIN is needed to match the right one.
const needsVin = (part) => /\b(engine|transmission|transaxle|gearbox)\b/i.test(String(part || ''));

// Budget and timing come from the request form and are saved at the start of notes:
// "Budget: $300 – $700 | Needed: This week | ..."
const BUDGETS = ['Under $100', '$100 – $300', '$300 – $700', '$700 – $1,500', 'Over $1,500', 'Not sure'];
const TIMINGS = ['This week', 'In the next 2 weeks', 'This month', 'Just comparing prices'];
const field = (notes, key) => (String(notes || '').match(new RegExp(key + ': ([^|]+)')) || [])[1]?.trim() || '';

// Worth chasing by hand (calls, car-part.com)? Everything else stays on automatic SMS.
function chaseCheck(part, notes) {
  const budget = field(notes, 'Budget'), needed = field(notes, 'Needed'), value = partValue(part);
  if (needed === 'Just comparing prices') return { yes: false, why: 'buyer is just comparing prices' };
  if (budget === 'Under $100' || budget === '$100 – $300') return { yes: false, why: 'budget ' + budget };
  if (budget === '$700 – $1,500' || budget === 'Over $1,500') return { yes: true, why: 'budget ' + budget };
  if (value === 'HIGH') return { yes: true, why: 'high-value part' + (budget ? ', budget ' + budget : '') };
  return { yes: false, why: value === 'LOW' ? 'low-value part' : 'unknown value, budget ' + (budget || 'not given') };
}

module.exports = { partValue, valueNote, needsVin, chaseCheck, BUDGETS, TIMINGS };
