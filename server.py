"""Lokaler Server für den Garten-Planer.

Phase B: liefert die RDF-Daten und die Visualisierung aus und erlaubt das
Speichern neuer Pflanzungen (Turtle) direkt in die RDF-Dateien.

Solid/LDP-kompatibel entworfen: GET liefert Turtle, PUT/POST nimmt Turtle
an. Die URIs bleiben stabil, damit ein späterer Wechsel auf einen echten
Solid-Pod (lasse.solidcommunity.net) ohne Frontend-Änderung möglich ist.

Start: python3 server.py  →  http://localhost:8765/
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).parent
PORT = 8765

# Reihenfolge wie im pyshacl-Aufruf – Zusammenführung für Export & Validierung
RDF_FILES = [
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

# Zieldatei für neue Pflanzungen (Phase B Entwurfs-Layer)
PLANUNGSPUFFER = ROOT / "garten91-planungen-neu.ttl"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".ttl": "text/turtle; charset=utf-8",
    ".png": "image/png",
    ".css": "text/css; charset=utf-8",
}


class GartenHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # ruhiger Server
        pass

    # ---------- GET ----------
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ("/", "/plan.html", "/index.html"):
            return self._serve_file("viz/plan.html", "text/html; charset=utf-8")
        if path == "/fruchtfolge.html":
            return self._serve_file("viz/fruchtfolge.html", "text/html; charset=utf-8")
        if path.startswith("/viz/"):
            return self._serve_rel(path[1:])
        if path == "/rdf/data.ttl":
            return self._serve_merged()
        if path == "/rdf/planungen-neu.ttl":
            return self._serve_file(str(PLANUNGSPUFFER.relative_to(ROOT)), MIME[".ttl"])
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
        """Alle RDF-Dateien zusammen als ein Turtle-Dokument (LDP-artig)."""
        parts = []
        for name in RDF_FILES:
            f = ROOT / name
            if f.exists():
                parts.append(f"# ---- {name} ----\n" + f.read_text())
        merged = "\n".join(parts).encode("utf-8")
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

    def _save_pflanzung(self, body: str):
        """Neue Pflanzung (Turtle) in den Planungspuffer schreiben + validieren."""
        try:
            if not body.strip():
                return False, '{"ok": false, "error": "Leere Anfrage"}'

            # An den bestehenden Puffer anhängen (oder neu anlegen)
            if PLANUNGSPUFFER.exists():
                with PLANUNGSPUFFER.open("a", encoding="utf-8") as f:
                    f.write("\n" + body.strip() + "\n")
            else:
                PLANUNGSPUFFER.write_text(body.strip() + "\n")

            # Validieren: neue Datei mit allen Daten gegen die Shapes
            merged = [ROOT / f for f in RDF_FILES]
            merged.append(PLANUNGSPUFFER)
            with tempfile.NamedTemporaryFile("w", suffix=".ttl", delete=False) as tf:
                for f in merged:
                    tf.write(f.read_text())
                    tf.write("\n")
                tmp_name = tf.name

            result = subprocess.run(
                [sys.executable, "-m", "pyshacl",
                 "-s", str(ROOT / "garten-shapes.ttl"),
                 "-s", str(ROOT / "garten-layout.shacl.ttl"),
                 tmp_name],
                capture_output=True, text=True, timeout=120,
            )
            conforms = "Conforms: True" in result.stdout

            if conforms:
                # Exporte neu erzeugen, damit beide Viewer die neue Pflanzung zeigen
                subprocess.run([sys.executable, str(ROOT / "export_garten91_plan.py")],
                               capture_output=True, timeout=60)
                subprocess.run([sys.executable, str(ROOT / "export_fruchtfolge.py")],
                               capture_output=True, timeout=60)
                return True, '{"ok": true, "message": "Pflanzung gespeichert und validiert"}'
            else:
                # Nicht valide → wieder zurückrollen
                self._rollback(body)
                violation_lines = [l for l in result.stdout.splitlines()
                                   if "Focus Node" in l or "Message" in l]
                return False, '{"ok": false, "error": "SHACL-Validierung fehlgeschlagen", "details": ' + \
                       repr(violation_lines[:6]) + '}'

        except Exception as e:  # pragma: no cover
            return False, '{"ok": false, "error": "' + str(e).replace('"', "'") + '"}'

    def _rollback(self, body: str):
        """Den letzten Block aus dem Puffer entfernen."""
        if not PLANUNGSPUFFER.exists():
            return
        content = PLANUNGSPUFFER.read_text()
        idx = content.rfind(body.strip())
        if idx >= 0:
            content = content[:idx] + content[idx + len(body.strip()):]
            PLANUNGSPUFFER.write_text(content)


def main():
    server = HTTPServer(("127.0.0.1", PORT), GartenHandler)
    print(f"Garten-Planer läuft auf http://localhost:{PORT}/")
    print(f"RDF-Daten:      http://localhost:{PORT}/rdf/data.ttl")
    print(f"Planungspuffer: {PLANUNGSPUFFER}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer beendet.")


if __name__ == "__main__":
    main()
