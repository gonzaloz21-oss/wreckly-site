// Rough value of a used part, so the admin knows whether it's worth chasing by hand (car-part.com, calls).
// HIGH: usually $250+ used. LOW: usually under $100, where a new aftermarket part is often the better buy.
const HIGH = /\b(engine|transmission|transaxle|gearbox|differential|transfer case|hood|bonnet|door|tail ?gate|liftgate|trunk lid|fender|quarter|bumper|head ?light|headlamp|tail ?light|tail ?lamp|rear lights?|ecu|ecm|pcm|bcm|tcm|tipm|module|computer|catalytic|cat converter|turbo|airbag|air bag|dashboard|instrument cluster|cluster|radio|navigation|screen|seat|axle assembly|rear end|subframe|steering rack|rack and pinion|ac compressor|a\/c compressor|alternator|starter|wheel|rim|mirror|grille|radiator support|frame)\b/i;
const LOW = /\b(hose|line|lines|pipe|flex|sensor|bracket|clip|mount|gasket|seal|belt|filter|molding|moulding|trim|switch|relay|fuse|bulb|knob|handle|insulation|liner|splash|shield|bolt|nut|bushing|tie rod|knuckle|hinge|latch|cable|harness|wiring|wire|inner fender|fender liner)\b/i;

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

module.exports = { partValue, valueNote, needsVin };
