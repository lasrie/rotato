import { json } from "@sveltejs/kit";
import { buildGardenModel, podBase } from "#lib/server/pod.js";

/**
 * GET /api/anzucht?year=2026 — Anzucht-Read-Modell für das Anzucht-Dock:
 * Pflanzungen des Jahres mit monatAnzucht, die noch nicht aufs Beet
 * transplantiert wurden (bed: null oder status "anzucht"/"geplant").
 *
 * Die Karten im Dock zeigen: Pflanze, Sorte, Menge, monatAnzucht und
 * Stadien-Progress (aus der Zeitdauer bis monatPflanzung abgeleitet).
 */
export async function GET({ url }) {
  const year = url.searchParams.get("year") ?? String(new Date().getFullYear());
  try {
    const model = await buildGardenModel();

    const items = model.plantings
      .filter((p) => p.year === year && p.monthAnzucht)
      .filter((p) => !p.bed || p.status === "anzucht" || p.status === "geplant")
      .map((p) => ({
        uri: p.uri,
        label: p.sortenLabel || p.plant.label,
        plant: p.plant,
        menge: p.menge,
        monthAnzucht: p.monthAnzucht,
        monatPflanzung: p.monatPflanzung,
        status: p.status ?? "anzucht",
      }));

    return json(
      { year, items, fetchedAt: model.fetchedAt },
      { headers: { "x-rotato-source": podBase() ? "pod" : "local-fallback", "cache-control": "no-store" } },
    );
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 502 });
  }
}
