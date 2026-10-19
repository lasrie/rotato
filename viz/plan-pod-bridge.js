/**
 * Pod-Bridge für den Pflanzplan-Viewer (GitHub-Pages-Modus).
 *
 * Lädt die Beet/Pflanzungs-Daten direkt aus dem Pod und befüllt
 * window.GARTEN91_PLAN im selben Format wie export_garten91_plan.py —
 * dann dispatcht es 'plan-data-ready' und der Viewer reloaddet mit
 * frischen Daten.
 *
 * Lokal (mit Export-Datei) bleibt der bestehende Pfad unverändert.
 */
import { fetch, rdfEnv, N3Parser, authReady } from "./lib/solid-bundle.js";

const POD_BASE = "https://solid.lasrie.dev/garten/";
const GARTEN = "https://example.org/garten-planer/ontology#";
const PLAN = "https://example.org/garten-planer/plan#";
const TIME = "http://www.w3.org/2006/time#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const SKOS = "http://www.w3.org/2004/02/skos/core#";
const DCTERMS = "http://purl.org/dc/terms/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

// Muss mit datamodel.py konsistent sein (Pflanzplan-Reihenfolge: alle außer tbd)
const REIHENFOLGE = [
  "tomatenbeet", "erdbeer-knoblauch-beet", "beetkoerper-nord", "beetkoerper-sued",
  "hackschnitzelweg-beetkoerper", "kartoffelbeet", "jungpflanzen-anzuchtkasten",
  "physalis-hochbeet", "beerenbeet", "zwiebel-kohlrabi-hochbeet",
];

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
const FAMILIE_COLOR_FALLBACK = "#9ccc8a";

const MONTHS = [null, "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];
const YEARS = ["2024", "2025", "2026"];

function realUri(slug) {
  return `https://example.org/garten-planer/data/garten91/real/#${slug}`;
}

function labelDe(ds, node, fallback = null) {
  if (!node) return fallback;
  for (const pred of [SKOS + "prefLabel", RDFS + "label", DCTERMS + "title"]) {
    const quads = [...ds.match(node, pred, null, null)];
    const de = quads.find((q) => q.object.language === "de");
    if (de) return de.object.value;
    if (quads.length) return quads[0].object.value;
  }
  return fallback || node.value?.split("#").pop() || "?";
}

function firstObj(ds, s, p) {
  return [...ds.match(s, p, null, null)][0]?.object ?? null;
}

function monthOfYm(ds, s, pred) {
  const ym = firstObj(ds, s, pred);
  if (ym) {
    const m = parseInt(String(ym.value).split("-")[1], 10);
    if (!Number.isNaN(m)) return m;
  }
  const te = firstObj(ds, s, TIME + "hasTemporalExtent");
  if (te) {
    const beg = firstObj(ds, te, TIME + "hasBeginning");
    if (beg) {
      const ymv = firstObj(ds, beg, TIME + "inXSDgYearMonth");
      if (ymv) {
        const m = parseInt(String(ymv.value).split("-")[1], 10);
        if (!Number.isNaN(m)) return m;
      }
    }
  }
  return null;
}

function yearOfYm(ds, s, pred) {
  const ym = firstObj(ds, s, pred);
  if (ym) return String(ym.value).split("-")[0];
  const te = firstObj(ds, s, TIME + "hasTemporalExtent");
  if (te) {
    const beg = firstObj(ds, te, TIME + "hasBeginning");
    if (beg) {
      for (const p of [TIME + "inXSDgYearMonth", TIME + "inXSDgYear"]) {
        const v = firstObj(ds, beg, p);
        if (v) return String(v.value).split("-")[0];
      }
    }
  }
  return null;
}

async function loadPodDataset() {
  const ds = rdfEnv.dataset();
  const files = [
    "vokabular.ttl", "ontologie.ttl", "pflanzen.ttl", "beete.ttl",
    "beetplan-2025-extrahiert.ttl", "beetplan-2024.ttl", "belegungen-2025.ttl",
    "planungen/planungen.ttl", "journal/anbau-journal.ttl", "linking.ttl",
  ];
  for (const name of files) {
    const res = await fetch(POD_BASE + name, { headers: { Accept: "text/turtle" }, cache: "no-store" });
    if (res.ok) {
      for (const quad of new N3Parser().parse(await res.text())) ds.add(quad);
    }
  }
  return ds;
}

async function buildPlanData(ds) {
  const beds = REIHENFOLGE.map((slug) => {
    const beetUri = realUri(slug);
    return {
      id: beetUri,
      slug,
      title: labelDe(ds, ds.match(beetUri, DCTERMS + "title", null, null).first?.object ?? beetUri),
      comment: firstObj(ds, beetUri, RDFS + "comment")?.value ?? "",
      x: parseFloat(firstObj(ds, beetUri, PLAN + "x")?.value ?? 0),
      y: parseFloat(firstObj(ds, beetUri, PLAN + "y")?.value ?? 0),
      width: parseFloat(firstObj(ds, beetUri, PLAN + "width")?.value ?? 0),
      height: parseFloat(firstObj(ds, beetUri, PLAN + "height")?.value ?? 0),
      family: null,
      isPath: slug === "hackschnitzelweg-beetkoerper",
      plantings: [],
    };
  });
  const bedByUri = new Map(beds.map((b) => [b.id, b]));

  for (const q of ds.match(null, RDF_TYPE, GARTEN + "Pflanzung", null)) {
    const p = q.subject;
    const beet = firstObj(ds, p, GARTEN + "aufBeet");
    if (!beet || !bedByUri.has(beet.value)) continue;
    let pflanze = firstObj(ds, p, GARTEN + "pflanzt");
    if (!pflanze) {
      const sorte = firstObj(ds, p, GARTEN + "sorte");
      if (sorte) pflanze = firstObj(ds, sorte, GARTEN + "sorteVon");
    }
    if (!pflanze) continue;
    const familie = firstObj(ds, pflanze, GARTEN + "fruchtFamilie");
    const familieLabel = familie ? labelDe(ds, familie) : null;
    const fromM = monthOfYm(ds, p, GARTEN + "monatPflanzung") ?? monthOfYm(ds, p, GARTEN + "monatAnzucht");
    const jahr = yearOfYm(ds, p, GARTEN + "monatPflanzung") ?? yearOfYm(ds, p, GARTEN + "monatAnzucht") ?? "2025";
    const section = firstObj(ds, p, GARTEN + "inAbschnitt");

    bedByUri.get(beet.value).plantings.push({
      id: p.value,
      label: labelDe(ds, pflanze, "Pflanze"),
      plantingLabel: labelDe(ds, p),
      plant: pflanze.value,
      family: familie?.value ?? null,
      familyLabel: familieLabel,
      familyColor: FAMILIE_COLOR[familieLabel] ?? FAMILIE_COLOR_FALLBACK,
      mehrjaehrig: firstObj(ds, pflanze, GARTEN + "mehrjaehrig")?.value === "true",
      jahr,
      fromMonth: fromM,
      toMonth: monthOfYm(ds, p, GARTEN + "monatErnte"),
      section: section?.value ?? null,
      sectionLabel: section ? labelDe(ds, section) : null,
      sectionStart: section ? parseFloat(firstObj(ds, section, GARTEN + "abschnittStart")?.value ?? "null") : null,
      sectionEnd: section ? parseFloat(firstObj(ds, section, GARTEN + "abschnittEnde")?.value ?? "null") : null,
    });
  }

  for (const b of beds) {
    b.plantings.sort((a, c) => (a.jahr ?? "").localeCompare(c.jahr ?? "") ||
      (a.label ?? "").localeCompare(c.label ?? "") ||
      ((a.fromMonth ?? 0) - (c.fromMonth ?? 0)));
  }

  // Pflanzen-Auswahl für das Formular
  const plants = [...ds.match(null, RDF_TYPE, GARTEN + "Pflanze", null)].map((q) => {
    const pflanze = q.subject;
    const familie = firstObj(ds, pflanze, GARTEN + "fruchtFamilie");
    const familieLabel = familie ? labelDe(ds, familie) : null;
    return {
      uri: pflanze.value,
      label: labelDe(ds, pflanze, "Pflanze"),
      familyUri: familie?.value ?? null,
      familyLabel: familieLabel,
    };
  }).sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));

  return {
    title: "Garten 91 – Pflanzplan",
    garden: realUri("__root__").replace("/real/#__root__", ""), // Basis-URI (nur informativ)
    sourceFiles: ["pod"],
    months: MONTHS,
    years: YEARS,
    beds,
    plants,
  };
}

async function load() {
  // Auf den Auth-Init warten: session.fetch braucht die OIDC-Session (restorePreviousSession),
  // sonst antwortet der private CSS mit 401 und die Daten bleiben leer.
  await authReady;
  // Wenn der lokale Export existiert (Entwickler-Modus mit server.py), überspringen:
  // das klassische Skript hat schon Daten und rendert mit ihnen.
  if (window.GARTEN91_PLAN && window.GARTEN91_PLAN.beds?.length) {
    return;
  }
  try {
    const ds = await loadPodDataset();
    window.GARTEN91_PLAN = await buildPlanData(ds);
    // sessionStorage: das klassische inline-Skript läuft VOR den Modulen — beim
    // nächsten Reload liest es die Daten hieraus (siehe plan.html 'garten91-plan-pod').
    sessionStorage.setItem("garten91-plan-pod", JSON.stringify(window.GARTEN91_PLAN));
    window.__planSource = "pod";
  } catch (e) {
    console.warn("Pod-Laden fehlgeschlagen:", e.message);
    window.__planSource = "unavailable";
  }
  window.dispatchEvent(new CustomEvent("plan-data-ready"));
}

load();
