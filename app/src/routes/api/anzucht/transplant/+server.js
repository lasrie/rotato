import { json } from "@sveltejs/kit";
import { podBase, getAuthFetch } from "#lib/server/pod.js";
import { validateMerged } from "#lib/server/shacl.js";
import { getMergedTtl, invalidateCache } from "#lib/server/pod.js";

/**
 * POST /api/anzucht/transplant — Umpflanzen aus dem Anzucht-Dock aufs Beet.
 *
 * Body (JSON): { uri, bed, month? }
 *   uri  — URI der Pflanzung (muss in planungen/planungen.ttl liegen)
 *   bed  — Slug des Ziel-Beets (z. B. "tomatenbeet")
 *   month— optional "2026-05" (monatPflanzung setzen)
 *
 * Ablauf (ADR-0004 read-modify-write):
 *   1. GET doc (planungen.ttl ODER journal/anbau-journal.ttl — die Pflanzung
 *      wird dort gesucht; 2026er Anzucht-Einträge liegen im Journal) (ETag)
 *   2. Block der Pflanzung lokal ersetzen: garten:aufBeet setzen + status "gepflanzt"
 *   3. SHACL-Pre-Check über komplettes Dataset + geändertes Doc
 *   4. PUT mit If-Match; 412 → Konflikt-Meldung
 */
export async function POST({ request }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Body muss JSON sein." }, { status: 400 });
  }
  const { uri, bed, month } = payload ?? {};
  if (!uri || !bed) {
    return json({ ok: false, error: "uri und bed sind Pflichtfelder." }, { status: 400 });
  }
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    return json({ ok: false, error: "month muss als YYYY-MM angegeben sein." }, { status: 400 });
  }

  const base = podBase();
  if (!base) {
    return json({ ok: false, error: "Kein Pod konfiguriert (POD_BASE fehlt)." }, { status: 503 });
  }
  // Die Pflanzung kann in planungen.ttl (neue Planungen) oder im
  // anbau-journal.ttl (2026er Anzucht-Einträge der Anzuchtdatenbank) liegen.
  const docs = ["planungen/planungen.ttl", "journal/anbau-journal.ttl"];

  let authFetch;
  try { authFetch = await getAuthFetch(); } catch { authFetch = null; }
  const fetchFn = authFetch || globalThis.fetch;

  // 1) Doc suchen, das die Pflanzung enthält (GET, ETag merken)
  let docUrl = null, etag = null, doc = "";
  for (const name of docs) {
    const u = `${base}/${name}`;
    const get = await fetchFn(u, { headers: { Accept: "text/turtle" } });
    if (get.status === 404) continue;
    if (get.status !== 200) {
      return json({ ok: false, error: `Pod-Lesefehler HTTP ${get.status} (${name})` }, { status: 502 });
    }
    const t = await get.text();
    // Doc-URI kann relativ sein (<#e2026_090> mit @base) — Suffix-Match auf die
    // letzte URI-Komponente, um relative und absolute Schreibweisen zu fangen.
    const suffix = uri.includes("#") ? uri.split("#").pop() : uri.split("/").pop();
    if (t.includes(suffix)) {
      docUrl = u; etag = get.headers.get("etag"); doc = t;
      break;
    }
  }
  if (!docUrl) {
    return json(
      { ok: false, error: "Pflanzung weder in planungen.ttl noch im Journal gefunden." },
      { status: 404 },
    );
  }

  // 2) Block ersetzen: Pflanzung finden, aufBeet hinzufügen + status setzen
  const bedUri = `https://example.org/garten-planer/data/garten91/real/#${bed}`;
  const updated = updatePlantingBlock(doc, uri, bedUri, month);
  if (!updated.ok) return json({ ok: false, error: updated.error }, { status: 422 });

  // 3) SHACL-Pre-Check: komplettes Dataset MINUS das geänderte Doc (kein Doppel
  //    im Merge — doppelte Docs machen die Validierung unbrauchbar), plus das
  //    modifizierte Doc.
  const excludeName = docUrl.replace(base + "/", "");
  const restTtl = await getMergedTtl({ exclude: [excludeName] });
  const v = await validateMerged(restTtl + "\n" + updated.doc + "\n");
  if (!v.ok) {
    return json({ ok: false, error: "SHACL-Validierung fehlgeschlagen", details: v.details }, { status: 422 });
  }

  // 4) PUT mit If-Match
  const headers = { "Content-Type": "text/turtle" };
  if (etag) headers["If-Match"] = etag;
  const put = await fetchFn(docUrl, { method: "PUT", headers, body: updated.doc });
  if (put.status === 200 || put.status === 201 || put.status === 205) {
    invalidateCache();
    return json({ ok: true, message: `Pflanzung auf ${bed} transplantiert.` });
  }
  if (put.status === 412) {
    return json({
      ok: false,
      error: "Konflikt: Planungen wurden zwischenzeitlich geändert — bitte erneut versuchen.",
    }, { status: 409 });
  }
  return json({ ok: false, error: `Pod-Schreibfehler HTTP ${put.status}` }, { status: 502 });
}

/**
 * Ersetzt im Turtle-Doc den Block einer Pflanzung: fügt garten:aufBeet und
 * optional garten:monatPflanzung hinzu und setzt garten:status "gepflanzt".
 *
 * Block-Erkennung: vom Subject (die URI-Zeile) bis zur nächsten Leerzeile
 * (Turtle-Konvention in diesem Repo: Statements getrennt durch Leerzeilen).
 */
function updatePlantingBlock(doc, uri, bedUri, month) {
  // Doc-Statements können relativ sein (<#e2026_090>) — Suffix-Match.
  const suffix = uri.includes("#") ? uri.split("#").pop() : uri.split("/").pop();
  const lines = doc.split("\n");
  const startIdx = lines.findIndex((l) => l.trim().startsWith("<") && l.includes(suffix));
  if (startIdx === -1) return { ok: false, error: "Pflanzung im Doc nicht gefunden." };
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") { endIdx = i; break; }
  }
  const block = lines.slice(startIdx, endIdx);

  const bedLine = `    garten:aufBeet <${bedUri}> ;`;
  const statusLine = `    garten:status "gepflanzt" ;`;
  const monthLine = month ? `    garten:monatPflanzung "${month}"^^<http://www.w3.org/2001/XMLSchema#gYearMonth> ;` : null;

  // Prüfen, ob aufBeet schon gesetzt ist (Doppel-Transplant abfangen)
  if (block.some((l) => l.includes("garten:aufBeet"))) {
    return { ok: false, error: "Pflanzung hat schon ein Beet — Umpflanzen nicht möglich." };
  }

  // Insert-Punkt: VOR der nested time:hasTemporalExtent-Struktur (falls vorhanden),
  // sonst nach der letzten Property-Zeile (endet mit ";"). Die Zeitstruktur
  // "[ ... ] ." darf NICHT durch eingefügte Zeilen unterbrochen werden
  // (would break the Turtle brackets — Folgefehler: "Unexpected literal").
  let insertIdx = -1;
  for (let i = 0; i < block.length; i++) {
    if (block[i].trim().startsWith("time:hasTemporalExtent") ||
        block[i].trim().includes("time:hasTemporalExtent")) {
      insertIdx = i;
      break;
    }
  }
  if (insertIdx === -1) {
    for (let i = block.length - 1; i >= 0; i--) {
      if (block[i].trim().endsWith(";")) { insertIdx = i + 1; break; }
    }
    if (insertIdx === -1) insertIdx = 1;   // fallback: nach der type-Zeile
  }

  const inserts = [statusLine, bedLine];
  if (monthLine) inserts.push(monthLine);
  block.splice(insertIdx, 0, ...inserts);

  lines.splice(startIdx, endIdx - startIdx, ...block);
  return { ok: true, doc: lines.join("\n") };
}
