"""Gemeinsame RDF-Datenquelle für Export-Skripte und Server.

ADR-0002 Stufe 1 (Gateway-first): Der Pod ist die Quelle der Wahrheit.
Dieses Modul lädt den Merge der Pod-Ressourcen — mit Fallback auf die
lokalen .ttl-Dateien (Offline-Modus / frisches Checkout ohne .env).

Nutzen:
- export_garten91_plan.py und export_fruchtfolge.py sehen dieselben Daten
  wie der Server — neue Pflanzungen erscheinen sofort im Viewer (Bug-Fix M2).
- Eine einzige Liste der Dateien/Ressourcen statt Kopien in jedem Skript.
"""
from __future__ import annotations

import threading
import time
from pathlib import Path

from rdflib import Graph

ROOT = Path(__file__).parent

# Lokale Dateien in Merge-Reihenfolge (Präfixe wie vokabular zuerst)
LOCAL_FILES = [
    "garten-vokabular.ttl",
    "garten-layout-vokabular.ttl",
    "pflanzen.ttl",
    "beetplan-2025-extrahiert.ttl",
    "garten91-linking.ttl",
    "garten-layout-ontology.ttl",
    "garten91-beete-real.ttl",
    "garten91-belegungen-real-2025.ttl",
    "garten91-beetplan-2024.ttl",
    "garten91-planungen-neu.ttl",
    "anbau-journal.ttl",
]

# Pod-Ressourcen in derselben Reihenfolge (ADR-0003)
POD_FILES = [
    "vokabular.ttl",
    "ontologie.ttl",
    "shapes.ttl",
    "layout-shapes.ttl",
    "pflanzen.ttl",
    "beete.ttl",
    "beetplan-2025-extrahiert.ttl",
    "beetplan-2024.ttl",
    "belegungen-2025.ttl",
    "planungen/planungen.ttl",
    "journal/anbau-journal.ttl",
    "linking.ttl",
]

# Kurzer Cache, damit mehrfaches Laden innerhalb eines Prozesses nicht
# mehrfach über das Netz geht (Export-Skripte laufen pro POST zweimal).
_CACHE_TTL = 30
_lock = threading.Lock()
_cache: str | None = None
_cache_at: float = 0.0


def load_local_merged() -> str:
    """Merge der lokalen .ttl-Dateien (Fallback / Offline)."""
    parts = []
    for name in LOCAL_FILES:
        f = ROOT / name
        if f.exists():
            parts.append(f"# ---- {name} ----\n" + f.read_text(encoding="utf-8"))
    return "\n".join(parts)


def get_merged_ttl(*, force_pod: bool = False) -> str:
    """Merge-Turtle: Pod first, Fallback lokal. Ergebnis wird kurz gecacht."""
    global _cache, _cache_at
    with _lock:
        if _cache is not None and time.time() < _cache_at + _CACHE_TTL:
            return _cache

        ttl = None
        if not force_pod:
            try:
                from pod_auth import PodAuth  # erst hier importieren (offline-tauglich)
                auth = PodAuth()
                parts = []
                for name in POD_FILES:
                    url = f"{auth.pod_base}/{name}"
                    resp = auth.get(url, headers={"Accept": "text/turtle"})
                    if resp.status_code == 200:
                        parts.append(f"# ---- {name} ----\n" + resp.text)
                    elif resp.status_code == 404:
                        continue  # z. B. leere planungen.ttl
                    else:
                        raise RuntimeError(f"Pod GET {url} → HTTP {resp.status_code}")
                ttl = "\n".join(parts)
            except Exception:
                ttl = None  # Fallback unten

        if ttl is None:
            ttl = load_local_merged()

        _cache = ttl
        _cache_at = time.time()
        return ttl


def get_graph(*, force_pod: bool = False) -> Graph:
    """Geparster Merge-Graph (Pod first, Fallback lokal)."""
    return Graph().parse(data=get_merged_ttl(force_pod=force_pod), format="turtle")


def invalidate_cache() -> None:
    """Nach einem Schreibvorgang aufrufen (z. B. neuer POST /api/pflanzung)."""
    global _cache
    with _lock:
        _cache = None
