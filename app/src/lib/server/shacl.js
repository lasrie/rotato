/**
 * SHACL-Validierung im BFF — als Library, nicht Subprocess.
 *
 * Lektion aus der Testsuite (Session Okt 2026): Die pyshacl-CLI akzeptiert
 * nur EINE -s-Datei (letzter gewinnt) — hier im BFF mergen wir alle
 * Shape-Dateien in EINEN Graph und validieren darüber.
 *
 * WICHTIG: rdf-validate-shacl 0.6.5 unterstützt KEINE sh:sparql-Constraints
 * (gilt im Browser UND im BFF — dieselbe Library). Der BFF validiert daher
 * nur gegen garten-shapes.ttl; die SPARQL-Regel (Abschnitts-Ende > Start)
 * bleibt beim Gateway-POST (server.py, pyshacl) — der BFF-PUT ist ein
 * schneller Vorfilter, das Gateway bleibt die strenge Instanz.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import SHACLValidator from "rdf-validate-shacl";
import ParserN3 from "@rdfjs/parser-n3";
import { Readable } from "node:stream";
import { Store } from "n3";
import rdfEnv from "@zazuko/env";
import { ROOT } from "./paths.js";

const SHACL_NS = "http://www.w3.org/ns/shacl#";

let shapesStore = null;
let validator = null;

function parseInto(store, ttl) {
  const parser = new ParserN3();
  const stream = parser.import(Readable.from([ttl]));
  return new Promise((resolve, reject) => {
    stream.on("data", (quad) => store.addQuad(quad));
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });
}

async function getValidator() {
  if (validator) return validator;
  shapesStore = new Store();
  // Bewusst OHNE garten-layout.shacl.ttl: die enthält sh:sparql, die
  // rdf-validate-shacl nicht ausführen kann (würde oben mit
  // "Cannot find validator for constraint component …SPARQLConstraintComponent"
  // crashen — derselbe Crash wie in der Session Okt 2026 im Browser).
  await parseInto(shapesStore, readFileSync(join(ROOT, "garten-shapes.ttl"), "utf8"));
  // @zazuko/env liefert die vollständige rdfjs-Environment (clownface, dataset,
  // DataFactory …) — ein nacktes n3-Store reicht nicht (factory.clownface fehlt).
  validator = new SHACLValidator(shapesStore, { factory: rdfEnv });
  return validator;
}

/**
 * Validiert gemergtes Dataset + neuen Turtle-Block.
 * @returns {Promise<{ok: boolean, details?: string[]}>}
 */
export async function validateMerged(mergedTtl) {
  const v = await getValidator();
  const store = new Store();
  await parseInto(store, mergedTtl);
  const report = await v.validate(store);
  if (report.conforms) return { ok: true };
  const details = [];
  for (const r of report.results.slice(0, 8)) {
    const focus = r.focusNode?.value ?? "?";
    const msg = Array.isArray(r.message)
      ? r.message.map((m) => m.value ?? String(m)).join("; ")
      : (r.message?.value ?? String(r.message ?? ""));
    details.push(`${focus}: ${msg}`);
  }
  return { ok: false, details };
}

export const SHACL_NS_EXPORT = SHACL_NS;
