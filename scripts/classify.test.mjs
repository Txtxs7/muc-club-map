import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, artistKey, cleanArtistName, extractIgHandle } from './lib/classify.mjs';
import { parseInstagramEvent } from './lib/instagram.mjs';
import { isPrecise, distanceKm } from './lib/geo.mjs';

test('Namenszusätze, Umlaute und Instagram-Links werden sauber normalisiert', () => {
  assert.equal(cleanArtistName('Haze (GER)'), 'Haze');
  assert.equal(cleanArtistName('Almedina (2)'), 'Almedina');
  assert.equal(artistKey('KØZLØV'), 'kozlov');
  assert.equal(artistKey('Héctor Oaks'), 'hector oaks');
  assert.equal(artistKey('Klangkünstler'), artistKey('Klangkuenstler'));
  assert.equal(artistKey('Überrest'), artistKey('Ueberrest'));
  assert.equal(extractIgHandle('https://www.instagram.com/somewhensrx/?hl=de'), 'somewhensrx');
  assert.equal(extractIgHandle('instagram.com/4nouk.mp3/'), '4nouk.mp3');
  assert.equal(extractIgHandle('@fnk.off'), 'fnk.off');
  assert.equal(extractIgHandle('https://www.instagram.com/p/DfO8R8bDPKL/'), null);
});

test('Genre Industrial → sicher', () => {
  const r = classify({ title: 'Night', genres: ['Industrial'] });
  assert.equal(r.confidence, 'high');
  assert.deepEqual(r.styles, ['industrial']);
});

test('Stichwörter & Szene-Reihen im Titel', () => {
  assert.deepEqual(classify({ title: 'HARDTECHNO all night' }).styles, ['hardtechno']);
  assert.deepEqual(classify({ title: '135+ mit XY' }).styles, ['uptempo']);
  assert.deepEqual(classify({ title: 'UNTERWELT (EBM, Electro, Industrial, Techno)' }).styles, ['industrial']);
  assert.deepEqual(classify({ title: 'UNTREATED w/ Perc & Octor', artists: ['Perc', 'Octor'] }).styles, ['industrial']);
});

test('Bekannter Act inkl. Schrotthagen / Somewhen → Industrial', () => {
  const r1 = classify({ title: 'Saturday', artists: ['Schrotthagen'] });
  assert.equal(r1.confidence, 'high');
  assert.ok(r1.styles.includes('industrial'));

  const r2 = classify({ title: 'PLAY', content: 'LINE-UP @somewhensrx' });
  assert.equal(r2.confidence, 'high');
  assert.ok(r2.styles.includes('industrial'));
});

test('Nur Techno → unsicher, House → raus', () => {
  assert.equal(classify({ title: 'Club', genres: ['Techno'] }).confidence, 'low');
  assert.equal(classify({ title: 'Club', genres: ['House'] }), null);
});

test('Instagram-Parser erkennt Nuketekk-Post (mit Datum, Uhrzeit & Venue)', () => {
  const rawDesc = `NUKETEKK RESIDENT NIGHT ☣️💛
Von Schranz über Bounce, Hardtechno, Tekk und Frenchcore ist alles dabei!
📅 05. 12. 2026
⏰ 22:00 - 05:00
📍 Skateschule München
#hardtechno #industrial #munich - @nuketekk on November 3, 2026`;
  const ev = parseInstagramEvent(
    { code: 'DfSb24-oNnE', rawDesc, image: 'https://example.com/flyer.jpg' },
    { handle: 'nuketekk', label: 'Nuketekk', defaultCity: 'München', defaultStyles: ['hardtechno', 'industrial'] },
    '2026-11-06',
    '2027-02-04',
  );
  assert.ok(ev);
  assert.equal(ev.date, '2026-12-05');
  assert.equal(ev.start, '22:00');
  assert.equal(ev.end, '05:00');
  assert.equal(ev.venue.id, 'known-skateschule');
});

test('Instagram-Parser erkennt relativen Wochentag ("SAMSTAG: 23 UHR") ab Post-Datum', () => {
  const rawDesc = `PLAY – SOMEWHEN ⛓️🖤
Zwischen Beton, Verzerrung und digitalem Rauschen.
LINE-UP
⛓️ @somewhensrx
START & ABENDKASSE ↙️
SAMSTAG: 23 UHR - @kesselhaus_augsburg on November 2, 2026`;
  const ev = parseInstagramEvent(
    { code: 'DfO8R8bDPKL', rawDesc, image: null },
    { handle: 'kesselhaus_augsburg', label: 'Kesselhaus Augsburg', defaultVenue: 'kesselhaus-augsburg', defaultStyles: [] },
    '2026-11-06',
    '2027-02-04',
  );
  assert.ok(ev);
  assert.equal(ev.date, '2026-11-07');
  assert.equal(ev.start, '23:00');
  assert.ok(ev.artists.some((a) => a.name === 'Somewhen'));
});

test('Instagram-Parser verwirft fremde Städte (Amsterdam / Tourplan)', () => {
  const amsterdam = `PURPOSELY CONNECT #2
GARAGE @anthony.linell
Garage Noord on sunday 15 november, 13:00-05:00 - @behaerd on October 27, 2026`;
  assert.equal(
    parseInstagramEvent(
      { code: 'DfAc6BrDPZR', rawDesc: amsterdam },
      { handle: 'behaerd', label: 'BeHaerd', defaultCity: 'München', defaultStyles: ['industrial'] },
      '2026-11-06',
      '2027-02-04',
    ),
    null,
  );
});

test('Fließtext-Wörter wie "alignment" oder "supported by …" triggern keine falschen Acts', () => {
  assert.equal(
    classify({
      title: 'SENTAKU SHOWCASE',
      content: 'A night in perfect alignment with deep house grooves, supported by 999999999 and I Hate Models.',
      genres: ['House'],
    }),
    null,
  );
});

test('Instagram-Parser ignoriert Bewerbungsdeadline vor Event-Datum und verwirft Wochenend-Sammelposts', () => {
  const openDecks = `100hz.club am November 2, 2026: "🎛 𝟭𝟬𝟬𝗛𝘇 𝗢𝗣𝗘𝗡 𝗗𝗘𝗖𝗞𝗦 | 𝟭𝟯.𝟭𝟭.𝟮𝟲 🎛
◢ Datum: Freitag, 13.11.2026
◢ Location: 100Hz Club, Fuggerstraße 14, 86150 Augsburg
Bewerbungsdeadline: Dienstag, 10.11.2026, 18:00 Uhr."`;
  const ev = parseInstagramEvent(
    { code: 'DfQPGzkDnqP', rawDesc: openDecks },
    { handle: '100hz.club', label: '100Hz Augsburg', defaultVenue: '100hz-augsburg', defaultStyles: [] },
    '2026-11-06',
    '2027-02-04',
  );
  assert.ok(ev);
  assert.equal(ev.date, '2026-11-13');

  const weekendSummary = `kesselhaus_augsburg am November 4, 2026: "MACHT EUCH BEREIT 🤞
🎉 Freitag ab 22 Uhr – @suendenherz
🥳 Samstag ab 23 Uhr - PLAY w/ @somewhensrx"`;
  assert.equal(
    parseInstagramEvent(
      { code: 'DfUjtrAMbJ5', rawDesc: weekendSummary },
      { handle: 'kesselhaus_augsburg', label: 'Kesselhaus Augsburg', defaultVenue: 'kesselhaus-augsburg', defaultStyles: [] },
      '2026-11-06',
      '2027-02-04',
    ),
    null,
  );
});

test('Geo-Helfer', () => {
  assert.equal(isPrecise(48, 11), false);
  assert.equal(isPrecise(48.14, 11.57), false);
  assert.equal(isPrecise(48.123198, 11.551234), true);
  const d = distanceKm({ lat: 48.1374, lng: 11.5755 }, { lat: 48.3705, lng: 10.8978 });
  assert.ok(d > 50 && d < 60);
});
