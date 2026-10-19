"""Tests für die Export-Skripte: Die Exporte müssen aus der gemeinsamen
Datenquelle (rdf_source) lesbar und strukturell korrekt sein."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))


def _run_export(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(ROOT / script)],
        capture_output=True, text=True, timeout=120,
    )


def test_export_garten91_plan_runs():
    r = _run_export("export_garten91_plan.py")
    assert r.returncode == 0, f"Export fehlgeschlagen: {r.stderr[-500:]}"
    out = ROOT / "viz" / "garten91-plan.js"
    assert out.exists(), "Export-Datei fehlt"


def test_export_garten91_plan_structure():
    text = (ROOT / "viz" / "garten91-plan.js").read_text(encoding="utf-8")
    assert text.startswith("window.GARTEN91_PLAN = "), "Export-Format falsch"
    # JSON-Teil extrahieren (alles zwischen '=' und abschließend ';')
    json_part = text[len("window.GARTEN91_PLAN = "):].rstrip(";\n")
    data = json.loads(json_part)
    assert data["beds"], "keine Beete im Export"
    assert len(data["beds"]) >= 10, "zu wenige Beete (REIHENFOLGE sollte 10+ liefern)"
    assert data["months"][0] is None, "Monats-Liste: Index 0 muss None sein (1-basiert)"
    assert len(data["months"]) == 13
    assert data["plants"], "keine Pflanzen im Export"
    # Jede Pflanzung braucht die Kernfelder
    for bed in data["beds"]:
        for p in bed["plantings"]:
            assert "jahr" in p and p["jahr"], f"Pflanzung ohne Jahr: {p['id']}"
            assert "plant" in p
            assert "familyColor" in p


def test_export_fruchtfolge_runs():
    r = _run_export("export_fruchtfolge.py")
    assert r.returncode == 0, f"Export fehlgeschlagen: {r.stderr[-500:]}"
    out = ROOT / "viz" / "fruchtfolge-data.js"
    assert out.exists(), "Export-Datei fehlt"
    text = out.read_text(encoding="utf-8")
    # Format: window.FRUCHTFOLGE_DATA = {...};  (Name im Skript prüfen)
    assert "window." in text and re.search(r"= \{", text), "Export-Format falsch"


def test_both_exports_use_pod_source():
    """Die Exporte müssen aus rdf_source lesen — nicht mehr aus lokalen
    Dateien mit eigener Liste (Bug-Fix M2: neue Pflanzungen unsichtbar)."""
    for script in ("export_garten91_plan.py", "export_fruchtfolge.py"):
        src = (ROOT / script).read_text(encoding="utf-8")
        assert "from rdf_source import get_graph" in src, \
            f"{script} nutzt nicht die gemeinsame Quelle (rdf_source)"
        assert "garten-vokabular.ttl" not in src or "LOCAL_FILES" in src, \
            f"{script} definiert eigene FILES-Liste — sollte rdf_source nutzen"
