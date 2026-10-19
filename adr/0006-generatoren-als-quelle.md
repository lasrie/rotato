# ADR-0006: Excel-Generatoren bleiben Quelle, Pod ist Runtime-Speicher

**Status:** Akzeptiert
**Datum:** 2026-10-19
**Kontext:** [Implementierungsplan](implementierungsplan.md)

## Entscheidung

Die drei Generatoren (`generate_pflanzen.py`, `generate_anbau.py`,
`generate_beetplan2024.py`) bleiben **Quelle der Wahrheit** für ihre jeweils
generierten Daten. Der Pod ist der **Runtime-Speicher** für die laufende
Planung (Pflanzplan, Fruchtfolge, neue Pflanzungen).

### Datenklassen

| Datenklasse | Quelle | Schreibpfad |
|---|---|---|
| Pflanzenkatalog | Excel (`Pflanzenanzucht_mit_Makro.xlsm`) + `generate_pflanzen.py` | Generator → lokale Datei → **Sync-Skript** → Pod |
| Anbau-Journal | Excel-Kalender + `generate_anbau.py` | Generator → lokale Datei → **Sync-Skript** → Pod |
| Beetplan 2024 | PPTM + `generate_beetplan2024.py` | Generator → lokale Datei → **Sync-Skript** → Pod |
| Beete-Struktur | Manuell (Google-Maps-Schätzung) | Manuell/Editor → Sync-Skript → Pod |
| **Neue Pflanzungen** (Planung) | Viewer (Phase B) | Browser/Gateway → **direkt in den Pod** |

### Sync-Skript (`sync_to_pod.py`)

Ein kleines Skript (Python, `requests`/`solid-client`-ähnlich) spiegelt die
lokalen Quell-Dateien in den Pod:

1. Lädt alle Quell-Dateien aus ADR-0003.
2. `PUT` je Datei nach `https://lasse.solidcommunity.net/garten/<name>.ttl`
   mit `Content-Type: text/turtle` und Gateway-Token.
3. Erst danach kann der Viewer die neue Pflanzung posten (Schreibpfad getrennt).

## Alternativen

| Ansatz | Bewertung |
|---|---|
| **Generatoren + Sync-Skript** ✅ | Getrennte Datenklassen, kein Konflikt zwischen Generator und Browser-Schreibpfad. |
| Generatoren schreiben direkt in den Pod | Verzichtet auf die lokale Datei als Backup/History (git). |
| Excel → direkt in den Pod | Verlust der lokalen Versionierung (git history), keine Überprüfbarkeit der Generierung. |

## Konsequenzen

**Positiv:**
- Git bleibt Versionsgeschichte für die generierten Dateien (lokal).
- Generatoren können ohne Pod (offline) laufen.
- Klar getrennte Verantwortung: "Excel → Generatoren → Sync" ist ein
  statischer Import-Pfad, "Viewer → Gateway → Pod" ist der dynamische
  Planungs-Pfad.

**Negativ / zu beachten:**
- Nach jedem Generator-Lauf muss der Sync laufen (kleines Shell-Skript oder
  `make`-Target).
- Lokale Dateien sind ab Stufe 2 nur noch Import-Quelle — wer sie ändert,
  ohne zu syncen, sieht die Änderung nicht im Viewer.

## Verwandt

- [ADR-0003](0003-uri-schema-lieferplan.md): Datei-Mapping
- [ADR-0002](0002-architektur-stufen.md): Stufenmodell
