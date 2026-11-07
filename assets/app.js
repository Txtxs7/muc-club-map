// HARD//MUC – Frontend
// Lädt data/events.json, data/germany-events.json + data/artists.json und zeigt sie auf einer Leaflet-Karte.

const STYLE_LABEL = { hardtechno: 'Hardtechno', industrial: 'Industrial', uptempo: 'Uptempo', techno: 'Techno?' };
const STYLE_PRIORITY = ['hardtechno', 'industrial', 'uptempo', 'techno'];
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const LS_CUSTOM_ACTS = 'hardmuc_custom_artists_v1';
const LS_DEEZER_CACHE = 'hardmuc_deezer_cache_v1';
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

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

// ---------- Künstlername-Normalisierung (analog zu scripts/lib/classify.mjs) ----------
function cleanName(raw) {
  return String(raw || '')
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

// ---------- Datum-Helfer (lokale Zeit, Format YYYY-MM-DD) ----------
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  return `${DOW_LONG[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};
const formatShort = (iso) => {
  const d = fromISO(iso);
  return `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
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
  customActs: readStorage(LS_CUSTOM_ACTS, []), // [{ key, plain, name }]
  deCatalog: [], // [{ key, plain, name, count }]
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

// ---------- Live Deezer JSONP (für manuell hinzugefügte Acts ohne Backend-Lauf) ----------
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

// ---------- Deutschlandweiter Act-Abgleich ----------
function getAllVenues() {
  return { ...(state.deData?.venues || {}), ...(state.data?.venues || {}) };
}

function venueById(vid) {
  return state.data?.venues?.[vid] || state.deData?.venues?.[vid] || null;
}

function buildGermanyCatalog() {
  const mapByKey = new Map();
  const today = todayISO();
  const sourceEvents = state.deData?.events?.length ? state.deData.events : state.data?.events || [];

  for (const ev of sourceEvents) {
    if (ev.date < today) continue;
    for (const a of ev.artists || []) {
      const k = a.key || normKey(a.name);
      if (!k) continue;
      const cur = mapByKey.get(k);
      if (cur) cur.count++;
      else mapByKey.set(k, { key: k, plain: plainKey(a.name), name: a.name, count: 1 });
    }
  }
  for (const [k, info] of Object.entries(state.artists)) {
    if (!mapByKey.has(k) && info?.name) {
      mapByKey.set(k, { key: k, plain: plainKey(info.name), name: info.name, count: 0 });
    }
  }
  state.deCatalog = [...mapByKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function eventMatchesAct(ev, act) {
  for (const a of ev.artists || []) {
    const ak = a.key || normKey(a.name);
    if (ak === act.key || (act.plain && plainKey(a.name) === act.plain)) return true;
  }
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
  const pool = state.deData?.events?.length ? state.deData.events : state.data?.events || [];
  return pool.filter((ev) => ev.date >= today && eventMatchesAct(ev, act) && venueById(ev.venueId));
}

function getAllTrackedGermanyEvents(onlyActKey = null) {
  const acts = onlyActKey ? state.customActs.filter((a) => a.key === onlyActKey) : state.customActs;
  if (!acts.length) return [];
  const today = todayISO();
  const pool = state.deData?.events?.length ? state.deData.events : state.data?.events || [];
  const out = [];
  for (const ev of pool) {
    if (ev.date < today || !venueById(ev.venueId)) continue;
    const matched = acts.filter((a) => eventMatchesAct(ev, a));
    if (matched.length) out.push({ ...ev, matchedCustomActs: matched });
  }
  return out;
}

function isActSaved(nameOrKey) {
  const k = normKey(nameOrKey);
  const pk = plainKey(nameOrKey);
  return state.customActs.some((a) => a.key === k || (pk && a.plain === pk));
}

async function addCustomAct(rawName) {
  const cleaned = cleanName(rawName);
  const key = normKey(cleaned);
  if (!key || key.length < 2) return;
  const plain = plainKey(cleaned);
  const catalogHit = state.deCatalog.find((c) => c.key === key || c.plain === plain);
  const displayName = catalogHit?.name || state.artists[key]?.name || cleaned;

  if (!isActSaved(displayName)) {
    state.customActs.unshift({ key, plain, name: displayName });
    writeStorage(LS_CUSTOM_ACTS, state.customActs);
  }
  updateActsCounters();
  refreshView({ fit: state.tab === 'acts' });

  await ensureArtistTracks(displayName);
  if (state.tab === 'acts' && !state.venueId) renderActsTab();
}

function removeCustomAct(key) {
  state.customActs = state.customActs.filter((a) => a.key !== key);
  if (state.focusedActKey === key) state.focusedActKey = null;
  writeStorage(LS_CUSTOM_ACTS, state.customActs);
  updateActsCounters();
  refreshView({ fit: state.tab === 'acts' });
}

function toggleCustomAct(name) {
  const k = normKey(name);
  if (isActSaved(k)) removeCustomAct(k);
  else addCustomAct(name);
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
  if (state.customActs.length && state.deData?.events?.length) {
    for (const e of state.deData.events) {
      if (e.date !== iso || byId.has(e.id)) continue;
      const matched = matchedCustomActsForEvent(e);
      if (!matched.length || !venueById(e.venueId)) continue;
      // Duplikat am selben Ort vermeiden
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
  if (state.customActs.length && state.deData?.events?.length) {
    const mucIds = new Set(state.data.events.map((e) => e.id));
    for (const e of state.deData.events) {
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
        ${!state.styles.has('techno') ? '<p class="muted">Tipp: „+ Techno (unsicher)“ aktivieren oder unter „★ Meine Acts (DE)“ Lieblings-DJs hinzufügen.</p>' : ''}
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
          const customLabel = customNames.length
            ? `${customNames.join(', ')}${v.city ? ` · ${v.city}` : ''}`
            : '';
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
  const saved = isActSaved(act.name);
  const links = [
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
      <button class="watch-btn ${saved ? 'saved' : ''}" data-watch="${esc(act.name)}" title="Act für ganz Deutschland merken">
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
  const deCount = state.deData?.events?.length || 0;
  const unusedSuggestions = SUGGESTED_ACTS.filter((name) => !isActSaved(name));
  const totalGigs = getAllTrackedGermanyEvents().length;

  panel.innerHTML = `
    <h2>Meine Acts · Ganz Deutschland ${deCount ? `(${deCount.toLocaleString('de-DE')} Events durchsucht)` : ''}</h2>
    <p class="acts-intro">
      Füge DJs oder Live-Acts mit Künstlernamen hinzu. Alle kommenden Auftritte in <strong>ganz Deutschland</strong> werden hier und auf der Karte (★) markiert – inklusive Top-Tracks.
    </p>
    <div class="acts-form-wrap">
      <form id="addActForm" class="acts-form" autocomplete="off">
        <input id="customActInput" type="text" placeholder="Künstlername (z. B. Klangkuenstler, Kobosil …)" aria-label="Künstlername hinzufügen" />
        <button type="submit">+ Hinzufügen</button>
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
              return `<div class="saved-act">
                <div class="saved-act-top">
                  <div class="act-head">
                    ${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" />` : `<div class="ph">${esc(act.name.slice(0, 1))}</div>`}
                    <div>
                      <div class="act-name">${esc(act.name)}</div>
                      <div class="act-sub">${fans ? `${fans.toLocaleString('de-DE')} Fans · ` : ''}${gigs.length} Termin${gigs.length === 1 ? '' : 'e'} in DE</div>
                    </div>
                  </div>
                  <div class="saved-act-btns">
                    ${gigs.length ? `<button class="mini-btn ${focused ? 'active' : ''}" data-focus-act="${esc(act.key)}" title="Auf Deutschland-Karte hervorheben">Karte</button>` : ''}
                    <button class="mini-btn del" data-remove-act="${esc(act.key)}" title="Act entfernen">✕</button>
                  </div>
                </div>
                ${a?.deezer?.top?.length ? renderTracks(a, act.name) : ''}
                ${
                  gigs.length
                    ? `<ul class="gig-list">
                        ${gigs
                          .map((g) => {
                            const v = venueById(g.venueId);
                            const city = v?.city || 'DE';
                            return `<li class="gig-item">
                              <button class="gig-jump" data-jump-date="${esc(g.date)}" data-jump-venue="${esc(g.venueId)}" title="Auf der Karte öffnen">
                                <div class="gig-when">${formatShort(g.date)}${g.start ? ` · ${esc(g.start)}` : ''} · ${esc(city)} · ${esc(v?.name || '')}</div>
                                <div class="gig-title">${esc(g.title)}</div>
                              </button>
                              ${safeUrl(g.url) ? `<a class="gig-tix" href="${esc(g.url)}" target="_blank" rel="noopener">Tickets ↗</a>` : ''}
                            </li>`;
                          })
                          .join('')}
                      </ul>`
                    : `<div class="no-gigs">Aktuell kein Termin in Deutschland (nächste 90 Tage) gemeldet – bleibt gespeichert.</div>`
                }
              </div>`;
            })
            .join('')}`
        : `<div class="empty-state">
            <div class="big">★</div>
            <p>Noch keine eigenen Acts gespeichert.</p>
            <p class="muted">Tippe oben einen Künstlernamen ein oder wähle einen Vorschlag aus, um alle Auftritte in ganz Deutschland zu sehen.</p>
          </div>`
    }`;

  bindActsForm();
}

function bindActsForm() {
  const form = $('#addActForm');
  const input = $('#customActInput');
  const acList = $('#acList');
  if (!form || !input || !acList) return;

  const updateAutocomplete = () => {
    const q = normKey(input.value);
    const qp = plainKey(input.value);
    if (q.length < 2) {
      acList.hidden = true;
      acList.innerHTML = '';
      return;
    }
    const matches = state.deCatalog
      .filter((c) => !isActSaved(c.key) && (c.key.includes(q) || c.plain.includes(qp)))
      .sort((a, b) => {
        const aStarts = a.key.startsWith(q) || a.plain.startsWith(qp) ? 1 : 0;
        const bStarts = b.key.startsWith(q) || b.plain.startsWith(qp) ? 1 : 0;
        return bStarts - aStarts || b.count - a.count || a.name.localeCompare(b.name);
      })
      .slice(0, 8);

    if (!matches.length) {
      acList.hidden = true;
      acList.innerHTML = '';
      return;
    }
    acList.innerHTML = matches
      .map(
        (m) => `<li><button type="button" data-pick-act="${esc(m.name)}">
          <span>${esc(m.name)}</span>
          <small>${m.count ? `${m.count} Termin${m.count === 1 ? '' : 'e'} in DE` : 'Bekannter Act'}</small>
        </button></li>`,
      )
      .join('');
    acList.hidden = false;
  };

  input.addEventListener('input', updateAutocomplete);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (!val) return;
    input.value = '';
    acList.hidden = true;
    addCustomAct(val);
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
  }, 4500);
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
      await ensureArtistTracks(act.name);
    }

    refreshView({ fit: false });
    const diffMuc = data.events.length - prevMucCount;
    const deTotal = state.deData?.events?.length || 0;
    const diffDe = deTotal - prevDeCount;
    const stamp = new Date(data.generatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    const deltaMsg =
      diffMuc > 0 || diffDe > 0
        ? ` (+${Math.max(0, diffMuc)} MUC / +${Math.max(0, diffDe)} DE neu)`
        : '';
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
    if (t.dataset.pickAct) return addCustomAct(t.dataset.pickAct);
    if (t.dataset.addAct) return addCustomAct(t.dataset.addAct);
    if (t.dataset.removeAct) return removeCustomAct(t.dataset.removeAct);
    if (t.dataset.watch) {
      toggleCustomAct(t.dataset.watch);
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
  const deCount = state.deData?.events?.length;
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

  // Für bereits gespeicherte Custom-Acts fehlende Deezer-Tracks im Hintergrund nachladen
  for (const act of state.customActs) {
    ensureArtistTracks(act.name).then(() => {
      if (state.tab === 'acts' && !state.venueId) renderActsTab();
    });
  }
}

main();
