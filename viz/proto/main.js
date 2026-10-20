// rotato Art-Prototyp — stilisierte Draufsicht auf Garten 91
// Geometrie: viz/proto/beds.json (generiert aus garten91-beete-real.ttl)
// Stil: handgezeichnete Tinte auf Papier (Not-a-Trolley-Problem-Referenz),
//       Beete als organisch gewackelte Flächen, Fruchtfamilien-Farben wie
//       in viz/fruchtfolge-logic.js (FAMILIE_COLOR).

import * as PIXI from "./pixi.min.mjs";
import bedsData from "./beds.json" with { type: "json" };
const beds = bedsData;

const {
  Application, Container, Graphics, Text, TextStyle,
  BlurFilter,
} = PIXI;

const SCALE = 46;          // px pro Meter
const PAD = 2.2;           // Meter Rand
const PAPER = "#f4f1e6";
const INK = "#2f2a24";
const INK_SOFT = "#6b6353";

// Fruchtfamilien-Farben (aus viz/fruchtfolge-logic.js FAMILIE_COLOR)
const FAMILY_COLORS = {
  "Nachtschattengewächse": "#e9a8a0",
  "Kreuzblütler": "#a8c686",
  "Korbblütler": "#e3c56f",
  "Doldenblütler": "#f2b880",
  "Zwiebelgewächse": "#c9b6e4",
  "Hülsenfrüchtler": "#a5d1a0",
  "Kürbisgewächse": "#f0a35e",
  "Süßgräser": "#cfc07a",
  "Beeren": "#d98ca6",
};

// Demo-Belegung 2025 (statisch — im echten Aufbau aus dem Pod / planungen.ttl)
const DEMO_PLANTINGS = [
  { bed: "tomatenbeet", family: "Nachtschattengewächse", label: "Tomaten", months: [4, 9] },
  { bed: "tomatenbeet", family: "Lippenblütler", label: "Basilikum (zwischen)", months: [5, 8], thin: true },
  { bed: "erdbeer-knoblauch-beet", family: "Beeren", label: "Erdbeeren", months: [3, 9] },
  { bed: "erdbeer-knoblauch-beet", family: "Zwiebelgewächse", label: "Knoblauch", months: [3, 7], thin: true },
  { bed: "beetkoerper-nord", family: "Korbblütler", label: "Salat", months: [4, 8] },
  { bed: "beetkoerper-sued", family: "Hülsenfrüchtler", label: "Bohnen", months: [5, 9] },
  { bed: "beetkoerper-sued", family: "Kreuzblütler", label: "Kohlrabi", months: [4, 7], thin: true },
  { bed: "hackschnitzelweg-beetkoerper", family: null, label: "Weg", months: [0, 11], path: true },
  { bed: "jungpflanzen-anzuchtkasten", family: "Nachtschattengewächse", label: "Anzucht", months: [1, 4], nursery: true },
  { bed: "beet-rechts-unten", family: "Süßgräser", label: "(offen)", months: [5, 9] },
  { bed: "zwiebel-kohlrabi-hochbeet", family: "Zwiebelgewächse", label: "Zwiebeln", months: [3, 8] },
  { bed: "beerenbeet", family: "Beeren", label: "Beeren", months: [0, 11] },
];

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];

const app = new PIXI.Application();
await app.init({
  canvas: document.getElementById("stage"),
  resizeTo: window,
  background: PAPER,
  antialias: true,
  preference: "webgl",
});

const world = new Container();   // verschoben/zoomt
app.stage.addChild(world);

// ------------------------------------------------------------------
// Paper-Grain: leichte Noise-Textur über alles (teller-look)
// ------------------------------------------------------------------
function makeGrainTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 210 + Math.random() * 45;   // heller Grain
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 26;                  // sehr transparent
  }
  ctx.putImageData(img, 0, 0);
  return PIXI.Texture.from(c);
}
const grain = new PIXI.Sprite(makeGrainTexture());
grain.width = app.screen.width + 200;
grain.height = app.screen.height + 200;
grain.alpha = 0.5;
app.stage.addChild(grain);

// ------------------------------------------------------------------
// Wackelige organische Form (hand-drawn-Look) als Graphics
// ------------------------------------------------------------------
function jitterPath(g, x, y, w, h, amp = 3, seed = 1) {
  // Rechteck mit sanft gewackelter Kontur — deterministisch via seed
  const rand = mulberry(seed);
  const pts = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: x + w * t, y: y - Math.abs(rand()) * amp });
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: x + w + Math.abs(rand()) * amp, y: y + h * t });
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: x + w * (1 - t), y: y + h + Math.abs(rand()) * amp });
  }
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: x - Math.abs(rand()) * amp, y: y + h * (1 - t) });
  }
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], prev = pts[i - 1];
    const cx = (prev.x + p.x) / 2 + (rand() - 0.5) * amp;
    const cy = (prev.y + p.y) / 2 + (rand() - 0.5) * amp;
    g.quadraticCurveTo(cx, cy, p.x, p.y);
  }
  g.closePath();
}

function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------
// Welt-Aufbau: Garten als Ort
// ------------------------------------------------------------------
const GARDEN_X = Math.min(...beds.map(b => b.x)) - PAD;
const GARDEN_Y = Math.min(...beds.map(b => b.y)) - PAD;
const GARDEN_W = (Math.max(...beds.map(b => b.x + (b.w || 0))) + PAD) - GARDEN_X;
const GARDEN_H = (Math.max(...beds.map(b => b.y + (b.h || 0))) + PAD) - GARDEN_Y;

const bedLayer = new Container();
const plantLayer = new Container();
const uiLayer = new Container();
world.addChild(bedLayer, plantLayer, uiLayer);

// Zaun (skizzierte Linie)
const fence = new Graphics();
fence.lineStyle({ width: 3, color: INK, cap: "round", alpha: 0.85 });
jitterPath(fence, 0, 0, GARDEN_W * SCALE, GARDEN_H * SCALE, 5, 7);
fence.endFill();
bedLayer.addChild(fence);

// Rasen-Fläche
const lawn = new Graphics();
lawn.beginFill("#b9d48a");
jitterPath(lawn, 0, 0, GARDEN_W * SCALE, GARDEN_H * SCALE, 5, 7);
lawn.endFill();
lawn.alpha = 0.35;
bedLayer.addChild(lawn);

// Gras-Büschel-Deko (deterministisch)
const grassDeco = new Graphics();
const grassRand = mulberry(42);
for (let i = 0; i < 160; i++) {
  const gx = grassRand() * GARDEN_W * SCALE;
  const gy = grassRand() * GARDEN_H * SCALE;
  grassDeco.lineStyle({ width: 1.5, color: "#7a9c4f", alpha: 0.5 });
  grassDeco.moveTo(gx, gy);
  grassDeco.lineTo(gx + (grassRand() - 0.5) * 3, gy - 5 - grassRand() * 4);
}
bedLayer.addChild(grassDeco);

// ------------------------------------------------------------------
// Beete
// ------------------------------------------------------------------
const bedViews = new Map();

function drawBed(b) {
  const c = new Container();
  c.x = (b.x - GARDEN_X) * SCALE;
  c.y = (b.y - GARDEN_Y) * SCALE;
  const w = (b.w || 1) * SCALE, h = (b.h || 1) * SCALE;

  const isPath = b.slug === "hackschnitzelweg-beetkoerper";
  const soilFill = isPath ? "#d9cfb8" : "#a97c50";

  const g = new Graphics();
  g.beginFill(soilFill);
  jitterPath(g, 0, 0, w, h, 3.5, b.slug.length * 31 + 7);
  g.endFill();
  // Tinte-Kontur (doppelt versetzt für hand-drawn-Look)
  g.lineStyle({ width: 2.5, color: INK, cap: "round" });
  jitterPath(g, 0, 0, w, h, 3.5, b.slug.length * 31 + 7);
  // zweite Kontur minimal versetzt (Sketchy-Look)
  g.lineStyle({ width: 1.2, color: INK_SOFT, alpha: 0.6, cap: "round" });
  jitterPath(g, 1.5, 1.5, w - 3, h - 3, 4, b.slug.length * 31 + 99);

  // Erdkrümel-Textur
  const rnd = mulberry(b.slug.length * 101 + 3);
  for (let i = 0; i < w * h / 260; i++) {
    const px = rnd() * w, py = rnd() * h;
    g.beginFill(isPath ? "#c4b79c" : "#8a6540", 0.7);
    g.drawCircle(px, py, 1 + rnd() * 1.8);
    g.endFill();
  }

  c.addChild(g);

  // Label-Pill (DOM-artig, aber in Pixi — im echten Aufbau DOM-Pills)
  const label = new Text(b.title, {
    fontFamily: "Inter, sans-serif",
    fontSize: 12,
    fontWeight: "600",
    fill: INK,
    padding: 3,
  });
  const pillBg = new Graphics();
  const lw = label.width + 16, lh = label.height + 8;
  pillBg.beginFill("#ffffff", 0.92);
  pillBg.lineStyle({ width: 1.5, color: INK });
  pillBg.drawRoundedRect(-4, -2, lw, lh, 8);
  pillBg.endFill();
  label.x = 4; label.y = 2;
  const pill = new Container();
  pill.addChild(pillBg, label);
  pill.x = 4;
  // Pill über den oberen Beet-Rand (nicht auf den Belegungen)
  pill.y = -lh - 4;
  c.addChild(pill);

  c.eventMode = "static";
  c.cursor = "pointer";
  c.hitArea = new PIXI.Rectangle(0, 0, w, h);

  bedViews.set(b.slug, { container: c, graphics: g, bed: b, pill, w, h });
  bedLayer.addChild(c);
}
beds.forEach(drawBed);

// ------------------------------------------------------------------
// Pflanzen-Sprites: Illustrationen aus assets/plants/<familie>/<stadium>.svg
// falls vorhanden, sonst abstrakter Platzhalter (Ellipsen-Blätter)
// ------------------------------------------------------------------
const PLANT_TEXTURES = new Map();   // key: "<familie>/<stadium>" → PIXI.Texture

async function loadPlantTexture(familySlug, stadium) {
  const key = `${familySlug}/${stadium}`;
  if (PLANT_TEXTURES.has(key)) return PLANT_TEXTURES.get(key);
  const url = `./assets/plants/${familySlug}/${stadium}.svg`;
  try {
    await PIXI.Assets.load(url);          // lädt & cached (SVG wird gerastert)
    const texture = PIXI.Texture.from(url);
    if (!texture || !texture.baseTexture) return null;
    PLANT_TEXTURES.set(key, texture);
    return texture;
  } catch {
    return null;   // 404 → stiller Fallback auf Platzhalter
  }
}

// Fruchtfamilie → Slug (wie im README beschrieben)
function familySlug(family) {
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
  };
  return map[family] || null;
}

function growthToStadium(growth) {
  if (growth < 0.33) return "seedling";
  if (growth < 0.72) return "young";
  return "mature";
}

function drawPlantSpritePlaceholder(family, growth /* 0..1 */) {
  const g = new Graphics();
  const col = FAMILY_COLORS[family] || "#7fa86f";
  const dark = shade(col, -30);
  const size = 6 + growth * 10;

  // Stiel
  g.lineStyle({ width: 2, color: "#5d7a3a", cap: "round" });
  g.moveTo(0, 0);
  g.lineTo(0, -size * 0.8);

  // 2–4 Blätter je nach Wuchs
  const leaves = Math.max(2, Math.round(2 + growth * 3));
  for (let i = 0; i < leaves; i++) {
    const angle = (i / leaves) * Math.PI * 2 + 0.3;
    const lx = Math.cos(angle) * size;
    const ly = -size * 0.6 + Math.sin(angle) * size * 0.6;
    g.beginFill(col);
    g.drawEllipse(lx, ly, size * 0.38, size * 0.22);
    g.endFill();
    g.lineStyle({ width: 1, color: dark, alpha: 0.7 });
    g.drawEllipse(lx, ly, size * 0.38, size * 0.22);
  }
  if (growth > 0.75) {   // Frucht bei ausgewachsen
    g.beginFill(dark);
    g.drawCircle(0, -size * 1.05, size * 0.22);
    g.endFill();
  }
  return g;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return (r << 16) | (g << 8) | b;
}

// ------------------------------------------------------------------
// Pflanzungen in Beete zeichnen (ein Streifen pro Beet, Growth je Monat)
// ------------------------------------------------------------------
const plantingViews = [];   // { bed, family, months, sprites: Container }

function drawPlantings() {
  plantLayer.removeChildren();
  plantingViews.length = 0;

  for (const p of DEMO_PLANTINGS) {
    const bv = bedViews.get(p.bed);
    if (!bv || !p.family) continue;

    const c = new Container();
    const [m0, m1] = p.months;

    // Streifen als „Saatband“
    const band = new Graphics();
    const bw = bv.w - 14, bh = Math.max(10, bv.h * 0.42);
    const bx = 7, by = bv.h / 2 - bh / 2;
    band.beginFill(FAMILY_COLORS[p.family], p.thin ? 0.4 : 0.75);
    jitterPath(band, bx, by, bw, bh, 2.5, p.label.length * 17 + 5);
    band.endFill();
    c.addChild(band);

    // Ein paar Pflanzen-Sprites entlang des Bandes
    const slug = familySlug(p.family);
    const n = Math.max(2, Math.floor(bw / 18));
    for (let i = 0; i < n; i++) {
      const growth = clampGrowth(p, currentMonth);
      if (growth <= 0) continue;
      let spr;
      if (slug && PLANT_TEXTURES.has(`${slug}/${growthToStadium(growth)}`)) {
        // Illustration aus assets/plants — Anker unten Mitte
        const tex = PLANT_TEXTURES.get(`${slug}/${growthToStadium(growth)}`);
        spr = new PIXI.Sprite(tex);
        spr.anchor.set(0.5, 0.96);
        const base = growthToStadium(growth) === "mature" ? 44 : 34;
        spr.scale.set(base / Math.max(tex.frame.width, 1));
      } else {
        spr = drawPlantSpritePlaceholder(p.family, growth);
      }
      spr.x = bx + 10 + (bw - 20) * (i / Math.max(1, n - 1));
      spr.y = by + bh * (0.35 + 0.35 * ((i % 3) / 2));
      if (spr.tint !== undefined && !PLANT_TEXTURES.has(`${slug}/${growthToStadium(growth)}`)) {
        spr.tint = Math.random() < 0.5 ? 0xffffff : 0xf0e8d8;
      }
      c.addChild(spr);
    }

    bv.container.addChild(c);
    plantingViews.push({ ...p, container: c });
  }
}

function clampGrowth(p, month) {
  const [m0, m1] = p.months;
  if (month < m0 || month > m1) return 0;
  return Math.min(1, 0.25 + (month - m0) / Math.max(1, m1 - m0) * 0.75);
}

// ------------------------------------------------------------------
// Pan / Zoom (Pointer Events auf dem Canvas)
// ------------------------------------------------------------------
let dragging = false, lastX = 0, lastY = 0, pinchStart = null;

function fitGarden() {
  const margin = 60;
  const sw = app.screen.width - margin * 2;
  const sh = app.screen.height - margin * 2;
  const s = Math.min(sw / (GARDEN_W * SCALE), sh / (GARDEN_H * SCALE));
  world.scale.set(s);
  world.x = margin + (sw - GARDEN_W * SCALE * s) / 2;
  world.y = margin + (sh - GARDEN_H * SCALE * s) / 2;
}
fitGarden();

const stage = app.stage;
stage.eventMode = "static";
stage.hitArea = app.screen;

stage.on("pointerdown", (e) => {
  if (e.target === stage || e.target === grain) {
    dragging = true;
    lastX = e.global.x; lastY = e.global.y;
  }
});
stage.on("pointermove", (e) => {
  if (!dragging) return;
  world.x += e.global.x - lastX;
  world.y += e.global.y - lastY;
  lastX = e.global.x; lastY = e.global.y;
});
stage.on("pointerup", () => dragging = false);
stage.on("pointerupoutside", () => dragging = false);

document.getElementById("stage").addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  const before = { x: e.offsetX, y: e.offsetY };
  const worldBefore = {
    x: (before.x - world.x) / world.scale.x,
    y: (before.y - world.y) / world.scale.y,
  };
  world.scale.set(Math.max(0.3, Math.min(3, world.scale.x * factor)));
  world.x = before.x - worldBefore.x * world.scale.x;
  world.y = before.y - worldBefore.y * world.scale.y;
}, { passive: false });

// ------------------------------------------------------------------
// Tap auf Beet → Badge-Details (Pseudo-Drawer)
// ------------------------------------------------------------------
const badge = document.getElementById("badge");
function showBadge(html, x, y, cls = "") {
  badge.innerHTML = html;
  badge.className = `hud-badge show ${cls}`;
  badge.style.left = Math.min(x, window.innerWidth - 340) + "px";
  badge.style.top = Math.min(y, window.innerHeight - 160) + "px";
}
function hideBadge() { badge.className = "hud-badge"; }

for (const [slug, bv] of bedViews) {
  bv.container.on("pointertap", (e) => {
    if (Math.abs(e.global.x - (bv._lastDown ?? -99)) > 8) return;  // Drag vs Tap
    const familyPlantings = DEMO_PLANTINGS.filter(p => p.bed === slug && p.family);
    const famDots = familyPlantings.map(p =>
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;
        background:${FAMILY_COLORS[p.family]};margin-right:4px;"></span>${p.label}`
    ).join("<br>");
    showBadge(
      `<div class="t">${bv.bed.title}</div>
       <div>${(bv.bed.flaeche || 0).toFixed(1)} m² · ${bv.bed.comment || ""}</div>
       <div style="margin-top:6px">${famDots || "— keine Pflanzung 2025 —"}</div>`,
      e.global.x + 14, e.global.y + 14
    );
  });
}

// pointerdown pro Beet merken (Tap vs. Drag unterscheiden)
for (const [slug, bv] of bedViews) {
  bv.container.on("pointerdown", (e) => {
    bv._lastDown = e.global.x;
    dragging = false;   // Beet-Fokus: nicht die Welt verschieben
  });
}

// ------------------------------------------------------------------
// Saison-Scrubber: Licht, Wuchs
// ------------------------------------------------------------------
let currentMonth = 5; // Juni

const scrub = document.getElementById("hud-scrub");
const hudMonth = document.getElementById("hud-month");
scrub.addEventListener("input", () => {
  currentMonth = parseInt(scrub.value, 10);
  hudMonth.textContent = MONTHS[currentMonth];
  applySeason();
});

function applySeason() {
  drawPlantings();

  // Saison-Licht: Overlay-Tint
  const lightTints = {
    0: 0x8a95b8, 1: 0x96a0be, 2: 0xb8c2a8, 3: 0xd6dfb0,
    4: 0xe8e4b8, 5: 0xfff2c8, 6: 0xfff0b4, 7: 0xffe8a8,
    8: 0xf2ddb4, 9: 0xe8c8a0, 10: 0xcfc0b0, 11: 0xb0b6cc,
  };
  lightOverlay.tint = lightTints[currentMonth];

  // Bed-Labels bleiben konstant; Konflikt-Demo-Beet (Demo) leicht pulsieren lassen
}

const lightOverlay = new PIXI.Sprite(PIXI.Texture.WHITE);
lightOverlay.width = app.screen.width + 400;
lightOverlay.height = app.screen.height + 400;
lightOverlay.alpha = 0.14;
lightOverlay.blendMode = "multiply";
app.stage.addChild(lightOverlay);
grain.alpha = 0.35;
app.stage.addChildAt(grain, app.stage.children.length - 1);

// initiale Saison
applySeason();
hudMonth.textContent = MONTHS[currentMonth];

// ------------------------------------------------------------------
// Illustrationen vorladen: alle vorhandenen SVGs unter
// assets/plants/<familie>/<stadium>.svg prüfen und laden.
// Nicht vorhandene Dateien werden still übersprungen (404 → Fallback).
// ------------------------------------------------------------------
const FAMILIES = ["nachtschatten", "korbbluetler", "huelsenfruechtler", "zwiebelgewaechse",
  "kreuzbluetler", "beeren", "suessgraeser", "lippenbluetler", "kuerbisgewaechse", "doldenbluetler"];
const STADIUMS = ["seedling", "young", "mature"];

(async () => {
  let loaded = 0;
  await Promise.all(FAMILIES.flatMap(fam =>
    STADIUMS.map(async (st) => {
      const tex = await loadPlantTexture(fam, st);
      if (tex) loaded++;
    })
  ));
  if (loaded > 0) {
    drawPlantings();   // neu zeichnen mit echten Illustrationen
    console.info(`rotato: ${loaded} Pflanzen-Illustrationen geladen`);
  }
})();

// ------------------------------------------------------------------
// Konflikt-Demo: Tomatenbeet 2026 wieder Nachtschatten → roter Pulse
// ------------------------------------------------------------------
const conflictDemo = bedViews.get("tomatenbeet");
const conflictPulse = new Graphics();
conflictPulse.lineStyle({ width: 3, color: "#d95f43" });
jitterPath(conflictPulse, 0, 0, conflictDemo.w, conflictDemo.h, 4, 11);
conflictDemo.container.addChild(conflictPulse);

let pulseT = 0;
app.ticker.add((dt) => {
  pulseT += dt * 0.05;
  const a = 0.5 + Math.sin(pulseT) * 0.4;
  conflictPulse.alpha = Math.max(0.15, a);
  conflictPulse.scale.set(1 + Math.sin(pulseT) * 0.012);
});

// ---------------------------------------------------------------
// Resize
// ---------------------------------------------------------------
window.addEventListener("resize", () => {
  app.resize();
  grain.width = app.screen.width + 200;
  grain.height = app.screen.height + 200;
  lightOverlay.width = app.screen.width + 400;
  lightOverlay.height = app.screen.height + 400;
  fitGarden();
});
