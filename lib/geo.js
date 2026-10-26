// Geocoding for Canadian postal codes and addresses.
// Tries several free sources because geocoder.ca rate-limits (HTTP 429) cloud servers.
const UA = { 'User-Agent': 'Wreckly/1.0 (info@wreckly.ca)' };

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(new URL(url).host + ' HTTP ' + r.status);
  return r.json();
}

async function geocoderCa(qs) {
  const d = await getJson('https://geocoder.ca/?' + qs + '&json=1');
  if (d.error || !d.latt || !d.longt) throw new Error('geocoder.ca: not found');
  return { lat: parseFloat(d.latt), lng: parseFloat(d.longt) };
}

async function nominatim(params) {
  const d = await getJson('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&' + params);
  if (!Array.isArray(d) || !d.length) throw new Error('nominatim: not found');
  return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
}

async function zippopotamFsa(fsa) {
  const d = await getJson('https://api.zippopotam.us/ca/' + encodeURIComponent(fsa));
  const p = d && d.places && d.places[0];
  if (!p) throw new Error('zippopotam: not found');
  return { lat: parseFloat(p.latitude), lng: parseFloat(p.longitude) };
}

async function firstOk(attempts) {
  const errors = [];
  for (const fn of attempts) {
    try { return await fn(); } catch (e) { errors.push(e.message); }
  }
  throw new Error(errors.join('; '));
}

// Canadian postal code -> lat/lng (exact code first, then the 3-character area)
async function postalToLatLng(postal) {
  const clean = String(postal).replace(/\s/g, '').toUpperCase();
  const spaced = clean.slice(0, 3) + ' ' + clean.slice(3);
  return firstOk([
    () => geocoderCa('postal=' + encodeURIComponent(clean) + '&geoit=XML'),
    () => nominatim('postalcode=' + encodeURIComponent(spaced)),
    () => zippopotamFsa(clean.slice(0, 3)),
  ]);
}

// Street address + city (Ontario) -> lat/lng
async function addressToLatLng(address, city) {
  const q = /,\s*ON\b/.test(address || '') ? address : [address, city, 'ON'].filter(Boolean).join(', ');
  return firstOk([
    () => geocoderCa('locate=' + encodeURIComponent(q)),
    () => nominatim('q=' + encodeURIComponent(q)),
    () => nominatim('city=' + encodeURIComponent(city || '') + '&state=Ontario'),
  ]);
}

module.exports = { postalToLatLng, addressToLatLng };
