# rotato UX-Konzept v2 — „Die Karte ist die App" (Map-First)

> **Status:** Entwurf v2.0 — ersetzt in Teilen [v1](rotato-ui-ux-konzept.md)
> (dort ersetzt: §1 Informationsarchitektur, §2.1 Screen 1, §5.1/§5.2 Tech Stack;
> v1 bleibt gültig für: Design-Prinzipien P1–P5, RDF-Datenmodell §4, Interaktions-Workflows §3).
>
> **Auslöser:** Nutzer-Wunsch nach mehr Fokus auf die **große Ansicht** — eine stilisierte
> Karte des Gartens als Draufsicht, comic-stilisiert, mit viel Spielraum zum Ausprobieren.
> Inspirationen: [Tavalo Interactive Map](https://www.awwwards.com/inspiration/interactive-map-tavalo),
> [Lacoste Customize Patch](https://www.draw-your-polo.lacoste.com/de/customize-patch),
> [townhouse.dev](https://townhouse.dev/).
> Alle drei wurden analysiert (Screenshots in `docs/inspo-*.png/jpg`); die konkreten
> Befunde stehen in §2.0 — das Konzept wurde nach der Analyse korrigiert.

---

## 1. Paradigma-Wechsel: vom 5-Screen-Layout zur Bühne mit Schubladen

### 1.1 V1 vs. V2

| | V1 (5 Screens) | V2 (Map-First) |
|---|---|---|
| Zentrum | Plan-Canvas neben Panels | **Vollbild-Karte als Bühne**, UI liegt *über* der Karte |
| Navigation | 4 View-Tabs + Detail-Panel | Karte bleibt; **Drawer/Overlays** (Anzucht, Konflikte, Detail) schieben sich zu |
| Zeitstrahl | Eigener Screen | **Bottom-Drawer (Filmstrip)** über der Karte — Scrubber steuert die Karte |
| Weltgefühl | Technischer Plan | **Stilisierter Garten als Ort** — man „betritt" ihn |

Die Karte ist nicht mehr „Screen 1 von 5", sondern die **Bühne**, auf der sich alles
abspielt. Die anderen Views werden zu Schubladen, die sich über die Bühne legen und sie
nicht verdecken.

### 1.2 Sitemap v2 (Hash-Routing bleibt)

```
rotato
├── #/map (Standard — die Bühne)
│     ?bed=<slug>            Beet angetippt → Beet-Drawer rechts
│     ?planting=<id>         Pflanzungs-Detail im selben Drawer
│     ?drawer=anzucht        Anzucht-Schublade offen (links)
│     ?drawer=konflikt       Konflikt-Schublade offen
│     ?drawer=timeline       Zeitstrahl-Filmstrip unten
│     ?t=2026-06             Zeit-Scrubber-Position (Deep-Link auf einen Saison-Moment)
└── #/daten                   bleibt eigener Screen (Status/Provenance/Debug — Fullscreen gerechtfertigt)
```

Es gibt nur **einen primären Screen** (`#/map`) plus einen Werkzeug-Screen (`#/daten`).
Alle Zustände der Bühne (Auswahl, offene Schublade, Scrubber-Position) sind
URL-Parameter → jede Kartenansicht ist teilbar und der Browser-Back-Button funktioniert
natürlich.

### 1.3 Layout-Anatomie

```
┌────────────────────────────────────────────────────────────────────┐
│ rotato · Garten 91                                    [● Status]  │ ← schwebend, 48px, transparent
│                                                                    │
│              ┌──────────────────────────────┐                      │
│              │                              │                      │
│         [Karte: stilisierter Garten,       │   Beet-Drawer        │ ← rechts, 380px,
│          Vollbild-Bühne, pan/zoom,          │   (Pflanzungs-       │   abgerundet, schwebt
│          comic-illustrativ, Saisons-       │    Detail, Konflikt- │   über der Karte
│          licht, wachsende Pflanzen]        │    Begründungen)     │   (halboffen: 380px)
│              │                              │                      │
│              │                              │                      │
│              └──────────────────────────────┘                      │
│                                                                    │
│  [Anzucht-Dock ▁]        [Ampel ● 2/3]         [Zeit-Scrubber ▂▃▅] │ ← HUD-Elemente, schwebend
└────────────────────────────────────────────────────────────────────┘
```

- **Kopfzeile:** schwebend, transparent, nur Wortmarke + StatusCluster — kein UI-Rahmen,
  die Karte ist der Screen.
- **Beet-Drawer** (rechts): öffnet sich bei Beet-/Pflanzungs-Auswahl, halboffen
  (380 px), die Karte bleibt sichtbar und interaktiv (der Drawer deckt nie die Mitte).
- **Anzucht-Dock** (links unten): eingeklappt ein schmaler Streifen mit Zählern
  („3 auspflanzreif“); ausgeklappt eine Schublade mit den Karten — Karten lassen sich
  **direkt von dort auf die Karte ziehen** (der zentrale Transplant-Flow bleibt, nur dass
  das Ziel jetzt die illustrierte Karte ist).
- **Konflikt-Ampel:** schwebender Chip unten Mitte (oder oben rechts neben Status) —
  klick öffnet die Konflikt-Schublade; auf der Karte selbst pulsieren betroffene Beete.
- **Zeit-Scrubber** (unten rechts): Monats-/Wochen-Regler; während des Scrubbings
  verändert sich die Karte live (Licht, Wuchszustand der Pflanzen, Belegungen) — der
  stärkste Moment der App: **Zeit wird zur Karte**.

---

## 2. Art Direction: der Garten als stilisierter Ort

### 2.0 Analyse der drei Referenzen (mit echten Screenshots geprüft)

Screenshots: `docs/inspo-tavalo-map-1.jpg`, `docs/inspo-townhouse-hero.png`,
`docs/inspo-lacoste-patch.png`.

| Referenz | Was es technisch wirklich ist | Design-Kern | Was rotato übernimmt |
|---|---|---|---|
| **Tavalo** | Mapbox-Karte, fast weißes Kartengrun, pastellgrüne Seite, Karte als abgerundetes Panel | **Kategoriefilter-Sidebar** (Restaurants/Schools/…, farbcodierte Dots), Hover-Tooltippille, ruhige Editorial-Typografie | Fruchtfamilien-Filter als Sidebar (Klick auf „Nachtschatten“ hebt alle Tomaten-Belegungen hervor); ruhige, nicht spielerische Grundstimmung für Daten-Dichte; Hover-Pill-Labels auf der Karte |
| **townhouse.dev** | **Isometrische Pixel-Art-Stadt** (Sprite-Assets, handgezeichnet), DOM-Labels als Pills, Hover/Click auf Gebäuden | **Metaphern-Mapping**: Screens = Häuser, Services = Türme, Routes = Rohre — jede Datenentität hat ein greifbares Äquivalent | Strenge Metaphern-Disziplin: Jede RDF-Entität bekommt genau eine Illustration (`Beet` = Beetkörper, `Reihe` = Ranke/Schnur, `ReihenAbschnitt` = Saatband, `Pflanzung` = Pflanze im Stadium). Hover-Pill mit Namen + Konflikt-Badge. Die Welt „lebt“ (wächst, verändert sich mit der Zeit) |
| **Lacoste** | Three.js/WebGL-Objekt, gemalt wird **direkt auf dem 3D-Modell**, minimale Chrome (segmentierter Toggle oben, Kreis-Thumbnails rechts, Coach-Marks) | **Malen statt Objekt schieben**; sehr wenig UI über dem Objekt; Onboarding als Mini-Coach-Marks im Bild | Statt nur Drag & Drop: **Saatband-Malen** — mit dem Finger/Zeiger ein Band über das Beet ziehen (Breite ≈ Reihe), loslassen erzeugt den `ReihenAbschnitt`. Coach-Marks beim ersten Besuch. Chrome so dünn wie möglich |

**Wichtige Korrektur gegenüber v2-Entwurf:** Tavalo ist *nicht* comic-stilisiert — der
Comic-Anteil kommt allein aus townhouse.dev (und ist dort isometrische Pixel-Art, nicht
Draufsicht). rotato bleibt bei der vom Nutzer gewünschten **Draufsicht**, lehnt sich
stilistisch an townhouse.dev an (greifbare Welt, Belebtheit) und nutzt Tavalo für Ruhe und
Filter-Sidebar sowie Lacoste für die Mal-Interaktion und die dünne Chrome.

### 2.1 Stil-Entscheidung: drei Optionen, eine Empfehlung

| Option | Beschreibung | Kosten / Risiko | Bewertung |
|---|---|---|---|
| A: **Pixel-Art isometrisch** (townhouse-Stil) | Asset-Atlas aus Pixel-Sprites (Beete, Pflanzen, Zaun), isometrische Projektion | Hoher Asset-Aufwand, echt „comicky“, aber isometrisch ≠ gewünschte Draufsicht; Flächentreue der echten Beet-Geometrie leidet | ❌ schön, aber gegen die Aufgabenstellung (Draufsicht, echte Maße) |
| B: **Handgezeichnete Draufsicht** (Flach-Illustration) | SVG-Formen mit wackeliger Kontur (jittered stroke), Textur-Noise (`feTurbulence`), Pflanzen sprites parametrisch aus SVG | Asset-Arbeit steuerbar (pro Fruchtfamilie 1 Motiv × 3 Stadien), bleibt editierbar und datengetrieben | ✅ **Empfehlung** — erfüllt Draufsicht + Comic-Anmutung + RDF-Getriebenheit |
| C: **WebGL-gemalt** (Lacoste-Stil) | Karte als WebGL-Szene, malen direkt im Objekt | Hexenwerk für 2D-Garten; Mal-Interaktion lässt sich auch in B nachbauen | ❌ als Gesamtstil, aber Mal-Interaktion wird übernommen |

**Gewählt: B**, mit Interaktions-Mustern aus C (Malen) und UX-Mustern aus A (Metaphern-
Disziplin, lebendige Welt) und Tavalo (Ruhe, Filter-Sidebar, Hover-Pills).

### 2.3 Visualisierungs-Technik: WebGL-Canvas für die Bühne, DOM für die Chrome

Alle drei Referenzen rendern ihre Karte/Ihr Objekt auf Canvas/WebGL (Tavalo: Mapbox,
townhouse: Pixel-Sprites, Lacoste: Three.js) und nutzen DOM nur für die dünne Chrome.
rotato folgt diesem Muster — **Korrektur gegenüber dem v2-Entwurf („SVG-DOM“)**:

| Ebene | Inhalt | Technik |
|---|---|---|
| Bühne | Karte komplett (Hintergrund, Beete, Reihen, Pflanzen, Effekte) | **PixiJS (2D-WebGL-Renderer)** mit PNG-Sprite-Atlas, Pan/Zoom transformieren die Bühne, nicht das DOM |
| Chrome | Kopfzeile, Drawer, Ampel, Scrubber, Coach-Marks | DOM (Svelte), liegt transparent über dem Canvas |
| Labels | Hover-Pills auf der Karte | DOM-Elemente, per Projektion an Sprite-Positionen gekoppelt (wie Mapbox-Marker) |
| Assets | Pflanzen sprites, Beet-Texturen | Handgezeichnet als SVG (Quelle der Wahrheit) → build-time gerastert in einen PNG-Atlas (Skalierungsfest, schnell), parametrisch: Farbe + Stadium als Vorlage |

**Warum PixiJS statt SVG-DOM:** beim Scrubben animieren wir hunderte Sprites (Wuchs,
Licht, Konflikte) bei 60 fps — SVG-Nodes im DOM werden ab ca. 500 Elementen ruckelig.
Der Drop-Live-Check (< 5 ms) bleibt identisch; PixiJS ist nur der Renderer.

**LOD nach Zoom:** Übersicht (Beete als farbige Flächen + Fruchtfamilien-Dots, Tavalo-
Ruhe) → Mitte (Reihen-Segmente + Hover-Pills, townhouse-Lebendigkeit) → Nah (einzelne
Pflanzen-Sprites im Wuchszustand). Sichtbarkeit per Zoom-Stufe gesteuert.

**Wachstum als Zeitfunktion:** Wuchsstadien der Sprites sind an die
`time:hasTemporalExtent` der Pflanzungen gekoppelt. Beim Scrubben wachsen die Pflanzen
sichtbar (Sämling → ausgereift → geerntet/abgeräumt). Fruchtfolge wird **erlebbar statt
abstrakt** — das ist die stärkste Anlehnung an die townhouse-„lebendige Stadt“.

### 2.4 Fruchtfamilien-Farbwelt

Die bestehende Palette aus `fruchtfolge-logic.js` (`FAMILIE_COLOR`) wird zur
Illustrations-Palette ausgebaut: jede Fruchtfamilie bekommt eine **Farbfamilie** (2–3
Töne für Frucht, Blatt, Blüte), nicht nur eine Fläche. So bleibt die Farblogik konsistent
(Plan/Zeitstrahl/Drawer) und die Karte wird trotzdem reich und „comicky“.

### 2.5 Metaphern-Disziplin (townhouse-Prinzip)

Townhouse funktioniert, weil **jede Datenentität genau ein greifbares Äquivalent** hat.
rotato übernimmt diese Disziplin strikt:

| RDF-Entität | Äquivalent auf der Karte | Interaktion |
|---|---|---|
| `garten:Beet` | Beetkörper (organische Fläche, Boden-Textur) | Tap → Beet-Drawer; anfassbar (Zonen-Gefühl) |
| `garten:Reihe` | Ranke/Schnur über dem Beet | visuell, keine eigene Interaktion |
| `garten:ReihenAbschnitt` | Saatband (farbiges Segment) | Tap → Pflanzungs-Detail; Drop-Ziel; **Mal-Ziel** |
| `garten:Pflanzung` | Pflanzen sprite im Stadium des Scrub-Zeitpunkts | Drag (Umpflanzen), Malen (Neuanlage) |
| Fruchtfamilie (`gv:ff_*`) | Farb- und Motivfamilie | Filter-Sidebar (Tavalo), Hover-Pill |
| Konflikt | Rote Wellen-Ringe / Shake | Ampel-Chip, Hover-Begründung |

Keine zweite Darstellungssprache daneben: was im Zeitstrahl als Balken auftaucht, ist
dasselbe Sprite in derselben Farbe wie auf der Karte.

### 2.6 Micro-Interactions (das „Ausprobieren“)

| Moment | Animation |
|---|---|
| **Saatband malen** (Lacoste-Prinzip) | Zeiger über Beet ziehen → gezeichnetes Band folgt mit weichem Pinselstrich; beim Loslassen „setzt“ sich das Saatband (Kurz-Puls), `ReihenAbschnitt` entsteht |
| Drag-Ghost über Karte | Ghost schwebt mit leichtem Pendeln; Ziel-Beet leuchtet; Valid-Check pulsiert grün/rot (wie v1 §3.3) |
| Drop (erfolgreich) | Pflanze „ploppt“ mit Bounce in den Abschnitt, Staubpartikel, kurzer Konfetti-Pop; Toast als **Sprechblase** (comic) |
| Drop (Konflikt) | Abschnitt schüttelt sich (Shake), rote Wellen-Ringe, Sprechblase mit Begründung + Empfehlung |
| Auswählen | Beet hebt sich leicht (Skalierung + weicher Schatten), Rest dunkelt leicht ab |
| Scrubben | Licht wechselt fließend (Frühjahr → Hochsommer), Pflanzen wachsen, Belegungen morphen |
| Stadien-Wechsel in der Anzucht | Karte im Dock hüpft in die nächste Spalte |

Alle Animationen respektieren `prefers-reduced-motion` (dann: Zustandswechsel hart,
ohne Tweening).

---

## 3. Der Transplant-Flow auf der Karte (ersetzt v1 §3.3 Ablauf-Szenografie)

Der Workflow bleibt logisch identisch (Live-Check → Grün: PUT / Rot: kein State-Change +
Begründung), aber die Inszenierung ändert sich:

1. **Anzucht-Dock** unten links zeigt den Zähler „3 auspflanzreif“; Klick öffnet die
   Schublade, die AUSPFLANZREIF-Karten leuchten.
2. Karte greifen → die Bühne **wechselt in den Pflanz-Modus**: restliche UI dimmt,
   potenzielle Ziel-Beete bekommen weiche Highlight-Ringe (nur Beete, die laut
   Konflikt-Engine in Frage kommen — Beete mit Konflikten sind dezent abgedunkelt, aber
   **trotzdem anwählbar**; der Live-Check entscheidet, nicht das Highlight).
3. Über einem Ziel-Abschnitt: Ghost pulsiert grün/rot (Live-Check §4.4 v1).
4. Drop grün: Pflanze ploppt ein, Sprechblase „Tomate ‚San Marzano‘ gepflanzt — Reihe 3,
   Tomatenbeet“, Status → „gepflanzt“, PUT (ADR-0004 read-modify-write).
5. Drop rot: Shake + Sprechblase mit Begründung **und Empfehlung** („Kartoffelbeet wäre
   frei — Nachtschatten zuletzt 2022“), Alternativen-Beete leuchten auf einmalig zur
   Orientierung.

---

## 4. Stack v2: Docker + SvelteKit + BFF mit Pod-Cache

### 4.1 Motivation

Die comic-illustrative Karte braucht: sofortiges First Paint (Assets, Sprites, Texturen),
flüssiges Scrubbing (Zeit × Karten-Zustand), und niedrige Latenz bei jedem Drop-Live-Check.
Ein Frontend-Direct-Zugriff auf den Pod (v1 Stufe 2) wird zum Flaschenhals: jede
Interaktion wartet auf Pod-Trips. Der BFF löst das, ohne die Pod-Wahrheit (P1) aufzugeben:
**Der Pod bleibt die einzige Quelle; der BFF ist Cache und Proxy, kein Datenspeicher.**

### 4.2 Architektur

```
┌─────────────┐   HTTPS    ┌──────────────────────────────────────┐
│  Browser    │───────────▶│  Reverse Proxy (nginx/Caddy)         │
│  (Svelte    │            │  · statische Assets (App, Sprites)   │
│   SPA)      │            │  · /api/* → SvelteKit (Node)         │
└─────────────┘            └──────────────┬───────────────────────┘
                                          │
                           ┌──────────────▼───────────────────────┐
                           │  SvelteKit BFF (adapter-node)        │
                           │  · Solid-OIDC Session (server-side)  │
                           │  · GET: Pod → Turtle → SPARQL        │
                           │    → vorgejointes JSON (Views)       │
                           │  · PUT: SHACL-Validierung (pyshacl   │
                           │    oder rdf-validate-shacl) → Pod    │
                           │  · Cache: ETag/If-Modified-Since,    │
                           │    in-memory (oder Redis) TTL 30–60s │
                           └──────────────┬───────────────────────┘
                                          │ DPoP/Client-Credentials
                           ┌──────────────▼───────────────────────┐
                           │  Solid Pod (solid.lasrie.dev/garten/)│
                           │  — die einzige Quelle der Wahrheit   │
                           └──────────────────────────────────────┘
```

Docker-Compose (3 Container): `proxy` (nginx), `app` (SvelteKit adapter-node), optional
`cache` (Redis — erst wenn nötig; in-memory Cache reicht für den Single-User-Fall).

### 4.3 API-Vertrag des BFF (vorschlag)

| Endpoint | Methode | Zweck | Cache |
|---|---|---|---|
| `/api/garden` | GET | Garden-Graph vorgejoint: Beete, Reihen, Abschnitte, Geometrie — ein Call für den Karten-Bau | ETag, TTL 60 s |
| `/api/plantings?year=` | GET | Pflanzungen eines Jahres inkl. Pflanze/Sorte/Familie (gejoint) | ETag, TTL 30 s |
| `/api/conflicts?year=` | GET | Konflikt-Engine serverseitig (dieselben Regeln wie v1 §4.4) | TTL 10 s |
| `/api/plantings` | PUT | Neue/Ändernde Pflanzung (Turtle-Body) → SHACL-Pre-Check → Pod-PUT → Cache-Invalidierung | — |
| `/api/auth/*` | — | Solid-OIDC-Flow server-side (Login/Logout/Session) | — |

Wichtig: Der BFF **rejoint** die verstreuten Pod-Dokumente (Beete in einem Doc, Pflanzungen
in `planungen/*`, Pflanzenkatalog generiert) zu **Read-Modellen** — genau die
`$derived`-Views aus v1 §5.2, nur serverseitig und cachebar. Das Frontend bekommt fertige,
kleine JSON-Payloads statt roher Turtle-Trips.

### 4.4 Trade-offs (ehrlich)

| | Frontend-Direct (v1) | BFF + Cache (v2) ✅ für diese UX |
|---|---|---|
| First Paint der reichen Karte | viele Pod-Trips, Turtle-Parsing im Client | 1–2 Calls, vorgejointes JSON |
| Offline-Modus (Garten ohne Netz) | hart (Pod remote) | gleich hart — ehrlich bleiben: kein Offline-Vorteil, nur Latenz-Gewinn |
| Pod-Unabhängigkeit der App | vollständig | BFF koppelt Deployment an Pod (aber: URIs der Daten bleiben stabil, ADR-0003) |
| Schreib-Auth | Browser-OIDC | Server-OIDC (einfacher: einmal Client-Credentials, wie `sync_to_pod.mjs`) |
| Mehr-Nutzer-Fälle (Freundin, WAC) | direkt am Pod sichtbar | genauso (BFF ist Proxy, keine Kopie) |
| Komplexität | weniger | Docker-Deployment + BFF-Code |

### 4.5 Der Svelte-Kern bleibt gleich

- **Svelte 5 (runes)** bleibt die Empfehlung — jetzt als SvelteKit-App mit
  `adapter-node` im Docker-Container (statt `adapter-static` auf Pages).
- Der Pod bleibt der Store: der BFF liefert Read-Modelle, der Client hält
  Optimistic-Updates, Rollback bei 409/412 (Merge-Wizard wie v1 §6.1).
- Die Konflikt-Engine läuft **beidseitig mit derselben Logik**: serverseitig
  (`/api/conflicts`, vorgebacken) und clientseitig für den sofortigen Live-Check beim
  Drag (Client bekommt die Regeln + Matrizen einmalig mitgeliefert, dann < 5 ms pro
  Check ohne Netz).

---

## 5. Umsetzungs-Reihenfolge v2 (ersetzt v1-Anhang)

1. **Art-Prototyp (Wochenende-Format):** statische SVG-Karte von Garten 91
   (Geometrie aus `garten91-beete-real.ttl` stilisiert) mit Pan/Zoom, 3 Frucht-
   familien-Sprites in 3 Wuchsstadien, Drop mit Plop-Animation — ohne Pod, ohne BFF,
   rein zur Stil-Findung.
2. BFF-Grundgerüst: SvelteKit adapter-node + `/api/garden` + `/api/plantings` +
   Docker-Compose (proxy + app), Cache mit ETag.
3. Konflikt-Engine (Regeln aus v1 §4.4) serverseitig + clientseitig geteilt;
   `/api/conflicts` + Client-Live-Check.
4. Anzucht-Dock + Transplant-Flow auf der Karte (§3).
5. Zeit-Scrubber + Wuchszustands-Sprites (Bühnen-Layer) + Saison-Licht.
6. Saatband-Malen (Lacoste-Prinzip) + Fruchtfamilien-Filter-Sidebar (Tavalo-Prinzip).
7. Konflikt-Schublade + Waiver-Flow; `#/daten`-Screen unverändert aus v1 §2.5.
8. Generator-Doc `mischkultur.ttl` (v1 §4.2) einbinden → Nachbarschafts-Konflikte aktiv.

---

## 6. Offene Fragen (ergänzend zu v1 §6)

1. **Illustrationen:** Wer zeichnet die Pflanzen-Sprites? Vorschlag: pro Fruchtfamilie
   ein Basis-Motiv (parametrisierbar: Farbe, Stadium), von Hand in SVG gezeichnet —
   kein KI-Generieren für den Kernstil, um Konsistenz zu wahren. Umriss-Styleguide
   (2.1–2.3) als Bindeglied.
2. **Zeit-Scrubber Granularität:** Monat reicht für das Weltgefühl; Wochen-Modus nur im
   Filmstrip-Drawer (für Vor-/Nachkulturen), nicht auf der Bühne.
3. **Mobil-Phone-Fallback:** Die Bühne ist auf dem Tablet ideal; auf schmalen Phones
   ggf. die v1-Screens als Fallback? (Erst testen — Drawer-Anordnung könnte auch auf
   Phones funktionieren.)
