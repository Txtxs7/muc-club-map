// Öffentlicher Instagram-Scanner für Münchner/Augsburger Clubs & Kollektive.
// Ablauf:
//  1) Headless Chrome lädt https://www.instagram.com/<handle>/ und liest die letzten Post-Shortcodes aus.
//  2) Neue Shortcodes werden per fetch (User-Agent: facebookexternalhit/1.1) abgerufen, um die
//     vollständige Caption (<meta name="description">) + Flyer (og:image) auszulesen, und in
//     data/ig-cache.json gecacht.
//  3) parseInstagramEvent() extrahiert Datum, Uhrzeit, Venue, Titel und Acts.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { KNOWN_VENUES, IG_HANDLE_TO_ARTIST } from '../config.mjs';
import { resolveKnownVenue, extractKnownArtists } from './classify.mjs';
import { decodeEntities } from './munich-sources.mjs';

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FB_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const MONTHS = {
  january: 1, januar: 1, jan: 1,
  february: 2, februar: 2, feb: 2,
  march: 3, maerz: 3, märz: 3, mar: 3,
  april: 4, apr: 4,
  may: 5, mai: 5,
  june: 6, juni: 6, jun: 6,
  july: 7, juli: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oktober: 10, oct: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dezember: 12, dec: 12, dez: 12,
};

const WEEKDAYS = {
  sunday: 0, sonntag: 0,
  monday: 1, montag: 1,
  tuesday: 2, dienstag: 2,
  wednesday: 3, mittwoch: 3,
  thursday: 4, donnerstag: 4, thu: 4,
  friday: 5, freitag: 5, fri: 5,
  saturday: 6, samstag: 6, sat: 6,
};

const VENUE_HANDLES = new Set([
  'clubrotesonne', 'bahnwaerterthiel', 'lieberscholli', 'feierwerk_', 'backstagemunich',
  'kesselhaus_augsburg', '100hz.club', 'blitz_music_club', 'hardshift_munich',
]);

export function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || null;
}

async function fetchProfileShortcodes(handle, chromeBin) {
  const { stdout } = await execFileAsync(
    chromeBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--user-agent=${CHROME_UA}`,
      '--virtual-time-budget=6000',
      '--dump-dom',
      `https://www.instagram.com/${handle}/`,
    ],
    { timeout: 18000, maxBuffer: 25 * 1024 * 1024 },
  );
  return [...new Set([...stdout.matchAll(/\/(?:p|reel)\/([A-Za-z0-9_-]{8,15})\//g)].map((m) => m[1]))].slice(0, 8);
}

async function fetchPostMeta(code) {
  const res = await fetch(`https://www.instagram.com/p/${code}/`, {
    headers: { 'User-Agent': FB_UA, 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`IG HTTP ${res.status}`);
  const html = await res.text();
  const desc = decodeEntities(html.match(/<meta name="description" content="([^"]+)"/i)?.[1] || '');
  const ogTitle = decodeEntities(html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1] || '');
  const image = decodeEntities(html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] || '');
  return { rawDesc: desc || ogTitle, image: image || null };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isValidIso(y, m, d) {
  if (y < 2024 || y > 2030 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parsePostedDate(raw) {
  // z. B. "on November 2, 2026" oder "am November 4, 2026"
  const m = raw.match(/\b(?:on|am)\s+([A-Za-zäöüÄÖÜ]+)\s+(\d{1,2}),\s*(\d{4})/i);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  const day = Number(m[2]);
  const yr = Number(m[3]);
  return mon && isValidIso(yr, mon, day) ? `${yr}-${pad2(mon)}-${pad2(day)}` : null;
}

function unwrapCaption(raw) {
  let s = String(raw || '').normalize('NFKC');
  const postedDate = parsePostedDate(s);
  // Prefix wie: 277 likes, 53 comments - handle on November 2, 2026: "..."
  const pref = s.match(/^\d[\d,.]*\s+likes?,\s*\d[\d,.]*\s+comments?\s*-\s*[^\n:]+:\s*"([\s\S]*)"\.?\s*$/i);
  if (pref) s = pref[1];
  // Suffix wie: - @nuketekk on November 3, 2026
  s = s.replace(/\s*-\s*@?[a-z0-9._]+\s+(?:on|am)\s+[A-Za-zäöüÄÖÜ]+\s+\d{1,2},\s*\d{4}\s*$/i, '').trim();
  return { body: s, postedDate };
}

function extractDates(body, refIso) {
  const [refY, refM] = refIso.split('-').map(Number);
  const found = new Set();
  // Deadlines / Vorverkaufsstarts ignorieren, damit z. B. "Bewerbungsdeadline: 10.11.2026" nicht vor dem Eventdatum landet
  const cleaned = body
    .split(/\r?\n/)
    .filter((l) => !/\b(bewerbungsdeadline|anmeldeschluss|deadline|vvk[\s-]*start|vorverkaufsstart)\b/i.test(l))
    .join('\n');

  // 1) DD.MM.YYYY / DD. MM. YYYY / DD.MM.YY / DD-MM-YY
  for (const m of cleaned.matchAll(/(?<![\d.])(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})(?!\d)/g)) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    if (isValidIso(y, mo, d)) found.add(`${y}-${pad2(mo)}-${pad2(d)}`);
  }

  // 2) DD.MM. ohne Jahr (z. B. "Am Freitag, den 13.11." oder "| 12.04. |")
  if (!found.size) {
    for (const m of cleaned.matchAll(/(?<![\d.])(\d{1,2})\.(\d{2})\.(?!\s*\d)/g)) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = mo < refM - 1 ? refY + 1 : refY;
      if (isValidIso(y, mo, d)) found.add(`${y}-${pad2(mo)}-${pad2(d)}`);
    }
  }

  // 3) DD. Monat [YYYY] (z. B. "am 14. November" oder "sunday 15 november")
  if (!found.size) {
    const monthNames = Object.keys(MONTHS).join('|');
    const re = new RegExp(`\\b(\\d{1,2})\\.?\\s+(${monthNames})(?:\\s+(\\d{4}))?\\b`, 'gi');
    for (const m of cleaned.matchAll(re)) {
      const d = Number(m[1]);
      const mo = MONTHS[m[2].toLowerCase()];
      const y = m[3] ? Number(m[3]) : mo < refM - 1 ? refY + 1 : refY;
      if (mo && isValidIso(y, mo, d)) found.add(`${y}-${pad2(mo)}-${pad2(d)}`);
    }
  }

  return [...found];
}

function nextWeekdayFrom(postedIso, targetDow) {
  const [y, m, d] = postedIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const diff = (targetDow - dt.getUTCDay() + 7) % 7 || 7;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}

/**
 * Parst einen einzelnen Instagram-Post in ein Event-Kandidaten-Objekt (oder null).
 */
export function parseInstagramEvent(post, account, fromIso, toIso) {
  const { body, postedDate } = unwrapCaption(post.rawDesc);
  if (!body || body.length < 20) return null;

  // Rückblicke / Aftermovies / Info- & Countdown-Posts ignorieren
  if (
    /\b(aftermovie|throwback|r[üu]ckblick|ethical values|our soundsystem|vielen dank an alle die da waren|big thanks to everybody|new blog|konzertplaylist|locker[\s-]*situation|gruppen[\s-]*tickets|\d+\s*(?:weeks?|days?)\s*left)\b/i.test(body) &&
    !/\b(n[äa]chste[rs]?|next\s+event)\b/i.test(body)
  ) {
    return null;
  }
  if (/^\s*(gewinnspiel|giveaway)\b/i.test(body) && !/line[\s-]?up/i.test(body)) return null;

  // Fremde Städte / Tourpläne ausschließen
  const foreignCities = body.match(/\b(hamburg|berlin|dresden|hannover|bielefeld|k[öo]ln|frankfurt|stuttgart|leipzig|dortmund|amsterdam|rotterdam|london|paris|wien|z[üu]rich|strasbourg|metzingen|garage\s*noord|berghain|bootshaus|gotec)\b/gi) || [];
  const localMention = /\b(m[üu]nchen|munich|augsburg|freising|rosenheim|ingolstadt)\b/i.test(body) || Boolean(resolveKnownVenue(body));
  if (foreignCities.length >= 2 && !localMention) return null;
  if (foreignCities.length >= 1 && !localMention && !account.defaultVenue) return null;

  // Datum ermitteln
  const refIso = postedDate || fromIso;
  const dates = extractDates(body, refIso);
  if (dates.length > 3) return null; // Monatsübersichten überspringen

  let eventDate = dates.find((d) => d >= fromIso && d <= toIso) || null;
  if (!eventDate && dates.length === 0 && postedDate) {
    const weekdayMatches = [
      ...body.matchAll(
        /\b(donnerstag|freitag|samstag|thursday|friday|saturday)(?:\s+ab)?\s*[:\-–•|]?\s*(?:\d{1,2}(?:[:.]\d{2})?\s*uhr|doors|start|\d{2}:\d{2})/gi,
      ),
    ];
    const distinctDows = new Set(weekdayMatches.map((m) => WEEKDAYS[m[1].toLowerCase()]));
    // Nur wenn genau ein Wochentag gemeint ist (keine Wochenend-Sammelposts "Freitag … Samstag …")
    if (distinctDows.size === 1) {
      const candidate = nextWeekdayFrom(postedDate, [...distinctDows][0]);
      if (candidate >= fromIso && candidate <= toIso) eventDate = candidate;
    }
  }
  if (!eventDate) return null;

  // Venue bestimmen
  let venueObj = null;
  const pinMatch = body.match(/📍\s*([^\n🎫⏰📅]+)/u);
  if (pinMatch) {
    const pinText = pinMatch[1].trim();
    const known = resolveKnownVenue(pinText);
    if (known) {
      venueObj = { id: `known-${known.key}`, name: known.name, address: known.address, url: known.url || null, lat: known.lat, lng: known.lng };
    } else if (pinText.length >= 3 && pinText.length <= 70) {
      venueObj = {
        id: `ig-venue-${pinText.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name: pinText,
        address: /m[üu]nchen|augsburg|freising|rosenheim|ingolstadt/i.test(pinText) ? pinText : `${pinText}, ${account.defaultCity || 'München'}`,
        url: null,
        lat: null,
        lng: null,
      };
    }
  }
  if (!venueObj) {
    const known = resolveKnownVenue(body);
    if (known) {
      venueObj = { id: `known-${known.key}`, name: known.name, address: known.address, url: known.url || null, lat: known.lat, lng: known.lng };
    } else if (account.defaultVenue && KNOWN_VENUES[account.defaultVenue]) {
      const kv = KNOWN_VENUES[account.defaultVenue];
      venueObj = { id: `known-${account.defaultVenue}`, name: kv.name, address: kv.address, url: kv.url || null, lat: kv.lat, lng: kv.lng };
    } else if (account.defaultCity === 'München' && /secret\s*location|location\s*tba|ort\s*folgt/i.test(body)) {
      const kv = KNOWN_VENUES['secret-munich'];
      venueObj = { id: 'known-secret-munich', name: kv.name, address: kv.address, url: null, lat: kv.lat, lng: kv.lng };
    }
  }
  if (!venueObj) return null;

  // Uhrzeit
  let start = null;
  let end = null;
  const rangeMatch = body.match(/\b([012]?\d:[0-5]\d)\s*[–\-bis]+\s*([012]?\d:[0-5]\d)\b/i);
  if (rangeMatch) {
    start = rangeMatch[1].padStart(5, '0');
    end = rangeMatch[2].padStart(5, '0');
  } else {
    const singleTime =
      body.match(/(?:⏰|doors(?:\s*open)?|start|einlass|\/\/)\s*[:\-]?\s*([012]?\d)(?::([0-5]\d))?\s*(?:uhr|h\b)?/i) ||
      body.match(/\b([012]?\d)(?::([0-5]\d))?\s*uhr\b/i);
    if (singleTime && Number(singleTime[1]) <= 23) {
      start = `${pad2(Number(singleTime[1]))}:${singleTime[2] || '00'}`;
    }
  }

  // Titel: erste aussagekräftige Zeile
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^[+\s•━─\-_*]+|[+\s•━─\-_*]+$/g, '').trim())
    .filter((l) => l.length >= 3 && !/^(sa|fr|do|mi|fri|sat|thu)\.?\s*\d{1,2}\./i.test(l) && !/^line[\s-]?up$/i.test(l));
  let title = (lines[0] || `${account.label} Rave`).slice(0, 90).trim();
  // Falls Titel keinen Hinweis aufs Kollektiv enthält und sehr generisch ist
  if (title.length < 5) title = `${account.label} – ${title}`;

  // Acts: bekannte Acts (Klarnamen nur in Titel & Lineup-Block, @Handles ohne Grafik-/Foto-Credits) + Lineup-Mentions
  const bodyNoCredits = body.replace(/^.*(?:🎨|📸|🎥|design\s*:|graphics\s*:|licht\s*:).*$/gim, '');
  const lineupBlock = bodyNoCredits.match(/(?:line[\s-]?up|mit dabei)[\s\S]{0,400}/i)?.[0] || '';
  const artists = new Map();
  for (const name of [
    ...extractKnownArtists(title, { allowPlainNames: true }),
    ...extractKnownArtists(lineupBlock, { allowPlainNames: true }),
    ...extractKnownArtists(bodyNoCredits, { allowPlainNames: false }),
  ]) {
    artists.set(name.toLowerCase(), name);
  }

  const addHandle = (rawHandle, explicitName = '') => {
    const h = rawHandle.toLowerCase().replace(/\.+$/, '');
    if (
      VENUE_HANDLES.has(h) ||
      h === account.handle.toLowerCase() ||
      /\.(?:psd|mov)$|photo|film|design|visuals|vfx|shots|records|events|kollektiv|tomorrowland|mysteryland/i.test(h)
    ) {
      return;
    }
    const cleaned =
      explicitName.trim() ||
      IG_HANDLE_TO_ARTIST[h] ||
      h
        .replace(/(?:_?official|_?dj|\.dj|\.wav|\.mp3|_uk)+$/i, '')
        .replace(/[._]+/g, ' ')
        .replace(/\bdj\b/gi, 'DJ')
        .trim();
    if (cleaned.length >= 2) artists.set(cleaned.toLowerCase(), cleaned);
  };

  for (const m of lineupBlock.matchAll(/@([a-z0-9._]{2,30})/gi)) addHandle(m[1]);
  for (const m of body.matchAll(/^[\s💥🎧⚡🔥⛓️🔊🖤•\-+*▶️►]+@([a-z0-9._]{2,30})(?:\s+b2b\s+@([a-z0-9._]{2,30}))?/gim)) {
    addHandle(m[1]);
    if (m[2]) addHandle(m[2]);
  }
  for (const m of body.matchAll(/@([a-z0-9._]{2,30})\s*\(([A-Z0-9ÄÖÜØ][A-Za-z0-9ÄÖÜäöüßØø\s.&/-]{1,28})\)/g)) {
    addHandle(m[1], m[2]);
  }
  for (const m of body.matchAll(/(?:headliner\s+mit:\s*|special\s+guest\s+)@?([A-Za-z0-9._ÄÖÜäöüßØø]{2,30})/gi)) {
    const token = m[1].replace(/[!.,:;]+$/, '');
    if (body.includes(`@${token.toLowerCase()}`)) addHandle(token);
    else if (token.length >= 3) artists.set(token.toLowerCase(), token);
  }

  return {
    id: `ig-${post.code}`,
    source: 'instagram',
    sourceLabel: `Instagram @${account.handle}`,
    date: eventDate,
    title,
    start,
    end,
    url: `https://www.instagram.com/p/${post.code}/`,
    flyer: post.image || null,
    content: body,
    genres: [],
    collectiveStyles: account.defaultStyles || [],
    collectiveName: `@${account.handle}`,
    artists: [...artists.values()].map((name) => ({ name, url: null })),
    venue: venueObj,
  };
}

/**
 * Scannt alle konfigurierten Instagram-Accounts und nutzt/aktualisiert igCache.
 */
export async function fetchInstagramEvents(accounts, igCache, fromIso, toIso, { skipNetwork = false } = {}) {
  const chromeBin = skipNetwork ? null : findChromeBinary();
  if (skipNetwork) {
    console.log('📸 Instagram: nutze vorhandenen ig-cache.json (--ig-cached) …');
  } else if (!chromeBin) {
    console.warn('⚠️  Kein Chrome/Chromium für Instagram-Scan gefunden – nutze nur ig-cache.json.');
  } else {
    console.log(`📸 Instagram-Scan über Headless Chrome (${accounts.length} Profile) …`);
    for (const acc of accounts) {
      try {
        const codes = await fetchProfileShortcodes(acc.handle, chromeBin);
        let newCount = 0;
        for (const code of codes) {
          if (igCache[code]?.rawDesc) {
            igCache[code].handle = igCache[code].handle || acc.handle;
            continue;
          }
          try {
            const meta = await fetchPostMeta(code);
            if (meta.rawDesc) {
              igCache[code] = {
                code,
                handle: acc.handle,
                rawDesc: meta.rawDesc,
                image: meta.image,
                fetchedAt: new Date().toISOString(),
              };
              newCount++;
            }
            await sleep(200);
          } catch (e) {
            console.warn(`  ⚠️  IG Post ${code} (@${acc.handle}): ${e.message}`);
          }
        }
        console.log(`  📸 @${acc.handle}: ${codes.length} Posts geprüft (${newCount} neu)`);
      } catch (e) {
        console.warn(`  ⚠️  IG Profil @${acc.handle} fehlgeschlagen: ${e.message}`);
      }
    }
  }

  // Alle gecachten Posts den jeweiligen Accounts zuordnen und parsen
  const byHandle = Object.fromEntries(accounts.map((a) => [a.handle.toLowerCase(), a]));
  const events = [];
  for (const post of Object.values(igCache)) {
    const acc = byHandle[String(post.handle || '').toLowerCase()];
    if (!acc) continue;
    const ev = parseInstagramEvent(post, acc, fromIso, toIso);
    if (ev) events.push(ev);
  }
  return events;
}
