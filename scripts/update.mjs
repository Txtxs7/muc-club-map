#!/usr/bin/env node
// Baut data/events.json + data/artists.json neu.
// Aufruf:  node scripts/update.mjs            (alles)
//          node scripts/update.mjs --no-artists (ohne Track-Anreicherung)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CENTER, RADIUS_KM, DAYS_AHEAD, RA_AREAS } from './config.mjs';
import { fetchAreaEvents } from './lib/ra.mjs';
import { geocode, distanceKm, isPrecise } from './lib/geo.mjs';
import { classify, cleanArtistName, artistKey } from './lib/classify.mjs';
import { enrichArtists } from './lib/artists.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const args = new Set(process.argv.slice(2));

const readJson = async (file, fallback) => {
  const p = path.join(DATA, file);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch (e) {
    console.warn(`⚠️  ${file} ist kein gültiges JSON: ${e.message}`);
    return fallback;
  }
};
const writeJson = (file, obj) => writeFile(path.join(DATA, file), JSON.stringify(obj, null, 2) + '\n');

const isoDate = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // YYYY-MM-DD
const hhmm = (s) => (s ? String(s).slice(11, 16) : null);
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ');

async function main() {
  await mkdir(DATA, { recursive: true });
  const venueCache = await readJson('venue-cache.json', {});
  const venueOverrides = await readJson('venue-overrides.json', {});
  const manualEvents = await readJson('manual-events.json', []);
  const artistOverrides = await readJson('artist-overrides.json', {});
  const artistCache = await readJson('artists.json', {});
  const previous = await readJson('events.json', null);

  const today = new Date();
  const from = isoDate(today);
  const to = isoDate(new Date(today.getTime() + DAYS_AHEAD * 864e5));
  console.log(`📅 Zeitraum ${from} – ${to}, Umkreis ${RADIUS_KM} km um ${CENTER.name}`);

  // ---- 1) Rohdaten sammeln ----
  const raw = new Map(); // eventId -> listing
  let raFailed = false;
  for (const area of RA_AREAS) {
    try {
      const list = await fetchAreaEvents(area.id, from, to);
      list.forEach((l) => raw.set(l.event.id, l));
      console.log(`  RA ${area.name}: ${list.length} Events`);
    } catch (e) {
      raFailed = true;
      console.warn(`⚠️  RA ${area.name} fehlgeschlagen: ${e.message}`);
    }
  }

  const candidates = [];
  for (const { listingDate, event: ev } of raw.values()) {
    if (!ev?.venue) continue;
    candidates.push({
      id: `ra-${ev.id}`,
      source: 'ra',
      date: String(listingDate || ev.date).slice(0, 10),
      title: ev.title,
      start: hhmm(ev.startTime),
      end: hhmm(ev.endTime),
      url: ev.contentUrl ? `https://ra.co${ev.contentUrl}` : null,
      flyer: ev.flyerFront || null,
      content: stripHtml(ev.content),
      genres: (ev.genres || []).map((g) => g.name),
      artists: (ev.artists || []).map((a) => ({ name: a.name, url: a.contentUrl ? `https://ra.co${a.contentUrl}` : null })),
      venue: {
        id: `ra-${ev.venue.id}`,
        name: ev.venue.name,
        address: ev.venue.address || '',
        url: ev.venue.contentUrl ? `https://ra.co${ev.venue.contentUrl}` : null,
        lat: ev.venue.location?.latitude,
        lng: ev.venue.location?.longitude,
      },
    });
  }

  manualEvents.forEach((m, i) => {
    if (!m.date || !m.venue?.name) return console.warn(`⚠️  manual-events.json #${i}: date und venue.name sind Pflicht`);
    candidates.push({
      id: `manual-${i}-${m.date}`,
      source: 'manual',
      date: m.date,
      title: m.title || m.venue.name,
      start: m.start || null,
      end: m.end || null,
      url: m.url || null,
      flyer: m.flyer || null,
      content: m.description || '',
      genres: m.genres || [],
      manualStyles: m.styles?.length ? m.styles : ['hardtechno'],
      artists: (m.artists || []).map((a) => (typeof a === 'string' ? { name: a, url: null } : a)),
      venue: {
        id: `manual-${m.venue.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: m.venue.name,
        address: m.venue.address || '',
        url: m.venue.url || null,
        lat: m.venue.lat,
        lng: m.venue.lng,
      },
    });
  });

  // ---- 2) Klassifizieren ----
  const matched = [];
  for (const c of candidates) {
    if (c.date < from) continue;
    const cls = classify({
      title: c.title,
      content: c.content,
      genres: c.genres,
      artists: c.artists.map((a) => a.name),
      venueName: c.venue.name,
      manualStyles: c.manualStyles || [],
    });
    if (cls) matched.push({ ...c, ...cls });
  }
  console.log(`🔎 ${candidates.length} Kandidaten → ${matched.filter((m) => m.confidence === 'high').length} sicher, ${matched.filter((m) => m.confidence === 'low').length} unsicher`);

  // ---- 3) Venues verorten + Umkreis prüfen ----
  const venues = {};
  for (const ev of matched) {
    const v = ev.venue;
    if (v.id in venues) continue;
    const ov = venueOverrides[v.id] || venueOverrides[v.name];
    let coords = null;
    if (ov?.lat && ov?.lng) coords = { lat: ov.lat, lng: ov.lng, src: 'override' };
    else if (isPrecise(v.lat, v.lng)) coords = { lat: v.lat, lng: v.lng, src: 'source' };
    else if (venueCache[v.id]) coords = venueCache[v.id];
    else if (v.address || v.name) {
      // Mehrere Versuche: volle Adresse → Name + PLZ/Ort → nur PLZ/Ort (ungefähr)
      const plzCity = (v.address.match(/\b\d{4,5}\s+[^,;]+/) || [])[0]?.trim();
      const queries = [
        v.address,
        plzCity && `${v.name}, ${plzCity}`,
        !v.address && `${v.name}, Bayern`,
        plzCity,
      ].filter(Boolean);
      let hit = null;
      for (const q of queries) {
        hit = await geocode(q);
        if (hit) break;
      }
      if (hit) {
        coords = { ...hit, src: 'nominatim' };
        venueCache[v.id] = coords;
      } else if (v.lat && v.lng) {
        coords = { lat: v.lat, lng: v.lng, src: 'source-approx' };
      }
    }
    if (!coords) {
      console.warn(`  📍 Keine Koordinaten für "${v.name}" (${v.address}) – bitte in data/venue-overrides.json eintragen`);
      venues[v.id] = null;
      continue;
    }
    const dist = distanceKm(CENTER, coords);
    venues[v.id] = dist <= RADIUS_KM
      ? { id: v.id, name: v.name, address: v.address, url: v.url, lat: +coords.lat.toFixed(6), lng: +coords.lng.toFixed(6), distanceKm: Math.round(dist) }
      : null;
  }

  const events = matched
    .filter((ev) => venues[ev.venue.id])
    .map((ev) => ({
      id: ev.id,
      source: ev.source,
      date: ev.date,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      url: ev.url,
      flyer: ev.flyer,
      venueId: ev.venue.id,
      genres: ev.genres,
      styles: ev.styles,
      confidence: ev.confidence,
      reasons: ev.reasons,
      artists: ev.artists.map((a) => ({ key: artistKey(a.name), name: cleanArtistName(a.name), url: a.url })),
    }))
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));

  if (raFailed && raw.size === 0 && previous?.events?.length) {
    console.warn('⚠️  RA nicht erreichbar – übernehme bestehende RA-Events aus events.json.');
    const keptRa = previous.events.filter((e) => e.source === 'ra' && e.date >= from);
    for (const e of keptRa) {
      events.push(e);
      if (previous.venues?.[e.venueId]) venues[e.venueId] = previous.venues[e.venueId];
    }
    events.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  }

  const usedVenues = Object.fromEntries(
    Object.entries(venues).filter(([id, v]) => v && events.some((e) => e.venueId === id)),
  );

  await writeJson('events.json', {
    generatedAt: new Date().toISOString(),
    center: CENTER,
    radiusKm: RADIUS_KM,
    venues: usedVenues,
    events,
  });
  console.log(`✅ ${events.length} Events in ${Object.keys(usedVenues).length} Venues gespeichert`);
  await writeJson('venue-cache.json', venueCache);

  // ---- 4) Acts anreichern ----
  if (!args.has('--no-artists')) {
    const names = [...new Map(events.flatMap((e) => e.artists).map((a) => [a.key, a.name])).values()];
    await enrichArtists(names, artistCache, artistOverrides);
    // nur noch benötigte + kürzlich genutzte behalten (Cache klein halten)
    const used = new Set(events.flatMap((e) => e.artists.map((a) => a.key)));
    for (const [k, v] of Object.entries(artistCache)) {
      if (!used.has(k) && Date.now() - new Date(v.updatedAt).getTime() > 180 * 864e5) delete artistCache[k];
    }
    await writeJson('artists.json', artistCache);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
