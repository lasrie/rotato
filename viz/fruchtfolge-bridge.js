/**
 * Bridge für den Fruchtfolge-Viewer (M4): lädt die Fruchtfolge direkt aus dem
 * Pod (fruchtfolge-logic.js) und befüllt window.FRUCHTFOLGE für den bestehenden
 * inline-Renderer. Fällt auf den Gateway-Export zurück, wenn der Pod nicht
 * erreichbar ist (z. B. offline).
 */
import { authReady, session } from "./solid-auth.js";
import { getFruchtfolge } from "./fruchtfolge-logic.js";

async function load() {
  // Session-Init abwarten (session.fetch braucht die OIDC-Session)
  await authReady;
  if (session.info.isLoggedIn) {
    console.info('Solid-Session aktiv:', session.info.webId);
  } else {
    console.warn('Keine Solid-Session — Pod-Daten werden 401 liefern. Bitte oben anmelden.');
  }
  // Lokaler Export vorhanden (Entwickler-Modus)? Dann überspringen — der
  // klassische Renderer nutzt die Export-Daten.
  if (window.FRUCHTFOLGE && window.FRUCHTFOLGE.matrix?.length) {
    window.__fruchtfolgeSource = "export";
    return;
  }
  try {
    const data = await getFruchtfolge({ refresh: true });
    window.FRUCHTFOLGE = data;
    window.__fruchtfolgeSource = "pod";
  } catch (e) {
    console.warn("Pod-Laden fehlgeschlagen, nutze Gateway-Export:", e.message);
    window.__fruchtfolgeSource = "export-fallback";
  }
  // inline-Skript rendern (es läuft nach diesem Modul)
  window.dispatchEvent(new CustomEvent("fruchtfolge-ready"));
}

load();
