// HARD//MUC – Frontend
// Lädt data/events.json + data/artists.json und zeigt sie auf einer Leaflet-Karte.

const STYLE_LABEL = { hardtechno: 'Hardtechno', industrial: 'Industrial', uptempo: 'Uptempo', techno: 'Techno?' };
const STYLE_PRIORITY = ['hardtechno', 'industrial', 'uptempo', 'techno'];
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

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

// ---------- State ----------
const params = new URLSearchParams(location.search);
const state = {
  data: null,
  artists: {},
  date: params.get('date') || todayISO(),
  venueId: params.get('venue') || null,
  styles: new Set(['hardtechno', 'industrial', 'uptempo']),
};

let map;
const markers = new Map(); // venueId -> L.Marker
const audio = new Audio();
let playingBtn = null;

// ---------- Filter ----------
function eventVisible(ev) {
  if (ev.confidence === 'low') return state.styles.has('techno');
  return ev.styles.some((s) => state.styles.has(s));
}
const eventsOn = (iso) => state.data.events.filter((e) => e.date === iso && eventVisible(e));
const mainStyle = (styles) => STYLE_PRIORITY.find((s) => styles.includes(s)) || 'techno';

function syncUrl() {
  const p = new URLSearchParams();
  p.set('date', state.date);
  if (state.venueId) p.set('venue', state.venueId);
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

// ---------- Karte ----------
function initMap() {
  const c = state.data.center;
  map = L.map('map', { zoomControl: true, attributionControl: false }).setView([c.lat, c.lng], 11);
  // OSM-Standardkacheln (kein API-Key nötig), per CSS-Filter dunkel eingefärbt (.dark-tiles)
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

function renderMarkers() {
  markers.forEach((m) => m.remove());
  markers.clear();
  const byVenue = groupByVenue(eventsOn(state.date));
  const bounds = [];
  for (const [venueId, evs] of byVenue) {
    const v = state.data.venues[venueId];
    if (!v) continue;
    const styles = [...new Set(evs.flatMap((e) => e.styles))];
    const low = evs.every((e) => e.confidence === 'low');
    const color = `var(--${mainStyle(styles)})`;
    const selected = venueId === state.venueId;
    const icon = L.divIcon({
      className: '',
      html: `<div class="marker ${low ? 'low' : ''} ${selected ? 'selected' : ''}" style="--c:${color}"><span>${evs.length > 1 ? evs.length : '♦'}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    const m = L.marker([v.lat, v.lng], { icon, zIndexOffset: selected ? 1000 : low ? 0 : 500 })
      .addTo(map)
      .bindTooltip(`${esc(v.name)} · ${esc(evs[0].title)}`, { className: 'vt', direction: 'top', offset: [0, -18] })
      .on('click', () => selectVenue(venueId, false));
    markers.set(venueId, m);
    bounds.push([v.lat, v.lng]);
  }
  return bounds;
}

function fitTo(bounds) {
  if (!bounds.length) return;
  if (bounds.length === 1) map.setView(bounds[0], Math.max(map.getZoom(), 12), { animate: true });
  else map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13, animate: true });
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
  state.data.events.filter(eventVisible).forEach((e) => (counts[e.date] = (counts[e.date] || 0) + 1));

  let html = '';
  for (let iso = start; iso <= end; iso = addDays(iso, 1)) {
    const d = fromISO(iso);
    const n = counts[iso] || 0;
    const cls = ['day', n ? 'has' : 'empty', d.getDay() % 6 === 0 || d.getDay() === 5 ? 'weekend' : '', iso === state.date ? 'active' : '', d.getDate() === 1 || iso === start ? 'month-start' : ''];
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

function badges(styles) {
  return `<div class="badges">${styles.map((s) => `<span class="badge ${esc(s)}">${esc(STYLE_LABEL[s] || s)}</span>`).join('')}</div>`;
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
        ${!state.styles.has('techno') ? '<p class="muted">Tipp: „+ Techno (unsicher)“ aktivieren, um auch allgemein getaggte Techno-Events zu sehen.</p>' : ''}
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
          const v = state.data.venues[vid];
          const styles = [...new Set(list.flatMap((e) => e.styles))];
          return `<li><button class="venue-item" data-venue="${esc(vid)}" style="--c:var(--${mainStyle(styles)})">
            <div class="vname">${esc(v.name)}</div>
            <div class="vmeta">${esc(list[0].start || '')}${list[0].end ? '–' + esc(list[0].end) : ''} · ${v.distanceKm} km</div>
            ${list.map((e) => `<div class="etitle">${esc(e.title)}</div>`).join('')}
            ${badges(styles)}
          </button></li>`;
        })
        .join('')}
    </ul>`;
}

function renderTracks(a) {
  const top = a?.deezer?.top?.slice(0, 3) || [];
  if (!top.length) return '';
  return `<ol class="tracks">${top
    .map(
      (t, i) => `<li class="track">
        <span class="num">${i + 1}</span>
        <button class="play" ${t.preview ? `data-preview="${esc(t.preview)}"` : 'disabled'} title="30-Sekunden-Hörprobe" aria-label="Hörprobe ${esc(t.title)}">▶</button>
        <span class="t" title="${esc(t.title)}">${esc(t.title)}${t.album && t.album !== t.title ? ` <small>· ${esc(t.album)}</small>` : ''}</span>
        <a class="sp" target="_blank" rel="noopener" href="https://open.spotify.com/search/${encodeURIComponent(`${a.name} ${t.title}`)}" title="Auf Spotify suchen">♫</a>
      </li>`,
    )
    .join('')}</ol>`;
}

function renderAct(act) {
  const a = state.artists[act.key];
  const pic = a?.deezer?.picture || a?.spotify?.image;
  const fans = a?.deezer?.fans;
  const spotifyId = a?.spotify?.id;
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
    ${a?.deezer?.top?.length ? renderTracks(a) : '<div class="act-sub" style="margin-top:6px">Keine Tracks gefunden.</div>'}
    <div class="act-actions">
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

// Headliner zuerst: nach Deezer-Fans absteigend sortieren
const sortActs = (acts) =>
  [...acts].sort((x, y) => (state.artists[y.key]?.deezer?.fans || 0) - (state.artists[x.key]?.deezer?.fans || 0));

function renderVenue() {
  const v = state.data.venues[state.venueId];
  const evs = eventsOn(state.date).filter((e) => e.venueId === state.venueId);
  if (!v || !evs.length) {
    state.venueId = null;
    return renderDayList();
  }
  const route = `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`;
  $('#panelContent').innerHTML = `
    <button class="back" data-action="back">← Alle Events am ${formatShort(state.date)}</button>
    <div class="venue-head">
      <h3>${esc(v.name)}</h3>
      <div class="addr">${esc(v.address)} · ${v.distanceKm} km vom Zentrum</div>
      <div class="links">
        <a href="${route}" target="_blank" rel="noopener">Route ↗</a>
        ${safeUrl(v.url) ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">Website / Venue ↗</a>` : ''}
      </div>
    </div>
    ${evs
      .map(
        (e) => {
          const srcText = e.sources?.length ? `Quelle: ${e.sources.map(esc).join(' + ')}` : '';
          const ticketLink = safeUrl(e.url) && e.url !== e.igUrl
            ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">Tickets & Infos ↗</a>`
            : '';
          const igLink = safeUrl(e.igUrl)
            ? `<a href="${esc(e.igUrl)}" target="_blank" rel="noopener">Instagram-Post ↗</a>`
            : '';
          const linksHtml = [ticketLink, igLink].filter(Boolean).join(' · ');
          return `<article class="event">
        <div class="event-head">
          ${safeUrl(e.flyer) ? `<img class="flyer" src="${esc(e.flyer)}" alt="Flyer" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ''}
          <div>
            <div class="event-title">${esc(e.title)}</div>
            <div class="event-time">${formatShort(e.date)} ${esc(e.start || '')}${e.end ? ' – ' + esc(e.end) : ''}</div>
            ${badges(e.styles)}
          </div>
        </div>
        ${srcText || e.reasons?.length ? `<div class="reasons">${[srcText, e.reasons?.length ? `Erkannt durch: ${e.reasons.map(esc).join(', ')}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
        ${linksHtml ? `<div class="event-links">${linksHtml}</div>` : ''}
        <div class="lineup">
          ${e.artists.length ? sortActs(e.artists).map(renderAct).join('') : '<div class="lineup-empty">Line-up noch nicht bekannt.</div>'}
        </div>
      </article>`;
        },
      )
      .join('')}`;
}

function renderPanel() {
  if (state.venueId) renderVenue();
  else renderDayList();
  $('#panelContent').scrollTop = 0;
}

// ---------- Aktionen ----------
function setDate(iso, { fit = true } = {}) {
  state.date = iso;
  state.venueId = null;
  $('#dateInput').value = iso;
  $('#dateLabel').textContent = formatLong(iso);
  stopAudio();
  renderDateStrip();
  const bounds = renderMarkers();
  renderPanel();
  syncUrl();
  if (fit) fitTo(bounds);
}

function selectVenue(venueId, pan = true) {
  state.venueId = venueId;
  stopAudio();
  renderMarkers();
  renderPanel();
  syncUrl();
  $('#panel').classList.add('expanded');
  const v = state.data.venues[venueId];
  if (pan && v) map.setView([v.lat, v.lng], Math.max(map.getZoom(), 13), { animate: true });
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

  document.querySelectorAll('[data-quick]').forEach((b) =>
    b.addEventListener('click', () => {
      const q = b.dataset.quick;
      if (q === 'today') setDate(todayISO());
      if (q === 'fri') setDate(nextWeekday(5));
      if (q === 'sat') setDate(nextWeekday(6));
      if (q === 'next') {
        const next = state.data.events.find((e) => e.date > state.date && eventVisible(e));
        if (next) setDate(next.date);
      }
    }),
  );

  document.querySelectorAll('.chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      const s = chip.dataset.style;
      state.styles.has(s) ? state.styles.delete(s) : state.styles.add(s);
      chip.classList.toggle('on', state.styles.has(s));
      setDate(state.date, { fit: false });
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
async function loadJson(url, fallback) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    return fallback;
  }
}

async function main() {
  const [data, artists] = await Promise.all([loadJson('data/events.json', null), loadJson('data/artists.json', {})]);
  if (!data) {
    $('#panelContent').innerHTML = '<p>Keine Daten gefunden. Bitte zuerst <code>npm run update</code> ausführen.</p>';
    return;
  }
  state.data = data;
  state.artists = artists;
  $('#radius').textContent = data.radiusKm;
  $('#updated').textContent = `Stand: ${new Date(data.generatedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;

  initMap();
  bindUi();
  const venueFromUrl = state.venueId;
  setDate(state.date);
  if (venueFromUrl && state.data.venues[venueFromUrl]) selectVenue(venueFromUrl);
}

main();
