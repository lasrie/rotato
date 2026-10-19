"""Lokaler Server für den Garten-Planer.

Phase B + M2 (Solid-Migration): liefert die RDF-Daten und die Visualisierung aus
und erlaubt das Speichern neuer Pflanzungen (Turtle) — **jetzt direkt in den
Solid-Pod** (lasse.solidcommunity.net) statt in lokale Dateien.

Flow (ADR-0002 Stufe 1: Gateway-first):
  GET  /rdf/data.ttl          → Merge aller Pod-Ressourcen (mit In-Memory-Cache)
  POST /api/pflanzung         → Turtle anhängen (read-modify-write auf Pod),
                                SHACL-validieren (pyshacl), bei Erfolg Exporte
                                regenerieren, bei Fehler Rollback
  GET  /plan.html, /viz/*     → statische Dateien (unverändert)

Die Objekt-URIs bleiben unverändert (ADR-0003); der Pod ist ab M2 die Quelle
der Wahrheit für Pflanzungen.
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from pod_auth import PodAuth
from rdf_source import get_graph, invalidate_cache

ROOT = Path(__file__).parent
PORT = 8765

# Reihenfolge wie im pyshacl-Aufruf — Pod-Ressourcen (ADR-0003)
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

# Statische Dateien, die weiterhin lokal liegen (Viewer)
MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".ttl": "text/turtle; charset=utf-8",
    ".png": "image/png",
    ".css": "text/css; charset=utf-8",
}

CACHE_TTL = 60  # Sekunden


class PodMergeCache:
    """Merged die Pod-Ressourcen mit einfachem In-Memory-Cache."""

    def __init__(self, auth: PodAuth, ttl: int = CACHE_TTL):
        self.auth = auth
        self.ttl = ttl
        self._lock = threading.Lock()
        self._merged: bytes | None = None
        self._merged_at: float = 0.0

    def get_merged(self) -> bytes:
        with self._lock:
            if self._merged is not None and time.time() < self._merged_at + self.ttl:
                return self._merged
            parts = []
            for name in POD_FILES:
                url = f"{self.auth.pod_base}/{name}"
                resp = self.auth.get(url, headers={"Accept": "text/turtle"})
                if resp.status_code == 200:
                    parts.append(f"# ---- {name} ----\n".encode() + resp.content)
                elif resp.status_code == 404:
                    continue  # Ressource existiert noch nicht (z. B. planungen.ttl leer)
                else:
                    raise RuntimeError(f"Pod GET {url} → HTTP {resp.status_code}")
            self._merged = b"\n".join(parts)
            self._merged_at = time.time()
            return self._merged

    def invalidate(self) -> None:
        with self._lock:
            self._merged = None


class GartenHandler(BaseHTTPRequestHandler):
    auth: PodAuth = None  # wird in main() gesetzt
    cache: PodMergeCache = None

    def log_message(self, fmt, *args):  # ruhiger Server
        pass

    # ---------- GET ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/plan.html", "/index.html"):
            return self._serve_file("viz/plan.html", MIME[".html"])
        if path == "/fruchtfolge.html":
            return self._serve_file("viz/fruchtfolge.html", MIME[".html"])
        if path.startswith("/viz/"):
            return self._serve_rel(path[1:])
        if path == "/rdf/data.ttl":
            return self._serve_merged()
        return self._not_found()

    # ---------- POST: Neue Pflanzung speichern ----------
    def do_POST(self):
        path = urlparse(self.path).path
        if path != "/api/pflanzung":
            return self._not_found()
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        ok, msg = self._save_pflanzung(body)
        status = 201 if ok else 400
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(msg.encode("utf-8"))

    # ---------- Hilfsfunktionen ----------
    def _serve_file(self, rel: str, mime: str):
        f = ROOT / rel
        if not f.exists():
            return self._not_found()
        data = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _serve_rel(self, rel: str):
        suffix = Path(rel).suffix
        return self._serve_file(rel, MIME.get(suffix, "application/octet-stream"))

    def _serve_merged(self):
        """Merge aller Pod-Ressourcen als ein Turtle-Dokument (LDP-artig)."""
        try:
            merged = self.cache.get_merged()
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"Pod-Fehler: {e}".encode("utf-8"))
            return
        self.send_response(200)
        self.send_header("Content-Type", MIME[".ttl"])
        self.send_header("Content-Length", str(len(merged)))
        self.end_headers()
        self.wfile.write(merged)

    def _not_found(self):
        self.send_response(404)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"404 not found")

    # ---------- Pflanzung speichern (read-modify-write auf den Pod) ----------
    def _save_pflanzung(self, body: str) -> tuple[bool, str]:
        try:
            body = body.strip()
            if not body:
                return False, '{"ok": false, "error": "Leere Anfrage"}'

            planungen_url = f"{self.auth.pod_base}/planungen/planungen.ttl"

            # Read-modify-write mit ETag (optimistische Concurrency):
            # Wenn zwischen GET und PUT ein anderer Schreiber interveniert,
            # antwortet der Pod mit 412 und wir verlieren keine Daten.
            get = self.auth.get(planungen_url, headers={"Accept": "text/turtle"})
            etag = get.headers.get("ETag")
            if get.status_code == 200:
                existing = get.text.rstrip() + "\n"
            elif get.status_code == 404:
                existing = ""
                etag = None
            else:
                return False, f'{{"ok": false, "error": "Pod-Lesefehler HTTP {get.status_code}"}}'

            # Validierung über das KOMPLETTE Dataset (Cache-Merge + neue Pflanzung),
            # damit Rules über Ressourcen hinweg (aufBeet → Beet) greifen.
            merged = self.cache.get_merged().decode("utf-8") + "\n" + body + "\n"
            ok, msg = self._validate(merged)
            if not ok:
                return False, msg

            # Schreiben in den Pod — erst nach erfolgreicher Validierung.
            # Rollback ist hier implizit: Bei Validierungsfehler wird nichts geschrieben.
            put = self.auth.put(planungen_url, (existing + body + "\n").encode("utf-8"),
                                if_match=etag)
            if put.status_code in (200, 201, 205):
                self.cache.invalidate()
                invalidate_cache()  # Export-Skripte sehen den neuen Stand
                self._regenerate_exports_async()
                return True, '{"ok": true, "message": "Pflanzung gespeichert und validiert"}'
            if put.status_code == 412:
                return False, '{"ok": false, "error": "Konflikt: Planungen wurden zwischenzeitlich von jemand anderem geändert — bitte erneut speichern."}'
            return False, f'{{"ok": false, "error": "Pod-Schreibfehler HTTP {put.status_code}: {put.text[:150]}"}}'

        except Exception as e:  # pragma: no cover
            return False, '{"ok": false, "error": "' + str(e).replace('"', "'") + '"}'

    def _validate(self, merged_ttl: str) -> tuple[bool, str]:
        """pyshacl über beide Shape-Dateien (gemerged)."""
        # ACHTUNG: pyshacl-CLI akzeptiert nur EINE -s-Datei (letzter gewinnt).
        # Deshalb mergen wir die Shape-Dateien in ein temporäres Shapes-Dokument.
        shapes_ttl = "\n".join(
            (ROOT / f).read_text(encoding="utf-8")
            for f in ("garten-shapes.ttl", "garten-layout.shacl.ttl")
        )
        with tempfile.NamedTemporaryFile("w", suffix=".ttl", delete=False) as sf:
            sf.write(shapes_ttl)
            shapes_tmp = sf.name
        with tempfile.NamedTemporaryFile("w", suffix=".ttl", delete=False) as tf:
            tf.write(merged_ttl)
            tmp_name = tf.name

        result = subprocess.run(
            [sys.executable, "-m", "pyshacl", "-s", shapes_tmp, tmp_name],
            capture_output=True, text=True, timeout=120,
        )
        conforms = "Conforms: True" in result.stdout
        if not conforms:
            violation_lines = [l for l in result.stdout.splitlines()
                               if "Focus Node" in l or "Message" in l]
            return False, '{"ok": false, "error": "SHACL-Validierung fehlgeschlagen", "details": ' + \
                   repr(violation_lines[:6]) + '}'
        return True, '{"ok": true}'

    def _regenerate_exports_async(self) -> None:
        """Exporte in einem Hintergrund-Thread neu erzeugen (schnelle POST-Antwort)."""
        def worker():
            try:
                subprocess.run([sys.executable, str(ROOT / "export_garten91_plan.py")],
                               capture_output=True, timeout=120, check=True)
                subprocess.run([sys.executable, str(ROOT / "export_fruchtfolge.py")],
                               capture_output=True, timeout=120, check=True)
                print("Exporte regeneriert.")
            except subprocess.CalledProcessError as e:
                print(f"Export-Fehler: {e.stderr.decode(errors='replace')[:500]}")
            except Exception as e:
                print(f"Export-Fehler: {e}")
        threading.Thread(target=worker, daemon=True).start()


def main():
    auth = PodAuth()
    GartenHandler.auth = auth
    GartenHandler.cache = PodMergeCache(auth)
    # ThreadingHTTPServer: Requests laufen parallel (pyshacl blockiert sonst den ganzen Server)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), GartenHandler)
    server.daemon_threads = True
    print(f"Garten-Planer läuft auf http://localhost:{PORT}/")
    print(f"Pod:        {auth.pod_base}")
    print(f"RDF-Daten:  http://localhost:{PORT}/rdf/data.ttl (aus dem Pod, Cache {CACHE_TTL}s)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer beendet.")


if __name__ == "__main__":
    main()
