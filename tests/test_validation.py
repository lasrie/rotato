"""Tests für die SHACL-Validierung (gemergte Shapes, wie server.py sie nutzt).

Der Grund für diese Tests: Die pyshacl-CLI akzeptiert nur EINE -s-Shape-Datei
(letzter gewinnt) — ein Aufruf mit zwei -s-Flags validierte stillschweigend
nur gegen die letzte Datei. Diese Tests benutzen pyshacl als Library über
beide Shape-Dateien, genau wie server.py es nach dem Bug-Fix tut.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from pyshacl import validate
from rdflib import Graph

ROOT = Path(__file__).parent.parent
SHAPES = [
    ROOT / "garten-shapes.ttl",
    ROOT / "garten-layout.shacl.ttl",
]

GARTEN = "https://example.org/garten-planer/ontology#"
PFLANZEN = "https://example.org/garten-planer/pflanzen/#Tomate"
BEET = "https://example.org/garten-planer/data/garten91/real/#tomatenbeet"
TRS = "http://www.opengis.net/def/uom/ISO-8601/0/Gregorian"

VALID_PLANTING = f"""
@prefix garten: <{GARTEN}> .
@prefix time: <http://www.w3.org/2006/time#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<https://example.org/garten-planer/test/#p-valid> a garten:Pflanzung ;
    garten:pflanzt <{PFLANZEN}> ;
    garten:aufBeet <{BEET}> ;
    time:hasTemporalExtent [
        a time:TemporalEntity ;
        time:hasTRS <{TRS}> ;
        time:hasBeginning [ time:inXSDgYear "2026"^^xsd:gYear ]
    ] .
"""

INVALID_PLANTING = f"""
@prefix garten: <{GARTEN}> .
<https://example.org/garten-planer/test/#p-invalid> a garten:Pflanzung ;
    garten:pflanzt <{PFLANZEN}> .
"""


@pytest.fixture(scope="module")
def merged_shapes() -> Graph:
    """Beide Shape-Dateien als EINEN Graph — derselbe Fix wie in server.py."""
    g = Graph()
    for f in SHAPES:
        g.parse(f, format="turtle")
    return g


@pytest.fixture(scope="module")
def dataset() -> Graph:
    """Kompletter Datenmerge — Pod first, Fallback lokal (rdf_source)."""
    import sys
    sys.path.insert(0, str(ROOT))
    from rdf_source import get_graph
    return get_graph()


def _conforms(data: Graph, shapes: Graph) -> bool:
    conforms, _, _ = validate(data_graph=data, shacl_graph=shapes)
    return conforms


def test_shapes_files_exist():
    for f in SHAPES:
        assert f.exists(), f"Shape-Datei fehlt: {f}"


def test_valid_planting_conforms(dataset: Graph, merged_shapes: Graph):
    g = Graph()
    for t in dataset:
        g.add(t)
    g.parse(data=VALID_PLANTING, format="turtle")
    assert _conforms(g, merged_shapes), "Gültige Pflanzung muss konform sein"


def test_invalid_planting_fails(dataset: Graph, merged_shapes: Graph):
    """Pflanzung ohne time:hasTemporalExtent muss abgelehnt werden
    (dieser Test hätte den pyshacl-CLI-Bug von Anfang an gefangen)."""
    g = Graph()
    for t in dataset:
        g.add(t)
    g.parse(data=INVALID_PLANTING, format="turtle")
    assert not _conforms(g, merged_shapes), \
        "Pflanzung ohne Jahr darf NICHT konform sein"


def test_wrong_namespace_not_targeted(dataset: Graph, merged_shapes: Graph):
    """Pflanzung im falschen Namespace (garten# statt ontology#) wird von
    targetClass nicht erfasst — Dokumentation der URI-Falle aus dem Projekt."""
    wrong_ns = INVALID_PLANTING.replace(GARTEN, "https://example.org/garten-planer/garten#")
    g = Graph()
    for t in dataset:
        g.add(t)
    g.parse(data=wrong_ns, format="turtle")
    # Nicht konform wäre EXPECTED eigentlich, aber targetClass greift nur auf
    # ontology#Pflanzung — der Datensatz ist formal konform. Wir dokumentieren
    # das Verhalten explizit, damit ein Namespace-Fehler nicht still bleibt.
    assert _conforms(g, merged_shapes), \
        "targetClass greift nur auf ontology# — falsch-namespaced Daten sind formal konform (Falle!)"


def test_dataset_itself_conforms(dataset: Graph, merged_shapes: Graph):
    """Der komplette Datenbestand (Pod oder lokal) muss konform sein."""
    assert _conforms(dataset, merged_shapes), "Datenbestand muss konform sein"
