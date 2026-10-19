/**
 * Bridge für den Fruchtfolge-Viewer (M4): lädt die Fruchtfolge direkt aus dem
 * Pod (fruchtfolge-logic.js) und befüllt window.FRUCHTFOLGE für den bestehenden
 * inline-Renderer. Fällt auf den Gateway-Export zurück, wenn der Pod nicht
 * erreichbar ist (z. B. offline).
 */
import { authReady, session, doLogin } from "./solid-auth.js";
import { getFruchtfolge } from "./fruchtfolge-logic.js";

async function load() {
  // Session-Init abwarten (session.fetch braucht die OIDC-Session)
  await authReady;
  if (!session.info.isLoggedIn) {
    // Fix ADR-Stufe-2: Der dynamische Client kennt nur plan.html als Redirect-URI.
    // Also: Login mit redirect auf plan.html, Rückweg über sessionStorage-Marker.
    if (!sessionStorage.getItem("ff-login-attempted")) {
      sessionStorage.setItem("ff-login-attempted", "1");
      sessionStorage.setItem("auth-return-to", window.location.href);
      console.info("Keine Session — Login über plan.html (Redirect-Ziel des Clients), danach Rückleitung.");
      await doLogin();
      return;
    }
    console.warn("Keine Solid-Session — bitte oben anmelden.");
  } else {
    console.info("Solid-Session aktiv:", session.info.webId);
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
    sessionStorage.removeItem("ff-login-attempted");
  } catch (e) {
    console.warn("Pod-Laden fehlgeschlagen, nutze Gateway-Export:", e.message);
    window.__fruchtfolgeSource = "export-fallback";
  }
  // inline-Skript rendern (es läuft nach diesem Modul)
  window.dispatchEvent(new CustomEvent("fruchtfolge-ready"));
}

load();
