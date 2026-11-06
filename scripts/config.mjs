// Zentrale Konfiguration für den Daten-Build.

export const CENTER = { name: 'München Marienplatz', lat: 48.1374, lng: 11.5755 };
export const RADIUS_KM = 100;
export const DAYS_AHEAD = 90;

// Resident-Advisor-Areas (IDs via GraphQL `area(areaUrlName, countryUrlCode)` ermittelt)
export const RA_AREAS = [
  { id: 357, name: 'Bavaria' },
  { id: 151, name: 'Munich' },
  { id: 209, name: 'Augsburg' },
  { id: 224, name: 'Regensburg' },
  { id: 693, name: 'Salzburg' },
];

// RA-Genres -> unsere Stile (RA hat kein eigenes "Hard Techno"-Genre)
export const GENRE_MAP = {
  Industrial: ['industrial'],
  EBM: ['industrial'],
  Noise: ['industrial'],
  Hardcore: ['uptempo'],
  Gabber: ['uptempo'],
  'Hard Drum': ['uptempo', 'hardtechno'],
};

// Genres, die ein Event als "möglicherweise passend" markieren (unsicher)
export const WEAK_GENRES = ['Techno', 'Acid', 'Minimal Techno'];

// Schlüsselwörter in Titel / Beschreibung
export const KEYWORDS = [
  { re: /hard\s*-?\s*techno|hardtek|schranz|hard\s*-?\s*groove|rave\s*techno|warehouse\s*techno/i, styles: ['hardtechno'] },
  { re: /industrial|\bebm\b|dark\s*techno/i, styles: ['industrial'] },
  { re: /up\s*-?\s*tempo|hard\s*dance|hardstyle|hardcore|gabber|frenchcore|hard\s*drum|\b1[4-9]\d\s*\+|\b1[4-9]\d\s*bpm|\b135\s*\+/i, styles: ['uptempo'] },
];

// Bekannte Acts -> Stil. Frei erweiterbar (Groß-/Kleinschreibung egal).
export const ARTIST_STYLES = {
  // Hardtechno / Rave
  'Nico Moreno': ['hardtechno'],
  'Dyen': ['hardtechno'],
  'Trym': ['hardtechno'],
  'Holy Priest': ['hardtechno'],
  'Klangkuenstler': ['hardtechno'],
  'Alignment': ['hardtechno'],
  'Fantasm': ['hardtechno'],
  'Sara Landry': ['hardtechno'],
  'Dax J': ['hardtechno'],
  'Kuko': ['hardtechno'],
  'Restricted': ['hardtechno'],
  'Hadone': ['hardtechno'],
  'Shlømo': ['hardtechno'],
  'Indira Paganotto': ['hardtechno'],
  'Cera Khin': ['hardtechno'],
  'Lacchesi': ['hardtechno'],
  'Funk Tribu': ['hardtechno'],
  'Charlie Sparks': ['hardtechno'],
  'Nicolas Julian': ['hardtechno'],
  'Novah': ['hardtechno'],
  'Kai Pattenberg': ['hardtechno'],
  'Basswell': ['hardtechno', 'uptempo'],
  'Hertz Collision': ['hardtechno'],
  'Somniac One': ['hardtechno'],
  'Clara Cuvé': ['hardtechno'],
  'Ø [Phase]': ['hardtechno'],
  'Chris Liebing': ['hardtechno'],
  'Robert Natus': ['hardtechno'],
  'Viper XXL': ['hardtechno'],
  'Frank Kvitta': ['hardtechno'],
  'Pet Duo': ['hardtechno', 'industrial'],
  // Industrial
  'Kobosil': ['industrial', 'hardtechno'],
  'VTSS': ['industrial'],
  'I Hate Models': ['industrial', 'hardtechno'],
  'Ancient Methods': ['industrial'],
  'Rebekah': ['industrial', 'hardtechno'],
  'Somewhen': ['industrial'],
  '999999999': ['hardtechno', 'industrial'],
  'Paula Temple': ['industrial'],
  'Perc': ['industrial'],
  'SNTS': ['industrial'],
  'Nene H': ['industrial'],
  'Unhuman': ['industrial'],
  'Schwefelgelb': ['industrial'],
  'Phase Fatale': ['industrial'],
  'Héctor Oaks': ['hardtechno'],
  'Parfait': ['industrial', 'hardtechno'],
  'A.N.I.M.A.': ['industrial'],
  'Shdw & Obscure Shape': ['industrial'],
  'Blawan': ['industrial'],
  // Uptempo / Hard Dance
  'Dr. Peacock': ['uptempo'],
  'Sefa': ['uptempo'],
  'Angerfist': ['uptempo'],
  'Miss K8': ['uptempo'],
  'Partyraiser': ['uptempo'],
  'Spitnoise': ['uptempo'],
  'Vieze Asbak': ['uptempo'],
  'Nusha': ['uptempo'],
  'Shadowkid': ['uptempo'],
  'KØZLØV': ['uptempo'],
  'Ninja Kore': ['uptempo'],
};

// Venues, deren Events immer als Hardtechno gelten sollen (optional)
export const VENUE_STYLES = {
  // 'Beispiel-Club': ['hardtechno'],
};
