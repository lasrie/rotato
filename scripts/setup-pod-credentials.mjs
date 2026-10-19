/**
 * setup-pod-credentials.mjs — legt einmalig ein CSS Client-Credentials-Token an.
 *
 * Fragt interaktiv (ohne Echo) nach E-Mail + Passwort, POSTet gegen
 * https://solidcommunity.net/idp/credentials/ und schreibt die resultierenden
 * id/secret direkt in die .env (ersetzt evtl. vorhandene SOLID_CLIENT_*-Zeilen).
 *
 * Voraussetzung: npm install @inrupt/solid-client-authn-core
 * (wird hier nur für den späteren Token-Flow gebraucht; das Setup selbst
 * nutzt nur fetch + readline/promises aus der Node-Standardbibliothek.)
 *
 * Start:  node setup-pod-credentials.mjs
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(__dirname, "..", ".env");

const CREDENTIALS_URL = "https://solidcommunity.net/idp/credentials/";

const rl = createInterface({ input, output });

async function ask(prompt) {
  return rl.question(prompt);
}

/** Passwort ohne Echo: bash `read -s` liest direkt vom TTY (stdio: inherit auf stdin). */
async function askPassword(prompt) {
  process.stdout.write(prompt);
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(
    "/bin/bash",
    ["-c", 'read -s pw; echo >&2; printf "%s" "$pw"'],
    { stdio: ["inherit", "pipe", "inherit"] },
  );
  console.log(); // Zeilenumbruch nach der verdeckten Eingabe
  return res.stdout.toString().trim();
}

async function main() {
  console.log("Garten-Planer: Pod-Credentials einrichten (CSS Client-Credentials)");
  console.log(`Ziel: ${CREDENTIALS_URL}`);
  console.log("Das Passwort wird ohne Echo abgefragt und NUR für den Request genutzt.\n");

  const email = await ask("E-Mail (solidcommunity.net-Login): ");
  const password = await askPassword("Passwort (ohne Echo): ");

  let res;
  try {
    res = await fetch(CREDENTIALS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "garten-planer-sync" }),
    });
  } catch (err) {
    console.error(`\n❌ Netzwerkfehler: ${err.message}`);
    process.exit(1);
  }

  const bodyText = await res.text();
  if (!res.ok) {
    console.error(`\n❌ HTTP ${res.status}: ${bodyText}`);
    console.error("   Häufige Ursachen: falsche E-Mail/Passwort, Sonderzeichen im Passwort,");
    console.error("   oder du bist nicht auf solidcommunity.net registriert.");
    process.exit(1);
  }

  let creds;
  try {
    creds = JSON.parse(bodyText);
  } catch {
    console.error(`\n❌ Unerwartete Antwort: ${bodyText.slice(0, 200)}`);
    process.exit(1);
  }
  const { id, secret } = creds;
  if (!id || !secret) {
    console.error(`\n❌ Antwort enthält keine id/secret: ${bodyText.slice(0, 200)}`);
    process.exit(1);
  }

  // .env updaten: SOLID_CLIENT_ID / SOLID_CLIENT_SECRET ersetzen oder anfügen;
  // altes SOLID_TOKEN entfernen (CSS akzeptiert es eh nicht).
  let envText = "";
  try {
    envText = readFileSync(ENV_FILE, "utf8");
  } catch { /* existiert nicht — wir legen neu an */ }

  const lines = envText.split("\n").filter((l) => l.trim() !== "");
  const set = (key, value) => {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (idx >= 0) lines[idx] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  };
  set("POD_BASE", "https://lasse.solidcommunity.net/garten/");
  set("SOLID_IDP", "https://solidcommunity.net");
  lines.filter((l) => l.startsWith("SOLID_TOKEN=")).forEach((l) => lines.splice(lines.indexOf(l), 1));
  set("SOLID_CLIENT_ID", id);
  set("SOLID_CLIENT_SECRET", secret);

  writeFileSync(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
  console.log(`\n✅ Credentials gespeichert in ${ENV_FILE} (chmod 600).`);
  console.log("   Nächster Schritt: python3 sync_to_pod.py --dry-run");
  rl.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
