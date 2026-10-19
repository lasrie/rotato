from __future__ import annotations

import json
from pathlib import Path
from rdflib import RDF, Graph
from rdflib.namespace import DCTERMS, RDFS, SKOS

from datamodel import (FAMILIE_COLOR, FAMILIE_COLOR_FALLBACK, GARTEN, MONTHS,
                       PLAN, REIHENFOLGE, TIME, YEARS, GARTEN91, first,
                       label_de, real)
from rdf_source import get_graph

ROOT = Path(__file__).parent
OUT = ROOT / "viz" / "garten91-plan.js"


def month_of_ym(g: Graph, planting, pred):
    """Monat aus monatPflanzung/monatErnte oder aus time:hasBeginning (gYearMonth)."""
    ym = first(g, planting, pred)
    if ym is not None:
        try:
            return int(str(ym).split("-")[1])
        except (ValueError, IndexError):
            return None
    te = first(g, planting, TIME.hasTemporalExtent)
    if te is not None:
        beg = first(g, te, TIME.hasBeginning)
        if beg is not None:
            ym = first(g, beg, TIME.inXSDgYearMonth)
            if ym is not None:
                return int(str(ym).split("-")[1])
    return None


def year_of_ym(g: Graph, planting, pred):
    ym = first(g, planting, pred)
    if ym is not None:
        return str(ym).split("-")[0]
    te = first(g, planting, TIME.hasTemporalExtent)
    if te is not None:
        beg = first(g, te, TIME.hasBeginning)
        if beg is not None:
            for p in (TIME.inXSDgYearMonth, TIME.inXSDgYear):
                v = first(g, beg, p)
                if v is not None:
                    return str(v).split("-")[0]
    return None


def main():
    g = get_graph()

    # ---- Beete ----
    beds = []
    for beet in REIHENFOLGE:
        is_path = beet == "hackschnitzelweg-beetkoerper"
        beet_uri = real(beet)
        beds.append({
            "id": str(beet_uri),
            "slug": beet,
            "title": label_de(g, beet_uri),
            "comment": str(first(g, beet_uri, RDFS.comment) or ""),
            "x": float(first(g, beet_uri, PLAN.x) or 0),
            "y": float(first(g, beet_uri, PLAN.y) or 0),
            "width": float(first(g, beet_uri, PLAN.width) or 0),
            "height": float(first(g, beet_uri, PLAN.height) or 0),
            "family": None,
            "isPath": is_path,
            "plantings": [],
        })

    bed_by_uri = {b["id"]: b for b in beds}

    # ---- Pflanzungen sammeln (alle, die aufBeet auf ein reales Beet zeigen) ----
    all_plantings = list(g.subjects(RDF.type, GARTEN.Pflanzung))
    for p in all_plantings:
        beet = first(g, p, GARTEN.aufBeet)
        if beet is None or str(beet) not in bed_by_uri:
            continue
        pflanze = first(g, p, GARTEN.pflanzt)
        if pflanze is None:
            sorte = first(g, p, GARTEN.sorte)
            if sorte is not None:
                pflanze = first(g, sorte, GARTEN.sorteVon)
        if pflanze is None:
            continue

        familie = first(g, pflanze, GARTEN.fruchtFamilie)
        familie_label = label_de(g, familie) if familie else None
        mehrjaehrig = bool(first(g, pflanze, GARTEN.mehrjaehrig) or False)

        from_m = month_of_ym(g, p, GARTEN.monatPflanzung)
        to_m = month_of_ym(g, p, GARTEN.monatErnte)
        if from_m is None:
            from_m = month_of_ym(g, p, GARTEN.monatAnzucht)
        jahr = year_of_ym(g, p, GARTEN.monatPflanzung) or year_of_ym(g, p, GARTEN.monatAnzucht) or "2025"

        section = first(g, p, GARTEN.inAbschnitt)
        abschnitt_label = label_de(g, section) if section else None
        abschnitt_start = float(first(g, section, GARTEN.abschnittStart)) if section and first(g, section, GARTEN.abschnittStart) else None
        abschnitt_end = float(first(g, section, GARTEN.abschnittEnde)) if section and first(g, section, GARTEN.abschnittEnde) else None

        bed_by_uri[str(beet)]["plantings"].append({
            "id": str(p),
            "label": label_de(g, pflanze, "Pflanze"),
            "plantingLabel": label_de(g, p, None),
            "plant": str(pflanze),
            "family": str(familie) if familie else None,
            "familyLabel": familie_label,
            "familyColor": FAMILIE_COLOR.get(familie_label, FAMILIE_COLOR_FALLBACK),
            "mehrjaehrig": mehrjaehrig,
            "jahr": jahr,
            "fromMonth": from_m,
            "toMonth": to_m,
            "section": str(section) if section else None,
            "sectionLabel": abschnitt_label,
            "sectionStart": abschnitt_start,
            "sectionEnd": abschnitt_end,
        })

    # Sortieren: jahr, label, fromMonth
    for b in beds:
        b["plantings"].sort(key=lambda p: (p["jahr"], p["label"], p["fromMonth"] or 0))

    # ---- Pflanzenauswahl für das Planungs-Formular ----
    plants = []
    for pflanze in g.subjects(RDF.type, GARTEN.Pflanze):
        familie = first(g, pflanze, GARTEN.fruchtFamilie)
        familie_label = label_de(g, familie) if familie else None
        plants.append({
            "uri": str(pflanze),
            "label": label_de(g, pflanze, "Pflanze"),
            "familyUri": str(familie) if familie else None,
            "familyLabel": familie_label,
        })
    plants.sort(key=lambda p: p["label"])

    data = {
        "title": "Garten 91 – Pflanzplan",
        "garden": str(GARTEN91),
        "sourceFiles": ["pod"],
        "months": MONTHS,
        "years": YEARS,
        "beds": beds,
        "plants": plants,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("window.GARTEN91_PLAN = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
