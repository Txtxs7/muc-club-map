// Geocoding über OpenStreetMap Nominatim (max. 1 Request/Sekunde, Ergebnisse werden gecacht).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

export async function geocode(query) {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'hardtechno-muenchen-map/1.0 (personal project)', 'Accept-Language': 'de' },
  });
  if (!res.ok) return null;
  const [hit] = await res.json();
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** RA liefert teilweise 0 oder stark gerundete Koordinaten (z. B. 48 / 48.14). */
export function isPrecise(lat, lng) {
  if (!lat || !lng) return false;
  const decimals = (n) => (String(n).split('.')[1] || '').length;
  return decimals(lat) >= 3 && decimals(lng) >= 3;
}
