from __future__ import annotations

import json
from pathlib import Path
from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import DCTERMS, RDF, RDFS, SKOS

ROOT = Path(__file__).parent
FILES = [
    ROOT / "garten-vokabular.ttl",
    ROOT / "garten-layout-vokabular.ttl",
    ROOT / "pflanzen.ttl",
    ROOT / "garten91-linking.ttl",
    ROOT / "garten-layout-ontology.ttl",
    ROOT / "garten91-beete-real.ttl",
    ROOT / "garten91-belegungen-real-2025.ttl",
    ROOT / "garten91-beetplan-2024.ttl",
    ROOT / "garten91-planungen-neu.ttl",
    ROOT / "anbau-journal.ttl",
]
OUT = ROOT / "viz" / "fruchtfolge-data.js"

GARTEN = Namespace("https://example.org/garten-planer/ontology#")
TIME = Namespace("http://www.w3.org/2006/time#")

REAL = lambda slug: URIRef("https://example.org/garten-planer/data/garten91/real/#" + slug)

BEDS = [
    ("tomatenbeet", "Tomatenbeet"),
    ("beetkoerper-nord", "Beetkörper West"),
    ("beetkoerper-sued", "Beetkörper Ost"),
    ("kartoffelbeet", "Kartoffelbeet"),
    ("erdbeer-knoblauch-beet", "Erdbeer-Beet"),
    ("zwiebel-kohlrabi-hochbeet", "Zwiebel-Kohlrabi-Hochbeet"),
    ("physalis-hochbeet", "Physalis-Hochbeet"),
    ("beerenbeet", "Beerenbeet"),
    ("jungpflanzen-anzuchtkasten", "Jungpflanzen-Anzuchtkasten"),
    ("beet-rechts-unten", "Beet rechts unten (tbd)"),
]
YEARS = ["2024", "2025", "2026"]

FAMILIE_COLOR = {
    "Nachtschattengewächse": "#e9a8a0",
    "Kreuzblütler": "#a8c686",
    "Doldenblütler": "#8fd0c4",
    "Kürbisgewächse": "#f0c060",
    "Zwiebelgewächse": "#c8a8e0",
    "Korbblütler": "#f0e080",
    "Fuchsschwanzgewächse": "#d0a0c8",
    "Lippenblütler": "#90d090",
    "Süßgräser": "#d8e0a0",
    "Kapuzinerkressengewächse": "#f0a888",
    "Hülsenfrüchtler": "#a0d0e0",
    "Hahnenfußgewächse": "#b0d0e8",
    "Rosengewächse": "#f09090",
    "Knöterichgewächse": "#c8d888",
}


def first(g, s, p):
    for o in g.objects(s, p):
        return o
    return None


def label_de(g, res, fallback=None):
    if res is None:
        return fallback
    labels = list(g.objects(res, SKOS.prefLabel)) or list(g.objects(res, RDFS.label)) or list(g.objects(res, DCTERMS.title))
    for lbl in labels:
        if getattr(lbl, "language", None) == "de":
            return str(lbl)
    return str(labels[0]) if labels else (fallback or str(res).split("#")[-1].split("/")[-1])


def main():
    g = Graph()
    for f in FILES:
        g.parse(f)

    # Pflanzungen → (jahr, beet, familie, kultur)
    rows = {}
    for p in g.subjects(RDF.type, GARTEN.Pflanzung):
        beet = first(g, p, GARTEN.aufBeet)
        if beet is None:
            continue
        pflanze = first(g, p, GARTEN.pflanzt)
        if pflanze is None:
            continue
        if bool(first(g, pflanze, GARTEN.mehrjaehrig) or False):
            continue  # nur einjährige Kulturen in die Fruchtfolge
        familie = first(g, pflanze, GARTEN.fruchtFamilie)
        if familie is None:
            continue
        familie_label = label_de(g, familie)

        # Jahr bestimmen: aus monatPflanzung/monatAnzucht, sonst aus time:hasBeginning
        jahr = None
        for pred in (GARTEN.monatPflanzung, GARTEN.monatAnzucht):
            v = first(g, p, pred)
            if v is not None:
                jahr = str(v).split("-")[0]
                break
        if jahr is None:
            te = first(g, p, TIME.hasTemporalExtent)
            if te is not None:
                beg = first(g, te, TIME.hasBeginning)
                if beg is not None:
                    for pred in (TIME.inXSDgYearMonth, TIME.inXSDgYear):
                        v = first(g, beg, pred)
                        if v is not None:
                            jahr = str(v).split("-")[0]
                            break
        if jahr is None or jahr not in YEARS:
            continue

        key = (jahr, str(beet), familie_label)
        cell = rows.setdefault(key, {
            "familie": familie_label,
            "color": FAMILIE_COLOR.get(familie_label, "#c8cfc0"),
            "kulturen": set(),
            "count": 0,
        })
        cell["kulturen"].add(label_de(g, pflanze))
        cell["count"] += 1

    # Matrix aufbauen
    matrix = []
    bed_slugs = {slug for slug, _ in BEDS}
    for slug, title in BEDS:
        beet_uri = REAL(slug)
        row = {"slug": slug, "title": title, "cells": []}
        for year in YEARS:
            cell = None
            for (j, b, fam), data in rows.items():
                if j == year and b == str(beet_uri):
                    if cell is None:
                        cell = {"family": fam, "color": data["color"], "items": []}
                    cell["items"].append({
                        "kultur": ", ".join(sorted(data["kulturen"])),
                        "count": data["count"],
                    })
            row["cells"].append(cell)
        matrix.append(row)

    # Konflikte: gleiche Familie in aufeinanderfolgenden Jahren auf demselben Beet
    conflicts = []
    by_bed_year = {}
    for (j, b, fam) in rows:
        by_bed_year.setdefault((b, j), set()).add(fam)
    for slug, title in BEDS:
        beet_uri = str(REAL(slug))
        for i in range(len(YEARS) - 1):
            y1, y2 = YEARS[i], YEARS[i + 1]
            fams1 = by_bed_year.get((beet_uri, y1), set())
            fams2 = by_bed_year.get((beet_uri, y2), set())
            overlap = fams1 & fams2
            if overlap:
                conflicts.append({
                    "beet": title,
                    "beetSlug": slug,
                    "jahre": f"{y1}→{y2}",
                    "familien": sorted(overlap),
                })

    data = {
        "title": "Garten 91 – Fruchtfolge-Matrix",
        "years": YEARS,
        "matrix": matrix,
        "conflicts": conflicts,
        "legend": [
            {"family": k, "color": v} for k, v in sorted(FAMILIE_COLOR.items())
        ],
    }

    OUT.write_text("window.FRUCHTFOLGE = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    print(f"Wrote {OUT}: {len(conflicts)} Konflikte")


if __name__ == "__main__":
    main()
