// Anreicherung der Acts mit ihren bekanntesten Tracks.
//  - Spotify (Client-Credentials, nur Build-Zeit): Artist-ID -> eingebetteter Spotify-Player
//    zeigt automatisch die beliebtesten Tracks des Acts.
//    Hinweis: Seit Feb. 2026 ist /artists/{id}/top-tracks für Development-Mode-Apps gesperrt,
//    /search funktioniert aber weiterhin (max. 10 Ergebnisse).
//  - Deezer (ohne Key): Top-Tracks als Textliste inkl. 30-Sekunden-Hörprobe.

import { artistKey, cleanArtistName } from './classify.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, opts = {}, attempt = 1) {
  const res = await fetch(url, opts);
  if (res.status === 429 && attempt < 4) {
    const retry = Number(res.headers.get('retry-after') || 2);
    await sleep(retry * 1000 + 250);
    return getJson(url, opts, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// ---------- Spotify ----------
let spotifyToken = null;
export async function spotifyAuth() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return false;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    console.warn(`⚠️  Spotify-Auth fehlgeschlagen (${res.status}) – fahre ohne Spotify fort.`);
    return false;
  }
  spotifyToken = (await res.json()).access_token;
  return true;
}

async function spotifyArtist(name) {
  if (!spotifyToken) return null;
  const q = encodeURIComponent(`artist:"${name}"`);
  const json = await getJson(`https://api.spotify.com/v1/search?type=artist&limit=10&q=${q}`, {
    headers: { Authorization: `Bearer ${spotifyToken}` },
  });
  const key = artistKey(name);
  const hit = (json.artists?.items || []).find((a) => artistKey(a.name) === key);
  if (!hit) return null;
  return {
    id: hit.id,
    url: hit.external_urls?.spotify || `https://open.spotify.com/artist/${hit.id}`,
    image: hit.images?.[hit.images.length - 1]?.url || null,
  };
}

// ---------- Deezer ----------
async function deezerById(id) {
  const [artist, top] = await Promise.all([
    getJson(`https://api.deezer.com/artist/${id}`),
    getJson(`https://api.deezer.com/artist/${id}/top?limit=5`),
  ]);
  if (artist.error) return null;
  return {
    id: artist.id,
    link: artist.link,
    picture: artist.picture_medium,
    fans: artist.nb_fan,
    top: (top.data || []).map((t) => ({
      title: t.title,
      album: t.album?.title,
      link: t.link,
      preview: t.preview || null,
      cover: t.album?.cover_small,
    })),
  };
}

async function deezerArtist(name) {
  const json = await getJson(`https://api.deezer.com/search/artist?limit=10&q=${encodeURIComponent(name)}`);
  const key = artistKey(name);
  // Bei mehreren gleichnamigen Artists den mit den meisten Fans nehmen
  const hits = (json.data || []).filter((a) => artistKey(a.name) === key).sort((a, b) => b.nb_fan - a.nb_fan);
  if (!hits.length) return null;
  return deezerById(hits[0].id);
}

/**
 * Ergänzt den Cache um fehlende / veraltete Acts.
 * overrides: { "<Name>": { spotifyId?: string|null, deezerId?: number|null } }
 */
export async function enrichArtists(names, cache, overrides = {}, maxAgeDays = 30) {
  const useSpotify = await spotifyAuth();
  console.log(`🎧 Spotify: ${useSpotify ? 'aktiv' : 'nicht konfiguriert (nur Deezer)'}`);
  const overrideByKey = Object.fromEntries(Object.entries(overrides).map(([k, v]) => [artistKey(k), v]));
  const now = Date.now();
  let done = 0;

  for (const raw of names) {
    const key = artistKey(raw);
    if (!key) continue;
    const name = cleanArtistName(raw);
    const entry = cache[key];
    const ov = overrideByKey[key] || {};
    const fresh = entry && now - new Date(entry.updatedAt).getTime() < maxAgeDays * 864e5;
    const spotifyMissing = useSpotify && entry && entry.spotify === undefined;
    if (fresh && !spotifyMissing && !ov.force) continue;

    const result = { name, updatedAt: new Date().toISOString() };
    try {
      if (ov.deezerId === null) result.deezer = null;
      else result.deezer = ov.deezerId ? await deezerById(ov.deezerId) : await deezerArtist(name);
    } catch (e) {
      console.warn(`  Deezer-Fehler bei ${name}: ${e.message}`);
      result.deezer = entry?.deezer ?? null;
    }
    if (useSpotify) {
      try {
        if (ov.spotifyId === null) result.spotify = null;
        else if (ov.spotifyId) result.spotify = { id: ov.spotifyId, url: `https://open.spotify.com/artist/${ov.spotifyId}` };
        else result.spotify = await spotifyArtist(name);
      } catch (e) {
        console.warn(`  Spotify-Fehler bei ${name}: ${e.message}`);
        result.spotify = entry?.spotify;
      }
    } else if (entry?.spotify !== undefined) {
      result.spotify = entry.spotify;
    }
    cache[key] = result;
    done++;
    await sleep(250);
  }
  console.log(`🎧 ${done} Acts aktualisiert, ${Object.keys(cache).length} im Cache`);
  return cache;
}
