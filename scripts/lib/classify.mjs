import { GENRE_MAP, WEAK_GENRES, KEYWORDS, ARTIST_STYLES, VENUE_STYLES, KNOWN_VENUES, IG_HANDLE_TO_ARTIST } from '../config.mjs';

/** Entfernt RA-Namenszusätze wie "Haze (GER)" oder "Almedina (2)". */
export function cleanArtistName(name) {
  return String(name)
    .replace(/^@/, '')
    .replace(/\s*\((\d+|[A-Z]{2,4}|live|dj set|all night long)\)\s*$/i, '')
    .replace(/\*all night long$/i, '')
    .trim();
}

export function artistKey(name) {
  return cleanArtistName(name)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function plainKey(name) {
  return cleanArtistName(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ARTIST_LOOKUP = {};
for (const [k, v] of Object.entries(ARTIST_STYLES)) {
  ARTIST_LOOKUP[artistKey(k)] = v;
  ARTIST_LOOKUP[plainKey(k)] = v;
}

export const ARTIST_TO_IG_HANDLE = {};
for (const [handle, canonicalName] of Object.entries(IG_HANDLE_TO_ARTIST)) {
  const k = artistKey(canonicalName);
  if (k && !ARTIST_TO_IG_HANDLE[k]) ARTIST_TO_IG_HANDLE[k] = handle.toLowerCase();
}

const IG_NON_PROFILE_PATHS = new Set(['p', 'reel', 'reels', 'stories', 'tv', 'explore', 'accounts', 'direct', 'about', 'legal']);

/** Extrahiert einen sauberen Instagram-Handle aus Profil-URLs ("https://www.instagram.com/somewhensrx?hl=de") oder "@somewhensrx". */
export function extractIgHandle(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const urlMatch = s.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})(?:[/?#]|$)/i);
  if (urlMatch) {
    const seg = urlMatch[1].toLowerCase().replace(/\.+$/, '');
    return IG_NON_PROFILE_PATHS.has(seg) ? null : seg;
  }
  const handleMatch = s.match(/^@?([A-Za-z0-9._]{2,30})$/);
  if (handleMatch && !/\s/.test(s)) {
    const seg = handleMatch[1].toLowerCase().replace(/\.+$/, '');
    return IG_NON_PROFILE_PATHS.has(seg) ? null : seg;
  }
  return null;
}

export function lookupArtistStyles(name) {
  return ARTIST_LOOKUP[artistKey(name)] || ARTIST_LOOKUP[plainKey(name)] || null;
}

const AMBIGUOUS_ARTIST_WORDS = new Set(['alignment', 'restricted', 'cloudy', 'anime', 'surgeon', 'regis', 'perc']);

/** Sucht bekannte Acts & gemappte Instagram-Handles in einem kurzen Text (z. B. Titel oder Line-up-Block). */
export function extractKnownArtists(text, { allowPlainNames = true } = {}) {
  const found = new Map();
  const s = String(text || '');

  for (const m of s.matchAll(/@([a-z0-9._]{2,30})/gi)) {
    const h = m[1].toLowerCase().replace(/\.+$/, '');
    const mapped = IG_HANDLE_TO_ARTIST[h];
    if (mapped) found.set(artistKey(mapped), mapped);
  }

  if (!allowPlainNames) return [...found.values()];

  const lower = ` ${plainKey(s)} `;
  for (const canonical of Object.keys(ARTIST_STYLES)) {
    const clean = canonical.trim();
    if (clean.length < 3) continue;
    const pk = plainKey(clean);
    const ak = artistKey(clean);
    if (AMBIGUOUS_ARTIST_WORDS.has(pk)) continue;
    if ((pk && lower.includes(` ${pk} `)) || (ak && lower.includes(` ${ak} `))) {
      found.set(artistKey(clean), clean);
    }
  }
  return [...found.values()];
}

/** Ordnet einen Venue-Namen oder Freitext einer bekannten Location aus KNOWN_VENUES zu. */
export function resolveKnownVenue(text) {
  const s = String(text || '');
  if (!s) return null;
  for (const [key, v] of Object.entries(KNOWN_VENUES)) {
    if (v.patterns?.some((re) => re.test(s))) return { key, ...v };
  }
  return null;
}

/**
 * Bewertet ein Event.
 * confidence: 'high' = klar Hardtechno/Industrial/Uptempo, 'low' = nur allgemein Techno, null = passt nicht.
 */
export function classify({
  title = '',
  content = '',
  genres = [],
  artists = [],
  venueName = '',
  manualStyles = [],
  collectiveStyles = [],
  collectiveName = '',
}) {
  const styles = new Set(manualStyles);
  const reasons = [];
  if (manualStyles.length) reasons.push('manuell');

  if (collectiveStyles.length) {
    collectiveStyles.forEach((s) => styles.add(s));
    reasons.push(`Kollektiv: ${collectiveName || 'Szene'}`);
  }

  for (const g of genres) {
    if (GENRE_MAP[g]) {
      GENRE_MAP[g].forEach((s) => styles.add(s));
      reasons.push(`Genre: ${g}`);
    }
  }

  const text = `${title}\n${content}`;
  for (const { re, styles: st } of KEYWORDS) {
    const m = text.match(re);
    if (m) {
      st.forEach((s) => styles.add(s));
      reasons.push(`Stichwort: "${m[0].trim()}"`);
    }
  }

  // Im Fließtext nur explizite @Handles matchen (keine "supported by …"-Aufzählungen oder englische Wörter wie "alignment")
  const handleArtists = extractKnownArtists(text, { allowPlainNames: false });
  const titleArtists = extractKnownArtists(title, { allowPlainNames: true });
  const allArtists = [...new Set([...artists, ...titleArtists, ...handleArtists])];
  for (const a of allArtists) {
    const st = lookupArtistStyles(a);
    if (st) {
      st.forEach((s) => styles.add(s));
      reasons.push(`Act: ${cleanArtistName(a)}`);
    }
  }

  if (VENUE_STYLES[venueName]) {
    VENUE_STYLES[venueName].forEach((s) => styles.add(s));
    reasons.push(`Venue: ${venueName}`);
  }

  // Case-insensitive Deduplizierung der Gründe
  const seenReason = new Set();
  const uniqueReasons = reasons.filter((r) => {
    const k = r.toLowerCase().replace(/[\s-]+/g, '');
    if (seenReason.has(k)) return false;
    seenReason.add(k);
    return true;
  });
  if (styles.size) return { styles: [...styles], confidence: 'high', reasons: uniqueReasons };
  const weak = genres.filter((g) => WEAK_GENRES.includes(g));
  if (weak.length) return { styles: ['techno'], confidence: 'low', reasons: weak.map((g) => `Genre: ${g}`) };
  return null;
}
