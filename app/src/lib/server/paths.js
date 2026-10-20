/** Repo-Root für beide Server-Module (auch im adapter-node-Build). */
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function findRoot() {
  // Dev-Modus: src/lib/server → 4 Ebenen hoch. Build-Modus:
  // build/server/chunks → 5 Ebenen hoch. Wir prüfen beide gegen ein
  // bekanntes Marker-File (garten-shapes.ttl) und nehmen das erste Treffer.
  for (const levels of [4, 5]) {
    const candidate = join(__dirname, ...Array(levels).fill(".."));
    if (existsSync(join(candidate, "garten-shapes.ttl"))) return candidate;
  }
  return join(__dirname, "..", "..", "..", "..");
}

// ROTATO_ROOT überschreibt die Auto-Erkennung (für Deployments).
export const ROOT = process.env.ROTATO_ROOT || findRoot();
