/**
 * Solid-Integration für den Garten-Planer (M3 Frontend-Direct, ADR-0002 Stufe 2).
 *
 * - Login via Solid-OIDC (solidcommunity.net)
 * - Direktes Lesen/Schreiben im Pod (kein Gateway nötig)
 * - SHACL-Validierung im Browser (dieselben Shapes wie der Server, ADR-0004)
 * - Fallback: Wenn nicht eingeloggt, läuft der Viewer weiter über das Gateway
 *   (server.py, Stufe 1) — beide Pfade funktionieren parallel.
 */
import {
  login, logout, fetch, handleIncomingRedirect, getDefaultSession,
  SHACLValidator, rdfEnv, N3Parser,
} from "./lib/solid-bundle.js";

const POD_BASE = "https://lasse.solidcommunity.net/garten/";
const OIDC_ISSUER = "https://solidcommunity.net";
const GATEWAY = window.location.origin; // server.py im lokalen Modus

export const session = getDefaultSession();

const TRS_GREGORIAN = "http://www.opengis.net/def/uom/ISO-8601/0/Gregorian";

let shapesDataset = null;

async function getShapesDataset() {
  // Beide Shape-Dateien einmalig aus dem Pod laden und zu einem Dataset mergen
  // (gleiche Semantik wie der gemergte pyshacl-Shape-Graph im Server).
  if (!shapesDataset) {
    const shapesDs = rdfEnv.dataset();
    // NUR garten-shapes.ttl: rdf-validate-shacl unterstützt keine SPARQL-Constraints
    // (sh:sparql in garten-layout.shacl.ttl → Crash im Browser). Die SPARQL-Regeln
    // bleiben serverseitig (pyshacl, Stufe 1 / Gateway-Fallback). Dokumentiert in ADR-0004.
    const res = await fetch(POD_BASE + "shapes.ttl", { headers: { Accept: "text/turtle" } });
    if (!res.ok) throw new Error(`Shapes laden fehlgeschlagen: HTTP ${res.status}`);
    await addTurtleToDataset(await res.text(), shapesDs);
    shapesDataset = shapesDs;
  }
  return shapesDataset;
}

async function addTurtleToDataset(turtle, dataset) {
  // n3.Parser ist string-basiert (browser-safe); @rdfjs/parser-n3 bräuchte Node-Streams
  const quads = new N3Parser().parse(turtle);
  for (const quad of quads) dataset.add(quad);
}

let podDatasetCache = null;
let podDatasetAt = 0;

async function loadPodDatasetForValidation({ refresh = false } = {}) {
  // Das KOMPLETTE Dataset aus dem Pod (Beete, Pflanzen, ...) — nötig, damit
  // sh:class-Constraints (aufBeet → Beet) die referenzierten Objekte kennen.
  // Kurzer Cache (60s), damit nicht jeder POST alles neu lädt.
  if (podDatasetCache && !refresh && Date.now() - podDatasetAt < 60000) {
    return podDatasetCache;
  }
  const ds = rdfEnv.dataset();
  const files = ["vokabular.ttl", "ontologie.ttl", "pflanzen.ttl", "beete.ttl",
    "beetplan-2025-extrahiert.ttl", "beetplan-2024.ttl", "belegungen-2025.ttl",
    "planungen/planungen.ttl", "journal/anbau-journal.ttl", "linking.ttl"];
  for (const name of files) {
    const res = await fetch(POD_BASE + name, { headers: { Accept: "text/turtle" } });
    if (res.ok) await addTurtleToDataset(await res.text(), ds);
    // 404 (z. B. leere Planungen) ist ok
  }
  podDatasetCache = ds;
  podDatasetAt = Date.now();
  return ds;
}

/**
 * SHACL-Validierung im Browser (ADR-0004 Stufe 2).
 * Liefert { conforms, details[] }.
 */
export async function validateShacl(turtle) {
  const shapes = await getShapesDataset();
  const validator = new SHACLValidator(shapes, { factory: rdfEnv });
  // Das KOMPLETTE Pod-Dataset (60s-Cache) + neuer Turtle-Block (wie server.py es validiert)
  const data = await loadPodDatasetForValidation();
  await addTurtleToDataset(turtle, data);
  const report = await validator.validate(data);
  return {
    conforms: report.conforms,
    details: (report.results ?? []).slice(0, 6).map((r) =>
      `${r.focusNode?.value ?? "?"}: ${r.message?.map((m) => m.value).join("; ") ?? "?"}`),
  };
}

/** Wird beim App-Start aufgerufen: bearbeitet OIDC-Redirect nach dem Login. */
export async function initSolidAuth() {
  await handleIncomingRedirect({ restorePreviousSession: true });
  return session;
}

export function isLoggedIn() {
  return session.info.isLoggedIn;
}

export async function doLogin() {
  await login({
    oidcIssuer: OIDC_ISSUER,
    redirect: window.location.href,
    clientName: "Garten-Planer",
  });
}

export async function doLogout() {
  await logout();
}

/**
 * Turtle-Pflanzung speichern:
 * 1. SHACL im Browser validieren (nur im Frontend-Direct-Pfad)
 * 2. Direkt in den Pod schreiben (If-Match-Schutz)
 * Fallback ohne Login: Gateway (Stufe 1), das serverseitig validiert.
 */
export async function savePflanzung(turtle) {
  if (isLoggedIn()) {
    const validation = await validateShacl(turtle);
    if (!validation.conforms) {
      return { ok: false, error: "SHACL-Validierung fehlgeschlagen", details: validation.details };
    }
    const planUrl = POD_BASE + "planungen/planungen.ttl";
    // cache: "no-store" verhindert 304-Not-Modified (deren Body wäre leer — ein Blind-
    // schreibender PUT würde dann bestehende Pflanzungen ÜBERSCHREIBEN/DATENVERLUST).
    const get = await fetch(planUrl, { headers: { Accept: "text/turtle" }, cache: "no-store" });
    let existing = "";
    if (get.status === 200) {
      existing = (await get.text()).trimEnd();
      if (!existing.trim()) existing = "# Planungen\n";
      else existing += "\n";
    } else if (get.status === 404) {
      existing = "# Planungen\n";
    } else {
      throw new Error(`Pod-Lesefehler HTTP ${get.status}`);
    }
    const etag = get.headers.get("ETag");
    const put = await fetch(planUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "text/turtle",
        ...(etag ? { "If-Match": etag } : {}),
      },
      body: existing + turtle.trim() + "\n",
    });
    if (put.status === 412) {
      return { ok: false, error: "Konflikt: Planungen wurden zwischenzeitlich geändert — bitte erneut speichern." };
    }
    if (!put.ok) {
      throw new Error(`Pod-Schreibfehler HTTP ${put.status}`);
    }
    return { ok: true, via: "pod" };
  }

  // Fallback: Gateway (Stufe 1) — validiert serverseitig mit pyshacl
  const res = await fetch(GATEWAY + "/api/pflanzung", {
    method: "POST",
    headers: { "Content-Type": "text/turtle" },
    body: turtle,
  });
  return res.json();
}
