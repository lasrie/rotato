/**
 * BFF-Server-Module — Pod → Read-Modelle für die Karte.
 *
 * Der Pod bleibt die einzige Quelle der Wahrheit (P1). Der BFF:
 *   1. lädt die Pod-Dokumente (Turtle) über Client-Credentials + DPoP
 *   2. parst sie in einen rdflib-Graph
 *   3. joint sie zu vorgejointen JSON-Read-Modellen (Beete, Pflanzungen)
 *   4. cacht sie mit ETag (In-Memory, TTL 30–60 s)
 *
 * Konventionen:
 * - Pod-Basis: POD_BASE env (z. B. https://solid.lasrie.dev/garten/)
 * - Bei fehlender .env / Offline: Fallback auf die lokalen .ttl-Dateien
 *   (gleiches Verhalten wie rdf_source.py in Stufe 1).
 * - Die URIs der Objekte bleiben stabil (ADR-0003): Der BFF löst nur auf,
 *   er definiert nichts um.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./paths.js";

// ---------------------------------------------------------------------
// Pod-Auth (Client-Credentials + DPoP) — gleiche Logik wie sync_to_pod.mjs
// ---------------------------------------------------------------------
let authFetchPromise = null;

function loadEnv() {
  const env = {};
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [key, ...rest] = t.split("=");
      env[key.trim()] = rest.join("=").trim();
    }
  }
  for (const k of ["POD_BASE", "SOLID_IDP", "SOLID_CLIENT_ID", "SOLID_CLIENT_SECRET"]) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}

export function podBase() {
  return (loadEnv().POD_BASE || "").replace(/\/$/, "");
}

export async function getAuthFetch() {
  const env = loadEnv();
  if (!env.SOLID_CLIENT_ID || !env.SOLID_CLIENT_SECRET) return null;
  if (authFetchPromise) return authFetchPromise;

  authFetchPromise = (async () => {
    const [{ createDpopHeader, generateDpopKeyPair, buildAuthenticatedFetch }, { fetch: undici }] =
      await Promise.all([
        import("@inrupt/solid-client-authn-core"),
        import("undici"),
      ]);
    const tokenUrl = `${(env.SOLID_IDP || "https://solidcommunity.net").replace(/\/$/, "")}/.oidc/token`;
    const dpopKey = await generateDpopKeyPair();
    const res = await undici(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: "Basic " + Buffer.from(`${env.SOLID_CLIENT_ID}:${env.SOLID_CLIENT_SECRET}`).toString("base64"),
        dpop: await createDpopHeader(tokenUrl, "POST", dpopKey),
      },
      body: "grant_type=client_credentials&scope=webid",
    });
    if (!res.ok) throw new Error(`Token-Request fehlgeschlagen (HTTP ${res.status})`);
    const { access_token } = await res.json();
    return buildAuthenticatedFetch(access_token, { dpopKey });
  })();
  return authFetchPromise;
}

// ---------------------------------------------------------------------
// Pod-Dokumente laden (Pod first, Fallback lokal — wie rdf_source.py)
// ---------------------------------------------------------------------
const POD_FILES = [
  "vokabular.ttl",
  "ontologie.ttl",
  "shapes.ttl",
  "layout-shapes.ttl",
  "pflanzen.ttl",
  "beete.ttl",
  "beetplan-2025-extrahiert.ttl",
  "beetplan-2024.ttl",
  "belegungen-2025.ttl",
  "planungen/planungen.ttl",
  "journal/anbau-journal.ttl",
  "linking.ttl",
];

const LOCAL_FILES = [
  "garten-vokabular.ttl",
  "garten-layout-vokabular.ttl",
  "pflanzen.ttl",
  "beetplan-2025-extrahiert.ttl",
  "garten91-linking.ttl",
  "garten-layout-ontology.ttl",
  "garten91-beete-real.ttl",
  "garten91-belegungen-real-2025.ttl",
  "garten91-beetplan-2024.ttl",
  "garten91-planungen-neu.ttl",
  "anbau-journal.ttl",
];

let cachedTtl = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

export async function getMergedTtl({ forcePod = false } = {}) {
  if (cachedTtl && Date.now() < cachedAt + CACHE_TTL_MS) return cachedTtl;

  let ttl = null;
  const env = loadEnv();
  const base = (env.POD_BASE || "").replace(/\/$/, "");

  if (base && (forcePod || env.SOLID_CLIENT_ID)) {
    try {
      const authFetch = await getAuthFetch();
      const fetchFn = authFetch || globalThis.fetch;
      const parts = [];
      for (const name of POD_FILES) {
        const res = await fetchFn(`${base}/${name}`, { headers: { Accept: "text/turtle" } });
        if (res.status === 200) {
          parts.push(`# ---- ${name} ----\n${await res.text()}`);
        } else if (res.status === 404) {
          continue;
        } else {
          throw new Error(`Pod GET ${name} → HTTP ${res.status}`);
        }
      }
      ttl = parts.join("\n");
    } catch {
      ttl = null;   // Fallback unten
    }
  }

  if (!ttl) ttl = loadLocalMerged();
  cachedTtl = ttl;
  cachedAt = Date.now();
  return ttl;
}

function loadLocalMerged() {
  const parts = [];
  for (const name of LOCAL_FILES) {
    const f = join(ROOT, name);
    if (existsSync(f)) {
      parts.push(`# ---- ${name} ----\n` + readFileSync(f, "utf8"));
    }
  }
  return parts.join("\n");
}

export function invalidateCache() {
  cachedTtl = null;
}

// ---------------------------------------------------------------------
// Graph parsen + Read-Modelle
// ---------------------------------------------------------------------
import ParserN3 from "@rdfjs/parser-n3";
import { Readable } from "node:stream";
import { Store, DataFactory } from "n3";
const { namedNode, literal } = DataFactory;

const GARTEN = "https://example.org/garten-planer/ontology#";
const PLAN = "https://example.org/garten-planer/plan#";
const DCT = "http://purl.org/dc/terms/";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const TIME = "http://www.w3.org/2006/time#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const PFLANZEN_BASE = "https://example.org/garten-planer/pflanzen/#";

const G = {
  Beet: namedNode(GARTEN + "Beet"),
  Pflanzung: namedNode(GARTEN + "Pflanzung"),
  hatReihe: namedNode(GARTEN + "hatReihe"),
  Reihe: namedNode(GARTEN + "Reihe"),
  hatAbschnitt: namedNode(GARTEN + "hatAbschnitt"),
  aufBeet: namedNode(GARTEN + "aufBeet"),
  pflanzt: namedNode(GARTEN + "pflanzt"),
  sorte: namedNode(GARTEN + "sorte"),
  fruchtFamilie: namedNode(GARTEN + "fruchtFamilie"),
  mehrjaehrig: namedNode(GARTEN + "mehrjaehrig"),
  monatAnzucht: namedNode(GARTEN + "monatAnzucht"),
  monatPflanzung: namedNode(GARTEN + "monatPflanzung"),
  monatErnte: namedNode(GARTEN + "monatErnte"),
  menge: namedNode(GARTEN + "menge"),
  flaeche: namedNode(GARTEN + "flaeche"),
  sonnenlage: namedNode(GARTEN + "sonnenlage"),
  bodentyp: namedNode(GARTEN + "bodentyp"),
  beetAusrichtung: namedNode(GARTEN + "beetAusrichtung"),
  hatPflanzung: namedNode(GARTEN + "hatPflanzung"),
};
const P = {
  x: namedNode(PLAN + "x"),
  y: namedNode(PLAN + "y"),
  width: namedNode(PLAN + "width"),
  height: namedNode(PLAN + "height"),
};
const DCTT = { title: namedNode(DCT + "title") };
const RDFS_L = { label: namedNode(RDFS + "label"), comment: namedNode(RDFS + "comment") };
const SKOS_L = { prefLabel: namedNode(SKOS + "prefLabel") };
const RDF_T = namedNode(RDF + "type");
const TIME_B = namedNode(TIME + "hasBeginning");
const TIME_E = namedNode(TIME + "hasEnd");
const TIME_EXT = namedNode(TIME + "hasTemporalExtent");
const TIME_GYM = namedNode(TIME + "inXSDgYearMonth");
const TIME_GY = namedNode(TIME + "inXSDgYear");

async function parseTtl(ttl) {
  const parser = new ParserN3();
  const store = new Store();
  const input = Readable.from([ttl]);
  const stream = parser.import(input);
  return new Promise((resolve, reject) => {
    stream.on("data", (quad) => store.addQuad(quad));
    stream.on("end", () => resolve(store));
    stream.on("error", reject);
  });
}

function one(store, s, p) {
  for (const o of store.getObjects(s, p, null)) return o;
  return null;
}

function labelOf(store, res) {
  if (!res) return null;
  for (const pred of [SKOS_L.prefLabel, RDFS_L.label, DCTT.title]) {
    for (const o of store.getObjects(res, pred, null)) {
      if (o.language === "de" || !o.language) return o.value;
    }
  }
  return res.value.split("#").pop().split("/").pop();
}

// ---------------------------------------------------------------------
// Konflikt-Engine — identische Regel wie viz/fruchtfolge-logic.js + export_fruchtfolge.py:
// gleiche Fruchtfamilie in aufeinanderfolgenden Jahren auf demselben Beet.
// ---------------------------------------------------------------------
export function computeConflicts(plantings, years) {
  const fruchtfolgeBeds = new Set(
    (gardenBedsFruchtfolge ?? []).map((b) => b.slug),
  );
  const byBedYear = new Map();   // "slug|year" → Set<Familie>
  for (const p of plantings) {
    if (!p.bed || !p.plant?.family) continue;
    const k = `${p.bed}|${p.year}`;
    if (!byBedYear.has(k)) byBedYear.set(k, new Set());
    byBedYear.get(k).add(p.plant.family);
  }
  const conflicts = [];
  for (const meta of BED_META) {
    if (!meta.fruchtfolge) continue;
    for (let i = 0; i < years.length - 1; i++) {
      const y1 = years[i], y2 = years[i + 1];
      const fams1 = byBedYear.get(`${meta.slug}|${y1}`) ?? new Set();
      const fams2 = byBedYear.get(`${meta.slug}|${y2}`) ?? new Set();
      const overlap = [...fams1].filter((f) => fams2.has(f));
      if (overlap.length) {
        conflicts.push({
          type: "rotation",
          bed: meta.title,
          bedSlug: meta.slug,
          years: `${y1}→${y2}`,
          families: overlap.sort(),
          // P3: Begründung, nicht Schelte
          reason:
            `Nachbau ${overlap.sort().join(", ")} auf ${meta.title} in ${y1} und ${y2} — gleiche Fruchtfamilie in Folgejahren schwächelt (Schädlinge/Erde müde). Empfehlung: Familie ein Jahr aussetzen oder mischkultur.ttl-Generator einbinden.`,
        });
      }
    }
  }
  return conflicts;
}

let gardenBedsFruchtfolge = null; // set by buildGardenModel

export async function buildConflicts(years = ["2024", "2025", "2026"]) {
  const ttl = await getMergedTtl();
  const store = await parseTtl(ttl);
  gardenBedsFruchtfolge = BED_META;
  const plantings = buildPlantings(store);
  return {
    conflicts: computeConflicts(plantings, years),
    years,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------
// Read-Modell: garden (Beete + Reihen + Geometrie)
// ---------------------------------------------------------------------
const BED_META = [
  { slug: "tomatenbeet", title: "Tomatenbeet", isPath: false, fruchtfolge: true },
  { slug: "erdbeer-knoblauch-beet", title: "Erdbeer-Beet", isPath: false, fruchtfolge: true },
  { slug: "beetkoerper-nord", title: "Beetkörper West", isPath: false, fruchtfolge: true },
  { slug: "beetkoerper-sued", title: "Beetkörper Ost", isPath: false, fruchtfolge: true },
  { slug: "hackschnitzelweg-beetkoerper", title: "Hackschnitzelweg im Beetkörper", isPath: true, fruchtfolge: false },
  { slug: "kartoffelbeet", title: "Kartoffelbeet", isPath: false, fruchtfolge: true },
  { slug: "jungpflanzen-anzuchtkasten", title: "Jungpflanzen-Anzuchtkasten", isPath: false, fruchtfolge: true },
  { slug: "physalis-hochbeet", title: "Physalis-Hochbeet", isPath: false, fruchtfolge: true },
  { slug: "beerenbeet", title: "Beerenbeet", isPath: false, fruchtfolge: true },
  { slug: "zwiebel-kohlrabi-hochbeet", title: "Zwiebel-Kohlrabi-Hochbeet", isPath: false, fruchtfolge: true },
  { slug: "beet-rechts-unten", title: "Beet rechts unten (tbd)", isPath: false, fruchtfolge: false },
];

const REAL_BASE = "https://example.org/garten-planer/data/garten91/real/#";

const FAMILY_COLOR = {
  "Nachtschattengewächse": "#e9a8a0",
  "Kreuzblütler": "#a8c686",
  "Doldenblütler": "#8fd0c4",
  "Kürbisgewächse": "#f0c060",
  "Zwiebelgewächse": "#c8a8e0",
  "Korbblütler": "#f0e080",
  "Fuchsschwanzgewächse": "#d0a0c8",
  "Lippenblütler": "#90d090",
  "Süßgräser": "#d8e0a0",
  "Kapuzinerkressengewächse": "#f0a888",
  "Hülsenfrüchtler": "#a0d0e0",
  "Hahnenfußgewächse": "#b0d0e8",
  "Rosengewächse": "#f09090",
  "Knöterichgewächse": "#c8d888",
};
const FAMILY_COLOR_FALLBACK = "#9ccc8a";

export async function buildGardenModel() {
  const ttl = await getMergedTtl();
  const store = await parseTtl(ttl);

  const beds = [];
  for (const meta of BED_META) {
    const uri = namedNode(REAL_BASE + meta.slug);
    const x = one(store, uri, P.x);
    if (!x) continue;   // ohne Geometrie nicht plottbar
    const w = one(store, uri, P.width);
    const h = one(store, uri, P.height);
    beds.push({
      uri: uri.value,
      slug: meta.slug,
      title: labelOf(store, uri) || meta.title,
      isPath: meta.isPath,
      fruchtfolge: meta.fruchtfolge,
      x: Number(x.value),
      y: one(store, uri, P.y)?.value ? Number(one(store, uri, P.y).value) : 0,
      w: w ? Number(w.value) : 1,
      h: h ? Number(h.value) : 1,
      flaeche: one(store, uri, G.flaeche)?.value ?? null,
      comment: one(store, uri, RDFS_L.comment)?.value ?? null,
      rows: listRows(store, uri),
    });
  }

  const plantings = buildPlantings(store);
  gardenBedsFruchtfolge = BED_META;

  return {
    beds,
    plantings,
    conflicts: computeConflicts(plantings, ["2024", "2025", "2026"]),
    fetchedAt: new Date().toISOString(),
  };
}

function listRows(store, bedUri) {
  const rows = [];
  for (const row of store.getObjects(bedUri, G.hatReihe, null)) {
    const num = one(store, row, namedNode(GARTEN + "reihenNummer"));
    const len = one(store, row, namedNode(GARTEN + "nutzlaenge"));
    const abs = [];
    for (const a of store.getObjects(row, namedNode(GARTEN + "hatAbschnitt"), null)) {
      const start = one(store, a, namedNode(GARTEN + "abschnittStart"));
      const end = one(store, a, namedNode(GARTEN + "abschnittEnde"));
      abs.push({
        uri: a.value,
        start: start ? Number(start.value) : null,
        end: end ? Number(end.value) : null,
      });
    }
    rows.push({
      uri: row.value,
      nummer: num ? Number(num.value) : null,
      nutzlaenge: len ? Number(len.value) : null,
      abschnitte: abs,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------
// Read-Modell: Pflanzungen (gejoint mit Pflanze/Sorte/Familie)
// ---------------------------------------------------------------------
function buildPlantings(store) {
  const out = [];
  for (const s of store.getSubjects(RDF_T, G.Pflanzung, null)) {
    const beet = one(store, s, G.aufBeet);
    const pflanze = one(store, s, G.pflanzt);
    const sorte = one(store, s, G.sorte);
    const plantUri = pflanze || (sorte ? one(store, sorte, namedNode(GARTEN + "sorteVon")) : null);
    if (!beet || !plantUri) continue;

    const familie = one(store, plantUri, G.fruchtFamilie);
    const familieLabel = familie ? labelOf(store, familie) : null;

    // Jahr/Zeitraum: time:hasTemporalExtent oder monatPflanzung/monatAnzucht
    let year = null, monthFrom = null, monthTo = null;
    const te = one(store, s, TIME_EXT);
    if (te) {
      const beg = one(store, te, TIME_B);
      const end = one(store, te, TIME_E);
      const begVal = beg && (one(store, beg, TIME_GYM) || one(store, beg, TIME_GY));
      const endVal = end && (one(store, end, TIME_GYM) || one(store, end, TIME_GY));
      if (begVal) { year = begVal.value.slice(0, 4); monthFrom = begVal.value; }
      if (endVal) monthTo = endVal.value;
    }
    if (!year) {
      const mp = one(store, s, G.monatPflanzung);
      const ma = one(store, s, G.monatAnzucht);
      const v = mp || ma;
      if (v && /^\d{4}-\d{2}/.test(v.value)) {
        year = v.value.slice(0, 4);
        monthFrom = v.value;
        if (!monthTo) {
          const me = one(store, s, G.monatErnte);
          if (me && /^\d{4}-\d{2}/.test(me.value)) monthTo = me.value;
        }
      }
    }
    if (!year) continue;

    out.push({
      uri: s.value,
      bed: beet.value.startsWith(REAL_BASE) ? beet.value.slice(REAL_BASE.length) : beet.value,
      plant: {
        uri: plantUri.value,
        label: labelOf(store, plantUri),
        mehrjaehrig: one(store, plantUri, G.mehrjaehrig)?.value === "true",
        family: familieLabel,
        familyColor: familieLabel ? (FAMILY_COLOR[familieLabel] || FAMILY_COLOR_FALLBACK) : null,
        familySlug: familieLabel ? familySlugOf(familieLabel) : null,
      },
      sortenLabel: sorte ? labelOf(store, sorte) : null,
      menge: one(store, s, G.menge)?.value ?? null,
      year,
      monthFrom,
      monthTo,
      status: one(store, s, namedNode(GARTEN + "status"))?.value ?? null,
    });
  }
  return out;
}

function familySlugOf(label) {
  const map = {
    "Nachtschattengewächse": "nachtschatten",
    "Korbblütler": "korbbluetler",
    "Hülsenfrüchtler": "huelsenfruechtler",
    "Zwiebelgewächse": "zwiebelgewaechse",
    "Kreuzblütler": "kreuzbluetler",
    "Beeren": "beeren",
    "Süßgräser": "suessgraeser",
    "Lippenblütler": "lippenbluetler",
    "Kürbisgewächse": "kuerbisgewaechse",
    "Doldenblütler": "doldenbluetler",
    "Fuchsschwanzgewächse": "fuchsschwanzgewaechse",
    "Kapuzinerkressengewächse": "kapuzinerkressengewaechse",
    "Hahnenfußgewächse": "hahnenfussgewaechse",
    "Rosengewächse": "rosengewaechse",
    "Knöterichgewächse": "knoeterichgewaechse",
  };
  return map[label] || null;
}
