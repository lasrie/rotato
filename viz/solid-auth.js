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
} from "./lib/solid-bundle.js";

const POD_BASE = "https://lasse.solidcommunity.net/garten/";
const OIDC_ISSUER = "https://solidcommunity.net";
const GATEWAY = window.location.origin; // server.py im lokalen Modus

export const session = getDefaultSession();

let shaclValidatorPromise = null;

async function getShaclValidator() {
  // Shapes einmalig laden (beide Shape-Dateien aus dem Pod, identisch zu server.py)
  if (!shaclValidatorPromise) {
    shaclValidatorPromise = (async () => {
      const { SHACLValidator, Parser } = await import("./lib/solid-bundle.js");
      const parser = new Parser();
      const shapes = parser.parse(await (await fetch(POD_BASE + "shapes.ttl", { headers: { Accept: "text/turtle" } })).text());
      const layoutShapes = parser.parse(await (await fetch(POD_BASE + "layout-shapes.ttl", { headers: { Accept: "text/turtle" } })).text());
      // Beide Graphen zusammenführen (gleicher Fix wie der pyshacl-CLI-Bug)
      const merged = shapes.merge?.(layoutShapes) ?? shapes;
      return new SHACLValidator(merged, { factory: { dataFactory: parser._factory } });
    })();
    shaclValidatorPromise.catch(() => { shaclValidatorPromise = null; });
  }
  return shaclValidatorPromise;
}

/**
 * SHACL-Validierung im Browser (ADR-0004 Stufe 2).
 * Liefert { conforms, details[] }.
 */
export async function validateShacl(turtle) {
  const { SHACLValidator, Parser } = await import("./lib/solid-bundle.js");
  const parser = new Parser();
  const validator = await getShaclValidator();
  const data = parser.parse(turtle);
  // Validator validiert gegen das Dataset; Merged-Graph wird beim ersten Aufruf geladen.
  const report = validator.validate({ dataset: data });
  return {
    conforms: report.conforms,
    details: report.results?.slice(0, 6).map((r) => `${r.focusNode?.value}: ${r.message?.[0]?.value}`) ?? [],
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
    const get = await fetch(planUrl, { headers: { Accept: "text/turtle" } });
    if (!get.ok && get.status !== 404) {
      throw new Error(`Pod-Lesefehler HTTP ${get.status}`);
    }
    const etag = get.headers.get("ETag");
    const existing = get.ok ? (await get.text()).trimEnd() + "\n" : "";
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
