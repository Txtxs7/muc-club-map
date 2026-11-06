// Zusätzliche regionale Quellen neben Resident Advisor:
//  1) Rote Sonne (rote-sonne.com __NEXT_DATA__)
//  2) Schwarzes München (schwarzes-muenchen.de/events/ – EBM, Industrial, Dark Electro)
//  3) Ticket.io-Shops regionaler Clubs (Schema.org MusicEvent JSON-LD)

import { KNOWN_VENUES } from '../config.mjs';
import { resolveKnownVenue } from './classify.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function decodeEntities(str) {
  return String(str || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&uuml;/g, 'ü')
    .replace(/&ouml;/g, 'ö')
    .replace(/&auml;/g, 'ä')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&szlig;/g, 'ß');
}

const stripHtml = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  return res.text();
}

function splitLineup(str) {
  if (!str || /unannounced/i.test(str)) return [];
  return str
    .split(/[,|/]|\s+\+\s+/)
    .map((s) => s.replace(/\*all night long/i, '').replace(/\s*\(live\)\s*/i, '').trim())
    .filter((s) => s.length >= 2 && s.length <= 45 && !/tour\s*202\d|tickets|tba/i.test(s));
}

// ---------- 1) Rote Sonne ----------
export async function fetchRoteSonne() {
  const html = await fetchHtml('https://www.rote-sonne.com/');
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const data = JSON.parse(m[1]);
  const evObj = data?.props?.pageProps?.events || {};
  const rsVenue = KNOWN_VENUES['rote-sonne'];
  const out = [];

  for (const [bucket, list] of [['club', evObj.club || []], ['concert', evObj.inConcert || []]]) {
    for (const e of list) {
      if (!e.startDate) continue;
      const date = String(e.startDate).slice(0, 10);
      const start = String(e.startDate).slice(11, 16) || null;
      const series = stripHtml(e.excerpt);
      const rawTitle = stripHtml(e.title);
      const unannounced = /unannounced/i.test(rawTitle);
      const fullTitle = series && rawTitle && !unannounced
        ? `${series} w/ ${rawTitle}`
        : series || rawTitle;
      const artists = bucket === 'club'
        ? splitLineup(rawTitle)
        : splitLineup(rawTitle.split(/\s+[–-]\s+/)[0]);

      out.push({
        id: `rs-${e.slug || date}`,
        source: 'rotesonne',
        sourceLabel: 'Rote Sonne',
        date,
        title: fullTitle,
        start,
        end: null,
        url: e.url || 'https://www.rote-sonne.com/',
        flyer: null,
        content: `${series}\n${rawTitle}\n${stripHtml(e.content)}`,
        genres: bucket === 'club' ? ['Techno'] : [],
        artists: artists.map((name) => ({ name, url: null })),
        venue: {
          id: 'known-rote-sonne',
          name: rsVenue.name,
          address: rsVenue.address,
          url: rsVenue.url,
          lat: rsVenue.lat,
          lng: rsVenue.lng,
        },
      });
    }
  }
  return out;
}

// ---------- 2) Schwarzes München (EBM / Industrial / Dark Electro) ----------
export async function fetchSchwarzesMuenchen() {
  const html = await fetchHtml('https://schwarzes-muenchen.de/events/');
  const out = [];

  for (const m of html.matchAll(/<tr[^>]*id="(e\d+)"[^>]*class="event[\s\S]*?<\/tr>/g)) {
    const row = m[0];
    const id = m[1];
    // Stammtische / Community-Treffen überspringen
    if (/title="Community"|Stammtisch/i.test(row)) continue;

    const dm = row.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!dm) continue;
    const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const tm = row.match(/(\d{2}:\d{2})\s*h/i);
    const start = tm ? tm[1] : null;

    const linkMatch = row.match(/<a\s+href="(\/events\/details\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = `https://schwarzes-muenchen.de${linkMatch[1]}`;
    const title = stripHtml(linkMatch[2]);

    const venueRaw = stripHtml(row.match(/<span class="small event_venue">([\s\S]*?)<\/span>/i)?.[1] || '');
    if (!venueRaw || /\bt\.?b\.?a\.?\b/i.test(venueRaw)) continue;

    const [vNamePart, ...addrParts] = venueRaw.split(/\s+[–-]\s+/);
    const known = resolveKnownVenue(venueRaw);
    // Künstler bei reinen Konzerten (nicht Partys) vor dem Tour-Bindestrich extrahieren
    const isConcertOnly = /title="Konzert"/i.test(row) && !/title="Party"/i.test(row);
    const artists = isConcertOnly
      ? title.split(/\s+-\s+/)[0].split(/\s*\+\s*/).map((s) => s.trim()).filter(Boolean)
      : [];

    // Bekannte Szene-Reihen von Schwarzes München taggen
    const extraContent = /dark\s*infection/i.test(title) ? 'Electro-Industrial Rhythmic Noise EBM' : '';

    out.push({
      id: `sm-${id}`,
      source: 'schwarzes-muenchen',
      sourceLabel: 'Schwarzes München',
      date,
      title,
      start,
      end: null,
      url,
      flyer: null,
      content: `${title}\n${venueRaw}\n${extraContent}`,
      genres: [],
      artists: artists.map((name) => ({ name, url: null })),
      venue: known
        ? { id: `known-${known.key}`, name: known.name, address: known.address, url: known.url || null, lat: known.lat, lng: known.lng }
        : {
            id: `sm-venue-${vNamePart.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            name: vNamePart.trim(),
            address: addrParts.join(', ').trim() || vNamePart.trim(),
            url: null,
            lat: null,
            lng: null,
          },
    });
  }
  return out;
}

// ---------- 3) Ticket.io-Shops (Schema.org JSON-LD) ----------
export async function fetchTicketIoShops(shops = []) {
  const out = [];
  for (const shop of shops) {
    try {
      const html = await fetchHtml(`https://${shop}.ticket.io/`);
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        let parsed;
        try {
          parsed = JSON.parse(m[1]);
        } catch {
          continue;
        }
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const it of items) {
          if (!/Event/i.test(String(it?.['@type'] || '')) || !it.startDate || !it.name) continue;
          const date = String(it.startDate).slice(0, 10);
          const start = String(it.startDate).slice(11, 16) || null;
          const end = it.endDate ? String(it.endDate).slice(11, 16) : null;
          const title = stripHtml(it.name);
          const desc = stripHtml(it.description || '');
          const loc = it.location || {};
          const addr = loc.address || {};
          const addressStr = [addr.streetAddress, [addr.postalCode, addr.addressLocality].filter(Boolean).join(' ')].filter(Boolean).join(', ');
          const known = resolveKnownVenue(`${loc.name || ''} ${addressStr}`);

          // Acts nach "w/" oder "with" im Titel erkennen
          const wm = title.match(/\b(?:w\/|with)\s+(.+)$/i);
          const artists = wm ? splitLineup(wm[1]) : [];

          out.push({
            id: `tio-${shop}-${(it.url || title).split('/').filter(Boolean).pop()}`,
            source: 'ticket.io',
            sourceLabel: `${shop}.ticket.io`,
            date,
            title,
            start,
            end,
            url: it.url || `https://${shop}.ticket.io/`,
            flyer: typeof it.image === 'string' ? it.image : null,
            content: desc,
            genres: /techno/i.test(`${title} ${desc}`) ? ['Techno'] : [],
            artists: artists.map((name) => ({ name, url: null })),
            venue: known
              ? { id: `known-${known.key}`, name: known.name, address: known.address, url: known.url || null, lat: known.lat, lng: known.lng }
              : {
                  id: `tio-venue-${shop}`,
                  name: loc.name || shop,
                  address: addressStr,
                  url: null,
                  lat: Number(loc.geo?.latitude) || null,
                  lng: Number(loc.geo?.longitude) || null,
                },
          });
        }
      }
    } catch (e) {
      console.warn(`⚠️  ticket.io (${shop}) fehlgeschlagen: ${e.message}`);
    }
  }
  return out;
}
