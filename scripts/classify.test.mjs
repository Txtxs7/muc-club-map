import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, artistKey, cleanArtistName } from './lib/classify.mjs';
import { isPrecise, distanceKm } from './lib/geo.mjs';

test('Namenszusätze von RA werden entfernt', () => {
  assert.equal(cleanArtistName('Haze (GER)'), 'Haze');
  assert.equal(cleanArtistName('Almedina (2)'), 'Almedina');
  assert.equal(artistKey('KØZLØV'), 'kozlov');
  assert.equal(artistKey('Héctor Oaks'), 'hector oaks');
});

test('Genre Industrial → sicher', () => {
  const r = classify({ title: 'Night', genres: ['Industrial'] });
  assert.equal(r.confidence, 'high');
  assert.deepEqual(r.styles, ['industrial']);
});

test('Stichwörter im Titel', () => {
  assert.deepEqual(classify({ title: 'HARDTECHNO all night' }).styles, ['hardtechno']);
  assert.deepEqual(classify({ title: '135+ mit XY' }).styles, ['uptempo']);
  assert.deepEqual(classify({ title: 'Schranz Attack' }).styles, ['hardtechno']);
});

test('Bekannter Act → sicher', () => {
  const r = classify({ title: 'Saturday', artists: ['I Hate Models', 'Local DJ'] });
  assert.equal(r.confidence, 'high');
  assert.ok(r.styles.includes('industrial'));
});

test('Nur Techno → unsicher, House → raus', () => {
  assert.equal(classify({ title: 'Club', genres: ['Techno'] }).confidence, 'low');
  assert.equal(classify({ title: 'Club', genres: ['House'] }), null);
});

test('Geo-Helfer', () => {
  assert.equal(isPrecise(48, 11), false);
  assert.equal(isPrecise(48.14, 11.57), false);
  assert.equal(isPrecise(48.123198, 11.551234), true);
  const d = distanceKm({ lat: 48.1374, lng: 11.5755 }, { lat: 48.3705, lng: 10.8978 }); // Augsburg
  assert.ok(d > 50 && d < 60);
});
