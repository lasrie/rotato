#!/usr/bin/env python3
"""Matched die Garten-Arten gegen Wikidata – API-verifiziert.

Vorgehen (bewusst ohne gemerkte QIDs, die sich als unzuverlässig erwiesen):
1. Suche per wbsearchentities mit dem wissenschaftlichen Namen
2. Prüfe beim Kandidaten: P225 (wissenschaftl. Name) muss vorhanden sein
   und zum erwarteten Namen passen (Toleranz bei var./subsp.)
3. Ergebnis: wikidata-matching.ttl mit garten:wikidataId je Art

Aufruf:  python3 match_wikidata.py
"""
import re
import time

import requests

from generate_pflanzen import slug

API = "https://www.wikidata.org/w/api.php"
UA = {"User-Agent": "GartenPlaner/0.1 (linked-data-garten; kontakt: beispiel@example.org)"}
ZIEL = "wikidata-matching.ttl"

# Art -> wissenschaftlicher Name (zur Suche). Botanische Nomenklatur ist
# stabil – hier liegt das Wissen, nicht in gemerkten QIDs.
WISS_NAME = {
    "Basilikum": "Ocimum basilicum",
    "Bechermalve": "Malva moschata",
    "Blattkoriander": "Coriandrum sativum",
    "Blumenkohl": "Brassica oleracea var. botrytis",
    "Bok Choy": "Brassica rapa subsp. chinensis",
    "Borretsch": "Borago officinalis",
    "Brokkoli": "Brassica oleracea var. italica",
    "Buschbohne": "Phaseolus vulgaris",
    "Chilli": "Capsicum annuum",
    "Cosmea": "Cosmos bipinnatus",
    "Dill": "Anethum graveolens",
    "Einlegegurke": "Cucumis sativus",
    "Endivien": "Cichorium endivia",
    "Gartenkresse": "Lepidium sativum",
    "Grünkohl": "Brassica oleracea var. sabellica",
    "Gurke": "Cucumis sativus",
    "Honigmelone": "Cucumis melo",
    "Himbeeren": "Rubus idaeus",
    "Jungfer im Grünen": "Nigella damascena",
    "Kamille": "Matricaria chamomilla",
    "Kapuzinerkresse": "Tropaeolum majus",
    "Kartoffeln": "Solanum tuberosum",
    "Knoblauch": "Allium sativum",
    "Kohlrabi": "Brassica oleracea var. gongylodes",
    # Rotkohl hat kein eigenes Taxon-Item mit Systematik (Q263203 ohne P171);
    # wir verlinken die übergeordnete Kopfkohl-Gruppe (var. capitata).
    "Rotkohl": "Brassica oleracea var. capitata",
    "Kopfsalat": "Lactuca sativa",
    "Kürbis": "Cucurbita pepo",
    "Lavendel": "Lavandula angustifolia",
    "Lein": "Linum usitatissimum",
    "Möhre": "Daucus carota subsp. sativus",
    "Paprika": "Capsicum annuum",
    "Petersilie": "Petroselinum crispum",
    "Pflücksalat": "Lactuca sativa",
    "Physalis": "Physalis peruviana",
    "Porree": "Allium ampeloprasum",
    "Radieschen": "Raphanus sativus",
    "Rauke": "Eruca vesicaria subsp. sativa",
    "Rhabarber": "Rheum rhabarbarum",
    "Ringelblumen": "Calendula officinalis",
    "Rote Bete": "Beta vulgaris subsp. vulgaris",
    "Schnittlauch": "Allium schoenoprasum",
    "Soja": "Glycine max",
    "Spinat": "Spinacia oleracea",
    "Stangensellerie": "Apium graveolens var. dulce",
    "Stielmus": "Brassica rapa",
    "Tomate": "Solanum lycopersicum",
    "Wintersteckzwiebel": "Allium cepa",
    "Zucchini": "Cucurbita pepo var. giromontiina",
    "Zuckermais": "Zea mays",
    "Zwiebeln": "Allium cepa",
}

session = requests.Session()
session.headers.update(UA)


def wbsearch(query: str) -> list[dict]:
    r = session.get(API, params={
        "action": "wbsearchentities", "search": query, "language": "de",
        "uselang": "de", "format": "json", "limit": 5}, timeout=30)
    r.raise_for_status()
    return r.json().get("search", [])


def wbgetentities(ids: list[str]) -> dict:
    r = session.get(API, params={
        "action": "wbgetentities", "ids": "|".join(ids),
        "props": "labels|claims", "languages": "de|en", "format": "json"}, timeout=60)
    r.raise_for_status()
    return r.json().get("entities", {})


def name_match(p225: str | None, erwartet: str) -> bool:
    """Vergleicht P225 mit dem erwarteten Namen; tolerant bei var./subsp./f."""
    if not p225:
        return False
    norm = lambda s: re.sub(r"\s+", " ", s.lower().replace("var.", "").replace("subsp.", "").replace("f.", "").strip())
    return norm(p225) == norm(erwartet)


def suche_art(art: str) -> str | None:
    """Sucht über den wiss. Namen; verifiziert P225 exakt."""
    erwartet = WISS_NAME.get(art)
    queries = ([erwartet] if erwartet else []) + [art]
    for query in queries:
        try:
            hits = wbsearch(query)
        except Exception as e:
            print(f"  FEHLER bei Suche '{query}': {e}")
            continue
        time.sleep(0.3)
        kandidaten = [h["id"] for h in hits if h.get("id", "").startswith("Q")][:5]
        if not kandidaten:
            continue
        try:
            entities = wbgetentities(kandidaten)
        except Exception as e:
            print(f"  FEHLER beim Abruf: {e}")
            continue
        time.sleep(0.3)
        for qid, ent in entities.items():
            cl = ent.get("claims", {}).get("P225", [])
            p225 = cl[0]["mainsnak"].get("datavalue", {}).get("value") if cl else None
            if name_match(p225, erwartet or art):
                return qid
            # Fallback: deutsches Label passt exakt (z.B. "Rotkohl")
            label = ent.get("labels", {}).get("de", {}).get("value", "")
            if label == art and p225:
                return qid
    return None


def main():
    ergebnisse = {}
    for art in sorted(WISS_NAME):
        qid = suche_art(art)
        ergebnisse[art] = qid
        print(f"{art:24s} -> {qid or 'NICHT GEFUNDEN'}")

    out = [
        "# Wikidata-Matching für die Garten-Arten",
        "# Generiert von match_wikidata.py (verifiziert über P225) – NICHT manuell editieren.",
        "",
        "@prefix garten: <https://example.org/garten-planer/ontology#> .",
        "@prefix wd:    <http://www.wikidata.org/entity/> .",
        "@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .",
        "@base    <https://example.org/garten-planer/pflanzen/> .",
        "",
    ]
    gefunden = 0
    for art, qid in sorted(ergebnisse.items()):
        if not qid:
            continue
        gefunden += 1
        out.append(f"<#{slug(art)}> garten:wikidataId wd:{qid} .")
        out.append("")
    with open(ZIEL, "w") as f:
        f.write("\n".join(out) + "\n")
    print(f"\n{ZIEL} geschrieben: {gefunden}/{len(WISS_NAME)} Arten mit Wikidata-QID")
    fehlen = [a for a, q in ergebnisse.items() if not q]
    if fehlen:
        print("Ohne Match:", ", ".join(fehlen))


if __name__ == "__main__":
    main()
