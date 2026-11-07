// HARD//MUC – Frontend
// Lädt data/events.json, data/germany-events.json + data/artists.json und zeigt sie auf einer Leaflet-Karte.
// Unterstützt manuelle Acts per Künstlername, Instagram-Profil-Link (@handle) sowie Live-Auslesen von Instagram-Tourposts.

const STYLE_LABEL = { hardtechno: 'Hardtechno', industrial: 'Industrial', uptempo: 'Uptempo', techno: 'Techno?' };
const STYLE_PRIORITY = ['hardtechno', 'industrial', 'uptempo', 'techno'];
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const LS_CUSTOM_ACTS = 'hardmuc_custom_artists_v1';
const LS_DEEZER_CACHE = 'hardmuc_deezer_cache_v1';
const LS_CUSTOM_IG_DATA = 'hardmuc_custom_ig_events_v1';

const SUGGESTED_ACTS = [
  'Somewhen',
  'Schrotthagen',
  'SHDW',
  'Kalte Liebe',
  'Clara Cuvé',
  'Kobosil',
  'Alignment',
  'I Hate Models',
  'Klangkuenstler',
];

const BUILTIN_IG_TO_ARTIST = {
  somewhensrx: 'Somewhen',
  klangkuenstler: 'Klangkuenstler',
  kobosil: 'Kobosil',
  '999999999_live': '999999999',
  ihatemodels1: 'I Hate Models',
  sara_landry: 'Sara Landry',
  schrotthagen: 'Schrotthagen',
  kalte_liebe: 'Kalte Liebe',
  alignment_official: 'Alignment',
  shdw_official: 'SHDW',
  'obscure.shape': 'Obscure Shape',
  claracuve: 'Clara Cuvé',
  daxj1: 'Dax J',
  perc_perc: 'Perc',
  inverruf: 'In Verruf',
  kruelty_official: 'Kruelty',
  'o.b.i._hardtechno': 'O.B.I.',
  bollmann_: 'Bollmann',
  noisenotwar: 'Noise Not War',
  dasstudach: 'Das Studach',
};

// Deutsche Städte für Live-Parsing von Instagram-Tourposts
const DE_CITIES = [
  { city: 'Berlin', lat: 52.52, lng: 13.405, re: /\bberlin\b/i },
  { city: 'München', lat: 48.1374, lng: 11.5755, re: /\b(m[üu]nchen|munich)\b/i },
  { city: 'Hamburg', lat: 53.5511, lng: 9.9937, re: /\bhamburg\b/i },
  { city: 'Köln', lat: 50.9375, lng: 6.9603, re: /\b(k[öo]ln|cologne)\b/i },
  { city: 'Frankfurt', lat: 50.1109, lng: 8.6821, re: /\b(frankfurt|offenbach)\b/i },
  { city: 'Stuttgart', lat: 48.7758, lng: 9.1829, re: /\bstuttgart\b/i },
  { city: 'Düsseldorf', lat: 51.2277, lng: 6.7735, re: /\b(d[üu]sseldorf|duesseldorf)\b/i },
  { city: 'Dortmund', lat: 51.5136, lng: 7.4653, re: /\bdortmund\b/i },
  { city: 'Essen', lat: 51.4556, lng: 7.0116, re: /\bessen\b/i },
  { city: 'Oberhausen', lat: 51.478, lng: 6.8625, re: /\boberhausen\b/i },
  { city: 'Bochum', lat: 51.4818, lng: 7.2162, re: /\bbochum\b/i },
  { city: 'Duisburg', lat: 51.4344, lng: 6.7623, re: /\bduisburg\b/i },
  { city: 'Wuppertal', lat: 51.2562, lng: 7.1508, re: /\bwuppertal\b/i },
  { city: 'Bonn', lat: 50.7374, lng: 7.0982, re: /\bbonn\b/i },
  { city: 'Aachen', lat: 50.7753, lng: 6.0839, re: /\baachen\b/i },
  { city: 'Münster', lat: 51.9607, lng: 7.6261, re: /\b(m[üu]nster|muenster)\b/i },
  { city: 'Bielefeld', lat: 52.0302, lng: 8.5325, re: /\bbielefeld\b/i },
  { city: 'Leipzig', lat: 51.3397, lng: 12.3731, re: /\bleipzig\b/i },
  { city: 'Dresden', lat: 51.0504, lng: 13.7373, re: /\bdresden\b/i },
  { city: 'Chemnitz', lat: 50.8278, lng: 12.9214, re: /\bchemnitz\b/i },
  { city: 'Nürnberg', lat: 49.4521, lng: 11.0767, re: /\b(n[üu]rnberg|nuernberg|nuremberg)\b/i },
  { city: 'Augsburg', lat: 48.3705, lng: 10.8978, re: /\baugsburg\b/i },
  { city: 'Regensburg', lat: 49.0134, lng: 12.1016, re: /\bregensburg\b/i },
  { city: 'Würzburg', lat: 49.7913, lng: 9.9534, re: /\b(w[üu]rzburg|wuerzburg)\b/i },
  { city: 'Ingolstadt', lat: 48.7665, lng: 11.4257, re: /\bingolstadt\b/i },
  { city: 'Rosenheim', lat: 47.8561, lng: 12.1289, re: /\brosenheim\b/i },
  { city: 'Kempten', lat: 47.7267, lng: 10.3168, re: /\bkempten\b/i },
  { city: 'Passau', lat: 48.5667, lng: 13.4319, re: /\bpassau\b/i },
  { city: 'Ulm', lat: 48.4011, lng: 9.9876, re: /\bulm\b/i },
  { city: 'Hannover', lat: 52.3759, lng: 9.732, re: /\b(hannover|hanover)\b/i },
  { city: 'Bremen', lat: 53.0793, lng: 8.8017, re: /\bbremen\b/i },
  { city: 'Braunschweig', lat: 52.2689, lng: 10.5268, re: /\bbraunschweig\b/i },
  { city: 'Osnabrück', lat: 52.2799, lng: 8.0472, re: /\b(osnabr[üu]ck|osnabrueck)\b/i },
  { city: 'Oldenburg', lat: 53.1435, lng: 8.2146, re: /\boldenburg\b/i },
  { city: 'Göttingen', lat: 51.5413, lng: 9.9158, re: /\b(g[öo]ttingen|goettingen)\b/i },
  { city: 'Kiel', lat: 54.3233, lng: 10.1228, re: /\bkiel\b/i },
  { city: 'Lübeck', lat: 53.8655, lng: 10.6866, re: /\b(l[üu]beck|luebeck)\b/i },
  { city: 'Rostock', lat: 54.0924, lng: 12.0991, re: /\brostock\b/i },
  { city: 'Mannheim', lat: 49.4875, lng: 8.466, re: /\bmannheim\b/i },
  { city: 'Karlsruhe', lat: 49.0069, lng: 8.4037, re: /\bkarlsruhe\b/i },
  { city: 'Freiburg', lat: 47.999, lng: 7.8421, re: /\bfreiburg\b/i },
  { city: 'Heidelberg', lat: 49.3988, lng: 8.6724, re: /\bheidelberg\b/i },
  { city: 'Heilbronn', lat: 49.1427, lng: 9.2109, re: /\bheilbronn\b/i },
  { city: 'Mainz', lat: 49.9929, lng: 8.2473, re: /\bmainz\b/i },
  { city: 'Wiesbaden', lat: 50.0782, lng: 8.2398, re: /\bwiesbaden\b/i },
  { city: 'Darmstadt', lat: 49.8728, lng: 8.6512, re: /\bdarmstadt\b/i },
  { city: 'Kassel', lat: 51.3127, lng: 9.4797, re: /\bkassel\b/i },
  { city: 'Koblenz', lat: 50.3569, lng: 7.589, re: /\bkoblenz\b/i },
  { city: 'Trier', lat: 49.7499, lng: 6.6371, re: /\btrier\b/i },
  { city: 'Saarbrücken', lat: 49.2402, lng: 6.9969, re: /\b(saarbr[üu]cken|saarbruecken)\b/i },
  { city: 'Magdeburg', lat: 52.1205, lng: 11.6276, re: /\bmagdeburg\b/i },
  { city: 'Halle', lat: 51.4828, lng: 11.97, re: /\bhalle\b/i },
  { city: 'Erfurt', lat: 50.9848, lng: 11.0299, re: /\berfurt\b/i },
  { city: 'Jena', lat: 50.9271, lng: 11.5892, re: /\bjena\b/i },
];

const IG_MONTHS = {
  january: 1, januar: 1, jan: 1,
  february: 2, februar: 2, feb: 2,
  march: 3, maerz: 3, märz: 3, mar: 3,
  april: 4, apr: 4,
  may: 5, mai: 5,
  june: 6, juni: 6, jun: 6,
  july: 7, juli: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oktober: 10, oct: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dezember: 12, dec: 12, dez: 12,
};

const IG_NON_PROFILE = new Set(['p', 'reel', 'reels', 'stories', 'tv', 'explore', 'accounts', 'direct', 'about', 'legal']);

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

// ---------- Künstlername & Instagram-Normalisierung ----------
function cleanName(raw) {
  return String(raw || '')
    .replace(/^@/, '')
    .replace(/\s*\((?:live|dj[\s-]*set|hybrid|b2b[^)]*|[a-z]{2,3}|\d+)\)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normKey(raw) {
  return cleanName(raw)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function plainKey(raw) {
  return cleanName(raw)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractIgPostCode(raw) {
  const m = String(raw || '').trim().match(/instagram\.com\/(?:p|reel|reels)\/([A-Za-z0-9_-]{6,18})/i);
  return m ? m[1] : null;
}

function extractIgHandle(raw, allowBareHandle = false) {
  const s = String(raw || '').trim();
  if (!s || extractIgPostCode(s)) return null;
  const urlMatch = s.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})(?:[/?#]|$)/i);
  if (urlMatch) {
    const seg = urlMatch[1].toLowerCase().replace(/\.+$/, '');
    return IG_NON_PROFILE.has(seg) ? null : seg;
  }
  if (s.startsWith('@') || allowBareHandle) {
    const hm = s.match(/^@?([A-Za-z0-9._]{2,30})$/);
    if (hm) {
      const seg = hm[1].toLowerCase().replace(/\.+$/, '');
      return IG_NON_PROFILE.has(seg) ? null : seg;
    }
  }
  return null;
}

function handleToPrettyName(handle) {
  if (BUILTIN_IG_TO_ARTIST[handle]) return BUILTIN_IG_TO_ARTIST[handle];
  return handle
    .replace(/(?:_?official|_?offiziell|_?live|_?music|_?techno|_?hardtechno|_?dj|\.dj|\.wav|\.mp3|_uk|_de|_bln|_muc)+$/i, '')
    .replace(/[._]+/g, ' ')
    .replace(/\bdj\b/gi, 'DJ')
    .trim();
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

// ---------- Datum-Helfer ----------
const pad2 = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, n) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const todayISO = () => toISO(new Date());
const nextWeekday = (dow) => {
  const d = new Date();
  d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  return toISO(d);
};
const formatLong = (iso) => {
  const d = fromISO(iso);
  return `${DOW_LONG[d.getDay()]}, ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
};
const formatShort = (iso) => {
  const d = fromISO(iso);
  return `${DOW[d.getDay()]} ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
};
const validIso = (y, m, d) => {
  if (y < 2024 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// ---------- Storage ----------
function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

// ---------- State ----------
const params = new URLSearchParams(location.search);
const state = {
  data: null,
  deData: null,
  artists: {},
  liveDeezer: readStorage(LS_DEEZER_CACHE, {}),
  customActs: readStorage(LS_CUSTOM_ACTS, []), // [{ key, plain, name, ig? }]
  customIgData: readStorage(LS_CUSTOM_IG_DATA, { venues: {}, events: [] }),
  deCatalog: [], // [{ key, plain, name, ig, count }]
  igToCatalog: {}, // handle -> catalog item
  editingIgKey: null,
  tab: params.get('tab') === 'acts' ? 'acts' : 'map',
  focusedActKey: null,
  date: params.get('date') || todayISO(),
  venueId: params.get('venue') || null,
  styles: new Set(['hardtechno', 'industrial', 'uptempo']),
};

let map;
const markers = new Map();
const audio = new Audio();
let playingBtn = null;
let toastTimer = null;

// ---------- Live Deezer JSONP ----------
function deezerJsonp(pathAndQuery) {
  return new Promise((resolve) => {
    const cb = `__dz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement('script');
    const cleanup = () => {
      delete window[cb];
      script.remove();
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 7000);
    window[cb] = (data) => {
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      clearTimeout(timer);
      cleanup();
      resolve(null);
    };
    const sep = pathAndQuery.includes('?') ? '&' : '?';
    script.src = `https://api.deezer.com/${pathAndQuery}${sep}output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

async function ensureArtistTracks(name, force = false) {
  const key = normKey(name);
  if (!key) return;
  if (!force && state.artists[key]?.deezer?.top?.length) return;

  const search = await deezerJsonp(`search/artist?limit=8&q=${encodeURIComponent(cleanName(name))}`);
  const items = search?.data || [];
  if (!items.length) return;

  const pk = plainKey(name);
  const exact = items
    .filter((a) => normKey(a.name) === key || plainKey(a.name) === pk)
    .sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
  const best = exact[0] || items[0];
  if (!best?.id) return;

  const topRes = await deezerJsonp(`artist/${best.id}/top?limit=5`);
  const deezerObj = {
    id: best.id,
    link: best.link,
    picture: best.picture_medium || best.picture,
    fans: best.nb_fan || 0,
    top: (topRes?.data || []).map((t) => ({
      title: t.title,
      album: t.album?.title,
      link: t.link,
      preview: t.preview || null,
      cover: t.album?.cover_small,
    })),
  };

  const entry = { ...(state.artists[key] || {}), name: cleanName(name), deezer: deezerObj, updatedAt: new Date().toISOString() };
  state.artists[key] = entry;
  state.liveDeezer[key] = entry;
  writeStorage(LS_DEEZER_CACHE, state.liveDeezer);
}

// ---------- Live Instagram Post / Tour-Schedule Scanner ----------
async function fetchInstagramPostLive(code) {
  const postUrl = `https://www.instagram.com/p/${code}/`;
  // 1) Jina JSON Reader (liefert vollständige Caption) + 2) Microlink (liefert Bild, Autor & Handle)
  const [jinaRes, mlRes] = await Promise.allSettled([
    fetch(`https://r.jina.ai/${postUrl}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(postUrl)}`, {
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? r.json() : null)),
  ]);

  const jina = jinaRes.status === 'fulfilled' ? jinaRes.value?.data : null;
  const ml = mlRes.status === 'fulfilled' ? mlRes.value?.data : null;
  if (!jina && !ml) return null;

  let caption = '';
  const jinaTitle = String(jina?.title || '');
  const quoteMatch = jinaTitle.match(/on Instagram:\s*"([\s\S]*)"\.?\s*$/i);
  if (quoteMatch) caption = quoteMatch[1];
  else if (ml?.description) caption = String(ml.description);
  else if (jina?.description) caption = String(jina.description);

  const titleMeta = String(ml?.title || jinaTitle || '');
  const handleMatch = titleMeta.match(/\(@([A-Za-z0-9._]{2,30})\)/);
  const authorHandle = handleMatch ? handleMatch[1].toLowerCase() : null;
  const authorName = ml?.author || titleMeta.split('(@')[0]?.replace(/on Instagram:[\s\S]*$/i, '').trim() || null;
  const flyer = ml?.image?.url || null;
  const postedIso = ml?.date ? String(ml.date).slice(0, 10) : todayISO();

  return { code, postUrl, caption: caption.normalize('NFKC'), authorHandle, authorName, flyer, postedIso };
}

function extractLineDate(text, refIso) {
  const [refY, refM] = (refIso || todayISO()).split('-').map(Number);
  const mFull = text.match(/(?<![\d.])(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})(?!\d)/);
  if (mFull) {
    const d = Number(mFull[1]);
    const mo = Number(mFull[2]);
    let y = Number(mFull[3]);
    if (y < 100) y += 2000;
    if (validIso(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const mShort = text.match(/(?<![\d.])(\d{1,2})\s*[./]\s*(\d{1,2})(?:\.|\b)(?!\s*\d{2,4})/);
  if (mShort) {
    const d = Number(mShort[1]);
    const mo = Number(mShort[2]);
    const y = mo < refM - 1 ? refY + 1 : refY;
    if (validIso(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const monthNames = Object.keys(IG_MONTHS).join('|');
  const mWord = text.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${monthNames})(?:\\s+(\\d{4}))?\\b`, 'i'));
  if (mWord) {
    const d = Number(mWord[1]);
    const mo = IG_MONTHS[mWord[2].toLowerCase()];
    const y = mWord[3] ? Number(mWord[3]) : mo < refM - 1 ? refY + 1 : refY;
    if (mo && validIso(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return null;
}

function matchGermanVenueOrCity(text) {
  const s = String(text || '');
  const lower = normKey(s);
  const allVenues = { ...(state.deData?.venues || {}), ...(state.data?.venues || {}) };

  // 1) Bekannten deutschen Venue-Namen im Text suchen (längste Namen zuerst)
  let bestVenue = null;
  for (const v of Object.values(allVenues)) {
    const vn = normKey(v.name);
    if (vn.length >= 5 && ` ${lower} `.includes(` ${vn} `)) {
      if (!bestVenue || vn.length > normKey(bestVenue.name).length) bestVenue = v;
    }
  }
  if (bestVenue) return { venue: bestVenue, isNewVenue: false };

  // 2) Deutsche Stadt erkennen -> passenden Venue in der Stadt oder Stadt-Pin anlegen
  const cityHit = DE_CITIES.find((c) => c.re.test(s));
  if (!cityHit) return null;

  // Clubname neben der Stadt extrahieren (z. B. "14.11. Berlin - RSO" -> "RSO")
  const cleaned = s
    .replace(/\b\d{1,2}\s*[.\-/]\s*\d{1,2}(?:\s*[.\-/]\s*\d{2,4})?\.?/g, '')
    .replace(cityHit.re, '')
    .replace(/^[•|–\-:,@\s📍📅⏰]+|[•|–\-:,@\s]+$/g, '')
    .trim();
  const clubLabel = cleaned.length >= 2 && cleaned.length <= 45 ? `${cleaned} (${cityHit.city})` : `${cityHit.city}`;
  const vid = `ig-de-${normKey(clubLabel).replace(/\s+/g, '-')}`;
  const dist = haversineKm(state.data.center, cityHit);

  return {
    venue: {
      id: vid,
      name: clubLabel,
      city: cityHit.city,
      address: cityHit.city,
      url: null,
      lat: cityHit.lat,
      lng: cityHit.lng,
      distanceKm: dist,
    },
    isNewVenue: true,
  };
}

function parseGermanGigsFromCaption(meta, act) {
  const body = String(meta.caption || '').trim();
  if (!body) return [];
  const today = todayISO();
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const foundGigs = [];
  const seenKey = new Set();

  // A) Zeilenweises Tourpost-Parsing (z. B. "07.11. Köln – Bootshaus", "14.11. Berlin | RSO")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/deadline|vorverkauf|vvk/i.test(line)) continue;
    const d = extractLineDate(line, meta.postedIso);
    if (!d || d < today) continue;
    // Ort auf derselben Zeile oder direkt auf der Folgezeile prüfen
    const loc = matchGermanVenueOrCity(line) || (lines[i + 1] && !extractLineDate(lines[i + 1], meta.postedIso) ? matchGermanVenueOrCity(lines[i + 1]) : null);
    if (!loc) continue;
    const dedup = `${d}|${loc.venue.id}`;
    if (seenKey.has(dedup)) continue;
    seenKey.add(dedup);
    foundGigs.push({ date: d, loc, title: `${act.name} @ ${loc.venue.name}` });
  }

  // B) Einzel-Event-Post (Datum + deutscher Ort irgendwo im Post verteilt)
  if (!foundGigs.length) {
    let singleDate = null;
    for (const l of lines) {
      if (/deadline|vorverkauf/i.test(l)) continue;
      singleDate = extractLineDate(l, meta.postedIso);
      if (singleDate && singleDate >= today) break;
    }
    const loc = singleDate ? matchGermanVenueOrCity(body) : null;
    if (singleDate && loc) {
      const headline = lines[0]?.slice(0, 80) || `${act.name} Live`;
      foundGigs.push({ date: singleDate, loc, title: headline });
    }
  }

  return foundGigs.map((g, idx) => ({
    venue: g.loc.venue,
    isNewVenue: g.loc.isNewVenue,
    event: {
      id: `custom-ig-${meta.code}-${idx}`,
      source: 'instagram',
      sources: [`Instagram @${act.ig || meta.authorHandle || 'post'}`],
      date: g.date,
      title: g.title,
      start: null,
      end: null,
      url: meta.postUrl,
      igUrl: meta.postUrl,
      flyer: meta.flyer || null,
      venueId: g.loc.venue.id,
      styles: ['hardtechno'],
      customActKey: act.key,
      customIg: act.ig || null,
      artists: [{ key: act.key, name: act.name, url: null, ...(act.ig ? { ig: act.ig } : {}) }],
    },
  }));
}

// ---------- Deutschlandweiter Act-Abgleich ----------
function venueById(vid) {
  return state.data?.venues?.[vid] || state.deData?.venues?.[vid] || state.customIgData?.venues?.[vid] || null;
}

function getGermanyEventPool() {
  const base = state.deData?.events?.length ? state.deData.events : state.data?.events || [];
  const extra = state.customIgData?.events || [];
  if (!extra.length) return base;
  const seen = new Set(base.map((e) => e.id));
  return [...base, ...extra.filter((e) => !seen.has(e.id))].sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
}

function buildGermanyCatalog() {
  const mapByKey = new Map();
  const igMap = {};
  const today = todayISO();
  const sourceEvents = getGermanyEventPool();

  for (const [h, name] of Object.entries(BUILTIN_IG_TO_ARTIST)) {
    const k = normKey(name);
    const entry = { key: k, plain: plainKey(name), name, ig: h, count: 0 };
    mapByKey.set(k, entry);
    igMap[h] = entry;
  }

  for (const ev of sourceEvents) {
    if (ev.date < today) continue;
    for (const a of ev.artists || []) {
      const k = a.key || normKey(a.name);
      if (!k) continue;
      let cur = mapByKey.get(k);
      if (!cur) {
        cur = { key: k, plain: plainKey(a.name), name: a.name, ig: a.ig || null, count: 0 };
        mapByKey.set(k, cur);
      }
      cur.count++;
      if (a.ig && !cur.ig) cur.ig = a.ig;
      if (cur.ig) igMap[cur.ig.toLowerCase()] = cur;
    }
  }
  for (const [k, info] of Object.entries(state.artists)) {
    if (!mapByKey.has(k) && info?.name) {
      mapByKey.set(k, { key: k, plain: plainKey(info.name), name: info.name, ig: null, count: 0 });
    }
  }
  state.deCatalog = [...mapByKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  state.igToCatalog = igMap;
}

function eventMatchesAct(ev, act) {
  if (ev.customActKey && ev.customActKey === act.key) return true;
  if (act.ig && ev.customIg && ev.customIg === act.ig) return true;
  for (const a of ev.artists || []) {
    if (act.ig && a.ig && a.ig.toLowerCase() === act.ig.toLowerCase()) return true;
    const ak = a.key || normKey(a.name);
    if (ak === act.key || (act.plain && plainKey(a.name) === act.plain)) return true;
  }
  if (act.ig && String(ev.title || '').toLowerCase().includes(`@${act.ig.toLowerCase()}`)) return true;
  if (act.key.length >= 4) {
    const tNorm = ` ${normKey(ev.title)} `;
    const tPlain = ` ${plainKey(ev.title)} `;
    if (tNorm.includes(` ${act.key} `) || (act.plain && tPlain.includes(` ${act.plain} `))) return true;
  }
  return false;
}

function matchedCustomActsForEvent(ev) {
  if (!state.customActs.length) return [];
  return state.customActs.filter((act) => eventMatchesAct(ev, act));
}

function getGermanyGigsForAct(act) {
  const today = todayISO();
  return getGermanyEventPool().filter((ev) => ev.date >= today && eventMatchesAct(ev, act) && venueById(ev.venueId));
}

function getAllTrackedGermanyEvents(onlyActKey = null) {
  const acts = onlyActKey ? state.customActs.filter((a) => a.key === onlyActKey) : state.customActs;
  if (!acts.length) return [];
  const today = todayISO();
  const out = [];
  for (const ev of getGermanyEventPool()) {
    if (ev.date < today || !venueById(ev.venueId)) continue;
    const matched = acts.filter((a) => eventMatchesAct(ev, a));
    if (matched.length) out.push({ ...ev, matchedCustomActs: matched });
  }
  return out;
}

function findSavedAct(nameOrKey, igHandle = null) {
  const k = normKey(nameOrKey);
  const pk = plainKey(nameOrKey);
  return state.customActs.find(
    (a) => (igHandle && a.ig === igHandle) || (k && (a.key === k || (pk && a.plain === pk))),
  );
}

function isActSaved(nameOrKey, igHandle = null) {
  return Boolean(findSavedAct(nameOrKey, igHandle));
}

async function addCustomAct(rawName = '', rawIg = '') {
  let nameInput = String(rawName || '').trim();
  let igInput = String(rawIg || '').trim();

  // Falls Instagram-Link oder @Handle direkt ins Namensfeld eingefügt wurde
  if (!igInput && (extractIgPostCode(nameInput) || extractIgHandle(nameInput, false))) {
    igInput = nameInput;
    nameInput = '';
  }

  const postCode = extractIgPostCode(igInput) || extractIgPostCode(nameInput);
  let igHandle = extractIgHandle(igInput, true) || extractIgHandle(nameInput, false);
  let postMeta = null;

  if (postCode) {
    showToast('⏳ Lese Instagram-Post nach Deutschland-Terminen aus …');
    postMeta = await fetchInstagramPostLive(postCode);
    if (!postMeta) {
      showToast('⚠️ Instagram-Post konnte nicht gelesen werden – bitte öffentlichen Link prüfen.');
      if (!nameInput && !igHandle) return;
    } else if (!igHandle && postMeta.authorHandle) {
      igHandle = postMeta.authorHandle;
    }
  }

  const catalogByIg = igHandle ? state.igToCatalog[igHandle] : null;
  let resolvedName = cleanName(nameInput);
  if (!resolvedName) {
    if (catalogByIg) resolvedName = catalogByIg.name;
    else if (postMeta?.authorName && !/instagram/i.test(postMeta.authorName)) resolvedName = cleanName(postMeta.authorName);
    else if (igHandle) resolvedName = handleToPrettyName(igHandle);
  }
  const key = normKey(resolvedName);
  if (!key || key.length < 2) return;
  const plain = plainKey(resolvedName);

  const catalogHit = catalogByIg || state.deCatalog.find((c) => c.key === key || c.plain === plain);
  const displayName = cleanName(nameInput) || catalogHit?.name || state.artists[key]?.name || resolvedName;
  const finalIg = igHandle || catalogHit?.ig || BUILTIN_IG_TO_ARTIST[key] || null;

  const existing = findSavedAct(displayName, finalIg);
  let actObj;
  if (existing) {
    if (finalIg) existing.ig = finalIg;
    if (nameInput) existing.name = displayName;
    actObj = existing;
  } else {
    actObj = { key, plain, name: displayName, ...(finalIg ? { ig: finalIg } : {}) };
    state.customActs.unshift(actObj);
  }
  state.editingIgKey = null;
  writeStorage(LS_CUSTOM_ACTS, state.customActs);

  // Falls ein Instagram-Tourpost/Event-Post übergeben wurde: deutsche Termine extrahieren & speichern
  if (postMeta) {
    const parsed = parseGermanGigsFromCaption(postMeta, actObj);
    if (parsed.length) {
      const existingIds = new Set(state.customIgData.events.map((e) => e.id));
      for (const item of parsed) {
        if (item.isNewVenue || !state.customIgData.venues[item.venue.id]) {
          state.customIgData.venues[item.venue.id] = item.venue;
        }
        if (!existingIds.has(item.event.id)) {
          state.customIgData.events.push(item.event);
        }
      }
      writeStorage(LS_CUSTOM_IG_DATA, state.customIgData);
      buildGermanyCatalog();
      showToast(`✓ ${parsed.length} Deutschland-Termin${parsed.length === 1 ? '' : 'e'} aus Instagram-Post für ${actObj.name} übernommen!`);
    } else {
      showToast(`ℹ️ Act „${actObj.name}“ gespeichert (im verlinkten Post wurde kein kommendes DE-Datum erkannt).`);
    }
  } else if (finalIg) {
    const cnt = getGermanyGigsForAct(actObj).length;
    showToast(`✓ ${actObj.name} (@${finalIg}) gespeichert · ${cnt} Termin${cnt === 1 ? '' : 'e'} in Deutschland gefunden.`);
  }

  updateActsCounters();
  refreshView({ fit: state.tab === 'acts' });

  await ensureArtistTracks(actObj.name);
  if (state.tab === 'acts' && !state.venueId) renderActsTab();
}

function removeCustomAct(key) {
  const removed = state.customActs.find((a) => a.key === key);
  state.customActs = state.customActs.filter((a) => a.key !== key);
  if (removed) {
    state.customIgData.events = (state.customIgData.events || []).filter(
      (e) => e.customActKey !== key && (!removed.ig || e.customIg !== removed.ig),
    );
    writeStorage(LS_CUSTOM_IG_DATA, state.customIgData);
  }
  if (state.focusedActKey === key) state.focusedActKey = null;
  if (state.editingIgKey === key) state.editingIgKey = null;
  writeStorage(LS_CUSTOM_ACTS, state.customActs);
  updateActsCounters();
  refreshView({ fit: state.tab === 'acts' });
}

function toggleCustomAct(name, ig = '') {
  const existing = findSavedAct(name, ig || null);
  if (existing) removeCustomAct(existing.key);
  else addCustomAct(name, ig);
}

function updateActsCounters() {
  const n = state.customActs.length;
  for (const el of [$('#topActsCount'), $('#tabActsCount')]) {
    if (!el) continue;
    el.textContent = String(n);
    el.hidden = n === 0;
  }
}

// ---------- Filter & Tages-Events ----------
function eventVisible(ev) {
  if (ev.confidence === 'low') return state.styles.has('techno');
  return (ev.styles || []).some((s) => state.styles.has(s));
}

function eventsOn(iso) {
  const byId = new Map();
  for (const e of state.data.events) {
    if (e.date !== iso) continue;
    const matched = matchedCustomActsForEvent(e);
    if (eventVisible(e) || matched.length) {
      byId.set(e.id, matched.length ? { ...e, matchedCustomActs: matched } : e);
    }
  }
  if (state.customActs.length) {
    for (const e of getGermanyEventPool()) {
      if (e.date !== iso || byId.has(e.id)) continue;
      const matched = matchedCustomActsForEvent(e);
      if (!matched.length || !venueById(e.venueId)) continue;
      const dup = [...byId.values()].some((x) => x.venueId === e.venueId && x.title === e.title);
      if (!dup) byId.set(e.id, { ...e, matchedCustomActs: matched, isGermanyExtra: true });
    }
  }
  return [...byId.values()];
}

const mainStyle = (styles) => STYLE_PRIORITY.find((s) => (styles || []).includes(s)) || 'techno';

function syncUrl() {
  const p = new URLSearchParams();
  p.set('date', state.date);
  if (state.tab === 'acts') p.set('tab', 'acts');
  if (state.venueId) p.set('venue', state.venueId);
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

// ---------- Karte ----------
function initMap() {
  const c = state.data.center;
  map = L.map('map', { zoomControl: true, attributionControl: false }).setView([c.lat, c.lng], 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    className: 'dark-tiles',
  }).addTo(map);
  L.circle([c.lat, c.lng], {
    radius: state.data.radiusKm * 1000,
    color: '#ff2a2a',
    weight: 1,
    opacity: 0.25,
    fill: false,
    dashArray: '4 6',
    interactive: false,
  }).addTo(map);
  L.marker([c.lat, c.lng], {
    icon: L.divIcon({ className: '', html: '<div class="center-dot"></div>', iconSize: [10, 10] }),
    interactive: false,
  }).addTo(map);
}

function activeMarkerEvents() {
  if (state.tab === 'acts') return getAllTrackedGermanyEvents(state.focusedActKey);
  return eventsOn(state.date);
}

function renderMarkers() {
  markers.forEach((m) => m.remove());
  markers.clear();
  const byVenue = groupByVenue(activeMarkerEvents());
  const bounds = [];

  for (const [venueId, evs] of byVenue) {
    const v = venueById(venueId);
    if (!v) continue;
    const hasCustom = evs.some((e) => e.matchedCustomActs?.length);
    const styles = [...new Set(evs.flatMap((e) => e.styles || []))];
    const low = !hasCustom && evs.every((e) => e.confidence === 'low');
    const color = hasCustom ? 'var(--custom)' : `var(--${mainStyle(styles)})`;
    const selected = venueId === state.venueId;
    const symbol = evs.length > 1 ? evs.length : hasCustom ? '★' : '♦';
    const cityPrefix = v.city && v.distanceKm > state.data.radiusKm ? `${v.city} · ` : '';
    const tooltipText =
      state.tab === 'acts'
        ? `${cityPrefix}${v.name} · ${evs.map((e) => `${formatShort(e.date)} (${e.matchedCustomActs.map((a) => a.name).join(', ')})`).slice(0, 2).join(' | ')}`
        : `${cityPrefix}${v.name} · ${evs[0].title}`;

    const icon = L.divIcon({
      className: '',
      html: `<div class="marker ${low ? 'low' : ''} ${selected ? 'selected' : ''}" style="--c:${color}"><span>${symbol}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    const m = L.marker([v.lat, v.lng], { icon, zIndexOffset: selected ? 1000 : hasCustom ? 800 : low ? 0 : 500 })
      .addTo(map)
      .bindTooltip(esc(tooltipText), { className: 'vt', direction: 'top', offset: [0, -18] })
      .on('click', () => selectVenue(venueId, false));
    markers.set(venueId, m);
    bounds.push([v.lat, v.lng]);
  }
  return bounds;
}

function fitTo(bounds) {
  if (!bounds.length) {
    if (state.tab === 'acts') map.setView([51.16, 10.45], 6, { animate: true });
    return;
  }
  if (bounds.length === 1) map.setView(bounds[0], Math.max(map.getZoom(), 12), { animate: true });
  else map.fitBounds(bounds, { padding: [55, 55], maxZoom: 13, animate: true });
}

// ---------- Datumsleiste ----------
function renderDateStrip() {
  const strip = $('#dateStrip');
  const start = todayISO() < state.date ? todayISO() : state.date;
  const lastEvent = state.data.events.at(-1)?.date || start;
  let end = addDays(start, 60);
  if (lastEvent > end) end = lastEvent;
  if (state.date > end) end = addDays(state.date, 7);

  const counts = {};
  const customDays = new Set();

  for (const e of state.data.events) {
    const matched = matchedCustomActsForEvent(e);
    if (eventVisible(e) || matched.length) counts[e.date] = (counts[e.date] || 0) + 1;
    if (matched.length) customDays.add(e.date);
  }
  if (state.customActs.length) {
    const mucIds = new Set(state.data.events.map((e) => e.id));
    for (const e of getGermanyEventPool()) {
      if (e.date < start || !venueById(e.venueId)) continue;
      if (matchedCustomActsForEvent(e).length) {
        customDays.add(e.date);
        if (!mucIds.has(e.id)) counts[e.date] = (counts[e.date] || 0) + 1;
      }
    }
  }

  let html = '';
  for (let iso = start; iso <= end; iso = addDays(iso, 1)) {
    const d = fromISO(iso);
    const n = counts[iso] || 0;
    const cls = [
      'day',
      n ? 'has' : 'empty',
      customDays.has(iso) ? 'has-custom' : '',
      d.getDay() % 6 === 0 || d.getDay() === 5 ? 'weekend' : '',
      iso === state.date ? 'active' : '',
      d.getDate() === 1 || iso === start ? 'month-start' : '',
    ];
    html += `<button class="${cls.join(' ')}" data-date="${iso}" data-month="${MONTHS[d.getMonth()]}" title="${formatLong(iso)}${n ? ` – ${n} Event(s)` : ''}">
      <div class="dow">${DOW[d.getDay()]}</div><div class="dom">${d.getDate()}</div><div class="cnt">${n || ''}</div></button>`;
  }
  strip.innerHTML = html;
  strip.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

// ---------- Panel ----------
function groupByVenue(evs) {
  const m = new Map();
  for (const e of evs) {
    if (!m.has(e.venueId)) m.set(e.venueId, []);
    m.get(e.venueId).push(e);
  }
  return m;
}

function badges(styles, extraCustomLabel = '') {
  const customTag = extraCustomLabel ? `<span class="badge custom">★ ${esc(extraCustomLabel)}</span>` : '';
  const styleTags = (styles || []).map((s) => `<span class="badge ${esc(s)}">${esc(STYLE_LABEL[s] || s)}</span>`).join('');
  return `<div class="badges">${customTag}${styleTags}</div>`;
}

function renderDayList() {
  const evs = eventsOn(state.date);
  const panel = $('#panelContent');
  if (!evs.length) {
    const upcoming = [...new Set(state.data.events.filter((e) => e.date > state.date && eventVisible(e)).map((e) => e.date))].slice(0, 6);
    panel.innerHTML = `
      <h2>${formatLong(state.date)}</h2>
      <div class="empty-state">
        <div class="big">∅</div>
        <p>Keine passenden Events an diesem Tag gefunden.</p>
        ${!state.styles.has('techno') ? '<p class="muted">Tipp: „+ Techno (unsicher)“ aktivieren oder unter „★ Meine Acts (DE)“ DJs / Instagram-Links hinzufügen.</p>' : ''}
        ${upcoming.length ? `<p class="muted">Nächste Termine:</p><div class="next-dates">${upcoming.map((d) => `<button data-date="${d}">${formatShort(d)}</button>`).join('')}</div>` : ''}
      </div>`;
    return;
  }
  const byVenue = groupByVenue(evs);
  panel.innerHTML = `
    <h2>${formatLong(state.date)} · ${evs.length} Event${evs.length > 1 ? 's' : ''}</h2>
    <ul class="venue-list">
      ${[...byVenue]
        .map(([vid, list]) => {
          const v = venueById(vid);
          const styles = [...new Set(list.flatMap((e) => e.styles || []))];
          const customNames = [...new Set(list.flatMap((e) => (e.matchedCustomActs || []).map((a) => a.name)))];
          const color = customNames.length ? 'var(--custom)' : `var(--${mainStyle(styles)})`;
          const locInfo = v.city && v.distanceKm > state.data.radiusKm ? `${esc(v.city)} (${v.distanceKm} km)` : `${v.distanceKm} km`;
          const customLabel = customNames.length ? `${customNames.join(', ')}${v.city ? ` · ${v.city}` : ''}` : '';
          return `<li><button class="venue-item" data-venue="${esc(vid)}" style="--c:${color}">
            <div class="vname">${esc(v.name)}</div>
            <div class="vmeta">${esc(list[0].start || '')}${list[0].end ? '–' + esc(list[0].end) : ''} · ${locInfo}</div>
            ${list.map((e) => `<div class="etitle">${esc(e.title)}</div>`).join('')}
            ${badges(styles, customLabel)}
          </button></li>`;
        })
        .join('')}
    </ul>`;
}

function renderTracks(a, fallbackName = '') {
  const top = a?.deezer?.top?.slice(0, 3) || [];
  if (!top.length) return '';
  const artistName = a?.name || fallbackName;
  return `<ol class="tracks">${top
    .map(
      (t, i) => `<li class="track">
        <span class="num">${i + 1}</span>
        <button class="play" ${t.preview ? `data-preview="${esc(t.preview)}"` : 'disabled'} title="30-Sekunden-Hörprobe" aria-label="Hörprobe ${esc(t.title)}">▶</button>
        <span class="t" title="${esc(t.title)}">${esc(t.title)}${t.album && t.album !== t.title ? ` <small>· ${esc(t.album)}</small>` : ''}</span>
        <a class="sp" target="_blank" rel="noopener" href="https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${t.title}`)}" title="Auf Spotify suchen">♫</a>
      </li>`,
    )
    .join('')}</ol>`;
}

function renderAct(act) {
  const key = act.key || normKey(act.name);
  const a = state.artists[key];
  const pic = a?.deezer?.picture || a?.spotify?.image;
  const fans = a?.deezer?.fans;
  const spotifyId = a?.spotify?.id;
  const ig = act.ig || state.deCatalog.find((c) => c.key === key)?.ig || null;
  const saved = isActSaved(act.name, ig);
  const links = [
    ig && `<a class="ig-pill" href="https://www.instagram.com/${encodeURIComponent(ig)}/" target="_blank" rel="noopener">@${esc(ig)} ↗</a>`,
    safeUrl(act.url) && `<a href="${esc(act.url)}" target="_blank" rel="noopener">RA</a>`,
    safeUrl(a?.deezer?.link) && `<a href="${esc(a.deezer.link)}" target="_blank" rel="noopener">Deezer</a>`,
  ].filter(Boolean);
  return `<div class="act">
    <div class="act-head">
      ${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" />` : `<div class="ph">${esc(act.name.slice(0, 1))}</div>`}
      <div>
        <div class="act-name">${esc(act.name)}</div>
        <div class="act-sub">${fans ? `${fans.toLocaleString('de-DE')} Fans · ` : ''}${links.join(' · ')}</div>
      </div>
    </div>
    ${a?.deezer?.top?.length ? renderTracks(a, act.name) : '<div class="act-sub" style="margin-top:6px">Keine Tracks gefunden.</div>'}
    <div class="act-actions">
      <button class="watch-btn ${saved ? 'saved' : ''}" data-watch="${esc(act.name)}" data-watch-ig="${esc(ig || '')}" title="Act für ganz Deutschland merken">
        ${saved ? '★ Gemerkt (DE)' : '☆ Merken (DE)'}
      </button>
      ${
        spotifyId
          ? `<button class="spotify" data-embed="${esc(spotifyId)}">▶ Spotify Top-Tracks</button>`
          : `<a class="spotify" target="_blank" rel="noopener" href="https://open.spotify.com/search/${encodeURIComponent(act.name)}/artists">Spotify suchen</a>`
      }
      <a target="_blank" rel="noopener" href="https://soundcloud.com/search?q=${encodeURIComponent(act.name)}">SoundCloud</a>
      <a target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${encodeURIComponent(act.name + ' set')}">YouTube</a>
    </div>
    <div class="embed"></div>
  </div>`;
}

const sortActs = (acts) =>
  [...acts].sort((x, y) => (state.artists[y.key || normKey(y.name)]?.deezer?.fans || 0) - (state.artists[x.key || normKey(x.name)]?.deezer?.fans || 0));

function renderVenue() {
  const v = venueById(state.venueId);
  const pool = state.tab === 'acts' ? activeMarkerEvents() : eventsOn(state.date);
  const evs = pool.filter((e) => e.venueId === state.venueId);
  if (!v || !evs.length) {
    state.venueId = null;
    return state.tab === 'acts' ? renderActsTab() : renderDayList();
  }
  const route = `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`;
  const backLabel = state.tab === 'acts' ? '← Zurück zu Meine Acts (DE)' : `← Alle Events am ${formatShort(state.date)}`;
  const cityPart = v.city ? `${esc(v.city)} · ` : '';

  $('#panelContent').innerHTML = `
    <button class="back" data-action="back">${backLabel}</button>
    <div class="venue-head">
      <h3>${esc(v.name)}</h3>
      <div class="addr">${cityPart}${esc(v.address)} · ${v.distanceKm} km von München</div>
      <div class="links">
        <a href="${route}" target="_blank" rel="noopener">Route ↗</a>
        ${safeUrl(v.url) ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">Website / Venue ↗</a>` : ''}
      </div>
    </div>
    ${evs
      .map((e) => {
        const srcText = e.sources?.length ? `Quelle: ${e.sources.map(esc).join(' + ')}` : '';
        const ticketLink =
          safeUrl(e.url) && e.url !== e.igUrl ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Tickets & Infos ↗</a>` : '';
        const igLink = safeUrl(e.igUrl) ? `<a href="${esc(e.igUrl)}" target="_blank" rel="noopener">Instagram-Post ↗</a>` : '';
        const linksHtml = [ticketLink, igLink].filter(Boolean).join(' · ');
        const customLabel = e.matchedCustomActs?.length ? e.matchedCustomActs.map((a) => a.name).join(', ') : '';
        return `<article class="event">
        <div class="event-head">
          ${safeUrl(e.flyer) ? `<img class="flyer" src="${esc(e.flyer)}" alt="Flyer" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
          <div>
            <div class="event-title">${esc(e.title)}</div>
            <div class="event-time">${formatShort(e.date)} ${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</div>
            ${badges(e.styles, customLabel)}
          </div>
        </div>
        ${srcText || e.reasons?.length ? `<div class="reasons">${[srcText, e.reasons?.length ? `Erkannt durch: ${e.reasons.map(esc).join(', ')}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
        ${linksHtml ? `<div class="event-links">${linksHtml}</div>` : ''}
        <div class="lineup">
          ${e.artists?.length ? sortActs(e.artists).map(renderAct).join('') : '<div class="lineup-empty">Line-up noch nicht bekannt.</div>'}
        </div>
      </article>`;
      })
      .join('')}`;
}

function renderActsTab() {
  const panel = $('#panelContent');
  const deCount = getGermanyEventPool().length;
  const unusedSuggestions = SUGGESTED_ACTS.filter((name) => !isActSaved(name));
  const totalGigs = getAllTrackedGermanyEvents().length;

  panel.innerHTML = `
    <h2>Meine Acts · Ganz Deutschland ${deCount ? `(${deCount.toLocaleString('de-DE')} Events)` : ''}</h2>
    <p class="acts-intro">
      Füge Acts per <strong>Künstlername</strong> oder <strong>Instagram-Link / @Handle</strong> hinzu (Profil-Link wie <code>instagram.com/somewhensrx</code> oder direkt ein Tourdaten-Post <code>instagram.com/p/…</code>). Alle Auftritte in ganz Deutschland werden auf der Karte (★) markiert.
    </p>
    <div class="acts-form-wrap">
      <form id="addActForm" class="acts-form" autocomplete="off">
        <input id="customActInput" type="text" placeholder="Künstlername (optional bei IG-Link, z. B. Somewhen …)" aria-label="Künstlername" />
        <div class="acts-form-row">
          <input id="customIgInput" type="text" placeholder="Instagram-Link oder @Handle (Profil oder /p/ Tour-Post)" aria-label="Instagram-Link oder Handle" />
          <button type="submit">+ Hinzufügen</button>
        </div>
      </form>
      <ul id="acList" class="ac-list" hidden></ul>
    </div>
    ${
      unusedSuggestions.length
        ? `<div class="suggest-row">
            ${unusedSuggestions.map((s) => `<button class="suggest-chip" data-add-act="${esc(s)}">+ ${esc(s)}</button>`).join('')}
          </div>`
        : ''
    }
    ${
      state.customActs.length
        ? `<div class="acts-toolbar">
            <span>${state.customActs.length} Act${state.customActs.length > 1 ? 's' : ''} · ${totalGigs} Termin${totalGigs === 1 ? '' : 'e'} in DE</span>
            <button data-focus-act="" class="${!state.focusedActKey ? 'active' : ''}">Alle auf Karte (${totalGigs})</button>
          </div>
          ${state.customActs
            .map((act) => {
              const a = state.artists[act.key];
              const pic = a?.deezer?.picture || a?.spotify?.image;
              const fans = a?.deezer?.fans;
              const gigs = getGermanyGigsForAct(act);
              const focused = state.focusedActKey === act.key;
              const isEditingIg = state.editingIgKey === act.key;
              const igBadge = act.ig
                ? ` · <a class="ig-pill" href="https://www.instagram.com/${encodeURIComponent(act.ig)}/" target="_blank" rel="noopener">@${esc(act.ig)} ↗</a>`
                : '';
              return `<div class="saved-act">
                <div class="saved-act-top">
                  <div class="act-head">
                    ${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" />` : `<div class="ph">${esc(act.name.slice(0, 1))}</div>`}
                    <div>
                      <div class="act-name">${esc(act.name)}</div>
                      <div class="act-sub">${fans ? `${fans.toLocaleString('de-DE')} Fans · ` : ''}${gigs.length} Termin${gigs.length === 1 ? '' : 'e'} in DE${igBadge}</div>
                    </div>
                  </div>
                  <div class="saved-act-btns">
                    <button class="mini-btn ${isEditingIg ? 'active' : ''}" data-edit-ig="${esc(act.key)}" title="Instagram-Profil oder Tourdaten-Post verknüpfen">+ IG</button>
                    ${gigs.length ? `<button class="mini-btn ${focused ? 'active' : ''}" data-focus-act="${esc(act.key)}" title="Auf Deutschland-Karte hervorheben">Karte</button>` : ''}
                    <button class="mini-btn del" data-remove-act="${esc(act.key)}" title="Act entfernen">✕</button>
                  </div>
                </div>
                ${
                  isEditingIg
                    ? `<form class="ig-edit-form" data-ig-form-for="${esc(act.name)}" autocomplete="off">
                        <input type="text" value="${act.ig ? `https://www.instagram.com/${esc(act.ig)}/` : ''}" placeholder="Instagram-Profil-URL, @Handle oder /p/ Tour-Post …" />
                        <button type="submit">Speichern</button>
                      </form>`
                    : ''
                }
                ${a?.deezer?.top?.length ? renderTracks(a, act.name) : ''}
                ${
                  gigs.length
                    ? `<ul class="gig-list">
                        ${gigs
                          .map((g) => {
                            const v = venueById(g.venueId);
                            const city = v?.city || 'DE';
                            const linkLabel = g.igUrl && g.url === g.igUrl ? 'IG-Post ↗' : 'Tickets ↗';
                            return `<li class="gig-item">
                              <button class="gig-jump" data-jump-date="${esc(g.date)}" data-jump-venue="${esc(g.venueId)}" title="Auf der Karte öffnen">
                                <div class="gig-when">${formatShort(g.date)}${g.start ? ` · ${esc(g.start)}` : ''} · ${esc(city)} · ${esc(v?.name || '')}</div>
                                <div class="gig-title">${esc(g.title)}</div>
                              </button>
                              ${safeUrl(g.url) ? `<a class="gig-tix" href="${esc(g.url)}" target="_blank" rel="noopener">${linkLabel}</a>` : ''}
                            </li>`;
                          })
                          .join('')}
                      </ul>`
                    : `<div class="no-gigs">Aktuell kein Termin in Deutschland (nächste 90 Tage) gemeldet – du kannst über „+ IG“ jederzeit einen aktuellen Tourdaten-Post verlinken.</div>`
                }
              </div>`;
            })
            .join('')}`
        : `<div class="empty-state">
            <div class="big">★</div>
            <p>Noch keine eigenen Acts gespeichert.</p>
            <p class="muted">Gib oben einen Künstlernamen oder einen Instagram-Link ein, um alle Auftritte in ganz Deutschland zu sehen.</p>
          </div>`
    }`;

  bindActsForm();
}

function bindActsForm() {
  const form = $('#addActForm');
  const nameInput = $('#customActInput');
  const igInput = $('#customIgInput');
  const acList = $('#acList');
  if (!form || !nameInput || !igInput || !acList) return;

  const updateAutocomplete = (rawVal) => {
    const handleQ = extractIgHandle(rawVal, false);
    const q = handleQ || normKey(rawVal);
    const qp = plainKey(rawVal);
    if (q.length < 2 || extractIgPostCode(rawVal)) {
      acList.hidden = true;
      acList.innerHTML = '';
      return;
    }
    const matches = state.deCatalog
      .filter(
        (c) =>
          !isActSaved(c.key, c.ig) &&
          (c.key.includes(q) || c.plain.includes(qp) || (c.ig && c.ig.includes(q.replace(/\s+/g, '')))),
      )
      .sort((a, b) => {
        const aExactIg = a.ig === handleQ ? 1 : 0;
        const bExactIg = b.ig === handleQ ? 1 : 0;
        const aStarts = a.key.startsWith(q) || (a.ig && a.ig.startsWith(q)) ? 1 : 0;
        const bStarts = b.key.startsWith(q) || (b.ig && b.ig.startsWith(q)) ? 1 : 0;
        return bExactIg - aExactIg || bStarts - aStarts || b.count - a.count || a.name.localeCompare(b.name);
      })
      .slice(0, 8);

    if (!matches.length) {
      acList.hidden = true;
      acList.innerHTML = '';
      return;
    }
    acList.innerHTML = matches
      .map(
        (m) => `<li><button type="button" data-pick-act="${esc(m.name)}" data-pick-ig="${esc(m.ig || '')}">
          <span>${esc(m.name)}${m.ig ? ` <small style="color:#ff6ad5">@${esc(m.ig)}</small>` : ''}</span>
          <small>${m.count ? `${m.count} Termin${m.count === 1 ? '' : 'e'} in DE` : 'Bekannter Act'}</small>
        </button></li>`,
      )
      .join('');
    acList.hidden = false;
  };

  nameInput.addEventListener('input', () => updateAutocomplete(nameInput.value));
  igInput.addEventListener('input', () => updateAutocomplete(igInput.value));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nVal = nameInput.value.trim();
    const iVal = igInput.value.trim();
    if (!nVal && !iVal) return;
    nameInput.value = '';
    igInput.value = '';
    acList.hidden = true;
    addCustomAct(nVal, iVal);
  });

  document.querySelectorAll('.ig-edit-form').forEach((f) => {
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const actName = f.dataset.igFormFor;
      const val = f.querySelector('input')?.value?.trim() || '';
      if (!val) return;
      addCustomAct(actName, val);
    });
  });
}

function renderPanel() {
  if (state.venueId) renderVenue();
  else if (state.tab === 'acts') renderActsTab();
  else renderDayList();
  $('#panelContent').scrollTop = 0;
}

function syncTabsUi() {
  $('#tabMap')?.classList.toggle('active', state.tab === 'map');
  $('#tabMap')?.setAttribute('aria-selected', String(state.tab === 'map'));
  $('#tabActs')?.classList.toggle('active', state.tab === 'acts');
  $('#tabActs')?.setAttribute('aria-selected', String(state.tab === 'acts'));
  $('#topActsBtn')?.classList.toggle('active', state.tab === 'acts');
}

function refreshView({ fit = true } = {}) {
  syncTabsUi();
  renderDateStrip();
  const bounds = renderMarkers();
  renderPanel();
  syncUrl();
  if (fit) {
    if (bounds.length) fitTo(bounds);
    else if (state.tab === 'acts') map.setView([51.16, 10.45], 6, { animate: true });
    else map.setView([state.data.center.lat, state.data.center.lng], 11, { animate: true });
  }
}

// ---------- Aktionen ----------
function setTab(tab) {
  state.tab = tab;
  state.venueId = null;
  stopAudio();
  if (tab === 'acts') $('#panel').classList.add('expanded');
  refreshView({ fit: true });
}

function setDate(iso, { fit = true } = {}) {
  state.date = iso;
  state.tab = 'map';
  state.venueId = null;
  $('#dateInput').value = iso;
  $('#dateLabel').textContent = formatLong(iso);
  stopAudio();
  refreshView({ fit });
}

function selectVenue(venueId, pan = true) {
  state.venueId = venueId;
  stopAudio();
  renderMarkers();
  renderPanel();
  syncUrl();
  $('#panel').classList.add('expanded');
  const v = venueById(venueId);
  if (pan && v) map.setView([v.lat, v.lng], Math.max(map.getZoom(), 13), { animate: true });
}

function showToast(msg) {
  const el = $('#refreshToast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

async function refreshData() {
  const btn = $('#refreshBtn');
  btn?.classList.add('loading');
  const prevMucCount = state.data?.events?.length || 0;
  const prevDeCount = state.deData?.events?.length || 0;

  const ts = Date.now();
  const [data, artists, deData] = await Promise.all([
    loadJson(`data/events.json?t=${ts}`, null, true),
    loadJson(`data/artists.json?t=${ts}`, {}, true),
    loadJson(`data/germany-events.json?t=${ts}`, null, true),
  ]);

  if (data) {
    state.data = data;
    state.artists = { ...artists, ...state.liveDeezer };
    if (deData) state.deData = deData;
    buildGermanyCatalog();
    updateHeaderTimestamp();

    for (const act of state.customActs) {
      if (!act.ig && state.deCatalog.find((c) => c.key === act.key)?.ig) {
        act.ig = state.deCatalog.find((c) => c.key === act.key).ig;
      }
      await ensureArtistTracks(act.name);
    }
    writeStorage(LS_CUSTOM_ACTS, state.customActs);

    refreshView({ fit: false });
    const diffMuc = data.events.length - prevMucCount;
    const deTotal = getGermanyEventPool().length;
    const diffDe = (state.deData?.events?.length || 0) - prevDeCount;
    const stamp = new Date(data.generatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    const deltaMsg = diffMuc > 0 || diffDe > 0 ? ` (+${Math.max(0, diffMuc)} MUC / +${Math.max(0, diffDe)} DE neu)` : '';
    showToast(`✓ Aktualisiert · ${data.events.length} Events Raum München · ${deTotal.toLocaleString('de-DE')} Events DE${deltaMsg} · Stand: ${stamp}`);
  } else {
    showToast('⚠️ Aktualisierung fehlgeschlagen – bitte Verbindung prüfen.');
  }
  btn?.classList.remove('loading');
}

function stopAudio() {
  audio.pause();
  playingBtn?.classList.remove('playing');
  if (playingBtn) playingBtn.textContent = '▶';
  playingBtn = null;
}

function togglePreview(btn) {
  if (playingBtn === btn) return stopAudio();
  stopAudio();
  audio.src = btn.dataset.preview;
  audio.play().catch(() => {});
  btn.classList.add('playing');
  btn.textContent = '❚❚';
  playingBtn = btn;
}
audio.addEventListener('ended', stopAudio);

function bindUi() {
  $('#prevDay').onclick = () => setDate(addDays(state.date, -1));
  $('#nextDay').onclick = () => setDate(addDays(state.date, 1));
  $('#dateInput').onchange = (e) => e.target.value && setDate(e.target.value);

  $('#refreshBtn').onclick = () => refreshData();
  $('#topActsBtn').onclick = () => setTab(state.tab === 'acts' ? 'map' : 'acts');
  $('#tabMap').onclick = () => setTab('map');
  $('#tabActs').onclick = () => setTab('acts');

  document.querySelectorAll('[data-quick]').forEach((b) =>
    b.addEventListener('click', () => {
      const q = b.dataset.quick;
      if (q === 'today') setDate(todayISO());
      if (q === 'fri') setDate(nextWeekday(5));
      if (q === 'sat') setDate(nextWeekday(6));
      if (q === 'next') {
        const next = state.data.events.find((e) => e.date > state.date && (eventVisible(e) || matchedCustomActsForEvent(e).length));
        if (next) setDate(next.date);
      }
    }),
  );

  document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      const s = chip.dataset.style;
      state.styles.has(s) ? state.styles.delete(s) : state.styles.add(s);
      chip.classList.toggle('on', state.styles.has(s));
      if (state.tab !== 'map') state.tab = 'map';
      refreshView({ fit: false });
    }),
  );

  $('#dateStrip').addEventListener('click', (e) => {
    const b = e.target.closest('[data-date]');
    if (b) setDate(b.dataset.date);
  });

  $('#panelHandle').onclick = () => $('#panel').classList.toggle('expanded');

  $('#panelContent').addEventListener('click', (e) => {
    const t = e.target.closest('button, a');
    if (!t) return;
    if (t.dataset.pickAct) return addCustomAct(t.dataset.pickAct, t.dataset.pickIg || '');
    if (t.dataset.addAct) return addCustomAct(t.dataset.addAct);
    if (t.dataset.removeAct) return removeCustomAct(t.dataset.removeAct);
    if (t.dataset.editIg) {
      state.editingIgKey = state.editingIgKey === t.dataset.editIg ? null : t.dataset.editIg;
      renderActsTab();
      return;
    }
    if (t.dataset.watch) {
      toggleCustomAct(t.dataset.watch, t.dataset.watchIg || '');
      return;
    }
    if ('focusAct' in t.dataset) {
      const key = t.dataset.focusAct || null;
      state.focusedActKey = state.focusedActKey === key ? null : key;
      refreshView({ fit: true });
      return;
    }
    if (t.dataset.jumpDate && t.dataset.jumpVenue) {
      state.date = t.dataset.jumpDate;
      state.tab = 'map';
      $('#dateInput').value = state.date;
      $('#dateLabel').textContent = formatLong(state.date);
      syncTabsUi();
      renderDateStrip();
      selectVenue(t.dataset.jumpVenue, true);
      return;
    }
    if (t.dataset.venue) return selectVenue(t.dataset.venue);
    if (t.dataset.date) return setDate(t.dataset.date);
    if (t.dataset.action === 'back') {
      state.venueId = null;
      stopAudio();
      renderMarkers();
      renderPanel();
      syncUrl();
      return;
    }
    if (t.dataset.preview) return togglePreview(t);
    if (t.dataset.embed) {
      const box = t.closest('.act').querySelector('.embed');
      if (box.innerHTML) {
        box.innerHTML = '';
        t.textContent = '▶ Spotify Top-Tracks';
      } else {
        stopAudio();
        box.innerHTML = `<iframe src="https://open.spotify.com/embed/artist/${encodeURIComponent(t.dataset.embed)}?utm_source=generator&theme=0" height="352" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
        t.textContent = '✕ Player schließen';
      }
    }
  });
}

// ---------- Start ----------
async function loadJson(url, fallback, forceReload = false) {
  try {
    const r = await fetch(url, { cache: forceReload ? 'no-store' : 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    return fallback;
  }
}

function updateHeaderTimestamp() {
  $('#radius').textContent = state.data.radiusKm;
  const deCount = getGermanyEventPool().length;
  const deHint = deCount ? ` · ${deCount.toLocaleString('de-DE')} Events DE` : '';
  $('#updated').textContent = `Stand: ${new Date(state.data.generatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}${deHint}`;
}

async function main() {
  const [data, artists, deData] = await Promise.all([
    loadJson('data/events.json', null),
    loadJson('data/artists.json', {}),
    loadJson('data/germany-events.json', null),
  ]);
  if (!data) {
    $('#panelContent').innerHTML = '<p>Keine Daten gefunden. Bitte zuerst <code>npm run update</code> ausführen.</p>';
    return;
  }
  state.data = data;
  state.deData = deData;
  state.artists = { ...artists, ...state.liveDeezer };
  buildGermanyCatalog();
  updateHeaderTimestamp();
  updateActsCounters();

  initMap();
  bindUi();

  $('#dateInput').value = state.date;
  $('#dateLabel').textContent = formatLong(state.date);

  const venueFromUrl = state.venueId;
  refreshView({ fit: true });
  if (venueFromUrl && venueById(venueFromUrl)) selectVenue(venueFromUrl);

  for (const act of state.customActs) {
    if (!act.ig) {
      const catIg = state.deCatalog.find((c) => c.key === act.key)?.ig;
      if (catIg) act.ig = catIg;
    }
    ensureArtistTracks(act.name).then(() => {
      if (state.tab === 'acts' && !state.venueId) renderActsTab();
    });
  }
}

main();
