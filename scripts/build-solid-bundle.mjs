/**
 * Build-Skript: bundelt die Inrupt-Client-Libs für den Browser (M3 Frontend-Direct).
 *
 * Erzeugt aus @inrupt/solid-client + solid-client-authn-browser ein ESM-Bundle
 * in viz/lib/solid-bundle.js. Der Viewer importiert daraus:
 *   import { login, fetch, logout, getSessionFromStorage } from "./lib/solid-bundle.js"
 *
 * Start: npm run build  (siehe package.json)
 */
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["scripts/solid-entrypoint.mjs"],
  bundle: true,
  format: "esm",
  outfile: "viz/lib/solid-bundle.js",
  target: "es2020",
  platform: "browser",
  // die Inrupt-Pakete sind groß — Minify hält die Ladezeit im Zaum
  minify: true,
  sourcemap: false,
  logLevel: "info",
});
console.log("✅ Bundle erzeugt: viz/lib/solid-bundle.js");
