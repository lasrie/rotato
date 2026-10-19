from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent
SLIDES = ROOT / "tmp" / "ppt2024" / "slides.json"
OUT = ROOT / "garten91-beetplan-2024.ttl"

# ----------------------------------------------------------------
# PPT-Zonen 2024 (EMU-Koordinaten aus Slide 2, identisch über alle
# Monatsfolien). Längsachse = die längere Kante des Rechtecks.
# ----------------------------------------------------------------
ZONES = {
    "left-vertical": (2793494, 773528, 540000, 5760000),
    "top-center-small": (5032585, 764101, 1116000, 576000),
    "center-upper": (4282199, 2778255, 2880000, 864000),
    "center-lower": (4282199, 3975675, 2880000, 864000),
    "berry-square": (7849384, 1680314, 864000, 1080000),
    "right-vertical-upper": (10616653, 1690688, 576000, 3168000),
    "right-vertical-lower": (10616653, 4882681, 576000, 1440000),
    "potato-bed": (8673497, 4839675, 1080000, 504000),
    "small-right": (8858506, 4497942, 1080000, 504000),
    "bottom-center": (5844639, 5550255, 864000, 828000),
}

# Mapping PPT-Zone -> reales Beet (Benutzer-gemappt)
ZONE_TO_BEET = {
    "left-vertical": "tomatenbeet",
    "berry-square": "erdbeer-knoblauch-beet",
    "right-vertical-upper": "zwiebel-kohlrabi-hochbeet",
    "right-vertical-lower": "zwiebel-kohlrabi-hochbeet",
    "potato-bed": "kartoffelbeet",
    "small-right": "kartoffelbeet",
    "bottom-center": "physalis-hochbeet",
    "top-center-small": None,  # unklar (2024: Gurke/Dill) – offene Zuordnung
    "center-upper": "beetkoerper-nord",
    "center-lower": "beetkoerper-sued",
}

# Gemüsebeete: hier greift die Fruchtfolge
GEMUESE_BEETE = {"tomatenbeet", "beetkoerper-nord", "beetkoerper-sued", "kartoffelbeet"}

# Schätzlänge der Beet-Längsachse in Metern (für Abschnitts-Start/Ende)
BEET_LAENGE = {
    "tomatenbeet": 10.0,
    "erdbeer-knoblauch-beet": 2.0,
    "zwiebel-kohlrabi-hochbeet": 3.0,
    "kartoffelbeet": 6.0,
    "physalis-hochbeet": 2.0,
    "beetkoerper-nord": 8.0,
    "beetkoerper-sued": 8.0,
}

# Kulturname in PPT -> Pflanzen-Slug in pflanzen.ttl
PFLANZEN = {
    "Tomate": "Tomate",
    "Basilikum": "Basilikum",
    "Kamille": "Kamille",
    "Petersilie": "Petersilie",
    "Schnittlaich": "Schnittlauch",
    "Schnitt-lauch": "Schnittlauch",
    "Schnittlauch": "Schnittlauch",
    "Ringelblume": "Ringelblumen",
    "Paprika": "Paprika",
    "Grünkohl": "Grunkohl",
    "Gurke": "Gurke",
    "Dill": "Dill",
    "Salat": "Kopfsalat",
    "Gemischter Salat": "Kopfsalat",
    "Möhren": "Mohre",
    "Rote Beete": "RoteBete",
    "Chili": "Chilli",
    "Radieschen": "Radieschen",
    "Buschbohne": "Buschbohne",
    "Zucchini": "Zucchini",
    "Stangensellerie": "Stangensellerie",
    "Blumenkohl": "Blumenkohl",
    "Brokkoli": "Brokkoli",
    "Kartoffeln": "Kartoffeln",
    "Kohlrabi": "Kohlrabi",
    "Lauch": "Porree",
    "Knoblauch": "Knoblauch",
    "Zwiebeln": "Zwiebeln",
    "Erdbeeren": "Erdbeeren",
    "Johannisbeere": "Johannisbeere",
    "Stache-beere": "Stachelbeere",
    "Melone": "Honigmelone",
}

MEHRJAEHRIG = {"Erdbeeren", "Johannisbeere", "Stachelbeere"}

# Einträge ohne Pflanzenreferenz (kein Gemüse / keine Fruchtfolge)
IGNORE = {"Mulch", "Gründünger", "Phacelia", "Zottelwicke und Winterroggen", "Minze"}

MONTHSLIDES = {
    3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 12: 10, 13: 11, 14: 12,
    15: 1, 16: 2, 17: 3, 18: 4, 19: 5, 20: 6, 21: 7, 22: 8, 23: 9, 24: 10, 25: 11, 26: 12,
}
# Folien 3-14: erste Gartenseite; Folien 15-26: zweite Ansicht. Für die
# Belegungsliste reicht eine Ansicht – wir nehmen Folien 3-14 (Monate 1-12).
ACTIVE_SLIDES = set(range(3, 15))


def zone_of(x: int, y: int, w: int = 0, h: int = 0):
    for name, (zx, zy, zw, zh) in ZONES.items():
        if zx <= x <= zx + zw and zy <= y <= zy + zh:
            return name
    return None


def parse_text(text: str):
    """'Tomate M5–E10' -> (name, from, to); 'Kamille' -> (name, None, None)"""
    t = text.replace("\u2013", "-").replace("\u2014", "-").strip()
    m = re.match(r"^(.*?)\s+([AME])\s?(\d+)\s*-\s*([AME])\s?(\d+)\s*$", t)
    if m:
        name, f1, m1, f2, m2 = m.groups()
        return name.strip(), int(m1), int(m2)
    m = re.match(r"^(.*?)\s+([AME])\s?(\d+)\s*-\s*$", t)  # 'Himbeeren 3 -'
    if m:
        name, _, m1 = m.groups()
        return name.strip(), int(m1), None
    return t.strip(), None, None


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name)
    s = s.encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).strip()
    return "".join(w.capitalize() for w in s.split()) or "Unbenannt"


def escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def main():
    data = json.load(SLIDES.open())
    entries = {}  # key: (zone, plant, x, y) -> dict

    for sid in ACTIVE_SLIDES:
        for sh in data.get(str(sid), []):
            text = sh["text"].strip()
            pos = sh["pos"]
            if not pos or not text or text in ("Rankgerüst",) or text.startswith("tbd"):
                continue
            zone = zone_of(*pos)
            if zone is None:
                continue
            name, from_m, to_m = parse_text(text)
            if name in IGNORE:
                continue
            key = (zone, name, pos[0], pos[1])
            if key in entries:
                # längster Zeitraum behalten (kontinuierliche Kultur über Monate)
                e = entries[key]
                if from_m is not None:
                    if e["from"] is None:
                        e["from"], e["to"] = from_m, to_m
                    else:
                        e["from"] = min(e["from"], from_m)
                        if to_m is not None:
                            e["to"] = max(e["to"] or to_m, to_m)
            else:
                entries[key] = {
                    "zone": zone, "name": name, "x": pos[0], "y": pos[1],
                    "w": pos[2], "h": pos[3], "from": from_m, "to": to_m,
                }

    lines = [
        "# Beetplan 2024 – aus input/Beetplan 2024.pptm generiert",
        "# Generator: generate_beetplan2024.py",
        "# Positionen: EMU-Koordinaten der Folie, konvertiert in Abschnitts-Meter",
        "",
        "@prefix garten:  <https://example.org/garten-planer/ontology#> .",
        "@prefix plan:    <https://example.org/garten-planer/plan#> .",
        "@prefix gv:      <https://example.org/garten-planer/vokabular#> .",
        "@prefix dcterms: <http://purl.org/dc/terms/> .",
        "@prefix rdfs:    <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix time:    <http://www.w3.org/2006/time#> .",
        "@prefix xsd:     <http://www.w3.org/2001/XMLSchema#> .",
        "",
        "@base <https://example.org/garten-planer/data/garten91/plan-2024/> .",
        "",
    ]
    header_len = len(lines)
    year = 2024
    n_pflanzung = 0
    used_slugs = {}

    for (zone, name, x, y), e in sorted(entries.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2])):
        beet_slug = ZONE_TO_BEET.get(zone)
        plant_slug = PFLANZEN.get(name)
        is_veg = plant_slug and (beet_slug in GEMUESE_BEETE)

        base = f"p{n_pflanzung + 1:03d}"
        used_slugs[base] = name

        # Zeitraum mit Jahreswechsel (A10 -> 2024-10, E7 -> 2025-07)
        from_ym = f"{year}-{e['from']:02d}" if e["from"] else None
        if e["to"]:
            to_year = year + 1 if (e["to"] < (e["from"] or 12)) else year
            to_ym = f"{to_year}-{e['to']:02d}"
        else:
            to_ym = None

        label = f"{name} {e['from'] or ''}{('-' + str(e['to'])) if e['to'] else ''}".strip()

        lines.append(f"<#{base}> a garten:Pflanzung ;")
        lines.append(f'    rdfs:label "{escape(label)}"@de ;')
        if plant_slug:
            lines.append(f"    garten:pflanzt <https://example.org/garten-planer/pflanzen/#{plant_slug}> ;")
        if beet_slug:
            lines.append(f"    garten:aufBeet <https://example.org/garten-planer/data/garten91/real/#{beet_slug}> ;")
        # Abschnitts-Position entlang der Beet-Längsachse (Schätzung)
        if beet_slug:
            zx, zy, zw, zh = ZONES[zone]
            laenge = BEET_LAENGE.get(beet_slug, 6.0)
            if zw >= zh:
                start_f = (x - zx) / zw
                width_f = w / zw if (w := e.get("w", 1)) else 0
            else:
                start_f = (y - zy) / zh
                width_f = e["h"] / zh
            start_m = round(max(0.0, min(0.99, start_f)) * laenge, 2)
            end_m = round(max(0.05, min(1.0, start_f + width_f)) * laenge, 2)
            if end_m <= start_m:
                end_m = start_m + 0.2
            lines.append(f"    garten:inAbschnitt <#{base}-abschnitt> ;")
        if from_ym:
            lines.append(f'    garten:monatPflanzung "{from_ym}"^^xsd:gYearMonth ;')
        if to_ym:
            lines.append(f'    garten:monatErnte "{to_ym}"^^xsd:gYearMonth ;')
        if plant_slug in MEHRJAEHRIG:
            lines.append("    garten:mehrjaehrig true ;")
        # time:hasTemporalExtent immer setzen — das Jahr (2024) ist für jede
        # Pflanzung bekannt, auch wenn Beet- oder Pflanzen-Zuordnung offen bleibt.
        # (SHACL: minCount 1 auf time:hasTemporalExtent für alle Pflanzungen.)
        lines.append("    time:hasTemporalExtent [ a time:TemporalEntity ;")
        lines.append("        time:hasTRS <http://www.opengis.net/def/uom/ISO-8601/0/Gregorian> ;")
        if from_ym:
            beg = '[ time:inXSDgYearMonth "%s"^^xsd:gYearMonth ]' % from_ym
        else:
            beg = '[ time:inXSDgYear "%d"^^xsd:gYear ]' % year
        lines.append("        time:hasBeginning " + beg + " ] ;")
        if not plant_slug:
            lines.append(f'    plan:displayName "{escape(name)}"@de ;')
        if zone == "top-center-small":
            lines.append('    rdfs:comment "PPT-Zone top-center-small 2024 (Gurke/Dill): reale Beet-Zuordnung offen."@de ;')
        if name == "Minze":
            lines.append('    rdfs:comment "Minze: nicht im Pflanzenkatalog, keine Fruchtfolge-Relevanz."@de ;')
        # Nur den neuen Pflanzungs-Block normalisieren (Header bleibt unangetastet)
        body = lines[header_len:]
        body = [l if l.endswith(" ;") or l.endswith(".") else l + " ;" for l in body if l.strip()]
        last = body[-1]
        if last.endswith(" ;"):
            body[-1] = last[:-2] + " ."
        lines = lines[:header_len] + body
        lines.append("")
        n_pflanzung += 1
    # Abschnitte erzeugen (nur für Zuordnungen mit Beet)
    lines.append("# ---------------- Abschnitte (Position entlang Beet-Längsachse) ----------------")
    lines.append("")
    for (zone, name, x, y), e in sorted(entries.items(), key=lambda kv: (kv[0][0], kv[0][2])):
        beet_slug = ZONE_TO_BEET.get(zone)
        if not beet_slug:
            continue
        idx = next(i for i, (k, _) in enumerate(sorted(entries.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2])), 1)
                   if k == (zone, name, x, y))
        zx, zy, zw, zh = ZONES[zone]
        laenge = BEET_LAENGE.get(beet_slug, 6.0)
        if zw >= zh:
            start_f = (x - zx) / zw
            width_f = e["w"] / zw
        else:
            start_f = (y - zy) / zh
            width_f = e["h"] / zh
        start_m = round(max(0.0, min(0.99, start_f)) * laenge, 2)
        end_m = round(max(0.05, min(1.0, start_f + width_f)) * laenge, 2)
        if end_m <= start_m:
            end_m = start_m + 0.2
        lines.append(f"<#p{idx:03d}-abschnitt> a garten:ReihenAbschnitt ;")
        lines.append(f'    dcterms:title "{escape(f"{beet_slug} – {name}")}" ;')
        lines.append(f"    garten:abschnittInReihe <#reihe-auto-{beet_slug}> ;")
        lines.append(f'    garten:abschnittStart "{start_m}"^^xsd:decimal ;')
        lines.append(f'    garten:abschnittEnde "{end_m}"^^xsd:decimal ;')
        lines.append(f"    garten:belegtMitPflanzung <#p{idx:03d}> .")
        lines.append("")

    # Auto-Reihen
    lines.append("# ---------------- Auto-Reihen (eine virtuelle Reihe pro Beet) ----------------")
    lines.append("")
    for beet_slug in sorted(v for v in ZONE_TO_BEET.values() if v):
        if not beet_slug:
            continue
        lines.append(f"<#reihe-auto-{beet_slug}> a garten:Reihe ;")
        lines.append(f'    dcterms:title "{escape(beet_slug)} – PPT-Reihe 2024" ;')
        lines.append(f"    garten:reiheInBeet <https://example.org/garten-planer/data/garten91/real/#{beet_slug}> ;")
        lines.append("    garten:reihenNummer 1 ;")
        lines.append("    garten:reihenAusrichtung gv:ostWest ;")
        lines.append(f'    garten:nutzlaenge "{BEET_LAENGE.get(beet_slug, 6.0)}"^^xsd:decimal .')
        lines.append("")

    OUT.write_text("\n".join(lines))
    print(f"Wrote {OUT}: {n_pflanzung} Pflanzungen")


if __name__ == "__main__":
    main()
