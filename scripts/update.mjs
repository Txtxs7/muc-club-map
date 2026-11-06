#!/usr/bin/env node
// Baut data/events.json + data/artists.json + Caches neu.
// Aufruf:  node scripts/update.mjs                 (alles inkl. Instagram, Club-Seiten, RA, Tracks)
//          node scripts/update.mjs --no-artists    (ohne Track-Anreicherung)
//          node scripts/update.mjs --no-instagram  (ohne Headless-Chrome Instagram-Scan)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CENTER, RADIUS_KM, DAYS_AHEAD, RA_AREAS, TICKET_IO_SHOPS, INSTAGRAM_ACCOUNTS } from './config.mjs';
import { fetchAreaEvents } from './lib/ra.mjs';
import { fetchRoteSonne, fetchSchwarzesMuenchen, fetchTicketIoShops } from './lib/munich-sources.mjs';
import { fetchInstagramEvents } from './lib/instagram.mjs';
import { geocode, distanceKm, isPrecise } from './lib/geo.mjs';
import { classify, cleanArtistName, artistKey, resolveKnownVenue, extractKnownArtists } from './lib/classify.mjs';
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

const isoDate = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const hhmm = (s) => (s ? String(s).slice(11, 16) : null);
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ');

const SOURCE_PRIO = { manual: 0, ra: 1, rotesonne: 2, 'ticket.io': 3, 'schwarzes-muenchen': 4, instagram: 5 };
const STOPWORDS = new Set(['with', 'mit', 'und', 'and', 'the', 'for', 'all', 'night', 'long', 'live', 'club', 'munich', 'muenchen', 'party', 'edition', 'series', 'presents']);

function titleTokens(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function isSameEvent(a, b) {
  if (a.date !== b.date || a.venue.id !== b.venue.id) return false;
  const ta = titleTokens(a.title);
  const tb = new Set(titleTokens(b.title));
  if (ta.some((w) => tb.has(w))) return true;
  const ka = new Set(a.artists.map((x) => artistKey(x.name)).filter(Boolean));
  if (b.artists.some((x) => ka.has(artistKey(x.name)))) return true;
  return false;
}

function mergeDuplicate(a, b) {
  const [pri, sec] = (SOURCE_PRIO[a.source] ?? 9) <= (SOURCE_PRIO[b.source] ?? 9) ? [a, b] : [b, a];
  const confidence = pri.confidence === 'high' || sec.confidence === 'high' ? 'high' : 'low';
  let styles = [...new Set([...pri.styles, ...sec.styles])];
  if (confidence === 'high' && styles.length > 1) styles = styles.filter((s) => s !== 'techno');

  const artistMap = new Map();
  for (const list of [pri.artists, sec.artists]) {
    for (const ar of list) {
      const k = artistKey(ar.name);
      if (!k) continue;
      const prev = artistMap.get(k);
      artistMap.set(k, { name: prev?.name || ar.name, url: prev?.url || ar.url || null });
    }
  }

  const igUrl = [pri, sec].find((x) => x.source === 'instagram')?.url || pri.igUrl || sec.igUrl || null;
  const sourceLabels = [...new Set([...(pri.sourceLabels || [pri.sourceLabel]), ...(sec.sourceLabels || [sec.sourceLabel])].filter(Boolean))];

  return {
    ...pri,
    title: pri.title.length >= sec.title.length || sec.source === 'instagram' ? pri.title : sec.title,
    start: pri.start || sec.start,
    end: pri.end || sec.end,
    url: (pri.source !== 'instagram' && pri.url) || sec.url || pri.url,
    igUrl,
    flyer: pri.flyer || sec.flyer,
    genres: [...new Set([...pri.genres, ...sec.genres])],
    styles,
    confidence,
    reasons: [...new Set([...pri.reasons, ...sec.reasons])],
    artists: [...artistMap.values()],
    sourceLabels,
  };
}

function canonicalizeVenue(v) {
  const known = resolveKnownVenue(`${v.name || ''} ${v.address || ''}`);
  if (!known) return v;
  return {
    id: `known-${known.key}`,
    name: known.name,
    address: v.address || known.address,
    url: v.url || known.url || null,
    lat: isPrecise(v.lat, v.lng) ? v.lat : known.lat,
    lng: isPrecise(v.lat, v.lng) ? v.lng : known.lng,
  };
}

async function main() {
  await mkdir(DATA, { recursive: true });
  const venueCache = await readJson('venue-cache.json', {});
  const venueOverrides = await readJson('venue-overrides.json', {});
  const manualEvents = await readJson('manual-events.json', []);
  const artistOverrides = await readJson('artist-overrides.json', {});
  const artistCache = await readJson('artists.json', {});
  const igCache = await readJson('ig-cache.json', {});
  const previous = await readJson('events.json', null);

  const today = new Date();
  const from = isoDate(today);
  const to = isoDate(new Date(today.getTime() + DAYS_AHEAD * 864e5));
  console.log(`📅 Zeitraum ${from} – ${to}, Umkreis ${RADIUS_KM} km um ${CENTER.name}`);

  const candidates = [];

  // ---- 1a) Resident Advisor ----
  const rawRa = new Map();
  let raFailed = false;
  for (const area of RA_AREAS) {
    try {
      const list = await fetchAreaEvents(area.id, from, to);
      list.forEach((l) => rawRa.set(l.event.id, l));
      console.log(`  RA ${area.name}: ${list.length} Events`);
    } catch (e) {
      raFailed = true;
      console.warn(`⚠️  RA ${area.name} fehlgeschlagen: ${e.message}`);
    }
  }
  for (const { listingDate, event: ev } of rawRa.values()) {
    if (!ev?.venue) continue;
    const contentText = stripHtml(ev.content);
    const raArtists = (ev.artists || []).map((a) => ({ name: a.name, url: a.contentUrl ? `https://ra.co${a.contentUrl}` : null }));
    // Falls RA noch keine Artists im Feld hat, bekannte Acts aus Titel bzw. @Handles im Text ergänzen
    const knownInText = [
      ...extractKnownArtists(ev.title, { allowPlainNames: true }),
      ...extractKnownArtists(contentText, { allowPlainNames: false }),
    ];
    const haveKeys = new Set(raArtists.map((a) => artistKey(a.name)));
    for (const name of knownInText) {
      if (!haveKeys.has(artistKey(name))) raArtists.push({ name, url: null });
    }
    candidates.push({
      id: `ra-${ev.id}`,
      source: 'ra',
      sourceLabel: 'Resident Advisor',
      date: String(listingDate || ev.date).slice(0, 10),
      title: ev.title,
      start: hhmm(ev.startTime),
      end: hhmm(ev.endTime),
      url: ev.contentUrl ? `https://ra.co${ev.contentUrl}` : null,
      flyer: ev.flyerFront || null,
      content: contentText,
      genres: (ev.genres || []).map((g) => g.name),
      artists: raArtists,
      venue: canonicalizeVenue({
        id: `ra-${ev.venue.id}`,
        name: ev.venue.name,
        address: ev.venue.address || '',
        url: ev.venue.contentUrl ? `https://ra.co${ev.venue.contentUrl}` : null,
        lat: ev.venue.location?.latitude,
        lng: ev.venue.location?.longitude,
      }),
    });
  }

  // ---- 1b) Rote Sonne, Schwarzes München & Ticket.io ----
  try {
    const rs = await fetchRoteSonne();
    console.log(`  Rote Sonne Direkt: ${rs.length} Events`);
    candidates.push(...rs.map((c) => ({ ...c, venue: canonicalizeVenue(c.venue) })));
  } catch (e) {
    console.warn(`⚠️  Rote Sonne fehlgeschlagen: ${e.message}`);
  }

  try {
    const sm = await fetchSchwarzesMuenchen();
    console.log(`  Schwarzes München: ${sm.length} Einträge`);
    candidates.push(...sm.map((c) => ({ ...c, venue: canonicalizeVenue(c.venue) })));
  } catch (e) {
    console.warn(`⚠️  Schwarzes München fehlgeschlagen: ${e.message}`);
  }

  const tio = await fetchTicketIoShops(TICKET_IO_SHOPS);
  console.log(`  Ticket.io-Shops: ${tio.length} Events`);
  candidates.push(...tio.map((c) => ({ ...c, venue: canonicalizeVenue(c.venue) })));

  // ---- 1c) Instagram ----
  if (!args.has('--no-instagram')) {
    const igEvents = await fetchInstagramEvents(INSTAGRAM_ACCOUNTS, igCache, from, to, {
      skipNetwork: args.has('--ig-cached'),
    });
    console.log(`  Instagram: ${igEvents.length} erkannte Events`);
    candidates.push(...igEvents.map((c) => ({ ...c, venue: canonicalizeVenue(c.venue) })));
    await writeJson('ig-cache.json', igCache);
  }

  // ---- 1d) Manuelle Events ----
  manualEvents.forEach((m, i) => {
    if (!m.date || !m.venue?.name) return console.warn(`⚠️  manual-events.json #${i}: date und venue.name sind Pflicht`);
    candidates.push({
      id: `manual-${i}-${m.date}`,
      source: 'manual',
      sourceLabel: 'Manuell',
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
      venue: canonicalizeVenue({
        id: `manual-${m.venue.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: m.venue.name,
        address: m.venue.address || '',
        url: m.venue.url || null,
        lat: m.venue.lat,
        lng: m.venue.lng,
      }),
    });
  });

  // ---- 2) Klassifizieren & Deduplizieren ----
  const classified = [];
  for (const c of candidates) {
    if (c.date < from || c.date > to) continue;
    const cls = classify({
      title: c.title,
      content: c.content,
      genres: c.genres,
      artists: c.artists.map((a) => a.name),
      venueName: c.venue.name,
      manualStyles: c.manualStyles || [],
      collectiveStyles: c.collectiveStyles || [],
      collectiveName: c.collectiveName || '',
    });
    if (cls) classified.push({ ...c, ...cls, sourceLabels: [c.sourceLabel || c.source] });
  }

  const matched = [];
  for (const item of classified) {
    const idx = matched.findIndex((existing) => isSameEvent(existing, item));
    if (idx >= 0) matched[idx] = mergeDuplicate(matched[idx], item);
    else matched.push(item);
  }
  console.log(
    `🔎 ${candidates.length} Kandidaten → ${matched.filter((m) => m.confidence === 'high').length} sicher, ${matched.filter((m) => m.confidence === 'low').length} unsicher (nach Deduplizierung)`,
  );

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
      sources: ev.sourceLabels,
      date: ev.date,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      url: ev.url,
      igUrl: ev.igUrl || (ev.source === 'instagram' ? ev.url : null),
      flyer: ev.flyer,
      venueId: ev.venue.id,
      genres: ev.genres,
      styles: ev.styles,
      confidence: ev.confidence,
      reasons: ev.reasons,
      artists: ev.artists
        .map((a) => ({ key: artistKey(a.name), name: cleanArtistName(a.name), url: a.url }))
        .filter((a) => a.key),
    }))
    .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));

  if (raFailed && rawRa.size === 0 && previous?.events?.length) {
    console.warn('⚠️  RA nicht erreichbar – übernehme bestehende RA-Events aus events.json.');
    const existingIds = new Set(events.map((e) => e.id));
    for (const e of previous.events.filter((x) => x.source === 'ra' && x.date >= from)) {
      if (!existingIds.has(e.id)) {
        events.push(e);
        if (previous.venues?.[e.venueId]) venues[e.venueId] = previous.venues[e.venueId];
      }
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
