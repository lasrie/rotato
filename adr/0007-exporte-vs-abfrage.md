# ADR-0007: Exporte behalten, schrittweise durch SPARQL-Abfrage ersetzen

**Status:** Akzeptiert
**Datum:** 2026-10-19
**Kontext:** [Implementierungsplan](implementierungsplan.md)

## Entscheidung

Die beiden Export-Skripte (`export_garten91_plan.py`, `export_fruchtfolge.py`)
bleiben in Stufe 1 und werden nach jedem Schreiben automatisch neu generiert
(bereits implementiert). In Stufe 2 werden sie schrittweise durch direkte
**SPARQL-Abfragen im Browser** (Comunica) ersetzt — zuerst für den
Fruchtfolge-Viewer, danach für den Pflanzplan.

### Übergangsplan

| Daten | Stufe 1 | Stufe 2 |
|---|---|---|
| Pflanzplan-Daten | `export_garten91_plan.py` → `viz/garten91-data.js` | Comunica-SPARQL direkt gegen die Pod-Ressourcen; Export bleibt als Fallback (offline, Dev) |
| Fruchtfolge-Matrix | `export_fruchtfolge.py` → `viz/fruchtfolge-data.js` | Comunica-SPARQL gegen `/garten/beete.ttl` + `planungen/` |
| SHACL-Formen | lokal (pyshacl) | vom Pod geladen (`shapes.ttl`, `layout-shapes.ttl`) |

## Alternativen

| Ansatz | Bewertung |
|---|---|
| **Exporte zuerst behalten, dann ersetzen** ✅ | Risikolos, Viewer läuft weiter, schrittweise Ersetzung pro View. |
| Sofort alles auf SPARQL im Browser | Doppeltes Risiko (OIDC + SPARQL im Browser gleichzeitig), Debugging schwerer. |
| Exporte endgültig behalten | Verlust des dezentralencharakters: Der Browser müsste immer ein Gateway nutzen. |

## Konsequenzen

**Positiv:**
- Der laufende Viewer bleibt stabil während der Migration.
- SPARQL im Browser ist der "richtige" Weg für Linked Data — kein Zwischen-
  Format, direkte Graph-Abfragen.
- Offline-Fähigkeit bleibt (lokal generierte `*.js` als Fallback).

**Negativ / zu beachten:**
- Zwei Pfade zum selben Datenbestand in der Übergangszeit — das Export-JSON
  kann temporär hinter dem Pod herhängen (Sync-Latenz: Sekunden).
- Comunica im Browser ist initial langsam (WASM/Engine-Bootstrap, ~1–2 s);
  akzeptabel für diesen Datenumfang.

## Verwandt

- [ADR-0002](0002-architektur-stufen.md): Stufenmodell
- [ADR-0003](0003-uri-schema-lieferplan.md): Ressourcen im Pod
