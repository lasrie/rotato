/**
 * Bridge-Modul: verbindet das klassische inline-Skript (plan.html) mit der
 * Solid-Auth-Logik (solid-auth.js, ESM). Stellt window.savePflanzung und
 * die Login-UI bereit — der inline-Code bleibt unverändert funktional.
 */
import { initSolidAuth, isLoggedIn, doLogin, doLogout, savePflanzung, session } from "./solid-auth.js";

window.savePflanzung = savePflanzung;
window.solidSession = session;

function updateLoginUi() {
  const el = document.getElementById("solid-login-status");
  if (!el) return;
  if (isLoggedIn()) {
    const name = session.info.webId?.split("/").slice(3, 4)[0] || "Solid";
    el.innerHTML = `
      <span class="solid-user" title="${session.info.webId}">✓ ${name}</span>
      <button id="solid-logout" class="solid-btn">Abmelden</button>`;
    document.getElementById("solid-logout").addEventListener("click", async () => {
      await doLogout();
      updateLoginUi();
      window.location.reload();
    });
  } else {
    el.innerHTML = `<button id="solid-login" class="solid-btn solid-btn-primary">Mit Solid anmelden</button>`;
    document.getElementById("solid-login").addEventListener("click", doLogin);
  }
}

initSolidAuth().then(() => updateLoginUi());
