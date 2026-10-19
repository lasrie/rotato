#!/usr/bin/env python3
"""Holt die Taxonomie-Kette (P171) jeder Art aus Wikidata, findet die botanische
Familie und schlägt sie mit unseren Fruchtfamilien-Konzepten zusammen.

Ergebnis: wikidata-matching.ttl wird erweitert um
  - garten:wikidataFamilie (wd:Q-ID der botanischen Familie)
  - garten:wikidataFamilieName (deutsches Label der Familie)

Aufruf:  python3 verify_familien.py
"""
import json
import re
import time

import requests
from rdflib import Graph, Namespace, URIRef, RDF, SKOS

WDQS = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "GartenPlaner/0.1 (linked-data-garten; kontakt: beispiel@example.org)"}

GV = Namespace("https://example.org/garten-planer/vokabular#")
G = Namespace("https://example.org/garten-planer/ontology#")
IN_SCHEME = URIRef("http://www.w3.org/2004/02/skos/core#inScheme")
WIKIDATA_ID = G.wikidataId

# Erwartete deutsche Familiennamen (deutsche Wikipedia/Botanik-Schreibweisen)
ERWARTETE_FAMILIE = {
    "ff_Borretschgewaechse": ["Borretschgewächse", "Raublattgewächse", "Boraginaceae"],
    "ff_Doldenbluetler": ["Doldenblütler", "Apiaceae", "Doldenblütler (Apiaceae)"],
    "ff_Fuchsschwanzgewaechse": ["Fuchsschwanzgewächse", "Amaranthaceae", "Gänsefußgewächse", "Chenopodiaceae"],
    "ff_Hahnenfussgewaechse": ["Hahnenfußgewächse", "Ranunculaceae"],
    "ff_Huelsenfruechtler": ["Hülsenfrüchtler", "Hülsenfrüchtler (Fabaceae)", "Fabaceae", "Schmetterlingsblütler", "Fabaceae (Hülsenfrüchtler)"],
    "ff_Kapuzinerkressengewaechse": ["Kapuzinerkressengewächse", "Tropaeolaceae"],
    "ff_Knoeterichgewaechse": ["Knöterichgewächse", "Polygonaceae"],
    "ff_Korbbluetler": ["Korbblütler", "Asteraceae", "Korbblütler (Asteraceae)", "Korbblütler (Compositae)"],
    "ff_Kreuzbluetler": ["Kreuzblütler", "Kreuzblütengewächse", "Brassicaceae", "Kreuzblütler (Brassicaceae)", "Kreuzblütler (Cruciferae)"],
    "ff_Kuerbisgewaechse": ["Kürbisgewächse", "Cucurbitaceae"],
    "ff_Leingewaechse": ["Leingewächse", "Linaceae"],
    "ff_Lippenbluetler": ["Lippenblütler", "Lamiaceae"],
    "ff_Malvengewaechse": ["Malvengewächse", "Malvaceae"],
    "ff_Nachtschatten": ["Nachtschattengewächse", "Solanaceae"],
    "ff_Rosengewaechse": ["Rosengewächse", "Rosaceae"],
    "ff_Suessgraeser": ["Süßgräser", "Poaceae", "Süßgräser (Poaceae)", "Süßgräser (Gramineae)"],
    "ff_Zwiebelgewaechse": ["Zwiebelgewächse", "Amaryllidaceae", "Alliaceae"],
    # Allium-Arten stehen in Wikidata teils unter Amaryllidaceae, teils Alliaceae
}

# Manuelle Familien-Zuordnung für Taxa ohne P171-Kette (z.B. Kultivargruppen)
FAMILIE_MANUELL = {
    # Zucchini gehört zu Cucurbita pepo -> Kürbisgewächse (Q8314)
    "Zucchini": ("Q8314", "Kürbisgewächse"),
}

# Allium-Sonderfall: Wikidata ordnet Allium in Amaryllidaceae ein (APG IV);
# traditionell "Alliaceae". Beide akzeptieren wir für ff_Zwiebelgewaechse.


def sparql(query: str) -> list[dict]:
    r = requests.get(WDQS, params={"query": query, "format": "json"},
                     headers=UA, timeout=90)
    r.raise_for_status()
    return r.json()["results"]["bindings"]


def familie_kette(qid: str) -> list[dict]:
    """Alle P171-Vorfahren bis zur Familie (Rang Q10538), max 12 Stufen."""
    query = f"""
    SELECT ?ancestor ?ancestorLabel ?rank ?rankLabel WHERE {{
      wd:{qid} p:P171 {{ ?st ps:P171 ?ancestor ; wikibase:rank ?rk ; a wikibase:BestRank }} .
      ?ancestor wdt:P105 ?rank ; rdfs:label ?ancestorLabel .
      ?rank rdfs:label ?rankLabel . FILTER(LANG(?rankLabel) = "en")
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }}
    }}"""
    for _ in range(3):
        try:
            return sparql(query)
    # noqa
        except Exception:
            time.sleep(5)
    return []


def main():
    # 1. Matching-Datei laden: Art -> QID
    m = Graph()
    m.parse("wikidata-matching.ttl")

    arten = {}
    for s, qid in m.subject_objects(WIKIDATA_ID):
        arturi = str(s)
        artname = arturi.split("#")[-1]
        arten[artname] = str(qid).split("/")[-1]

    print(f"{len(arten)} Arten mit Wikidata-QID")

    # 2. Familien-Ketten per SPARQL (ein Batch-Query für alle)
    qids = list(arten.values())
    qid_liste = " ".join(f"wd:{q}" for q in qids)
    query = f"""
    SELECT ?taxon ?ancestor ?rankQid ?ancestorLabel WHERE {{
      VALUES ?taxon {{ {qid_liste} }}
      ?taxon wdt:P171+ ?ancestor .
      ?ancestor wdt:P105 ?rankQid .
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "de,en". }}
    }}"""
    rows = []
    for versuch in range(3):
        try:
            rows = sparql(query)
            break
        except Exception as e:
            print(f"  SPARQL-Versuch {versuch+1} fehlgeschlagen: {e}")
            time.sleep(10)
    print(f"{len(rows)} P171-Kanten geholt")

    # P105-Rang-QID für „Familie“ (verifiziert via wbgetentities)
    RANK_FAMILY = "Q35409"
    familie_qid = {}
    for row in rows:
        taxon = row["taxon"]["value"].split("/")[-1]
        rank_qid = row["rankQid"]["value"].split("/")[-1] if "rankQid" in row else None
        ancestor = row["ancestor"]["value"].split("/")[-1]
        label = row.get("ancestorLabel", {}).get("value", "")
        if rank_qid == RANK_FAMILY:
            familie_qid[taxon] = (ancestor, label)

    print(f"{len(familie_qid)} Arten mit Familien-QID ermittelt")

    # 3. Familien-Labels holen (Batch)
    fam_qids = sorted(set(q for q, _ in familie_qid.values()))
    fam_labels = {}
    if fam_qids:
        for i in range(0, len(fam_qids), 50):
            chunk = fam_qids[i:i+50]
            r = requests.get("https://www.wikidata.org/w/api.php", params={
                "action": "wbgetentities", "ids": "|".join(chunk),
                "props": "labels", "languages": "de|en", "format": "json"},
                headers=UA, timeout=60)
            r.raise_for_status()
            for qid, ent in r.json().get("entities", {}).items():
                lab = ent.get("labels", {}).get("de", {}).get("value") or ent.get("labels", {}).get("en", {}).get("value", "")
                fam_labels[qid] = lab
            time.sleep(0.5)

    # 4. Zuordnung Familie-QID -> unser ff_*-Konzept über deutsche Namen
    fam_qid_zu_ff = {}
    unklar = set()
    for artname, qid in arten.items():
        if artname in FAMILIE_MANUELL:
            fam, famlabel = FAMILIE_MANUELL[artname]
        else:
            fam, famlabel = familie_qid.get(qid, (None, None))
        if not fam:
            unklar.add(artname)
            continue
        famlabel = fam_labels.get(fam, "")
        ff = None
        for ff_key, namen in ERWARTETE_FAMILIE.items():
            if famlabel in namen:
                ff = ff_key
                break
        if not ff:
            unklar.add(artname)
        else:
            fam_qid_zu_ff.setdefault((fam, famlabel), set()).add(ff)

    # 5. Bericht
    print("\n=== Bericht: Wikidata-Familie vs. unser Vokabular ===")
    for artname, qid in sorted(arten.items()):
        if artname in FAMILIE_MANUELL:
            fam, famlabel = FAMILIE_MANUELL[artname]
        else:
            fam, famlabel = familie_qid.get(qid, (None, None))
        if not fam:
            print(f"{artname:24s} QID={qid:10s} -> keine Familie gefunden")
            continue
        print(f"{artname:24s} QID={qid:10s} -> {famlabel} ({fam})")

    # 6. Erweiterte matching.ttl schreiben
    out = [
        "# Wikidata-Matching für die Garten-Arten",
        "# Generiert von match_wikidata.py + verify_familien.py – NICHT manuell editieren.",
        "",
        "@prefix garten: <https://example.org/garten-planer/ontology#> .",
        "@prefix wd:    <http://www.wikidata.org/entity/> .",
        "@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .",
        "@base    <https://example.org/garten-planer/pflanzen/> .",
        "",
    ]
    for artname, qid in sorted(arten.items()):
        if artname in FAMILIE_MANUELL:
            fam, famlabel = FAMILIE_MANUELL[artname]
        else:
            fam, famlabel = familie_qid.get(qid, (None, None))
        out.append(f"<#{artname}> garten:wikidataId wd:{qid} ;")
        if fam:
            out.append(f'    garten:wikidataFamilie wd:{fam} ;')
            if famlabel:
                out.append(f'    garten:wikidataFamilieName "{famlabel}"@de .')
            else:
                out.append("    .")
        else:
            out.append("    .")
        out.append("")

    with open("wikidata-matching.ttl", "w") as f:
        f.write("\n".join(out) + "\n")
    print(f"\nwikidata-matching.ttl aktualisiert")
    if unklar:
        print("Zu prüfende Fälle:", ", ".join(sorted(unklar)))


if __name__ == "__main__":
    main()
