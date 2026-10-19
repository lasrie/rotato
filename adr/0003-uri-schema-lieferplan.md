# ADR-0003: URI-Schema & LDP-Container-Mapping im Pod

**Status:** Akzeptiert
**Datum:** 2026-10-19
**Kontext:** [Implementierungsplan](implementierungsplan.md)

## Entscheidung

Im Pod entsteht ein **LDP-Basic-Container** `/garten/`, der die 11 lokalen
`.ttl`-Dateien als einzelne Ressourcen spiegelt. Die URIs der Objekte
(Beete, Pflanzungen, Pflanzen) ändern sich **nicht** — sie bleiben bei
`https://example.org/garten-planer/...`, damit bestehende Links (Wikidata-
Verweise, Reihenabschnitte, Belegungen) nicht brechen.

### Container-Layout

```
https://lasse.solidcommunity.net/garten/                 (LDP Basic Container)
├── vokabular.ttl                    ← garten-vokabular.ttl + garten-layout-vokabular.ttl
├── ontologie.ttl                    ← garten-layout-ontology.ttl
├── shapes.ttl                       ← garten-shapes.ttl (Ontologie + SHACL)
├── layout-shapes.ttl                ← garten-layout.shacl.ttl
├── pflanzen.ttl                     ← pflanzen.ttl (55 Arten, 75 Sorten)
├── beete.ttl                        ← garten91-beete-real.ttl
├── beetplan-2024.ttl                ← garten91-beetplan-2024.ttl (63 Pflanzungen)
├── belegungen-2025.ttl              ← garten91-belegungen-real-2025.ttl (38 Pflanzungen)
├── planungen/                       ← LDP-Container für laufende Planungen
│   └── (neue Pflanzungen, eine Datei pro Jahres-POST-Batch oder eine Sammeldatei)
├── journal/                         ← LDP-Container
│   └── anbau-journal.ttl            ← anbau-journal.ttl (97 Ereignisse 2025)
└── linking.ttl                      ← garten91-linking.ttl (Zonen ↔ Beet)
```

### URI-Regeln

1. **Dokument-URIs** (Dateien im Pod): `https://lasse.solidcommunity.net/garten/<name>.ttl`
2. **Objekt-URIs** (Beete, Pflanzungen, …): bleiben
   `https://example.org/garten-planer/<pfad>#<slug>`.
   Begründung: Diese URIs sind in 3 Jahren Daten bereits verlinkt (Wikidata,
   Journal, Beete-Dateien). Ein Umbenennen würde alle `garten:aufBeet`-Bezüge
   brechen (bekannte Falle: URI-Mismatch, siehe `projekt#stolperfallen:uriMismatch`).
3. **Kein Trailing-Slash-Problem:** Objekt-URIs mit Fragment (`#slug`) sind
   von Dokument-URIs getrennt; keine `Namespace(.../real/') + .tomatenbeet`-
   Konkatenation (bekannte Falle: `namespaceFalle`).

### Merge-Strategie

Der Browser/Gateway braucht für die Abfragen kein physisches Merge-Dokument
mehr (Comunica fragt mehrere Dateien via SPARQL ab). Für Stufe 1 liefert
`GET /rdf/data.ttl` weiterhin das Merge aller Dateien — jetzt aus dem Pod
statt aus dem Dateisystem.

## Alternativen

| Ansatz | Bewertung |
|---|---|
| **Objekt-URIs unverändert lassen** ✅ | Keine Datenmigration, Wikidata-Links bleiben, Risiko = 0. |
| Objekt-URIs auf den Pod umziehen (`https://lasse.solidcommunity.net/garten/beete#tomatenbeet`) | Schöner (Daten "wohnen im Pod"), aber alle bestehenden Tripel müssten umgeschrieben werden — zu hohes Risiko. |
| Alles in eine große Datei im Pod | Einfach, aber kein LDP-Container-Modell, kein feingranulares WAC (Rechte pro Datei). |

## Konsequenzen

**Positiv:**
- Migration ist rein mechanisch (Dateien hochladen), keine URI-Rewrites.
- Feingranulares WAC später möglich (z. B. `planungen/` für die Freundin
  freigeben, ohne die anderen Daten offenzulegen).

**Negativ / zu beachten:**
- Die Objekt-URIs zeigen nicht auf den Pod — wer die Beete auflösen will
  (z. B. über den Data-Browser browsen), muss die Container-Struktur kennen.
  Optional später: `owl:sameAs`/`rdfs:seeAlso`-Verweise von Objekt-URIs auf
  die Pod-Ressourcen.

## Verwandt

- [ADR-0004](0004-shacl-validierung-ort.md): Wo wird geprüft
- [ADR-0005](0005-authentifizierung.md): Rechte (WAC) je Container

## Erweiterungsoption: Echte Namespace-Basis (offen, bewusst zurückgestellt)

Die Objekt-URIs nutzen `example.org` — laut RFC 2606 reserviert für Beispiele,
nicht auflösbar. Für ein rein privates Dataset ist das vertretbar; sobald die
Ontologie/Vokabulare geteilt werden sollen (größeres Ziel des Projekts), braucht
es eine echte Basis. Kandidaten:

| Option | URI-Form | Bewertung |
|---|---|---|
| Pod-URI | `https://lasse.solidcommunity.net/garten/ontology#…` | auflösbar, aber Provider-Lock-in |
| GitHub Pages | `https://lasrie.github.io/garten-planer/ontology#…` | kostenlos, provider-unabhängig, statisch servierbar |
| Eigene Domain | (wenn vorhanden) | die sauberste Lösung, 303-Redirects möglich |

Migration-Aufwand sobald entschieden: Rewrite-Skript über alle .ttl/Generatoren/
Shapes (~1–2 h inkl. Re-Sync und Validierung). **Status: bewusst offen** (Entscheid
19.10.2026: erstmal bei example.org bleiben).
