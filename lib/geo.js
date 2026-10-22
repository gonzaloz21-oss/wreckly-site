// Geocoding with the free geocoder.ca API (Canada)
async function geocoderCa(qs) {
  const r = await fetch('https://geocoder.ca/?' + qs + '&json=1', { headers: { 'User-Agent': 'Wreckly/1.0 (info@wreckly.ca)' } });
  if (!r.ok) throw new Error('Geocoder HTTP ' + r.status);
  const d = await r.json();
  if (d.error || !d.latt || !d.longt) throw new Error('Geocoder: not found');
  return { lat: parseFloat(d.latt), lng: parseFloat(d.longt) };
}

// Canadian postal code -> lat/lng
async function postalToLatLng(postal) {
  const clean = String(postal).replace(/\s/g, '').toUpperCase();
  return geocoderCa('postal=' + encodeURIComponent(clean) + '&geoit=XML');
}

// Street address + city (Ontario) -> lat/lng
async function addressToLatLng(address, city) {
  return geocoderCa('locate=' + encodeURIComponent([address, city, 'ON'].filter(Boolean).join(', ')));
}

module.exports = { postalToLatLng, addressToLatLng };
