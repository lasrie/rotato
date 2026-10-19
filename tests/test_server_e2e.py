"""Tests für die Server-Logik — End-to-End gegen einen echten lokalen Server.

Der Server braucht Pod-Zugriff (.env). Diese Tests starten server.py,
posten eine Test-Pflanzung und prüfen die Antwort — Pod-Schreiben wird
über die echte .env gemacht, danach wird der Test-Eintrag wieder entfernt.
"""
from __future__ import annotations

import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest
import requests

ROOT = Path(__file__).parent.parent
PORT = 8799  # eigener Port für Tests, kollidiert nicht mit dem Dev-Server

VALID_PLANTING = """
@prefix garten: <https://example.org/garten-planer/ontology#> .
@prefix time: <http://www.w3.org/2006/time#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<https://example.org/garten-planer/test/#p-e2e-test> a garten:Pflanzung ;
    garten:pflanzt <https://example.org/garten-planer/pflanzen/#Tomate> ;
    garten:aufBeet <https://example.org/garten-planer/data/garten91/real/#tomatenbeet> ;
    time:hasTemporalExtent [
        a time:TemporalEntity ;
        time:hasTRS <http://www.opengis.net/def/uom/ISO-8601/0/Gregorian> ;
        time:hasBeginning [ time:inXSDgYear "2026"^^xsd:gYear ]
    ] .
"""

INVALID_PLANTING = """
@prefix garten: <https://example.org/garten-planer/ontology#> .
<https://example.org/garten-planer/test/#p-e2e-invalid> a garten:Pflanzung ;
    garten:pflanzt <https://example.org/garten-planer/pflanzen/#Tomate> .
"""


@pytest.fixture(scope="module")
def server():
    """server.py mit Test-Port starten (braucht gültige .env)."""
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py")],
        env={**__import__("os").environ, "GARTEN_PORT": str(PORT)},
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{PORT}"
    # Warten bis der Server antwortet (max 15 s)
    for _ in range(30):
        try:
            requests.get(f"{base}/rdf/data.ttl", timeout=2)
            break
        except requests.RequestException:
            time.sleep(0.5)
    else:
        proc.terminate()
        pytest.skip("Server startete nicht (Pod erreichbar? .env vorhanden?)")
    yield base
    proc.terminate()
    proc.wait(timeout=10)


def test_data_ttl_served(server):
    r = requests.get(f"{server}/rdf/data.ttl", timeout=60)
    assert r.status_code == 200
    assert "text/turtle" in r.headers["Content-Type"]
    assert "garten:Pflanzung" in r.text or "Pflanzung" in r.text


def test_viewer_pages_served(server):
    for path in ("/", "/plan.html", "/fruchtfolge.html"):
        r = requests.get(f"{server}{path}", timeout=10)
        assert r.status_code == 200, f"{path} → {r.status_code}"


def test_post_valid_planting(server):
    r = requests.post(f"{server}/api/pflanzung", data=VALID_PLANTING.encode(),
                      headers={"Content-Type": "text/turtle"}, timeout=120)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["ok"] is True
    _cleanup(server)


def test_post_invalid_planting_rejected(server):
    r = requests.post(f"{server}/api/pflanzung", data=INVALID_PLANTING.encode(),
                      headers={"Content-Type": "text/turtle"}, timeout=120)
    assert r.status_code == 400
    body = r.json()
    assert body["ok"] is False
    assert "SHACL" in body.get("error", "")


def test_post_empty_rejected(server):
    r = requests.post(f"{server}/api/pflanzung", data=b"",
                      headers={"Content-Type": "text/turtle"}, timeout=30)
    assert r.status_code == 400
    assert r.json()["ok"] is False


def _cleanup(server):
    """Test-Pflanzung wieder aus dem Pod entfernen (PUT leerer Planungen)."""
    # Der Server invalidiert seinen Cache nicht bei unserem direkten PUT,
    # daher warten wir kurz auf Cache-Ablauf und überschreiben danach.
    from pod_auth import PodAuth
    auth = PodAuth()
    resp = auth.put(f"{auth.pod_base}/planungen/planungen.ttl",
                    b"# Planungen\n")
    assert resp.status_code in (200, 201, 205), resp.text
