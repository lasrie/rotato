#!/usr/bin/env python3
"""Generiert anbau-journal.ttl aus dem 2025-Kalender-Blatt der Anzuchtdatenbank.

Quelle: input/Pflanzenanzucht_mit_Makro.xlsm, Sheet '2025' (bzw. alle Jahres-Blätter).
Erzeugt garten:Pflanzung-Ereignisse mit Menge, Anzucht-, Pflanz- und Ernte-Monat.

Aufruf:  python3 generate_anbau.py
"""
import openpyxl
import re
import unicodedata

QUELLE = "input/Pflanzenanzucht_mit_Makro.xlsm"
ZIEL = "anbau-journal.ttl"
MONATSKUERZEL = ["Januar", "Februar", "März", "April", "Mai", "Juni",
                 "Juli", "August", "September", "Oktober", "November", "Dezember"]


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^A-Za-z0-9]+", " ", s).strip()
    return "".join(w.capitalize() for w in s.split()) or "Unbenannt"


def lade_katalog() -> tuple[dict, dict]:
    """Liest pflanzen.ttl und liefert (arten, sorten) als Label -> URI-Suffix."""
    from rdflib import Graph, Namespace, RDF, SKOS
    G = Namespace("https://example.org/garten-planer/ontology#")
    arten, sorten = {}, {}
    g = Graph()
    g.parse("pflanzen.ttl")
    for p in g.subjects(RDF.type, G.Pflanze):
        label = g.value(p, SKOS.prefLabel)
        if label:
            arten[str(label)] = str(p).split("#")[-1]
    for s in g.subjects(RDF.type, G.Sorte):
        label = g.value(s, SKOS.prefLabel)
        if label:
            art_uri = g.value(s, G.sorteVon)
            art_label = str(g.value(art_uri, SKOS.prefLabel) or "")
            sorten[(art_label, str(label))] = str(s).split("#")[-1]
    return arten, sorten


def escape(s: str) -> str:
    s = s.replace("\\", "\\\\").replace('"', '\\"')
    return s.replace("\n", " ").replace("\r", " ")


def normalize_art(art: str) -> str:
    """Schreibweisen aus den Kalender-Blättern an den Pflanzenkatalog anpassen."""
    if art.startswith("Tomat"):
        return "Tomate"
    if art == "Chili":           # 2025-Schreibweise; DB: 'Chilli'
        return "Chilli"
    if art == "Wintersteckzwiebeln":
        return "Wintersteckzwiebel"
    return art


def parse_monat(zelle) -> int | None:
    """Zellen wie '2', '2 ', 'März' -> Monatsnummer 1..12."""
    if zelle is None:
        return None
    s = str(zelle).strip()
    if not s:
        return None
    if re.fullmatch(r"(1[0-2]|[1-9])", s):
        return int(s)
    for i, name in enumerate(MONATSKUERZEL, 1):
        if s.lower() == name.lower():
            Monatskuerzel = None  # noqa
            return i
    return None


def parse_haelfte(zelle) -> str | None:
    s = str(zelle or "").strip().lower()
    if s in ("anfang", "mitte", "ende"):
        return s
    return None


def main():
    wb = openpyxl.load_workbook(QUELLE, data_only=True)

    out = [
        "# Anbau-Journal aus den Kalender-Blättern der Anzuchtdatenbank",
        f"# Generiert von generate_anbau.py – Quelle: {QUELLE}",
        "# NICHT manuell editieren: Änderungen in Excel machen und Skript neu laufen lassen.",
        "",
        "@prefix garten: <https://example.org/garten-planer/ontology#> .",
        "@prefix rdfs:   <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix time:   <http://www.w3.org/2006/time#> .",
        "@prefix xsd:    <http://www.w3.org/2001/XMLSchema#> .",
        "@base    <https://example.org/garten-planer/anbau/> .",
        "",
    ]

    jahr_sheets = [n for n in wb.sheetnames if re.fullmatch(r"(19|20)\d{2}", n.strip())]
    ereignis_nr = 0
    unbekannt = set()
    arten_katalog, sorten_katalog = lade_katalog()

    for sheet in jahr_sheets:
        jahr = int(sheet.strip())
        ws = wb[sheet]
        header = [c.value for c in ws[1]]
        col = {name: i for i, name in enumerate(header) if name is not None}

        def find_col(*kandidaten):
            for name in header:
                if isinstance(name, str):
                    for k in kandidaten:
                        if k.lower() in name.lower():
                            return header.index(name)
            return None

        c_art = col.get("Was") or find_col("Was")
        c_sorte = col.get("Sorte") or find_col("Sorte")
        c_gekauft = col.get("Gekauft") or find_col("Gekauft")
        c_menge = col.get("Menge") or find_col("Menge")
        c_mon_anz = find_col("Monat der Anzucht")
        c_punkt_anz = find_col("Anzuchtzeitpunkt")
        c_mon_pfl = find_col("Monat der Pflanzung")
        c_punkt_pfl = find_col("Pflanz-zeitpunkt", "Pflanzzeitpunkt")
        c_mon_ern = find_col("Monat der (letzten) Er")
        c_bem = find_col("Bemerkung")

        for row in ws.iter_rows(min_row=2, values_only=True):
            art_roh = str(row[c_art]).strip() if c_art is not None and row[c_art] else ""
            if not art_roh:
                continue
            art = normalize_art(art_roh)
            sorte = str(row[c_sorte]).strip() if c_sorte is not None and row[c_sorte] else ""
            sorte = re.sub(r"\s+", " ", sorte)   # Zeilenumbrüche wie im Katalog behandeln
            # Tomaten-Gruppen im Sorten-Namen entschärfen (z.B. 'Tomaten (Fleischtomaten) San Marzano')
            sorte = re.sub(r"^Tomat[^:]*?\((.*?)\)\s*", "", sorte).strip()
            if sorte in ("?", "-", "", "keine"):
                sorte = ""

            # Katalog-Matching: nur echte Katalog-Arten verlinken
            if art not in arten_katalog:
                unbekannt.add(art)
                continue

            mon_anz = parse_monat(row[c_mon_anz]) if c_mon_anz is not None else None
            mon_pfl = parse_monat(row[c_mon_pfl]) if c_mon_pfl is not None else None
            mon_ern = parse_monat(row[c_mon_ern]) if c_mon_ern is not None else None

            # Überwinternde Kulturen (z.B. Wintersteckzwiebeln, Knoblauch):
            # Liegt Anzucht-/Pflanz-Monat NACH dem Ernte-Monat, gehört die
            # Anzucht ins Vorjahr.
            jahr_anz, jahr_pfl = jahr, jahr
            if mon_ern is not None:
                if mon_anz is not None and mon_anz > mon_ern:
                    jahr_anz = jahr - 1
                if mon_pfl is not None and mon_pfl > mon_ern:
                    jahr_pfl = jahr - 1

            ereignis_nr += 1
            out.append(f"<#e{jahr}_{ereignis_nr:03d}> a garten:Pflanzung ;")
            out.append(f'    rdfs:label "{escape(art)}' + (f' {escape(sorte)}' if sorte else '') + f' {jahr}"@de ;')
            out.append(f'    garten:pflanzt <https://example.org/garten-planer/pflanzen/#{arten_katalog[art]}> ;')
            if sorte:
                sslug = sorten_katalog.get((art, sorte))
                if sslug:
                    out.append(f'    garten:sorte <https://example.org/garten-planer/pflanzen/#{sslug}> ;')
                else:
                    print(f"  HINWEIS: Sorte '{sorte}' von Art '{art}' nicht im Katalog gefunden")
            if c_gekauft is not None and row[c_gekauft]:
                out.append('    garten:gekauft true ;')
            if c_menge is not None and row[c_menge]:
                out.append(f'    garten:menge "{escape(str(row[c_menge]).strip())}"@de ;')
            if mon_anz is not None:
                out.append(f'    garten:monatAnzucht "{jahr_anz}-{mon_anz:02d}"^^xsd:gYearMonth ;')
            if mon_pfl is not None:
                out.append(f'    garten:monatPflanzung "{jahr_pfl}-{mon_pfl:02d}"^^xsd:gYearMonth ;')
            if mon_ern is not None:
                out.append(f'    garten:monatErnte "{jahr}-{mon_ern:02d}"^^xsd:gYearMonth ;')
            haelfte_anz = parse_haelfte(row[c_punkt_anz]) if c_punkt_anz is not None else None
            if haelfte_anz:
                out.append(f'    garten:anzuchtZeitpunkt "{haelfte_anz}"@de ;')
            haelfte_pfl = parse_haelfte(row[c_punkt_pfl]) if c_punkt_pfl is not None else None
            if haelfte_pfl:
                out.append(f'    garten:pflanzZeitpunkt "{haelfte_pfl}"@de ;')
            if c_bem is not None and row[c_bem]:
                out.append(f'    rdfs:comment "{escape(str(row[c_bem]).strip())}"@de ;')
            # Zeitintervall: vom Anzucht- bis zum Ernte-Monat
            start = f"{jahr_anz}-{(mon_anz or 1):02d}"
            ende = f"{jahr}-{(mon_ern or 12):02d}"
            out.append(f'    time:hasTemporalExtent [ a time:TemporalEntity ;')
            out.append(f'        time:hasTRS <http://www.opengis.net/def/uom/ISO-8601/0/Gregorian> ;')
            out.append(f'        time:hasBeginning [ time:inXSDgYearMonth "{start}"^^xsd:gYearMonth ] ] .')
            out.append("")

    with open(ZIEL, "w") as f:
        f.write("\n".join(out) + "\n")
    print(f"{ZIEL} geschrieben: {ereignis_nr} Pflanzungs-Ereignisse")
    if unbekannt:
        print("WARNUNG – folgende Arten aus dem Journal fehlen im Pflanzenkatalog:")
        for a in sorted(unbekannt):
            print(f"  - {a}")
        print("  -> In generate_pflanzen.py (FAMILIEN) bzw. Anzuchtdatenbank ergänzen!")


if __name__ == "__main__":
    main()
