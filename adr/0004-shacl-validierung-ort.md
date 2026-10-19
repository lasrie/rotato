# ADR-0004: SHACL-Validierung — Gateway jetzt, Browser später

**Status:** Akzeptiert
**Datum:** 2026-10-19
**Kontext:** [Implementierungsplan](implementierungsplan.md)

## Entscheidung

Die SHACL-Validierung bleibt in **Stufe 1 serverseitig** (pyshacl in
`server.py`, bereits implementiert und getestet) und wandert in **Stufe 2**
in den Browser (`rdf-validate-shacl` mit denselben `.shacl.ttl`-Dateien).

In beiden Stufen gilt:

1. **Validieren vor dem Schreiben.** Erst wenn der neue Graph (bestehende
   Daten + neue Pflanzung) gegen `garten-shapes.ttl` und
   `garten-layout.shacl.ttl` konform ist, wird per `PUT` in den Pod
   geschrieben. Kein Schreiben invalider Daten in den Pod.
2. **Rollback bei Fehler** (Stufe 1): Der Planungspuffer wird nur angehängt,
   wenn die Validierung `Conforms: True` liefert; andernfalls wird der
   zuletzt angehängte Block entfernt (bestehende Logik in `server.py`).
3. **Pot-Pourri vermeiden:** Der Pod enthält niemals invalide Daten. Wer
   Daten manipulieren will, geht immer durch den validierenden Schreibpfad.

### Validierungs-Kontext

- **Stufe 1 (Gateway):** pyshacl lädt `garten-shapes.ttl` +
  `garten-layout.shacl.ttl` lokal, validiert den Merge aller Pod-Ressourcen
  mit der neuen Pflanzung. Tempfile wie gehabt.
- **Stufe 2 (Browser):** `@inrupt/solid-client`/`rdf-validate-shacl` im
  Browser mit denselben Shape-Dateien, die vom Pod geladen werden
  (`shapes.ttl` + `layout-shapes.ttl` sind selbst Pod-Ressourcen).

## Alternativen

| Ansatz | Bewertung |
|---|---|
| **Validierung im Schreibpfad (Gateway → Browser)** ✅ | Konsistent, ein Regelwerk, keine invalide Daten im Pod. |
| Pod-seitige Validierung (z. B. via ACP/WAC-Regeln oder Server-Hooks) | NSS bietet keine SHACL-Hooks; wäre Eigenbetrieb nötig. |
| Keine Validierung im Pod | Gefahr von Drift und invalide Daten, wenn mehrere Schreibpfade existieren. |

## Konsequenzen

**Positiv:**
- Ein Regelwerk (`*.shacl.ttl`) läuft in beiden Stufen identisch — keine
  Semantik-Drift zwischen Gateway und Browser.
- Browser-Validierung (Stufe 2) macht die App voll dezentral: kein vertrauens-
  würdiger Zwischenserver nötig.

**Negativ / zu beachten:**
- Doppelte Implementierung (Python + JS). Da beide dasselbe Shape-File
  lesen, ist das Risiko gering; die Regeln sind nicht dupliziert, nur die
  Engines.
- pyshacl ist bei großen Graphen langsam (Sekunden) — für diesen Datenumfang
  (~140 Pflanzungen, 55 Arten) unkritisch.

## Verwandt

- [ADR-0002](0002-architektur-stufen.md): Stufenmodell
- [ADR-0005](0005-authentifizierung.md): Schreibrechte im Pod
