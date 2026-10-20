import { json } from "@sveltejs/kit";
import { buildConflicts, podBase } from "#lib/server/pod.js";

/**
 * GET /api/conflicts?years=2024,2025,2026
 * Konflikt-Engine serverseitig (dieselbe Regel wie fruchtfolge-logic.js):
 * gleiche Fruchtfamilie in aufeinanderfolgenden Jahren auf demselben Beet.
 */
export async function GET({ url }) {
  const yearsParam = url.searchParams.get("years");
  const years = yearsParam
    ? yearsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : ["2024", "2025", "2026"];
  try {
    const model = await buildConflicts(years);
    return json(model, {
      headers: { "x-rotato-source": podBase() ? "pod" : "local-fallback", "cache-control": "no-store" },
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 502 });
  }
}
