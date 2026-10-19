#!/usr/bin/env python3
"""Generiert pflanzen.ttl aus der Anzuchtdatenbank (Excel).
Quelle: input/Pflanzenanzucht_mit_Makro.xlsm, Sheet 'Anzuchtdatenbank'.

Aufruf:  python3 generate_pflanzen.py
"""
import openpyxl
import re
import unicodedata

QUELLE = "input/Pflanzenanzucht_mit_Makro.xlsm"
ZIEL = "pflanzen.ttl"

# Zuordnung Artname -> Fruchtfamilie (URI-Suffix im garten-vokabular.ttl)
FAMILIEN = {
    "Basilikum": "ff_Lippenbluetler",
    "Bechermalve": "ff_Malvengewaechse",
    "Blattkoriander": "ff_Doldenbluetler",
    "Blumenkohl": "ff_Kreuzbluetler",
    "Bok Choy": "ff_Kreuzbluetler",
    "Borretsch": "ff_Borretschgewaechse",
    "Brokkoli": "ff_Kreuzbluetler",
    "Buschbohne": "ff_Huelsenfruechtler",
    "Chilli": "ff_Nachtschatten",
    "Cosmea": "ff_Korbbluetler",
    "Dill": "ff_Doldenbluetler",
    "Einlegegurke": "ff_Kuerbisgewaechse",
    "Erdbeeren": "ff_Rosengewaechse",
    "Endivien": "ff_Korbbluetler",
    "Gartenkresse": "ff_Kreuzbluetler",
    "Grünkohl": "ff_Kreuzbluetler",
    "Gurke": "ff_Kuerbisgewaechse",
    "Honigmelone": "ff_Kuerbisgewaechse",
    "Jungfer im Grünen": "ff_Hahnenfussgewaechse",
    "Johannisbeere": "ff_Rosengewaechse",
    "Jostabeere": "ff_Rosengewaechse",
    "Kamille": "ff_Korbbluetler",
    "Kapuzinerkresse": "ff_Kapuzinerkressengewaechse",
    "Kartoffeln": "ff_Nachtschatten",
    "Knoblauch": "ff_Zwiebelgewaechse",
    "Kohlrabi": "ff_Kreuzbluetler",
    "Kopfsalat": "ff_Korbbluetler",
    "Kürbis": "ff_Kuerbisgewaechse",
    "Lavendel": "ff_Lippenbluetler",
    "Lein": "ff_Leingewaechse",
    "Möhre": "ff_Doldenbluetler",
    "Paprika": "ff_Nachtschatten",
    "Petersilie": "ff_Doldenbluetler",
    "Pflücksalat": "ff_Korbbluetler",
    "Physalis": "ff_Nachtschatten",
    "Porree": "ff_Zwiebelgewaechse",
    "Radieschen": "ff_Kreuzbluetler",
    "Rauke": "ff_Kreuzbluetler",
    "Rhabarber": "ff_Knoeterichgewaechse",
    "Rosmarin": "ff_Lippenbluetler",
    "Ringelblumen": "ff_Korbbluetler",
    "Rote Bete": "ff_Fuchsschwanzgewaechse",
    "Rotkohl": "ff_Kreuzbluetler",
    "Schnittlauch": "ff_Zwiebelgewaechse",
    "Soja": "ff_Huelsenfruechtler",
    "Spinat": "ff_Fuchsschwanzgewaechse",
    "Stachelbeere": "ff_Rosengewaechse",
    "Stangensellerie": "ff_Doldenbluetler",
    "Stielmus": "ff_Kreuzbluetler",
    "Tomate": "ff_Nachtschatten",
    "Tomaten (Cherrytomaten)": "ff_Nachtschatten",
    "Tomaten (Cocktailtomaten)": "ff_Nachtschatten",
    "Tomaten (Fleischtomaten)": "ff_Nachtschatten",
    "Tomaten (Salattomaten)": "ff_Nachtschatten",
    "Wintersteckzwiebel": "ff_Zwiebelgewaechse",
    "Zucchini": "ff_Kuerbisgewaechse",
    "Zuckermais": "ff_Suessgraeser",
    "Zwiebeln": "ff_Zwiebelgewaechse",
}

# Normalisierung: Tomaten-Gruppen führen wir zu einer Art "Tomate" zusammen,
# damit die Fruchtfolge-Logik (alle Nachtschatten) korrekt greift.
TOMATEN = {
    "Tomate",
    "Tomaten (Cherrytomaten)",
    "Tomaten (Cocktailtomaten)",
    "Tomaten (Fleischtomaten)",
    "Tomaten (Salattomaten)",
}

# Mehrjährige Kulturen – nehmen nicht an der Fruchtfolge teil.
MEHRJAEHRIG = {"Rhabarber"}

# Arten, die im Journal vorkommen, aber nicht in der Anzuchtdatenbank stehen
# (z.B. mehrjährige Beeren) – werden zusätzlich in den Katalog aufgenommen.
EXTRA_ARTEN = {
    "Himbeeren": {"familie": "ff_Rosengewaechse", "mehrjaehrig": True},
    "Erdbeeren": {"familie": "ff_Rosengewaechse", "mehrjaehrig": True},
    "Johannisbeere": {"familie": "ff_Rosengewaechse", "mehrjaehrig": True},
    "Jostabeere": {"familie": "ff_Rosengewaechse", "mehrjaehrig": True},
    "Stachelbeere": {"familie": "ff_Rosengewaechse", "mehrjaehrig": True},
    "Rosmarin": {"familie": "ff_Lippenbluetler", "mehrjaehrig": True},
}

# Spaltenname in Excel -> Property-Suffix (garten:…)
SPALTEN = [
    ("Anzucht-Zeit", "anzuchtZeit"),
    ("Anzucht-Ort", "anzuchtOrt"),
    ("Vorkeimen?", "vorkeimen"),
    ("Vorkeim-Art", "vorkeimArt"),
    ("Vorkeim-Dauer", "vorkeimDauer"),
    ("Keimtemperatur", "keimtemperatur"),
    ("Aussaattiefe", "aussaattiefe"),
    ("Erde (Anzucht)", "erdeAnzucht"),
    ("Pflege (Anzucht)", "pflegeAnzucht"),
    ("Pflanzzeit", "pflanzzeit"),
    ("Abstand", "abstand"),
    ("Erde (Auspflanzung)", "erdeAuspflanzung"),
    ("Standort", "standort"),
    ("Pflege", "pflege"),
    ("Dauer Aussaat bis Ernte", "dauerAussaatBisErnte"),
    ("Erntezeit", "erntezeit"),
    ("Kommentar", "kommentar"),
]


def slug(name: str) -> str:
    """URI-Suffix aus einem Namen erzeugen (ASCII, CamelCase)."""
    s = unicodedata.normalize("NFKD", name)
    s = s.encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).strip()
    return "".join(w.capitalize() for w in s.split()) or "Unbenannt"


def escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def main():
    wb = openpyxl.load_workbook(QUELLE, data_only=True)
    ws = wb["Anzuchtdatenbank"]

    header = [c.value for c in ws[1]]
    col = {name: i for i, name in enumerate(header) if name is not None}
    jahr_spalten = [n for n in header if isinstance(n, str) and re.fullmatch(r"(19|20)\d{2}", n.strip())]

    spalten = [(name, prop) for name, prop in SPALTEN if name in col]

    arten = {}   # artname -> dict(slug, familie, eigenschaften, mehrjaehrig)
    sorten = []  # dict(sorte, art, jahre)

    for row in ws.iter_rows(min_row=2, values_only=True):
        art_roh = str(row[col["Art"]]).strip() if col.get("Art") is not None and row[col["Art"]] else ""
        if not art_roh:
            continue
        art = "Tomate" if art_roh in TOMATEN else art_roh

        jahre = []
        for jahr_name in jahr_spalten:
            zelle = row[header.index(jahr_name)]
            if zelle is not None and str(zelle).strip().lower() in ("x", "X"):
                jahre.append(int(jahr_name.strip()))

        if art not in arten:
            arten[art] = {
                "slug": slug(art),
                "familie": FAMILIEN.get(art_roh),
                "eigenschaften": {},
                "mehrjaehrig": art in MEHRJAEHRIG,
            }

        for name, prop in spalten:
            if col[name] >= len(row):
                continue
            wert = row[col[name]]
            if wert is not None and str(wert).strip() and prop not in arten[art]["eigenschaften"]:
                arten[art]["eigenschaften"][prop] = re.sub(r"\s+", " ", str(wert).strip())

        sorte = str(row[col["Sorte"]]).strip() if col.get("Sorte") is not None and row[col["Sorte"]] else ""
        if sorte:
            sorten.append({
                "sorte": re.sub(r"\s+", " ", sorte),
                "art": art,
                "jahre": sorted(set(jahre)),
            })

    # ---------------- Turtle erzeugen ----------------
    out = [
        "# Pflanzenkatalog aus der Anzuchtdatenbank",
        f"# Generiert von generate_pflanzen.py – Quelle: {QUELLE}, Sheet 'Anzuchtdatenbank'",
        "# NICHT manuell editieren: Änderungen in Excel machen und Skript neu laufen lassen.",
        "",
        "@prefix garten: <https://example.org/garten-planer/ontology#> .",
        "@prefix gv:     <https://example.org/garten-planer/vokabular#> .",
        "@prefix skos:   <http://www.w3.org/2004/02/skos/core#> .",
        "@prefix xsd:    <http://www.w3.org/2001/XMLSchema#> .",
        "@base    <https://example.org/garten-planer/pflanzen/> .",
        "",
    ]

    for art, info in EXTRA_ARTEN.items():
        if art not in arten:
            arten[art] = {
                "slug": slug(art),
                "familie": info["familie"],
                "eigenschaften": {},
                "mehrjaehrig": info["mehrjaehrig"],
            }

    for art in sorted(arten):
        d = arten[art]
        out.append(f"<#{d['slug']}> a garten:Pflanze ;")
        out.append(f'    skos:prefLabel "{escape(art)}"@de ;')
        if d["familie"]:
            out.append(f"    garten:fruchtFamilie gv:{d['familie']} ;")
        out.append(f"    garten:mehrjaehrig {'true' if d['mehrjaehrig'] else 'false'}")
        for prop, wert in d["eigenschaften"].items():
            out.append(f'    ; garten:{prop} "{escape(wert)}"@de')
        out.append(" .")
        out.append("")

    for s in sorted(sorten, key=lambda x: (x["art"], x["sorte"])):
        d = arten[s["art"]]
        out.append(f"<#Sorte{d['slug']}{slug(s['sorte'])}> a garten:Sorte ;")
        out.append(f'    skos:prefLabel "{escape(s["sorte"])}"@de ;')
        out.append(f"    garten:sorteVon <#{d['slug']}>")
        for jahr in s["jahre"]:
            out.append(f"    ; garten:angebautImJahr {jahr}")
        out.append(" .")
        out.append("")

    with open(ZIEL, "w") as f:
        f.write("\n".join(out) + "\n")
    print(f"{ZIEL} geschrieben: {len(arten)} Arten, {len(sorten)} Sorten")


if __name__ == "__main__":
    main()
