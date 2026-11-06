# HARD//MUC 🔩

**Live-Seite:** <https://txtxs7.github.io/muc-club-map/>

Karte mit **Hardtechno-, Industrial- und Uptempo-Events** im Umkreis von 100 km um München.

- 📅 **Nach Datum filtern**: Datumsauswahl, Tagesleiste mit Event-Anzahl sowie Schnellwahl für Heute/Fr/Sa
- 🗺️ **Karte**: Alle passenden Clubs des gewählten Tages werden markiert, die Farbe zeigt den Stil
- 🎧 **Klick auf einen Club**: Event, Line-up (Headliner zuerst) und pro Act die **3 bekanntesten Tracks** mit 30-Sekunden-Hörprobe, dazu der Spotify-Player mit den Top-Tracks des Acts
- 🎛️ **Stil-Filter**: Hardtechno / Industrial / Uptempo, optional auch Events, die nur allgemein als „Techno“ getaggt sind

Reines statisches Frontend (HTML/JS + Leaflet) ohne Build-Schritt. Die Daten erzeugt ein Node-Script, das per GitHub Action einmal täglich läuft.

## Datenquellen & Erkennung

Viele Industrial-, Schranz- und Underground-Raves in München stehen **nicht** auf Resident Advisor. Deshalb kombiniert der tägliche Lauf mehrere Quellen und führt doppelte Einträge automatisch zusammen:

1. **Resident Advisor** (Areas Munich, Bavaria, Augsburg, Regensburg, Salzburg)
2. **Instagram-Scanner** ([`scripts/lib/instagram.mjs`](scripts/lib/instagram.mjs)) – prüft per Headless Chrome öffentliche Profile regionaler Kollektive & Clubs (`@nuketekk`, `@aphotic.germany`, `@syndikat.lab`, `@noexit.muc`, `@pulstreiberkollektiv`, `@tanzwut.kollektiv`, `@behaerd`, `@vortex_underground`, `@unikat.info`, `@morph.kollektiv`, `@clubrotesonne`, `@kesselhaus_augsburg`, `@100hz.club`, `@bahnwaerterthiel`, …) und liest Datum, Uhrzeit, Venue & Line-up aus den Captions aus
3. **Club-Webseiten & Ticket-Shops** ([`scripts/lib/munich-sources.mjs`](scripts/lib/munich-sources.mjs)) – u. a. `rote-sonne.com` sowie `*.ticket.io`-Shops
4. **Schwarzes München** (`schwarzes-muenchen.de/events/`) – für EBM-, Electro-Industrial- und Dark-Techno-Nächte (z. B. *UNTERWELT*, *Dark Infection*, *SPK*)

Jedes Event wird anschließend klassifiziert ([`scripts/config.mjs`](scripts/config.mjs)):

| Signal | Beispiel | Ergebnis |
|---|---|---|
| Genre / Szene-Kollektiv | Industrial, EBM, Hardcore, Gabber, `@nuketekk`, `@aphotic.germany` … | ✅ sicher |
| Stichwort in Titel/Caption | „Hardtechno“, „Industrial“, „Schranz“, „Uptempo“, „UNTERWELT“, „UNTREATED“, „135+“ | ✅ sicher |
| Bekannter Act im Line-up | Perc, Somewhen, Schrotthagen, I Hate Models, Kobosil, Angerfist … | ✅ sicher |
| Nur Genre „Techno“/„Acid“ | – | ❔ unsicher (Filter „+ Techno“) |

👉 Fehlt dir ein Instagram-Kollektiv, ein Act oder ein Club, trag ihn einfach in `INSTAGRAM_ACCOUNTS`, `ARTIST_STYLES` bzw. `KNOWN_VENUES` in [`scripts/config.mjs`](scripts/config.mjs) ein.

## Lokal starten

Benötigt Node ≥ 22 und Python 3 (nur für den lokalen Webserver).

```bash
npm run update     # Events + Tracks holen  (nur Events: npm run update:events)
npm run serve      # → http://localhost:8080
npm test           # Unit-Tests der Erkennung
```

## Spotify einrichten (optional, empfohlen)

Ohne Spotify funktionieren die Track-Listen trotzdem (über Deezer). Mit Spotify bekommt jeder Act zusätzlich einen eingebetteten Spotify-Player mit seinen beliebtesten Tracks.

1. Unter <https://developer.spotify.com/dashboard> eine App anlegen (Redirect-URI ist egal, z. B. `http://127.0.0.1:8080`). Wähle **Web API** aus.
2. Client-ID und Client-Secret kopieren.
3. Lokal: `.env.example` nach `.env` kopieren und ausfüllen.
4. Auf GitHub: *Settings → Secrets and variables → Actions* → `SPOTIFY_CLIENT_ID` und `SPOTIFY_CLIENT_SECRET` anlegen.

> **Hinweis:** Seit Februar 2026 braucht der App-Owner im Spotify-Development-Mode einen **Premium-Account**, und der Endpoint `/artists/{id}/top-tracks` ist gesperrt. Deshalb kommt die Rangliste der bekanntesten Tracks von Deezer. Von Spotify wird nur die Artist-Suche genutzt; deren Player zeigt die Top-Tracks dann selbst an. Das Secret wird nur beim Build verwendet und landet nie im Frontend.

## Hosten auf GitHub Pages (kostenlos)

1. Repo auf GitHub: <https://github.com/Txtxs7/muc-club-map>
2. *Settings → Pages → Source:* **GitHub Actions** auswählen.
3. *Settings → Actions → General → Workflow permissions:* **Read and write permissions** aktivieren, damit die Action die Daten committen darf.
4. Optional die Spotify-Secrets anlegen (siehe oben).
5. *Actions → „Events aktualisieren & deployen“ → Run workflow*. Danach läuft der Workflow jeden Morgen automatisch.

Die Seite liegt unter <https://txtxs7.github.io/muc-club-map/>.

## Daten von Hand pflegen

| Datei | Zweck |
|---|---|
| `data/manual-events.json` | Eigene Events, die nicht auf RA stehen (Format siehe `manual-events.example.json`) |
| `data/venue-overrides.json` | Koordinaten korrigieren: `{ "Clubname": { "lat": 48.1, "lng": 11.5 } }` |
| `data/artist-overrides.json` | Falsche Act-Zuordnung beheben: `{ "Name": { "spotifyId": "…", "deezerId": 123 } }`, `null` blendet sie aus, `"force": true` lädt neu |
| `data/events.json`, `artists.json`, `venue-cache.json` | Werden automatisch erzeugt, bitte nicht von Hand bearbeiten |

Teilen von Links funktioniert über URL-Parameter, z. B. `?date=2026-12-05&venue=ra-55821`.

## Hinweise

- Die RA-GraphQL-Schnittstelle ist **inoffiziell** und kann sich jederzeit ändern. Das Script ruft sie nur einmal täglich ab, und schlägt der Abruf fehl, bleiben die alten Daten stehen. Gedacht ist das Projekt für den privaten, nicht-kommerziellen Gebrauch.
- Die Kartenkacheln kommen von OpenStreetMap (per CSS dunkel eingefärbt), Geocoding über Nominatim (gecacht).
- Gleichnamige Acts können bei Deezer oder Spotify falsch zugeordnet werden. In dem Fall hilft `artist-overrides.json`.
