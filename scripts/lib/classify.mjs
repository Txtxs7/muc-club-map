import { GENRE_MAP, WEAK_GENRES, KEYWORDS, ARTIST_STYLES, VENUE_STYLES } from '../config.mjs';

/** Entfernt RA-Namenszusätze wie "Haze (GER)" oder "Almedina (2)". */
export function cleanArtistName(name) {
  return String(name)
    .replace(/\s*\((\d+|[A-Z]{2,4}|live|dj set)\)\s*$/i, '')
    .trim();
}

export function artistKey(name) {
  return cleanArtistName(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/g, 'o')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ARTIST_LOOKUP = Object.fromEntries(Object.entries(ARTIST_STYLES).map(([k, v]) => [artistKey(k), v]));

/**
 * Bewertet ein Event.
 * confidence: 'high' = klar Hardtechno/Industrial/Uptempo, 'low' = nur allgemein Techno, null = passt nicht.
 */
export function classify({ title = '', content = '', genres = [], artists = [], venueName = '', manualStyles = [] }) {
  const styles = new Set(manualStyles);
  const reasons = [];
  if (manualStyles.length) reasons.push('manuell');

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

  for (const a of artists) {
    const st = ARTIST_LOOKUP[artistKey(a)];
    if (st) {
      st.forEach((s) => styles.add(s));
      reasons.push(`Act: ${cleanArtistName(a)}`);
    }
  }

  if (VENUE_STYLES[venueName]) {
    VENUE_STYLES[venueName].forEach((s) => styles.add(s));
    reasons.push(`Venue: ${venueName}`);
  }

  if (styles.size) return { styles: [...styles], confidence: 'high', reasons };
  const weak = genres.filter((g) => WEAK_GENRES.includes(g));
  if (weak.length) return { styles: ['techno'], confidence: 'low', reasons: weak.map((g) => `Genre: ${g}`) };
  return null;
}
