from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
PPTM = ROOT / "input" / "Beetplan 2025.pptm"
OUT_DIR = ROOT / "viz" / "slides"
TMP_DIR = ROOT / "tmp" / "ppt_render_exact"
PDF = TMP_DIR / "Beetplan 2025.pdf"


def need(cmd: str) -> str:
    path = shutil.which(cmd)
    if not path:
        raise SystemExit(f"Fehlt im PATH: {cmd}")
    return path


def main() -> None:
    soffice = need("soffice")
    pdftoppm = need("pdftoppm")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    subprocess.run(
        [soffice, "--headless", "--convert-to", "pdf", "--outdir", str(TMP_DIR), str(PPTM)],
        check=True,
    )
    subprocess.run(
        [pdftoppm, "-png", str(PDF), str(OUT_DIR / "slide")],
        check=True,
    )
    print(f"Wrote slides to {OUT_DIR}")


if __name__ == "__main__":
    main()
