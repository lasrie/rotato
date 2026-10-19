# ADR-0005: Authentifizierung — Gateway-Session zuerst, Solid-OIDC im Browser danach

**Status:** Akzeptiert
**Datum:** 2026-10-19
**Kontext:** [Implementierungsplan](implementierungsplan.md)

## Entscheidung

### Stufe 1: Gateway-Session (kein OIDC im Browser)

Der Browser authentifiziert sich **nicht** selbst — er spricht mit dem lokalen
Gateway, das sich gegenüber dem Pod authentifiziert:

- `server.py` startet einmalig einen kleinen lokalen **OIDC-Flow** (z. B. mit
  `@inrupt/solid-client-authn-node` oder `solid-client-authn-browser` im
  "Headless"-Fallback) und speichert das resultierende Access Token lokal
  (z. B. `~/.config/garten-planer/token.json`, **niemals im Repo**).
- Alternative (noch einfacher, für den Start): ein **manuell erzeugtes
  langlebiges Token** aus der NSS-Weboberfläche, gespeichert in `.env`
  (`.env` in `.gitignore`).
- Der Browser kommuniziert wie bisher mit `http://localhost:8765` — gleiche
  Endpunkte wie heute (`/rdf/data.ttl`, `/api/pflanzung`). Keine CORS- oder
  Token-Logik im Frontend.

### Stufe 2: Solid-OIDC im Browser

Der Viewer nutzt `@inrupt/solid-client-authn-browser`:

1. `login({ oidcIssuer: "https://solidcommunity.net" })` beim ersten Start.
2. Redirect-Flow (`handleIncomingRedirect()`), Session-Token im Browser.
3. `fetch` via `fetch`-Wrapper von `solid-client-authn-browser` gegen den Pod.

### Rechte (WAC) im Pod

- `lasse.solidcommunity.net` (Owner) hat **Control** auf `/garten/`.
- Die Freundin bekommt (sobald sie eine WebID hat) **Read + Write** auf
  `/garten/planungen/` und **Read** auf `/garten/` (Data-Browser-Ansicht).
- Für die Öffentlichkeit: keine Freigabe (Privatdaten).

## Alternativen

| Ansatz | Bewertung |
|---|---|
| **Gateway-Token (Stufe 1) → OIDC im Browser (Stufe 2)** ✅ | Startet sofort ohne Frontend-Änderung; Migration zum echten dezentralen Login follow-up. |
| Direkt OIDC im Browser | Frontend muss sofort Session-Handling, Redirect-URIs und Fallbacks (localhost-Redirect für dev) beherrschen — mehr Risiken am Anfang. |
| Pod ohne Auth (public write) | Unmöglich für NSS; Daten sind privat, Schreibrechte müssen kontrolliert bleiben. |

## Konsequenzen

**Positiv:**
- Kein Frontend-Rewrite in Stufe 1; bestehende `fetch`-Calls laufen weiter.
- Solid-OIDC (Stufe 2) ist Standard und portabel — sie funktioniert auch mit
  jedem anderen Pod-Provider (falls später Provider-Wechsel).

**Negativ / zu beachten:**
- Tokens sind sensibel: `.env` / Token-Datei **niemals committen** (`.gitignore`
  ergänzen). Bei Verlust: Token im NSS-Backend revoke-able.
- NSS-WebID-Delegation (Stufe 2) erfordert einmalig die Registrierung der
  Client-App beim Identity Provider — beim lokalen Dev-Server mit
  `http://localhost:8765` als Redirect-URI.

## Verwandt

- [ADR-0002](0002-architektur-stufen.md): Stufenmodell
- [ADR-0001](0001-pod-provider-solidcommunity.md): Provider
- [ADR-0003](0003-uri-schema-lieferplan.md): Container-Layout (WAC pro Container)
