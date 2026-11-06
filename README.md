# HARD//MUC 🔩

**Live-Seite:** <https://txtxs7.github.io/muc-club-map/>

Karte mit **Hardtechno-, Industrial- und Uptempo-Events** im Umkreis von 100 km um München.

- 📅 **Nach Datum filtern**: Datumsauswahl, Tagesleiste mit Event-Anzahl sowie Schnellwahl für Heute/Fr/Sa
- 🗺️ **Karte**: Alle passenden Clubs des gewählten Tages werden markiert, die Farbe zeigt den Stil
- 🎧 **Klick auf einen Club**: Event, Line-up (Headliner zuerst) und pro Act die **3 bekanntesten Tracks** mit 30-Sekunden-Hörprobe, dazu der Spotify-Player mit den Top-Tracks des Acts
- 🎛️ **Stil-Filter**: Hardtechno / Industrial / Uptempo, optional auch Events, die nur allgemein als „Techno“ getaggt sind

Reines statisches Frontend (HTML/JS + Leaflet) ohne Build-Schritt. Die Daten erzeugt ein Node-Script, das per GitHub Action einmal täglich läuft.

## Wie werden Events erkannt?

Quelle ist [Resident Advisor](https://ra.co) (Areas Munich, Bavaria, Augsburg, Regensburg, Salzburg). Da RA kein eigenes Genre „Hard Techno“ hat, wird jedes Event bewertet ([`scripts/config.mjs`](scripts/config.mjs)):

| Signal | Beispiel | Ergebnis |
|---|---|---|
| RA-Genre | Industrial, EBM, Hardcore, Gabber, Hard Drum | ✅ sicher |
| Stichwort in Titel/Beschreibung | „Hardtechno“, „Schranz“, „Hardgroove“, „Uptempo“, „135+“, „150 BPM“ | ✅ sicher |
| Bekannter Act im Line-up | I Hate Models, Kobosil, VTSS, Nico Moreno … | ✅ sicher |
| Nur Genre „Techno“/„Acid“ | – | ❔ unsicher (Filter „+ Techno“) |

👉 Fehlt dir ein Act oder ein Club, trag ihn einfach in `ARTIST_STYLES` bzw. `VENUE_STYLES` in `scripts/config.mjs` ein.

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
