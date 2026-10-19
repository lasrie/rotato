from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import DCTERMS, RDF, RDFS, SKOS

ROOT = Path(__file__).parent
FILES = [
    ROOT / "garten-vokabular.ttl",
    ROOT / "garten-layout-vokabular.ttl",
    ROOT / "pflanzen.ttl",
    ROOT / "beetplan-2025-extrahiert.ttl",
    ROOT / "garten91-linking.ttl",
    ROOT / "garten-layout-ontology.ttl",
    ROOT / "garten91-linkes-hohes-beet-2025.ttl",
]
OUT = ROOT / "viz" / "linkes-hohes-beet-data.js"

GARTEN = Namespace("https://example.org/garten-planer/ontology#")
PLAN = Namespace("https://example.org/garten-planer/plan#")
XSD = Namespace("http://www.w3.org/2001/XMLSchema#")
BEET = URIRef("https://example.org/garten-planer/extract/beetplan-2025/#zone-left-vertical")


def first(graph: Graph, subject: URIRef, predicate: URIRef):
    for obj in graph.objects(subject, predicate):
        return obj
    return None


def as_str(graph: Graph, subject: URIRef, predicate: URIRef):
    value = first(graph, subject, predicate)
    return str(value) if value is not None else None


def as_float(graph: Graph, subject: URIRef, predicate: URIRef):
    value = first(graph, subject, predicate)
    return float(value) if value is not None else None


def as_int(graph: Graph, subject: URIRef, predicate: URIRef):
    value = first(graph, subject, predicate)
    return int(value) if value is not None else None


def plant_label(graph: Graph, plant: URIRef | None):
    if plant is None:
        return None
    labels = list(graph.objects(plant, SKOS.prefLabel))
    for label in labels:
        if getattr(label, "language", None) == "de":
            return str(label)
    return str(labels[0]) if labels else str(plant).split("#")[-1]


MONTHS = [
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
]


def month_num(value: str | None):
    if not value:
        return None
    try:
        return int(value.split("-")[1])
    except Exception:
        return None


def main():
    g = Graph()
    for file in FILES:
        g.parse(file)

    rows = []
    for row in g.objects(BEET, GARTEN.hatReihe):
        row_data = {
            "id": str(row),
            "slug": str(row).split("#")[-1],
            "title": as_str(g, row, DCTERMS.title),
            "comment": as_str(g, row, RDFS.comment),
            "number": as_int(g, row, GARTEN.reihenNummer),
            "length": as_float(g, row, GARTEN.nutzlaenge),
            "orientation": as_str(g, row, GARTEN.reihenAusrichtung),
            "sections": [],
        }

        for section in g.objects(row, GARTEN.hatAbschnitt):
            section_data = {
                "id": str(section),
                "slug": str(section).split("#")[-1],
                "title": as_str(g, section, DCTERMS.title),
                "comment": as_str(g, section, RDFS.comment),
                "start": as_float(g, section, GARTEN.abschnittStart),
                "end": as_float(g, section, GARTEN.abschnittEnde),
                "plantings": [],
            }

            for planting in g.objects(section, GARTEN.belegtMitPflanzung):
                plant = first(g, planting, GARTEN.pflanzt)
                family = first(g, plant, GARTEN.fruchtFamilie) if plant else None
                family_label = plant_label(g, family) if family else None
                if family:
                    family_label = None
                    for label in g.objects(family, SKOS.prefLabel):
                        if getattr(label, "language", None) == "de":
                            family_label = str(label)
                            break
                    if family_label is None:
                        family_label = str(family).split("#")[-1]

                start_month = month_num(as_str(g, planting, GARTEN.monatPflanzung))
                end_month = month_num(as_str(g, planting, GARTEN.monatErnte))
                section_data["plantings"].append(
                    {
                        "id": str(planting),
                        "title": as_str(g, planting, DCTERMS.title) or as_str(g, planting, RDFS.label),
                        "label": plant_label(g, plant) or str(planting).split("#")[-1],
                        "plant": str(plant) if plant else None,
                        "family": str(family) if family else None,
                        "familyLabel": family_label,
                        "startMonth": start_month,
                        "endMonth": end_month,
                    }
                )

            section_data["plantings"].sort(key=lambda p: (p["label"] or "", p["startMonth"] or 0))
            row_data["sections"].append(section_data)

        row_data["sections"].sort(key=lambda s: (s["start"] if s["start"] is not None else 0.0, s["end"] if s["end"] is not None else 999.0))
        rows.append(row_data)

    rows.sort(key=lambda r: (r["number"] if r["number"] is not None else 999, r["title"] or ""))

    data = {
        "title": "Linkes hohes Beet – Reihenlayout 2025",
        "beet": str(BEET),
        "beetTitle": as_str(g, BEET, DCTERMS.title),
        "beetComment": as_str(g, BEET, RDFS.comment),
        "months": MONTHS,
        "rows": rows,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.LINKES_HOHES_BEET = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
