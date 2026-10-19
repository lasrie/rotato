/**
 * sync_to_pod.mjs — spiegelt lokale RDF-Dateien in den Solid-Pod (ADR-0006).
 *
 * CSS Client-Credentials-Flow:
 *   1. POST /.oidc/token  (Basic auth mit SOLID_CLIENT_ID/SECRET + DPoP-Header)
 *      → kurzlebiges Access-Token (scope=webid)
 *   2. Jede Pod-Anfrage mit Authorization: DPoP <token> + frischem DPoP-Proof
 *
 * Mapping der Dateien: siehe adr/0003-uri-schema-lieferplan.md
 *
 * Verwendung:
 *   node sync_to_pod.mjs --dry-run   # nur anzeigen
 *   node sync_to_pod.mjs             # geänderte Dateien spiegeln
 *   node sync_to_pod.mjs --force     # alles neu hochladen
 */
import { readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAuthenticatedFetch,
  createDpopHeader,
  generateDpopKeyPair,
} from "@inrupt/solid-client-authn-core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ENV_FILE = join(ROOT, ".env");

/** Mapping: lokale Datei(en) → Pod-Ressource (ADR-0003). Merge-Dateien zuerst. */
const MERGE_FILES = {
  "vokabular.ttl": ["garten-vokabular.ttl", "garten-layout-vokabular.ttl"],
};
const SINGLE_FILES = {
  "beetplan-2025-extrahiert.ttl": "beetplan-2025-extrahiert.ttl",
  "garten-layout-ontology.ttl": "ontologie.ttl",
  "garten-shapes.ttl": "shapes.ttl",
  "garten-layout.shacl.ttl": "layout-shapes.ttl",
  "pflanzen.ttl": "pflanzen.ttl",
  "garten91-beete-real.ttl": "beete.ttl",
  "garten91-beetplan-2024.ttl": "beetplan-2024.ttl",
  "garten91-belegungen-real-2025.ttl": "belegungen-2025.ttl",
  "anbau-journal.ttl": "journal/anbau-journal.ttl",
  "garten91-linking.ttl": "linking.ttl",
};

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

function loadEnv(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [key, ...rest] = t.split("=");
      env[key.trim()] = rest.join("=").trim();
    }
  } catch { /* .env fehlt */ }
  return env;
}

function sha256Short(data) {
  return createHash(data).slice(0, 12);
}
function createHash(data) {
  // SubtleCrypto ist async — für den Log-Output reicht md5-artige Kurzform? Nein,
  // wir nehmen einen simplen FNV-1a-Hash, nur zur Anzeige.
  let h = 0x811c9dc5;
  for (const b of data) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

async function getAuthenticatedFetch(env) {
  const id = env.SOLID_CLIENT_ID;
  const secret = env.SOLID_CLIENT_SECRET;
  const idp = (env.SOLID_IDP || "https://solidcommunity.net").replace(/\/$/, "");
  if (!id || !secret) {
    throw new Error("SOLID_CLIENT_ID / SOLID_CLIENT_SECRET fehlen in .env (siehe .env.example).");
  }

  // 1. DPoP-Schlüsselpaar (einmal pro Lauf)
  const dpopKey = await generateDpopKeyPair();

  // 2. Access-Token über client_credentials holen
  const authString = `${encodeURIComponent(id)}:${encodeURIComponent(secret)}`;
  const tokenUrl = `${idp}/.oidc/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(authString).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      dpop: await createDpopHeader(tokenUrl, "POST", dpopKey),
    },
    body: "grant_type=client_credentials&scope=webid",
  });
  if (!res.ok) {
    throw new Error(`Token-Request fehlgeschlagen (HTTP ${res.status}): ${await res.text()}`);
  }
  const { access_token: accessToken, expires_in: expiresIn } = await res.json();
  console.log(`🔐 Access-Token geholt (gültig ${expiresIn}s).`);

  // 3. Authentifizierten fetch bauen — signiert jede Anfrage mit DPoP
  return buildAuthenticatedFetch(accessToken, { dpopKey });
}

async function main() {
  const env = loadEnv(ENV_FILE);
  // Umgebungsvariablen überschreiben .env
  for (const k of ["POD_BASE", "SOLID_IDP", "SOLID_CLIENT_ID", "SOLID_CLIENT_SECRET"]) {
    if (process.env[k]) env[k] = process.env[k];
  }
  const podBase = (env.POD_BASE || "").replace(/\/$/, "");
  if (!podBase) throw new Error("POD_BASE fehlt in .env.");

  console.log(`Pod-Basis: ${podBase}`);

  // Upload-Plan aufbauen
  const uploads = [];
  for (const [podName, sources] of Object.entries(MERGE_FILES)) {
    const paths = sources.map((s) => join(ROOT, s));
    const missing = paths.filter((p) => !readExists(p));
    if (missing.length) {
      console.error(`  ❌ ${podName}: fehlende Quelldateien: ${missing.map((m) => basename(m)).join(", ")}`);
      process.exitCode = 1;
      continue;
    }
    const data = Buffer.concat(paths.map((p) => readFileSync(p)));
    uploads.push({ podName, sources, data });
  }
  for (const [localName, podName] of Object.entries(SINGLE_FILES)) {
    const p = join(ROOT, localName);
    if (!readExists(p)) {
      console.error(`  ❌ ${localName}: Datei fehlt lokal`);
      process.exitCode = 1;
      continue;
    }
    uploads.push({ podName, sources: [p], data: readFileSync(p) });
  }

  if (DRY_RUN) {
    console.log("\n--- Dry-Run: Upload-Plan ---");
    for (const u of uploads) {
      const label = u.sources.map((s) => basename(s)).join(" + ");
      console.log(`  ${label} → ${u.podName}  (${u.data.length} Bytes)`);
    }
    const containers = [...new Set(
      uploads
        .map((u) => u.podName.split("/")[0])
        .filter((name) => !name.endsWith(".ttl")),
    )];
    console.log(`\n  betroffene Container: ${containers.join(", ") || "keine"}`);
    console.log("✅ Dry-Run abgeschlossen (nichts hochgeladen).");
    return;
  }

  // Auth holen (vor dem ersten Schreibzugriff)
  const authFetch = await getAuthenticatedFetch(env);

  // Container anlegen (PUT auf Container-URI)
  const containers = [...new Set(
    uploads
      .map((u) => u.podName.split("/")[0])
      .filter((name) => !name.endsWith(".ttl")),
  )];
  for (const c of containers) {
    const url = `${podBase}/${c}/`;
    const res = await authFetch(url, { method: "PUT" });
    console.log(`  Container ${url}: HTTP ${res.status}`);
    if (res.status === 409) continue; // existiert bereits
    if (res.status >= 300) process.exitCode = 1;
  }

  let ok = true;
  for (const u of uploads) {
    const url = `${podBase}/${u.podName}`;
    const label = u.sources.map((s) => basename(s)).join(" + ");
    const res = await authFetch(url, {
      method: "PUT",
      headers: { "content-type": "text/turtle; charset=utf-8" },
      body: u.data,
    });
    if (res.ok) {
      console.log(`  ✓ PUT ${label} → ${u.podName} (HTTP ${res.status}, ${u.data.length} Bytes)`);
    } else {
      console.error(`  ❌ PUT ${label} → ${u.podName}: HTTP ${res.status} ${await res.text()}`);
      ok = false;
    }
  }

  console.log(ok ? "\n✅ Sync abgeschlossen." : "\n❌ Sync mit Fehlern.");
  if (!ok) process.exitCode = 1;
}

function readExists(p) {
  try {
    readFileSync(p); // cheap existence + readability check
    return true;
  } catch {
    return false;
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
