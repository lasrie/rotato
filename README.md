# Garten-Planer: Linked Data & SHACL für den naturnahen Kleingarten

Deinen Kleingarten als **Linked Data** modellieren und mit **SHACL**-Shapes
formal validieren. Grundlage für spätere Fruchtfolge-Planung, Apps oder Abfragen.

---

## Dateien

| Datei | Inhalt |
|---|---|
| `garten-shapes.ttl` | Ontologie (Begriffe) **+ SHACL-Regeln** (Shapes) |
| `garten-vokabular.ttl` | Kontrollierte Listen: Fruchtfamilien, Sonnenlagen, Bodentypen |
| `pflanzen.ttl` | Pflanzenkatalog aus der Anzuchtdatenbank: 55 Arten, 75 Sorten (generiert) |
| `generate_pflanzen.py` | Generator: Excel → `pflanzen.ttl` (bei Excel-Änderungen neu laufen lassen) |
| `anbau-journal.ttl` | Anbau-Journal aus den Kalender-Blättern: 97 Pflanzungs-Ereignisse 2025 (generiert) |
| `generate_anbau.py` | Generator: Excel-Kalender → `anbau-journal.ttl` |
| `beispiel-garten.ttl` | Beispiel-Datengraph: 4 Beete, 4-jährige Fruchtfolge, 4 Pflanzungen |
| `beetplan-2025-extrahiert.ttl` | Visuell aus der PowerPoint extrahierte Zonen und Belegungen für Garten 91 |
| `garten91-linking.ttl` | Verknüpft die extrahierten Zonen als `garten:Beet` mit einem echten `garten:Kleingarten` |
| `garten91-beete-real.ttl` | Reale Beetstruktur von Garten 91 aus dem Google-Maps-Screenshot (Maße = Schätzwerte) |
| `garten91-beetplan-2024.ttl` | Beetplan 2024 mit Positionsdaten, generiert aus `input/Beetplan 2024.pptm` |
| `generate_beetplan2024.py` | Generator: PPTM 2024 → RDF (Reihenabschnitte mit Position) |
| `garten91-belegungen-real-2025.ttl` | Pflanzungen 2025 auf den realen Beeten (aus dem PPT-Plan gemappt; offene Zuordnungen markiert) |
| `fruchtfolge-analyse.rq` | SPARQL-Abfrage: Fruchtfamilien pro Beet und Jahr |
| `garten-layout-ontology.ttl` | Ontologie-Erweiterung: `garten:Reihe` und `garten:ReihenAbschnitt` für echte Beetplanung |
| `garten-layout.shacl.ttl` | SHACL-Regeln für Reihen und Reihenabschnitte |
| `garten91-linkes-hohes-beet-2025.ttl` | Reihenmodell des Tomatenbeets 2025 (vorläufig, vor Satellitenbild-Abgleich) |
| `server.py` | Lokaler Server (Phase B): liefert Viewer + RDF aus, nimmt neue Pflanzungen (Turtle) an und validiert sie |
| `garten91-planungen-neu.ttl` | Planungspuffer: neue Pflanzungen aus dem Viewer landen hier |
| `scripts/sync_to_pod.mjs` | **Solid-Migration (M1):** spiegelt die lokalen RDF-Dateien in den Pod (CSS Client-Credentials + DPoP) |
| `.env.example` | Vorlage für die Pod-Konfiguration (Client-Credentials, niemals selbst committen) |
| `render_beetplan_2025_slides.py` | Rendert die PPT-Folien als PNG für die exakte Ansicht |
| `export_garten91_plan.py` | Exportiert die RDF-Daten in ein Browser-freundliches JSON/JS für die Visualisierung |
| `export_fruchtfolge.py` | Erzeugt die Fruchtfolge-Matrix (Beet × Jahr) mit Konflikterkennung |
| `viz/fruchtfolge.html` | Fruchtfolge-Viewer: Matrix + Rotation-Konflikte |
| `viz/index.html` | SVG-Viewer für den Gartenplan 2025 von Garten 91 |

## Solid-Pod (M1 abgeschlossen)

Die Daten werden in einen Solid-Pod gespiegelt (ADRs in `adr/`):

```bash
cp .env.example .env      # Client-Credentials eintragen (einmalig im Browser erzeugen)
node scripts/sync_to_pod.mjs --dry-run   # Upload-Plan anzeigen
node scripts/sync_to_pod.mjs             # in den Pod spiegeln
```

Der Pod läuft auf **solidcommunity.net** (Community Solid Server). Die Objekt-URIs
in den Daten bleiben unverändert (`example.org/garten-planer/...`), nur die
Dokument-URIs liegen im Pod: `https://lasse.solidcommunity.net/garten/<name>.ttl`.

Architektur-Entscheidungen: `adr/README.md`, Implementierungsplan:
`adr/implementierungsplan.md`.

## Validieren

```bash
pip install pyshacl
cat garten-vokabular.ttl garten-shapes.ttl pflanzen.ttl beispiel-garten.ttl anbau-journal.ttl > /tmp/data.ttl
python3 -m pyshacl -s garten-shapes.ttl /tmp/data.ttl
```

Oder im Browser: <https://shacl-playground.zazuko.com/> – Vokabular + Daten in
das Datenfeld, Shapes in das Shapes-Feld.

---

## 1. Was ist Linked Data?

RDF dreht sich um **Tripel**:

```
<Subjekt>  <Prädikat>  <Objekt> .
```

Beispiel aus `beispiel-garten.ttl`:

```turtle
<#beetNord> a garten:Beet ;                     # Beet Nord ist vom Typ "Beet"
    dcterms:title "Beet Nord (sonnig, humos)" ; # … hat einen Titel
    garten:sonnenlage gv:sonnig .               # … und verlinkt das Konzept "sonnig"
```

Drei Grundideen:

1. **URIs statt Namen.** Alles (Garten, Beet, Pflanze, Fruchtfamilie) bekommt
   eine URI. So kann man aus fremden Datensätzen auf dieselbe Ressource zeigen.
2. **Verlinkung zu bekannten Vokabularen.** Wir greifen auf bestehende
   Standards zurück:
   - `dcterms:title` – Titel/Bezeichnung
   - `skos:Concept` – kontrollierte Listen (Fruchtfamilien, Sonnenlage, Boden)
   - `time:` – Zeitintervalle für Folge-Jahre
   - `xsd:` – Datentypen (Zahlen, Boolean, Jahr)
3. **Graph statt Tabelle.** Ein Beet verlinkt seine Pflanzungen, eine Pflanzung
   verlinkt Pflanze und Jahr, das Beet verlinkt die Fruchtfolge. So entstehen
   Abfragen wie „Zeig alle Nachtschatten-Pflanzungen 2026".

## 2. Was macht SHACL?

**SHACL** ist eine W3C-Sprache für *Shapes*: Regeln, die ein RDF-Graph
erfüllen soll. Ein Validator (z.B. `pyshacl`) prüft das und liefert
verständliche Fehlermeldungen (hier auf Deutsch via `sh:message`).

Beispiel aus `garten-shapes.ttl`:

```turtle
shape:BeetShape a sh:NodeShape ;
    sh:targetClass garten:Beet ;            # gilt für jedes garten:Beet
    sh:property [
        sh:path dcterms:title ;
        sh:minCount 1 ; sh:maxCount 1 ;     # genau ein Titel
    ] ;
    sh:property [
        sh:path garten:sonnenlage ;
        sh:minCount 1 ; sh:maxCount 1 ;
        sh:node shape:SonnenlageNode ;      # Wert muss SKOS-Konzept der Liste sein
    ] .
```

Wichtige SHACL-Begriffe:

| Begriff | Bedeutung |
|---|---|
| `sh:NodeShape` | Eine Regelgruppe |
| `sh:targetClass` | Auf welche Klasse die Shape greift |
| `sh:path` | Welches Prädikat geprüft wird |
| `sh:minCount` / `sh:maxCount` | Wie oft der Wert auftreten darf |
| `sh:datatype` / `sh:class` / `sh:node` | Typ- und Struktur-Bedingungen |
| `sh:languageIn` | Sprache von Literals (hier `@de`) |
| `sh:hasValue` / `sh:in` | Zulässige Werte |
| `sh:message` | Verständliche Fehlermeldung (deutsch) |

## 3. Was Shapes können – und was nicht

**Getestet (Negativtest):** setzt man die Fläche eines Beets auf `-8.0`, meldet
der Validator:

> *„Die Fläche muss in m² angegeben werden und größer als 0 sein."*

**Wichtig zur Erwartung:** Shapes prüfen *Struktur und Werte* (Pflichtfelder,
Datentypen, Listenwerte, Zahlbereiche). Ob eine Fruchtfolge fachlich korrekt
ist – z.B. dass zwei Nachtschattengewächse nie nacheinander auf demselben Beet
stehen – ist eine **semantische Regel über mehrere Pflanzungen hinweg**. Das
überfordert einfache SHACL-Constraints; dafür braucht es später
*SHACL-Regeln mit SPARQL* oder eine kleine Abfrageschicht. Die Shapes hier
sichern trotzdem schon alle strukturellen Fundamente ab.

## 4. Warum diese Modellierung für Fruchtfolgen?

- **Fruchtfamilien als SKOS-Liste.** Fruchtfolge heißt: *verwandte Familien
  nicht nacheinander auf demselben Beet*. „Kartoffel → Nachtschatten" und
  „Tomate → Nachtschatten" zeigen auf dasselbe Konzept – ein Programm kann
  also erkennen, dass sie verwandt sind.
- **Hülsenfrüchtler als Drehzscheibe.** Die Beispieldaten sind so gebaut, dass
  stickstoffsammelnde Hülsenfrüchtler (Bohne) als vorbereitende Kultur vor
  Starkzehrern (Kohl, Kartoffel) stehen.
- **Naturnah statt monokulturell.** Das „Beet Wildhecke" als Nützlingsbeet
  zeigt: Das Modell erlaubt auch Beete ohne Fruchtfolge-Pflege – die Shape
  verlangt nur die Struktur, nicht die Kultur.

## 5. Pflanzenkatalog aus Excel

Die Anzuchtdatenbank liegt in `input/Pflanzenanzucht_mit_Makro.xlsm` (Sheet
„Anzuchtdatenbank“). Das Skript `generate_pflanzen.py` übernimmt daraus:

- **Arten** als `garten:Pflanze` mit Fruchtfamilie (gemappt über die Tabelle
  `FAMILIEN` im Skript – neu angebaute Arten landen zunächst ohne Familie und
  müssen dort ergänzt werden).
- **Sorten** als `garten:Sorte` mit `garten:sorteVon` zur Art. Tomaten-Gruppen
  (Cherry/Cocktail/Fleisch/Salat) werden zu einer Art „Tomate“ zusammengeführt,
  damit die Fruchtfolge-Logik (alle Nachtschatten) korrekt greift.
- **Kultur-Eigenschaften** (Anzucht-Zeit, Keimtemperatur, Abstand, Erntezeit
  usw.) als Freitext-Literale an der Art.
- **Anbau-Jahre** aus den Kalender-Spalten („2025“ etc., Markierung mit `x`)
  als `garten:angebautImJahr` an der Sorte.

Nach Excel-Änderungen einfach neu generieren:

```bash
python3 generate_pflanzen.py
cat garten-vokabular.ttl garten-shapes.ttl pflanzen.ttl beispiel-garten.ttl > /tmp/data.ttl
python3 -m pyshacl -s garten-shapes.ttl /tmp/data.ttl
```

## 6. Eigene Daten eintragen

1. Neue Beete als `a garten:Beet` mit Titel, Fläche, Sonnenlage, Bodentyp und
   Verweis auf die Fruchtfolge.
2. Neue Pflanzenarten als `a garten:Pflanze` mit `skos:prefLabel …@de`,
   `garten:fruchtFamilie` und `garten:mehrjaehrig`.
3. Neue Pflanzungen als `a garten:Pflanzung` mit `garten:aufBeet`,
   `garten:pflanzt` und Jahr.

Danach wieder validieren (Befehl oben). Der Validator sagt dir genau, was fehlt.

## M3: Frontend-Direct (Solid-OIDC im Browser)

Der Haupt-Viewer kann sich jetzt direkt gegen den Pod authentifizieren:

- **Anmelden** über `Mit Solid anmelden` (solidcommunity.net, OIDC-Flow im Browser)
- Eingeloggt: Das Planungs-Formular **validiert im Browser** (SHACL, dieselben Shapes
  aus dem Pod) und **schreibt direkt in den Pod** (If-Match-Schutz)
- Nicht eingeloggt: Fallback auf das Gateway (Stufe 1) — der Viewer funktioniert
  weiterhin ohne Solid-Login

Technik: ESM-Bundle aus `@inrupt/solid-client` + `solid-client-authn-browser` +
`rdf-validate-shacl` (via esbuild, `npm run build`), eingebunden als
`viz/lib/solid-bundle.js`. Die Bridge (`viz/solid-auth-bridge.js`) stellt das
Globale `window.savePflanzung` bereit, das der bestehende inline-Code nutzt.

```bash
npm run build     # Bundle erzeugen (nach Änderungen an den Dependencies)
python3 server.py # oder: Viewer direkt öffnen (Pod-Daten kommen via Gateway-Export)
```

## M2: Gateway als Pod-Adapter

`server.py` liest und schreibt jetzt **direkt im Pod** (ADR-0002, Stufe 1):

- `GET /rdf/data.ttl` – Merge aller Pod-Ressourcen (In-Memory-Cache 60 s)
- `POST /api/pflanzung` – validiert mit pyshacl über das **komplette** Dataset
  (Cache-Merge + neue Pflanzung), schreibt erst bei Erfolg per PUT in den Pod
  (read-modify-write auf `planungen/planungen.ttl`); bei Fehler wird nichts
  geschrieben (impliziter Rollback)
- Die Pod-Auth (client_credentials + DPoP) liefert `pod_auth.py`

```bash
python3 server.py   # http://localhost:8765/ – Daten kommen aus dem Pod
```

**Wichtig (Bug-Fix M2):** pyshacl-CLI akzeptiert nur EINE `-s`-Shape-Datei
(letzter gewinnt). Frühere Validierungen prüften effektiv nur
`garten-layout.shacl.ttl`. `server.py` merged jetzt beide Shape-Dateien in
ein temporäres Shapes-Dokument.

## Phase B: Planungs-Eingabe

Der Haupt-Viewer unterstützt jetzt das Anlegen neuer Pflanzungen:

1. Server starten:
   ```bash
   python3 server.py
   ```

2. Viewer öffnen:
   ```
   http://localhost:8765/
   ```

3. Beet anklicken → „+ Neue Pflanzung planen“ → Pflanze + Monate wählen → speichern.

Der Server hängt die neue Pflanzung in `garten91-planungen-neu.ttl` an,
**validiert** sie gegen beide SHACL-Shape-Dateien und regeneriert den
Viewer-Export automatisch. Bei Validierungsfehlern wird zurückgerollt.

Architektur: LDP-artig (GET liefert Turtle, POST nimmt Turtle an) –
dadurch später leicht gegen einen Solid-Pod austauschbar.

## Phase C: Fruchtfolge-Matrix

Beet × Jahr-Matrix (2024–2026) mit Fruchtfamilien-Farbcodierung und
automatischer Konflikterkennung (gleiche Familie in aufeinanderfolgenden
Jahren auf demselben Beet):

```bash
python3 export_fruchtfolge.py
# Server läuft: http://localhost:8765/fruchtfolge.html
```

Der Server regeneriert bei jedem gespeicherten Pflanzplan beide Exporte
(Pflanzplan + Fruchtfolge) automatisch.

## Phase A: Visualisierung

Für Garten 91 gibt es jetzt einen ersten Viewer auf Basis der Linked-Data-Dateien.

Dateien:
- `viz/index.html`
- `viz/garten91-data.js` (generiert)
- `export_garten91_plan.py`

Export neu erzeugen:

```bash
python3 export_garten91_plan.py
```

Viewer lokal öffnen:

```bash
open viz/index.html
```

Exakte PPT-Layoutansicht rendern und öffnen:

```bash
python3 render_beetplan_2025_slides.py
open viz/exakt.html
```

Reihen-/Abschnitts-Viewer für das linke hohe Beet erzeugen und öffnen:

```bash
python3 export_linkes_hohes_beet_layout.py
open viz/linkes-hohes-beet.html
```

**Haupt-Viewer (Phase A):** schematische Gartenkarte der realen Beete,
fryd.app-inspiriert, mit Jahres-/Monats-Slider:

```bash
python3 export_garten91_plan.py
open viz/plan.html
```

Der Viewer zeigt:
- die Beete/Zonen aus `plan:x`, `plan:y`, `plan:width`, `plan:height`
- die sichtbaren Kulturen pro Monat aus `plan:fromMonth` / `plan:toMonth`
- Farben nach Fruchtfamilie oder Sicherheit (`plan:confidence`)

Aktuelle Einschränkung:
- Die Darstellung in `viz/index.html` ist zonenbasiert. Einzelne Kulturen werden noch nicht an ihrer exakten Unterposition innerhalb eines Beets gerendert, sondern als kompakte Chips im jeweiligen Beet.
- Für die pixelgenaue Originalansicht gibt es zusätzlich `viz/exakt.html`, das die PowerPoint-Folienbilder direkt zeigt.
- Für echte Planungsdaten auf Reihenebene gibt es `viz/linkes-hohes-beet.html`, das direkt `garten:Reihe` und `garten:ReihenAbschnitt` aus RDF rendert.

## 7. Erweiterungsideen

- `garten:nachbarschaft` zwischen Beeten (Mischkultur-Partner)
- `garten:ernteMenge` mit `qudt`-Einheiten (g, kg)
- Verknüpfung zu externen Taxonomien (GBIF, Wikidata) für die Pflanzenarten
- SPARQL-Regeln für die Fruchtfamilien-Rotation (siehe Punkt 3)
