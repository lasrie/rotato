"""Gemeinsames Datenmodell: Namespaces, Beete, Farben, Monate — EINE Quelle.

Vorher dupliziert in export_garten91_plan.py (REIHENFOLGE, FAMILIE_COLOR),
export_fruchtfolge.py (BEDS, FAMILIE_COLOR) und mehreren Dateien die
Namespace-Definitionen. Ein neuer Beet-Eintrag muss nur noch HIER geändert
werden; die Skripte filtern nach Bedarf.
"""
from __future__ import annotations

from rdflib import Namespace, URIRef

# ---------------------------------------------------------------------------
# Namespaces — die einzige Definitionsstelle
# ---------------------------------------------------------------------------
GARTEN = Namespace("https://example.org/garten-planer/ontology#")
PLAN = Namespace("https://example.org/garten-planer/plan#")
GV = Namespace("https://example.org/garten-planer/vokabular#")
TIME = Namespace("http://www.w3.org/2006/time#")

DATA91 = Namespace("https://example.org/garten-planer/data/garten91/")
GARTEN91 = DATA91.garten91
PFLANZEN_BASE = "https://example.org/garten-planer/pflanzen/"


def real(slug: str) -> URIRef:
    """URI eines realen Beets (bekannte URI-Falle: immer explizit, kein
    Namespace-Konkatenieren — siehe ADR-0003 / Stolperfallen)."""
    return URIRef("https://example.org/garten-planer/data/garten91/real/#" + slug)


def pflanze(slug: str) -> URIRef:
    return URIRef(PFLANZEN_BASE + "#" + slug)


# ---------------------------------------------------------------------------
# Beete — die Stammliste
# ---------------------------------------------------------------------------
# Alle realen Beete mit:
#   slug, Titel, Flag is_path (kein Anbau-Beet: Hackschnitzelweg), Flag
#   fruchtfolge (nimmt an der Fruchtfolge-Matrix teil — der Weg und das
#   noch unbenannte "tbd"-Beet nicht).
BEDS: list[dict] = [
    {"slug": "tomatenbeet", "title": "Tomatenbeet", "is_path": False, "fruchtfolge": True},
    {"slug": "erdbeer-knoblauch-beet", "title": "Erdbeer-Beet", "is_path": False, "fruchtfolge": True},
    {"slug": "beetkoerper-nord", "title": "Beetkörper West", "is_path": False, "fruchtfolge": True},
    {"slug": "beetkoerper-sued", "title": "Beetkörper Ost", "is_path": False, "fruchtfolge": True},
    {"slug": "hackschnitzelweg-beetkoerper", "title": "Hackschnitzelweg im Beetkörper", "is_path": True, "fruchtfolge": False},
    {"slug": "kartoffelbeet", "title": "Kartoffelbeet", "is_path": False, "fruchtfolge": True},
    {"slug": "jungpflanzen-anzuchtkasten", "title": "Jungpflanzen-Anzuchtkasten", "is_path": False, "fruchtfolge": True},
    {"slug": "physalis-hochbeet", "title": "Physalis-Hochbeet", "is_path": False, "fruchtfolge": True},
    {"slug": "beerenbeet", "title": "Beerenbeet", "is_path": False, "fruchtfolge": True},
    {"slug": "zwiebel-kohlrabi-hochbeet", "title": "Zwiebel-Kohlrabi-Hochbeet", "is_path": False, "fruchtfolge": True},
    {"slug": "beet-rechts-unten", "title": "Beet rechts unten (tbd)", "is_path": False, "fruchtfolge": False},
]

# Reihenfolge im Pflanzplan-Viewer (alle Anbau-Beete + der Weg-Körper, der auf der
# Karte erscheint — exakt wie der alte Export: 10 Beete inkl. Hackschnitzelweg)
REIHENFOLGE: list[str] = [b["slug"] for b in BEDS if b["slug"] != "beet-rechts-unten"]

# Fruchtfolge-Matrix: nur Anbau-Beete mit Fruchtfolge-Teilnahme
FF_BEDS: list[tuple[str, str]] = [(b["slug"], b["title"]) for b in BEDS if b["fruchtfolge"]]

# ---------------------------------------------------------------------------
# Fruchtfamilien-Farben (Pflanzplan + Fruchtfolge-Matrix)
# ---------------------------------------------------------------------------
FAMILIE_COLOR: dict[str, str] = {
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
FAMILIE_COLOR_FALLBACK = "#9ccc8a"

# ---------------------------------------------------------------------------
# Zeitachse
# ---------------------------------------------------------------------------
MONTHS = [None, "Januar", "Februar", "März", "April", "Mai", "Juni",
          "Juli", "August", "September", "Oktober", "November", "Dezember"]
YEARS = ["2024", "2025", "2026"]


# ---------------------------------------------------------------------------
# RDF-Helfer (von beiden Export-Skripten genutzt)
# ---------------------------------------------------------------------------
from rdflib import Graph  # noqa: E402
from rdflib.namespace import DCTERMS, RDFS, SKOS  # noqa: E402


def first(g: Graph, s, p):
    for o in g.objects(s, p):
        return o
    return None


def label_de(g: Graph, res, fallback=None):
    if res is None:
        return fallback
    labels = list(g.objects(res, SKOS.prefLabel))
    if not labels:
        labels = list(g.objects(res, RDFS.label))
    if not labels:
        labels = list(g.objects(res, DCTERMS.title))
    for lbl in labels:
        if getattr(lbl, "language", None) == "de":
            return str(lbl)
    return str(labels[0]) if labels else (fallback or str(res).split("#")[-1].split("/")[-1])
