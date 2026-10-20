import { json } from "@sveltejs/kit";
import { buildGardenModel, podBase } from "#lib/server/pod.js";

/** GET /api/garden — Beete + Pflanzungen als vorgejointes Read-Modell. */
export async function GET() {
  try {
    const model = await buildGardenModel();
    return json(model, {
      headers: {
        "x-rotato-source": podBase() ? "pod" : "local-fallback",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 502 });
  }
}
