// Skip specialist yards that can't have the buyer's make (e.g. a JDM yard for a Ram 1500).
const JAPANESE = /\b(acura|honda|toyota|lexus|nissan|infiniti|mazda|subaru|mitsubishi|suzuki|isuzu|scion|datsun)\b/i;
const EUROPEAN = /\b(bmw|mini|mercedes|benz|audi|vw|volkswagen|porsche|volvo|saab|jaguar|land rover|range rover|fiat|alfa|smart)\b/i;
const HEAVY = /\b(freightliner|peterbilt|kenworth|mack|international|western star|hino|navistar|volvo truck)\b/i;

function fitsYard(company, make) {
  const c = String(company || '');
  const m = String(make || '');
  if (/acura\s*&\s*honda|honda\s*&\s*acura/i.test(c)) return /\b(acura|honda)\b/i.test(m);
  if (/jdm|japan/i.test(c)) return JAPANESE.test(m);
  if (/europe|german|bavarian/i.test(c)) return EUROPEAN.test(m);
  if (/heavy truck|used truck parts/i.test(c)) return HEAVY.test(m);
  return true;
}

module.exports = { fitsYard };
