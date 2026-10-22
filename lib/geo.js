// Converts a Canadian postal code to lat/lng using the free geocoder.ca API
async function postalToLatLng(postal) {
  const clean = postal.replace(/\s/g, '').toUpperCase();
  const url = `https://geocoder.ca/?postal=${encodeURIComponent(clean)}&geoit=XML&json=1`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Wreckly/1.0 (info@wreckly.ca)' } });
  if (!r.ok) throw new Error('Geocoder HTTP ' + r.status);
  const d = await r.json();
  if (d.error) throw new Error('Geocoder: postal not found (' + clean + ')');
  return { lat: parseFloat(d.latt), lng: parseFloat(d.longt) };
}

module.exports = { postalToLatLng };
