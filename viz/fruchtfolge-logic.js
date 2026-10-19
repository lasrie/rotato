/**
 * Fruchtfolge-Aggregation direkt aus dem Pod (M4, ADR-0007 Stufe 2).
 *
 * Lädt das Pod-Dataset (wie M3) und berechnet Beet × Jahr-Matrix + Konflikte
 * im Browser — identische Logik zu export_fruchtfolge.py, damit beide Wege
 * dasselbe Ergebnis liefern. Der Python-Export bleibt als Offline-Fallback
 * (ADR-0007).
 */
import { fetch, rdfEnv, N3Parser } from "./lib/solid-bundle.js";
import { authReady } from "./solid-auth.js";

const POD_BASE = "https://solid.lasrie.dev/garten/";

// Muss mit datamodel.py konsistent sein (Beet-Stammliste, siehe datamodel.py)
const BEDS = [
  { slug: "tomatenbeet", title: "Tomatenbeet", ff: true },
  { slug: "erdbeer-knoblauch-beet", title: "Erdbeer-Beet", ff: true },
  { slug: "beetkoerper-nord", title: "Beetkörper West", ff: true },
  { slug: "beetkoerper-sued", title: "Beetkörper Ost", ff: true },
  { slug: "kartoffelbeet", title: "Kartoffelbeet", ff: true },
  { slug: "jungpflanzen-anzuchtkasten", title: "Jungpflanzen-Anzuchtkasten", ff: true },
  { slug: "physalis-hochbeet", title: "Physalis-Hochbeet", ff: true },
  { slug: "beerenbeet", title: "Beerenbeet", ff: true },
  { slug: "zwiebel-kohlrabi-hochbeet", title: "Zwiebel-Kohlrabi-Hochbeet", ff: true },
];
const YEARS = ["2024", "2025", "2026"];

const FAMILIE_COLOR = {
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
const FAMILIE_COLOR_FALLBACK = "#c8cfc0";

const GARTEN = "https://example.org/garten-planer/ontology#";
const TIME = "http://www.w3.org/2006/time#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const DCTERMS = "http://purl.org/dc/terms/";

const RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#";

function realUri(slug) {
  return `https://example.org/garten-planer/data/garten91/real/#${slug}`;
}

/** Turtle-Text → Quad-Array (string-basierter n3-Parser, browser-safe). */
function parseTurtle(turtle) {
  return new N3Parser().parse(turtle);
}

/**
 * Pod-Dataset laden (Beete, Pflanzen, Pflanzungen, Journal, Linking).
 * Kurzer Cache (60 s), damit nicht jede Aktion alles neu lädt.
 */
let podDataset = null;
let podDatasetAt = 0;

export async function loadFruchtfolgeDataset({ refresh = false } = {}) {
  // Auth-Init abwarten (session.fetch braucht die OIDC-Session gegen den privaten CSS)
  await authReady;
  if (podDataset && !refresh && Date.now() - podDatasetAt < 60000) {
    return podDataset;
  }
  const ds = rdfEnv.dataset();
  const files = [
    "vokabular.ttl", "ontologie.ttl", "pflanzen.ttl", "beete.ttl",
    "beetplan-2025-extrahiert.ttl", "beetplan-2024.ttl", "belegungen-2025.ttl",
    "planungen/planungen.ttl", "journal/anbau-journal.ttl", "linking.ttl",
  ];
  for (const name of files) {
    const res = await fetch(POD_BASE + name, { headers: { Accept: "text/turtle" }, cache: "no-store" });
    if (res.ok) {
      for (const quad of parseTurtle(await res.text())) ds.add(quad);
    }
    // 404 ok (z. B. leere planungen.ttl)
  }
  podDataset = ds;
  podDatasetAt = Date.now();
  return ds;
}

/** deutschsprachiges Label aus prefLabel/label/title */
function labelDe(dataset, node, fallback = null) {
  if (!node) return fallback;
  for (const pred of [`${SKOS}prefLabel`, `${RDFS_NS}label`, `${DCTERMS}title`]) {
    const matches = dataset.match(node, pred, null, null);
    for (const q of matches) {
      if (q.object.language === "de") return q.object.value;
    }
    const any = dataset.match(node, pred, null, null);
    for (const q of any) return q.object.value;
  }
  return fallback || node.value?.split("#").pop() || "?";
}

/** Pflanzung → (jahr, beet, familie, kultur) | null */
function plantRow(ds, plantUri) {
  const beet = ds.match(plantUri, `${GARTEN}aufBeet`, null, null).first?.object;
  if (!beet) return null;
  const pflanze = ds.match(plantUri, `${GARTEN}pflanzt`, null, null).first?.object
    ?? null;
  if (!pflanze) return null;
  const mehrjaehrig = ds.match(pflanze, `${GARTEN}mehrjaehrig`, null, null).first;
  if (mehrjaehrig?.object?.value === "true") return null; // nur einjährige

  const familie = ds.match(pflanze, `${GARTEN}fruchtFamilie`, null, null).first?.object;
  if (!familie) return null;

  let jahr = null;
  for (const pred of [`${GARTEN}monatPflanzung`, `${GARTEN}monatAnzucht`]) {
    const v = ds.match(plantUri, pred, null, null).first?.object;
    if (v) { jahr = String(v.value).split("-")[0]; break; }
  }
  if (!jahr) {
    const te = ds.match(plantUri, `${TIME}hasTemporalExtent`, null, null).first?.object;
    if (te) {
      const beg = ds.match(te, `${TIME}hasBeginning`, null, null).first?.object;
      if (beg) {
        for (const pred of [`${TIME}inXSDgYearMonth`, `${TIME}inXSDgYear`]) {
          const v = ds.match(beg, pred, null, null).first?.object;
          if (v) { jahr = String(v.value).split("-")[0]; break; }
        }
      }
    }
  }
  if (!jahr || !YEARS.includes(jahr)) return null;

  return {
    jahr,
    beet: beet.value,
    familie: labelDe(ds, familie),
    kultur: labelDe(ds, pflanze, "Pflanze"),
  };
}

/**
 * Fruchtfolge-Daten berechnen: { matrix, conflicts, legend, years }
 * Identische Logik wie export_fruchtfolge.py.
 */
export function computeFruchtfolge(ds) {
  const rows = new Map(); // key: jahr|beetUri|familie → {familie, color, kulturen:Set, count}
  for (const q of ds.match(null, RDF_TYPE, `${GARTEN}Pflanzung`, null)) {
    const row = plantRow(ds, q.subject);
    if (!row) continue;
    const key = `${row.jahr}|${row.beet}|${row.familie}`;
    let cell = rows.get(key);
    if (!cell) {
      cell = {
        familie: row.familie,
        color: FAMILIE_COLOR[row.familie] ?? FAMILIE_COLOR_FALLBACK,
        kulturen: new Set(),
        count: 0,
      };
      rows.set(key, cell);
    }
    cell.kulturen.add(row.kultur);
    cell.count += 1;
  }

  // Matrix
  const matrix = BEDS.map(({ slug, title }) => {
    const beetUri = realUri(slug);
    const cells = YEARS.map((year) => {
      let cell = null;
      for (const [key, data] of rows) {
        const [j, b, fam] = key.split("|");
        if (j === year && b === beetUri) {
          if (!cell) cell = { family: fam, color: data.color, items: [] };
          cell.items.push({ kultur: [...data.kulturen].sort().join(", "), count: data.count });
        }
      }
      return cell;
    });
    return { slug, title, cells };
  });

  // Konflikte: gleiche Familie in aufeinanderfolgenden Jahren auf demselben Beet
  const byBedYear = new Map();
  for (const key of rows.keys()) {
    const [j, b, fam] = key.split("|");
    const k = `${b}|${j}`;
    if (!byBedYear.has(k)) byBedYear.set(k, new Set());
    byBedYear.get(k).add(fam);
  }
  const conflicts = [];
  for (const { slug, title } of BEDS) {
    const beetUri = realUri(slug);
    for (let i = 0; i < YEARS.length - 1; i++) {
      const y1 = YEARS[i], y2 = YEARS[i + 1];
      const fams1 = byBedYear.get(`${beetUri}|${y1}`) ?? new Set();
      const fams2 = byBedYear.get(`${beetUri}|${y2}`) ?? new Set();
      const overlap = [...fams1].filter((f) => fams2.has(f));
      if (overlap.length) {
        conflicts.push({
          beet: title,
          beetSlug: slug,
          jahre: `${y1}→${y2}`,
          familien: overlap.sort(),
        });
      }
    }
  }

  const legend = Object.entries(FAMILIE_COLOR).map(([family, color]) => ({ family, color }));

  return { matrix, conflicts, legend, years: YEARS };
}

/** Komfort: Dataset laden + Fruchtfolge berechnen. */
export async function getFruchtfolge({ refresh = false } = {}) {
  const ds = await loadFruchtfolgeDataset({ refresh });
  return computeFruchtfolge(ds);
}
