# ADR-0001: Pod-Provider solidcommunity.net (NSS)

**Status:** Akzeptiert
**Datum:** 2026-10-19
**Kontext:** [Implementierungsplan](implementierungsplan.md)

## Entscheidung

Wir verwenden **solidcommunity.net** (Node Solid Server, NSS) als Pod-Provider
für den Garten-Planer. Der Pod wird unter der WebID
`https://lasse.solidcommunity.net/profile/card#me` geführt, die Garten-Daten
landen unter `https://lasse.solidcommunity.net/garten/`.

## Alternativen

| Provider | Bewertung |
|---|---|
| **solidcommunity.net (NSS)** ✅ | Klassischer, frei betriebener Reference-Server. Einfachste Auth (Solid-OIDC mit WebID-Delegation), beste Doku im Solid-Ökosystem, ohne kommerzielle Lizenz. |
| Inrupt PodSpaces (ESS) | Kommerziell, stärker auf Unternehmen ausgelegt; Auth-Details (dynamic client registration, UMA) aufwändiger, für diesen Use-Case unnötig komplex. |
| Eigenes Hosting (CSS/NSS self-hosted) | Später sinnvoll für Autonomie, aber jetzt Overhead (Server, TLS, Domain). |
| Andere Community-Provider (z.B. trinpod, pod-server.js lokal) | pod-server.js lokal für Tests interessant, aber kein echter Ersatz für einen persistenten Pod. |

## Konsequenzen

**Positiv:**
- Schnellster Weg zu einem funktionierenden, dauerhaft erreichbaren Pod.
- NSS versteht Turtle nativ; `PUT`/`PATCH` (SPARQL-Update) und `GET` mit
  `Accept: text/turtle` funktionieren out of the box.
- WebID + Profile existieren sofort — wichtig für spätere WAC-Freigaben an
  die Freundin.

**Negativ / zu beachten:**
- NSS ist ein Community-Dienst ohne SLA — für private Garten-Daten ok, für
  kritische Daten nicht. Sollte der Pod eines Tages wegziehen, bleiben alle
  URIs in den Daten stabil (siehe ADR-0003), nur die Pod-Basis-URL ändert sich.
- NSS erlaubt standardmäßig keine SPARQL-`UPDATE`-Anfragen gegen Ressourcen
  ohne entsprechende Freigabe; wir nutzen stattdessen `PUT` auf ganze
  Ressourcen (read-modify-write, siehe ADR-0004).

## Verwandt

- [ADR-0003](0003-uri-schema-lieferplan.md): URI-Schema im Pod
- [ADR-0005](0005-authentifizierung.md): Auth-Flows
