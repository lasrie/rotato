# ADR-0002: Architektur in Stufen (Gateway-first → Frontend-Direct → SolidOS)

**Status:** Akzeptiert
**Datum:** 2026-10-19
**Kontext:** [Implementierungsplan](implementierungsplan.md)

## Entscheidung

Die Solid-Migration erfolgt in drei Stufen. Jede Stufe ist für sich
nutzbar und hinterlässt keine halbfertigen Reste in der vorherigen.

### Stufe 1: Gateway-first

```
Browser (viz/plan.html) ── fetch() ──► server.py (localhost:8765)
                                          │  GET  → Proxy → Pod (text/turtle)
                                          │  POST → Validierung (pyshacl)
                                          │         → PUT in den Pod
                                          └────► Pod (lasse.solidcommunity.net)
```

- `server.py` bleibt Schnittstelle und wird zum **Adapter**: GET liest aus dem
  Pod (cached), POST validiert lokal mit pyshacl und schreibt per `PUT` in den
  Pod.
- Auth macht der Server (siehe ADR-0005): einmaliges Browser-Login im Gateway,
  Token wird lokal gecacht.
- SHACL-Regeln bleiben serverseitig (Python/pyshacl) — der Code existiert schon
  und ist getestet.
- Der Viewer braucht keine Änderungen.

### Stufe 2: Frontend-Direct

```
Browser (plan.html, rdflib.js / Comunica / @inrupt/solid-client) ──► Pod
        GET  https://lasse.solidcommunity.net/garten/beete.ttl
        PUT  https://lasse.solidcommunity.net/garten/planungen/2026.ttl
```

- Der Browser authentifiziert sich selbst (Solid-OIDC via
  `@inrupt/solid-client-authn-browser`), kein Gateway mehr nötig.
- Validierung wandert in den Browser: `rdf-validate-shacl` mit denselben
  `.shacl.ttl`-Dateien.
- Der Viewer liest Turtle direkt (Comunica SPARQL im Browser) — die
  Export-JSONs werden optional.

### Stufe 3: SolidOS-Integration

- Die Daten sind über den **SolidOS Data-Browser** (mashlib) standardmäßig
  lesbar — einfach `https://lasse.solidcommunity.net/garten/` öffnen.
- Optional: eigene App auf Basis von `solid-ide`/`solid-client` oder
  Einbettung als SolidOS-Pane, sodass andere WebIDs denselben Gartenplan
  sehen können (Freundin mit WAC-Read/Write, siehe ADR-0005).

## Alternativen

| Ansatz | Bewertung |
|---|---|
| **Stufenweise Migration** ✅ | Risikokontrolle, jede Stufe lauffähig, keine Big-Bang-Umstellung. |
| Direkt Frontend-Direct | Erfordert OIDC im Browser + SHACL im Browser sofort — hoher Anfangsaufwand, schwerer zu debuggen. |
| SolidOS von Anfang an | Kopplung an ein Framework, dessen Pane-API noch instabil ist. Besser später als Add-on. |

## Konsequenzen

**Positiv:**
- Jede Stufe liefert Wert und kann gestoppt werden, ohne Baustellen zu
  hinterlassen.
- SHACL-Logik wird zweimal implementiert, aber die Regeln (`.shacl.ttl`) sind
  identisch — die eigentliche Invarianten bleiben überall gleich.

**Negativ / zu beachten:**
- In Stufe 1 bestehen zwei "Warheiten" nebeneinander: die lokalen `.ttl`-Dateien
  und der Pod. Der Pod ist ab Stufe 1 **die Wahrheit**, die lokalen Dateien
  werden in Stufe 2 überflüssig. Damit keine Drift entsteht: ab Stufe 1 schreibt
  nur der Gateway (bzw. ab Stufe 2 nur der Browser) in den Pod; die lokalen
  Dateien sind nur noch Import/Backup.
- Generatoren (ADR-0006) bleiben Ausnahme: sie schreiben weiterhin lokal und
  werden per Skript in den Pod gespiegelt.

## Verwandt

- [ADR-0005](0005-authentifizierung.md): Auth je Stufe
- [ADR-0006](0006-generatoren-als-quelle.md): Excel-Generatoren
