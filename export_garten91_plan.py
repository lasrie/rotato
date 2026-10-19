from __future__ import annotations

import json
from pathlib import Path
from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import DCTERMS, RDF, RDFS, SKOS

ROOT = Path(__file__).parent
FILES = [
    ROOT / "beetplan-2025-extrahiert.ttl",
    ROOT / "garten91-linking.ttl",
    ROOT / "pflanzen.ttl",
    ROOT / "garten-vokabular.ttl",
]
OUT = ROOT / "viz" / "garten91-data.js"

GARTEN = Namespace("https://example.org/garten-planer/ontology#")
PLAN = Namespace("https://example.org/garten-planer/plan#")
DATA = Namespace("https://example.org/garten-planer/data/garten91/#")
EXTRACT = "https://example.org/garten-planer/extract/beetplan-2025/#"


def lit(graph: Graph, subject: URIRef, predicate: URIRef):
    for obj in graph.objects(subject, predicate):
        return obj
    return None


def lit_int(graph: Graph, subject: URIRef, predicate: URIRef):
    value = lit(graph, subject, predicate)
    return int(value) if value is not None else None


def lit_str(graph: Graph, subject: URIRef, predicate: URIRef):
    value = lit(graph, subject, predicate)
    return str(value) if value is not None else None


def plant_label(graph: Graph, plant: URIRef):
    labels = list(graph.objects(plant, SKOS.prefLabel))
    if not labels:
        return plant.split("#")[-1]
    for label in labels:
        if getattr(label, "language", None) == "de":
            return str(label)
    return str(labels[0])


def main():
    graph = Graph()
    for file in FILES:
        graph.parse(file)

    garden = DATA.garten91
    zones = []
    for zone in graph.objects(garden, GARTEN.hatBeet):
        zone_data = {
            "id": str(zone),
            "slug": str(zone).split("#")[-1],
            "title": lit_str(graph, zone, DCTERMS.title),
            "x": lit_int(graph, zone, PLAN.x),
            "y": lit_int(graph, zone, PLAN.y),
            "width": lit_int(graph, zone, PLAN.width),
            "height": lit_int(graph, zone, PLAN.height),
            "entries": [],
        }

        for entry in graph.subjects(PLAN.inZone, zone):
            plant = lit(graph, entry, GARTEN.pflanzt)
            display_name = lit_str(graph, entry, PLAN.displayName)
            family = lit(graph, plant, GARTEN.fruchtFamilie) if plant else None
            family_label = None
            if family:
                for label in graph.objects(family, SKOS.prefLabel):
                    if getattr(label, "language", None) == "de":
                        family_label = str(label)
                        break
                if family_label is None:
                    family_label = str(family).split("#")[-1]

            zone_data["entries"].append(
                {
                    "id": str(entry),
                    "label": plant_label(graph, plant) if plant else display_name,
                    "displayName": display_name,
                    "plant": str(plant) if plant else None,
                    "family": str(family) if family else None,
                    "familyLabel": family_label,
                    "fromMonth": lit_int(graph, entry, PLAN.fromMonth),
                    "toMonth": lit_int(graph, entry, PLAN.toMonth),
                    "confidence": lit_str(graph, entry, PLAN.confidence),
                    "sourceText": lit_str(graph, entry, PLAN.sourceText),
                    "comment": lit_str(graph, entry, RDFS.comment),
                    "countHint": lit_int(graph, entry, PLAN.countHint),
                }
            )

        zone_data["entries"].sort(
            key=lambda item: (
                item["fromMonth"] if item["fromMonth"] is not None else 0,
                item["toMonth"] if item["toMonth"] is not None else 99,
                item["label"] or "",
            )
        )
        zones.append(zone_data)

    zones.sort(key=lambda z: ((z["y"] or 10**9), (z["x"] or 10**9), z["title"] or ""))

    data = {
        "title": "Garten 91 – Pflanzplan 2025",
        "garden": str(garden),
        "sourceFiles": [file.name for file in FILES],
        "months": [
            None,
            "Januar",
            "Februar",
            "März",
            "April",
            "Mai",
            "Juni",
            "Juli",
            "August",
            "September",
            "Oktober",
            "November",
            "Dezember",
        ],
        "zones": zones,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.GARTEN91_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
