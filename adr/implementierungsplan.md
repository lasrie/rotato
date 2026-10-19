# Implementierungsplan: Solid-Migration des Garten-Planers

**Stand:** 2026-10-19
**ADRs:** Siehe [adr/README.md](README.md)

## Zielbild

Der Garten-Planer läuft als dezentrale Solid-App: Die Daten liegen im Pod
(`https://lasse.solidcommunity.net/garten/`), der Viewer liest und schreibt
direkt dagegen, die Freundin kann per WAC mitlesehen und mitplanen, und die
Daten bleiben standardkonform (Turtle, SHACL, LDP).

## Meilensteine

### M1 — Pod einrichten und Daten spiegeln (Stufe 1, Tag 1)

1. **Pod anlegen** auf solidcommunity.net (Registrierung, WebID prüfen:
   `https://lasse.solidcommunity.net/profile/card#me`).
2. **`.gitignore` ergänzen:** `.env`, `token.json`, `pod-config.local.*`.
3. **Pod-Konfiguration** in `.env`:
   ```
   POD_BASE=https://lasse.solidcommunity.net/garten/
   SOLID_IDP=https://solidcommunity.net
   SOLID_TOKEN=<aus NSS-Weboberfläche, langlebiges Token>
   ```
4. **`sync_to_pod.py` schreiben** (ADR-0006):
   - liest die 11 lokalen Quell-Dateien (Mapping siehe ADR-0003),
   - `PUT` je Datei in den Pod (`Content-Type: text/turtle`),
   - trocken-run-Flag (`--dry-run`) und `--force`.
5. **Smoke-Test:** `GET https://lasse.solidcommunity.net/garten/beete.ttl`
   liefert Turtle identisch zur lokalen Datei.

**Akzeptanzkriterium:** Alle 11 Dateien im Pod, `GET` liefert sie identisch
zur lokalen Quelle.

### M2 — Gateway als Pod-Adapter (Stufe 1, Tag 1–2)

1. `server.py` erweitern:
   - `GET /rdf/data.ttl` → Merge aus dem **Pod** (statt aus dem Dateisystem),
     mit einfachem In-Memory-Cache (TTL ~60 s).
   - `POST /api/pflanzung` → SHACL-Validierung (wie gehabt, pyshacl) →
     `PUT` der aktualisierten `planungen/`-Ressource in den Pod → Rollback
     bei Fehler.
   - Konfiguration über `.env` (kein Pod-Zugriff ohne Token).
2. Viewer unverändert lassen (gleiche Endpunkte).

**Akzeptanzkriterium:** Viewer funktioniert wie heute, aber die Daten kommen
aus dem Pod; eine gepostete Pflanzung landet im Pod und überlebt einen
`server.py`-Neustart.

### M3 — Frontend-Direct (Stufe 2, Tag 3–5)

1. **Session-Handling:** `@inrupt/solid-client-authn-browser` einbauen
   (Login-Button, `handleIncomingRedirect`, Redirect-URI
   `http://localhost:8765/` bzw. später die finale App-URL).
2. **Lesen:** `@inrupt/solid-client` (`getSolidDataset`, `getThingAll`) oder
   Comunica-SPARQL gegen `/garten/beete.ttl` + `planungen/` — ersetzt
   `fetch('/rdf/data.ttl')` schrittweise (siehe ADR-0007).
3. **Schreiben:** Neue Pflanzung im Browser mit `rdf-validate-shacl` gegen
   die Pod-Shapes validieren, dann `PUT` auf `planungen/…` (read-modify-write).
4. Exporte (ADR-0007) bleiben als Fallback erhalten.

**Akzeptanzkriterium:** Viewer läuft ohne `server.py`, liest/schreibt direkt
in den Pod; SHACL-Verstoß wird im Browser abgefangen.

### M4 — Fruchtfolge-Viewer migrieren (Stufe 2, Tag 5)

1. `viz/fruchtfolge.html` auf Comunica-SPARQL umstellen (statt
   `fruchtfolge-data.js`).
2. Konflikterkennung: Die bestehende Logik (gleiche Fruchtfamilie in
   aufeinanderfolgenden Jahren auf demselben Beet) als SPARQL-Query im
   Browser — Erweiterung von `fruchtfolge-analyse.rq`.

**Akzeptanzkriterium:** Fruchtfolge-Matrix lädt direkt aus dem Pod, ohne
Export-Schritt.

### M5 — Zusammenarbeiten & SolidOS (Stufe 3, Tag 6+)

1. **Freundin einladen:** Ihre WebID in die WAC-ACLs von `/garten/` (Read)
   und `/garten/planungen/` (Read+Write) eintragen (per Data-Browser oder
   `PUT` der `.acl`-Datei).
2. **SolidOS-Check:** `https://lasse.solidcommunity.net/garten/` im
   Data-Browser öffnen — Beete und Pflanzungen sind dort browsbar.
3. Optional: Eigenes SolidOS-Pane oder App-Verpackung (`solid-ide`),
   damit der Gartenplan als echte Solid-App von jeder WebID aus nutzbar ist.
4. Konflikt-Regeln verfeinern (Tomatenbeet-Ausnahme,
   Hülsenfrüchtler-vor-Starkzehrer) — jetzt im SPARQL-Layer statt im
   Export-Skript.

**Akzeptanzkriterium:** Die Freundin kann mit ihrer eigenen WebID den Plan
sehen und Pflanzungen anlegen; alle Daten laufen über den Pod.

## Offene Fragen (während der Umsetzung klären)

- [ ] Soll `planungen/` eine Sammeldatei bleiben (wie heute
  `garten91-planungen-neu.ttl`) oder eine Datei pro Pflanzung (feingranularer,
  besser für Konflikte beim gleichzeitigen Planen)?
- [ ] Nach der Umstellung auf Frontend-Direct: Wird der lokale `server.py`
  ganz eingestellt oder als Dev-Hilfe (Offline-Modus) behalten?
- [ ] Wann genau bekommt die Freundin ihre WebID?

## Risiko-Register

| Risiko | Gegenmaßnahme |
|---|---|
| NSS-Ausfall / Provider zieht um | URIs der Objekte sind stabil (ADR-0003), nur Basis-URL ändert sich; lokale Dateien bleiben als Backup (ADR-0006). |
| Token-Leak | `.gitignore` strikt, Token nur in `.env`, revoke im NSS-Backend. |
| Validierungs-Lücke (direktes PUT ohne SHACL) | Nur der validierende Schreibpfad ist dokumentiert; WAC-Schreibrechte nur für vertraute WebIDs (Freundin). |
| Doppelte Wahrheit (lokal vs. Pod) | Ab M2 ist der Pod die Quelle; lokale Dateien werden als Backup markiert (README-Hinweis). |

## Backlog-Anbindung

Die offenen Punkte aus dem Projekt-Backlog bleiben bestehen und werden nach
der Migration teils einfacher:

1. Beet rechts unten (tbd) → Bezeichnung klären, dann in `beete.ttl` im Pod.
2. Knoblauch-Zuordnung → Viewer-Frage, dann in `belegungen-2025.ttl`.
3. 26 Journal-Einträge 2026 ohne Beet → Excel-Korretur + Generator + Sync.
4. Reihen-Ebene im Viewer → bleibt später, funktioniert unverändert mit
   Pod-Daten.
5. Konflikt-Regeln → M5, Punkt 4.
6. Solid-Pod-Migration → **dieser Plan**.
7. Fruchtfolge-Integration ins Planungs-Formular → nach M4 (Konflikte beim
   Planen anzeigen), Daten liegen dann im Pod.
