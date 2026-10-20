import { json } from "@sveltejs/kit";
import { buildGardenModel, podBase } from "#lib/server/pod.js";
import { savePflanzung } from "#lib/server/save.js";

/**
 * GET /api/plantings           → Pflanzungen (gejoint), optional ?year=
 * GET /api/plantings?conflicts=1 → mit Konflikten (Bequemlichkeit)
 * PUT /api/plantings           → neue/ändernde Pflanzung (Turtle-Body)
 *                                SHACL-Pre-Check, dann Pod-PUT (If-Match).
 */
export async function GET({ url }) {
  const year = url.searchParams.get("year");
  try {
    const model = await buildGardenModel();
    let plantings = model.plantings;
    if (year) plantings = plantings.filter((p) => p.year === year);

    if (url.searchParams.get("conflicts") === "1") {
      return json(
        { plantings, conflicts: model.conflicts, fetchedAt: model.fetchedAt },
        { headers: { "x-rotato-source": podBase() ? "pod" : "local-fallback", "cache-control": "no-store" } },
      );
    }
    return json(
      { plantings, fetchedAt: model.fetchedAt },
      { headers: { "x-rotato-source": podBase() ? "pod" : "local-fallback", "cache-control": "no-store" } },
    );
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 502 });
  }
}

export async function PUT({ request }) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("text/turtle") && !ct.includes("text/plain")) {
    return json(
      { ok: false, error: "Content-Type muss text/turtle sein (Turtle-Body der Pflanzung)." },
      { status: 415 },
    );
  }
  const body = await request.text();
  try {
    const res = await savePflanzung(body);
    if (!res.ok) {
      return json(res, { status: res.details ? 422 : 409 });
    }
    return json({ ok: true, message: "Pflanzung gespeichert und validiert" }, { status: 201 });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
