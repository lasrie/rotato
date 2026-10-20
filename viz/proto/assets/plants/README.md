# Illustrationen für den rotato-Prototyp — Anleitung

Hier liegen die handgezeichneten Pflanzen-Illustrationen, die die Karten-
Darstellung ersetzen, sobald sie existieren. **Solange eine Datei fehlt,
zeigt die Karte automatisch den abstrakten Platzhalter** — du kannst also
inkrementell arbeiten und jederzeit zwischenspeichern.

---

## Der Deal in einem Satz

Zeichne **eine SVG pro Fruchtfamilie und Wuchsstadium**, lege sie unter dem
richtigen Dateinamen hier ab, lade die Seite neu — fertig. Kein Export,
kein Code, kein Build-Schritt nötig.

---

## 1. Ordnerstruktur und Dateinamen (wichtig!)

```
viz/proto/assets/plants/<familie>/<stadium>.svg
```

- `<familie>` = Slug der Fruchtfamilie (Tabelle unten)
- `<stadium>` = `seedling` (Sämling), `young` (jung), `mature` (ausgewachsen)

Beispiel: `assets/plants/nachtschatten/mature.svg` = ausgewachsene Tomate.

### Familien-Slugs (wie in beds.json / fruchtfolge-logic.js)

| Ordnername | Fruchtfamilie | Beispiel-Pflanzen |
|---|---|---|
| `nachtschatten` | Nachtschattengewächse | Tomate, Paprika, Chilli, Physalis |
| `korbbluetler` | Korbblütler | Salat, Sonnenblume |
| `huelsenfruechtler` | Hülsenfrüchtler | Bohne, Erbse |
| `zwiebelgewaechse` | Zwiebelgewächse | Zwiebel, Knoblauch, Schnittlauch |
| `kreuzbluetler` | Kreuzblütler | Kohlrabi, Radieschen, Rucola |
| `beeren` | Beeren | Erdbeere, Johannisbeere |
| `suessgraeser` | Süßgräser | Mais |
| `lippenbluetler` | Lippenblütler | Basilikum, Lavendel |
| `kuerbisgewaechse` | Kürbisgewächse | Zucchini, Gurke |
| `doldenbluetler` | Doldenblütler | Möhre, Petersilie, Dill |

Fehlt eine Familie in dieser Liste (z. B. neue aus der Excel), dann kann die
Datei trotzdem benutzt werden: gleiches Muster `assets/plants/<slug>/...`,
der Slug ist der Name nach `ff_` im Vokabular in Kleinschreibung.

---

## 2. Zeichen-Konventionen (damit die Karte konsistent bleibt)

### ViewBox

**Alle SVGs: `viewBox="0 0 100 100"`** — die Pflanze zentriert, mit etwas
Rand. Der Renderer skaliert sie automatisch (Basisgröße ~34 px auf der Karte,
Ausnahme: `mature` darf bis 44 px). Nur der Inhalt zählt.

### Ankerpunkt: unten Mitte = Wurzelpunkt

Die Pflanze sollte so gezeichnet sein, dass der **unterste Punkt der Pflanze
bei (50, 96)** liegt — dort „steht" sie im Beet. Nach oben darf frei gezeichnet
werden. Daraus folgt: eher hochkant komponieren, nicht quadratisch ausfillern.

### Farb-Palette (die Karte färbt nicht nach, die Farben kommen aus der Datei)

Verwende die Fruchtfamilien-Farben aus `fruchtfolge-logic.js` als Grundton,
damit die Karte farblich konsistent bleibt (Karte färbt *nicht* automatisch
um — die Farben kommen aus deiner SVG-Datei):

| Familie | Grundton | Beispiel |
|---|---|---|
| Nachtschatten | `#e9a8a0` | Tomate: `#e9a8a0` (rot) + `#7fa86f` (Blattgrün) |
| Korbblütler | `#e3c56f` | Salat: `#a8c686` + gelbe Mitte |
| Hülsenfrüchtler | `#a5d1a0` | Bohnenranke |
| Zwiebelgewächse | `#c9b6e4` | Zwiebel: violett-weiß |
| Kreuzblütler | `#a8c686` | Kohlrabi: hellgrün-weiß |
| Beeren | `#d98ca6` | Erdbeere: rot-pink |
| Süßgräser | `#cfc07a` | Mais: gelb-grün |
| Lippenblütler | `#b7a6d9` | Basilikum: sattes Grün |
| Kürbisgewächse | `#f0a35e` | Zucchini: dunkelgrün-orange Blüte |
| Doldenblütler | `#f2b880` | Möhre: oranges Grün-Büschel |

### Kontur (der „Comic-Look")

- **Strichstärke 3–4 Einheiten** (bei ViewBox 100), Farbe `#2f2a24` (Tinten-
  braunschwarz, wie die restliche Karte)
- Runde Enden (`stroke-linecap="round"`), keine exakten Geraden — leicht
  gewackelte Pfade wirken handgezeichnet
- Optional: zweite Kontur versetzt (1–2 Einheiten) in `#6b6353` mit 60 % Opazität
  für den Doppelstrich-Look wie auf der restlichen Karte

### Detailgrad pro Stadium

| Stadium | Detailgrad | Grund |
|---|---|---|
| `seedling` | Minimal: 2 Keimblätter | In der Übersicht sollen Sämlinge nicht „lärmen" |
| `young` | Mittleres Blattwerk, noch keine Frucht | Übergangsform |
| `mature` | Volle Pflanze + Frucht/Blüte | Der „Wow"-Zustand beim Scrubben |

### Stil-Hinweise für Konsistenz

- **Keine Verläufe, keine Schatten in der Datei** — Schatten macht der Renderer
  (Drop-Shadow-Layer). Flache Farben + Kontur.
- **Kein Hintergrund** (transparent), kein weißes Rechteck
- **Kein Text** in den SVGs (Beschriftung macht die Karte als Pill)
- Bei Symmetrie: leicht asymmetrische Blatt-Winkel wirken natürlicher als
  perfekter Spiegel

---

## 3. Empfohlene Tools (in Präferenz-Ordnung)

1. **Figma** (gratis, ideal) — neue Datei, Frame 100×100, als SVG exportieren
   (Rechtsklick → Copy as SVG geht auch). Achte darauf, dass der Export die
   viewBox beibehält: Im Export-Dialog „SVG" → Outline stroke deaktivieren
   lassen? Nein — **Outline stroke AN lassen** (Export → „Include id and outline
   stroke"), damit die Strichstärken im SVG landen und nicht als CSS verloren
   gehen. Alternativ: nach dem Export kurz prüfen, ob `stroke-width` in den
   Pfaden steht.
2. **Inkscape** (gratis, Desktop) — direkt SVG, `viewBox` im Dokument-Dialog
   auf 0 0 100 100 setzen, Striche NICHT in Pfade umwandeln (kein „Stroke to
   Path"), damit die Konturstärke erhalten bleibt.
3. **Excalidraw** (gratis, im Browser) — für den handgezeichneten Look fast zu
   gut: roughness auf 1, Export als SVG. Achtung: Export enthält `fill` teils
   als „hachure" — dann statt Export die Farben manuell setzen (siehe unten).
4. **Vektorator / Vectornator (Linearity)** — gut auf dem iPad (wenn du lieber
   auf dem Tablet zeichnest), SVG-Export direkt.

**Nicht ideal:** Procreate (raster → kein SVG), Canva (SVG-Export nur bezahlt,
Qualität schwankt).

---

## 4. Vorlagen zum Loslegen

In `viz/proto/assets/plants/_vorlagen/` liegen zwei SVG-Vorlagen, die du
direkt kopieren und anpassen kannst:

- `_vorlage-seedling.svg` — 2 Keimblätter, minimalistisch
- `_vorlage-mature.svg` — ausgewachsene Pflanze mit Frucht und Doppelkontur

Beide haben die richtige ViewBox, Ankerpunkt und Palette als Kommentar in
der Datei. Du kannst sie direkt bearbeiten (jeder Texteditor) oder in
Figma/Inkscape öffnen.

---

## 5. Test-Loop

1. SVG speichern unter dem richtigen Namen (z. B.
   `assets/plants/nachtschatten/mature.svg`)
2. Browser neu laden (`http://localhost:8901/viz/proto/index.html`)
3. Die Pflanze erscheint auf der Karte statt des Platzhalters

Wenn etwas nicht erscheint: Browser-Konsole (F12) zeigt Loader-Fehler mit
Dateinamen. Häufige Fehler: falscher Dateiname (siehe Tabelle oben), fehlende
`viewBox`, leere Datei.

---

## 6. Was technisch im Renderer passiert (Info, nicht zum Mitmachen)

Der Renderer (PixiJS v8) lädt die SVGs beim Start als Texturen. Die
Wuchsstadien werden durch den Saison-Scrubber gesteuert: `seedling` → `young`
→ `mature` als weiche Cross-Fade (Opacity-Blending zwischen den Stadien, keine
harten Sprünge). Skalierung folgt der Beet-Geometrie, Ankerpunkt unten Mitte.
