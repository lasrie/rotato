/**
 * Pod-Schreibzugriff — read-modify-write auf planungen/planungen.ttl
 * mit ETag (optimistische Concurrency) und SHACL-Pre-Check.
 *
 * Gleicher Flow wie server.py (M2): GET → ETag, Validierung über das
 * KOMPLETTE Dataset (Cache + neuer Block), dann PUT; bei Validierungsfehler
 * wird nichts geschrieben (impliziter Rollback), bei 412 keine Datenverluste.
 */
import { getMergedTtl, invalidateCache, podBase, getAuthFetch } from "./pod.js";
import { validateMerged } from "./shacl.js";

function planungenUrl() {
  const base = podBase();
  if (!base) return null;
  return `${base}/planungen/planungen.ttl`;
}

/**
 * @param {string} turtleBody  neuer Pflanzungs-Block (Turtle)
 * @returns {Promise<{ok: boolean, error?: string, details?: string[], etag?: string}>}
 */
export async function savePflanzung(turtleBody) {
  const body = (turtleBody || "").trim();
  if (!body) return { ok: false, error: "Leere Anfrage" };

  const url = planungenUrl();
  if (!url) {
    return { ok: false, error: "Kein Pod konfiguriert (POD_BASE fehlt) — Schreiben nur im Pod-Setup möglich." };
  }

  // 1) Read-modify-write: erst GET, ETag merken
  let authFetch = null;
  try { authFetch = await getAuthFetch(); } catch { authFetch = null; }
  const fetchFn = authFetch || globalThis.fetch;

  let etag = null;
  let existing = "";
  const get = await fetchFn(url, { headers: { Accept: "text/turtle" } });
  if (get.status === 200) {
    existing = (await get.text()).replace(/\s*$/, "") + "\n";
    etag = get.headers.get("etag");
  } else if (get.status === 404) {
    existing = "";
  } else {
    return { ok: false, error: `Pod-Lesefehler HTTP ${get.status}` };
  }

  // 2) SHACL-Validierung über das KOMPLETTE Dataset + neuer Block
  const merged = `${await getMergedTtl()}\n${body}\n`;
  const v = await validateMerged(merged);
  if (!v.ok) {
    return { ok: false, error: "SHACL-Validierung fehlgeschlagen", details: v.details };
  }

  // 3) PUT mit If-Match (falls ETag vorhanden)
  const headers = { "Content-Type": "text/turtle" };
  if (etag) headers["if-match"] = etag;
  const put = await fetchFn(url, { method: "PUT", headers, body: existing + body + "\n" });
  if (put.status === 200 || put.status === 201 || put.status === 205) {
    invalidateCache();
    return { ok: true, etag: put.headers.get("etag") ?? undefined };
  }
  if (put.status === 412) {
    return {
      ok: false,
      error: "Konflikt: Planungen wurden zwischenzeitlich von jemand anderem geändert — bitte erneut speichern.",
    };
  }
  return { ok: false, error: `Pod-Schreibfehler HTTP ${put.status}: ${(await put.text()).slice(0, 150)}` };
}
