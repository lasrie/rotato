// rotato — PixiJS-Karten-Renderer (Bühne)
// Liest das Read-Modell vom BFF (/api/garden) und rendert die stilisierte
// Draufsicht. Aktuell: Beete, Saatbänder, Pflanzen-Platzhalter/Illustrationen,
// Saison-Scrubber. Geplant: Drag/Malen, Konflikt-Pulse, Anzucht-Dock.

import * as PIXI from "pixi.js";

const PAPER = "#f4f1e6";
const INK = "#2f2a24";
const INK_SOFT = "#6b6353";
const SCALE = 46;
const PAD = 2.2;

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"];

function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterPath(g, x, y, w, h, amp = 3, seed = 1) {
  const rand = mulberry(seed);
  const pts = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) pts.push({ x: x + w * (i / steps), y: y - Math.abs(rand()) * amp });
  for (let i = 0; i <= steps; i++) pts.push({ x: x + w + Math.abs(rand()) * amp, y: y + h * (i / steps) });
  for (let i = 0; i <= steps; i++) pts.push({ x: x + w * (1 - i / steps), y: y + h + Math.abs(rand()) * amp });
  for (let i = 0; i <= steps; i++) pts.push({ x: x - Math.abs(rand()) * amp, y: y + h * (1 - i / steps) });
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], prev = pts[i - 1];
    g.quadraticCurveTo(
      (prev.x + p.x) / 2 + (rand() - 0.5) * amp,
      (prev.y + p.y) / 2 + (rand() - 0.5) * amp,
      p.x, p.y,
    );
  }
  g.closePath();
}

export function createGardenMap(canvas, garden, opts = {}) {
  const onBedSelect = opts.onBedSelect || (() => {});
  const onMonthChange = opts.onMonthChange || (() => {});

  const app = new PIXI.Application();
  let ready = false;

  const state = {
    month: new Date().getMonth(),
    plantings: garden.plantings ?? [],
    beds: garden.beds ?? [],
  };

  const world = new PIXI.Container();
  const bedLayer = new PIXI.Container();
  const plantLayer = new PIXI.Container();
  let grain, lightOverlay;
  const bedViews = new Map();

  // Pflanzen-Sprites: Illustrationen aus /assets/plants/<familie>/<stadium>.svg
  // falls vorhanden, sonst abstrakter Platzhalter (Ellipsen-Blätter)
  const PLANT_TEXTURES = new Map();   // key: "<familie>/<stadium>" → PIXI.Texture

  async function loadPlantTexture(familySlug, stadium) {
    const key = `${familySlug}/${stadium}`;
    if (PLANT_TEXTURES.has(key)) return PLANT_TEXTURES.get(key);
    const url = `/assets/plants/${familySlug}/${stadium}.svg`;
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

  function growthToStadium(growth) {
    if (growth < 0.33) return "seedling";
    if (growth < 0.72) return "young";
    return "mature";
  }

  async function init() {
    await app.init({
      canvas,
      resizeTo: canvas.parentElement || window,
      background: PAPER,
      antialias: true,
      preference: "webgl",
    });

    app.stage.addChild(world);
    world.addChild(bedLayer, plantLayer);

    grain = new PIXI.Sprite(makeGrainTexture());
    grain.alpha = 0.35;
    app.stage.addChild(grain);

    lightOverlay = new PIXI.Sprite(PIXI.Texture.WHITE);
    lightOverlay.alpha = 0.14;
    lightOverlay.blendMode = "multiply";
    app.stage.addChild(lightOverlay);

    buildWorld();
    wireInput();
    applySeason();

    // Illustrationen vorladen: alle vorhandenen SVGs prüfen und laden.
    // Nicht vorhandene Dateien werden still übersprungen (404 → Fallback).
    const slugs = [...new Set(state.plantings.map(p => p.plant?.familySlug).filter(Boolean))];
    const STADIUMS = ["seedling", "young", "mature"];
    let loaded = 0;
    await Promise.all(slugs.flatMap(slug =>
      STADIUMS.map(async (st) => {
        const tex = await loadPlantTexture(slug, st);
        if (tex) loaded++;
      })
    ));
    if (loaded > 0) {
      drawPlantings();   // neu zeichnen mit echten Illustrationen
      console.info(`rotato: ${loaded} Pflanzen-Illustrationen geladen`);
    }

    ready = true;
    return api;
  }

  function makeGrainTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 210 + Math.random() * 45;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 26;
    }
    ctx.putImageData(img, 0, 0);
    return PIXI.Texture.from(c);
  }

  // ------------------------------------------------------------------
  function buildWorld() {
    const xs = state.beds.map(b => [b.x, b.x + b.w]);
    const ys = state.beds.map(b => [b.y, b.y + b.h]);
    const gx = Math.min(...xs.flat()) - PAD;
    const gy = Math.min(...ys.flat()) - PAD;
    const gw = Math.max(...xs.flat()) + PAD - gx;
    const gh = Math.max(...ys.flat()) + PAD - gy;

    state.gardenBounds = { gx, gy, gw, gh };

    const fence = new PIXI.Graphics();
    fence.lineStyle({ width: 3, color: INK, cap: "round", alpha: 0.85 });
    jitterPath(fence, 0, 0, gw * SCALE, gh * SCALE, 5, 7);
    bedLayer.addChild(fence);

    const lawn = new PIXI.Graphics();
    lawn.beginFill("#b9d48a");
    jitterPath(lawn, 0, 0, gw * SCALE, gh * SCALE, 5, 7);
    lawn.endFill();
    lawn.alpha = 0.35;
    bedLayer.addChild(lawn);

    const grassDeco = new PIXI.Graphics();
    const grassRand = mulberry(42);
    for (let i = 0; i < 160; i++) {
      const gx2 = grassRand() * gw * SCALE;
      const gy2 = grassRand() * gh * SCALE;
      grassDeco.lineStyle({ width: 1.5, color: "#7a9c4f", alpha: 0.5 });
      grassDeco.moveTo(gx2, gy2);
      grassDeco.lineTo(gx2 + (grassRand() - 0.5) * 3, gy2 - 5 - grassRand() * 4);
    }
    bedLayer.addChild(grassDeco);

    for (const bed of state.beds) drawBed(bed);
    drawPlantings();
  }

  function drawBed(b) {
    const c = new PIXI.Container();
    c.x = (b.x - state.gardenBounds.gx) * SCALE;
    c.y = (b.y - state.gardenBounds.gy) * SCALE;
    const w = b.w * SCALE, h = b.h * SCALE;
    const isPath = b.isPath;

    const g = new PIXI.Graphics();
    g.beginFill(isPath ? "#d9cfb8" : "#a97c50");
    jitterPath(g, 0, 0, w, h, 3.5, b.slug.length * 31 + 7);
    g.endFill();
    g.lineStyle({ width: 2.5, color: INK, cap: "round" });
    jitterPath(g, 0, 0, w, h, 3.5, b.slug.length * 31 + 7);
    g.lineStyle({ width: 1.2, color: INK_SOFT, alpha: 0.6, cap: "round" });
    jitterPath(g, 1.5, 1.5, w - 3, h - 3, 4, b.slug.length * 31 + 99);

    const rnd = mulberry(b.slug.length * 101 + 3);
    for (let i = 0; i < (w * h) / 260; i++) {
      const px = rnd() * w, py = rnd() * h;
      g.beginFill(isPath ? "#c4b79c" : "#8a6540", 0.7);
      g.drawCircle(px, py, 1 + rnd() * 1.8);
      g.endFill();
    }
    c.addChild(g);

    const label = new PIXI.Text(b.title, {
      fontFamily: "Inter, sans-serif",
      fontSize: 12,
      fontWeight: "600",
      fill: INK,
    });
    const pillBg = new PIXI.Graphics();
    const lw = label.width + 16, lh = label.height + 8;
    pillBg.beginFill("#ffffff", 0.92);
    pillBg.lineStyle({ width: 1.5, color: INK });
    pillBg.drawRoundedRect(-4, -2, lw, lh, 8);
    pillBg.endFill();
    label.x = 4; label.y = 2;
    const pill = new PIXI.Container();
    pill.addChild(pillBg, label);
    pill.x = 4;
    pill.y = -lh - 4;
    c.addChild(pill);

    c.eventMode = "static";
    c.cursor = "pointer";
    c.hitArea = new PIXI.Rectangle(0, 0, w, h);
    c.on("pointertap", () => onBedSelect(b));

    bedViews.set(b.slug, { container: c, bed: b, w, h });
    bedLayer.addChild(c);
  }

  // ------------------------------------------------------------------
  function drawPlantings() {
    plantLayer.removeChildren();
    for (const p of state.plantings) {
      const bv = bedViews.get(p.bed);
      if (!bv || !p.plant?.familyColor) continue;
      const growth = clampGrowth(p, state.month);
      if (growth <= 0) continue;

      const c = new PIXI.Container();
      const bw = bv.w - 14, bh = Math.max(10, bv.h * 0.42);
      const bx = 7, by = bv.h / 2 - bh / 2;

      const band = new PIXI.Graphics();
      band.beginFill(p.plant.familyColor, 0.75);
      jitterPath(band, bx, by, bw, bh, 2.5, (p.plant.label || "x").length * 17 + 5);
      band.endFill();
      c.addChild(band);

      const slug = p.plant.familySlug;
      const n = Math.max(2, Math.floor(bw / 18));
      for (let i = 0; i < n; i++) {
        const stadium = slug ? growthToStadium(growth) : null;
        let spr;
        if (slug && PLANT_TEXTURES.has(`${slug}/${stadium}`)) {
          // Illustration aus /assets/plants — Anker unten Mitte
          const tex = PLANT_TEXTURES.get(`${slug}/${stadium}`);
          spr = new PIXI.Sprite(tex);
          spr.anchor.set(0.5, 0.96);
          const base = stadium === "mature" ? 44 : 34;
          spr.scale.set(base / Math.max(tex.frame.width, 1));
        } else {
          spr = placeholderSprite(p.plant.familyColor, growth);
        }
        spr.x = bx + 10 + (bw - 20) * (i / Math.max(1, n - 1));
        spr.y = by + bh * (0.35 + 0.35 * ((i % 3) / 2));
        c.addChild(spr);
      }
      bv.container.addChild(c);
    }
  }

  function placeholderSprite(color, growth) {
    const g = new PIXI.Graphics();
    const dark = shade(color, -30);
    const size = 6 + growth * 10;
    g.lineStyle({ width: 2, color: "#5d7a3a", cap: "round" });
    g.moveTo(0, 0);
    g.lineTo(0, -size * 0.8);
    const leaves = Math.max(2, Math.round(2 + growth * 3));
    for (let i = 0; i < leaves; i++) {
      const angle = (i / leaves) * Math.PI * 2 + 0.3;
      const lx = Math.cos(angle) * size;
      const ly = -size * 0.6 + Math.sin(angle) * size * 0.6;
      g.beginFill(color);
      g.drawEllipse(lx, ly, size * 0.38, size * 0.22);
      g.endFill();
      g.lineStyle({ width: 1, color: dark, alpha: 0.7 });
      g.drawEllipse(lx, ly, size * 0.38, size * 0.22);
    }
    return g;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g2 = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return (r << 16) | (g2 << 8) | b;
  }

  function clampGrowth(p, month) {
    const from = monthOf(p.monthFrom) ?? 4;
    const to = monthOf(p.monthTo) ?? 9;
    if (month < from || month > to) return 0;
    return Math.min(1, 0.25 + ((month - from) / Math.max(1, to - from)) * 0.75);
  }

  function monthOf(ym) {
    if (!ym) return null;
    const m = parseInt(ym.slice(5, 7), 10);
    return Number.isFinite(m) ? m - 1 : null;
  }

  // ------------------------------------------------------------------
  // Input: Pan/Zoom
  // ------------------------------------------------------------------
  let dragging = false, lastX = 0, lastY = 0;

  function fitGarden() {
    const { gw, gh } = state.gardenBounds;
    const margin = 60;
    const sw = app.screen.width - margin * 2;
    const sh = app.screen.height - margin * 2;
    const s = Math.min(sw / (gw * SCALE), sh / (gh * SCALE));
    world.scale.set(s);
    world.x = margin + (sw - gw * SCALE * s) / 2;
    world.y = margin + (sh - gh * SCALE * s) / 2;
  }

  function wireInput() {
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", (e) => {
      dragging = true;
      lastX = e.global.x; lastY = e.global.y;
    });
    app.stage.on("pointermove", (e) => {
      if (!dragging) return;
      world.x += e.global.x - lastX;
      world.y += e.global.y - lastY;
      lastX = e.global.x; lastY = e.global.y;
    });
    const end = () => dragging = false;
    app.stage.on("pointerup", end);
    app.stage.on("pointerupoutside", end);

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const before = { x: e.offsetX, y: e.offsetY };
      const wb = {
        x: (before.x - world.x) / world.scale.x,
        y: (before.y - world.y) / world.scale.y,
      };
      world.scale.set(Math.max(0.3, Math.min(3, world.scale.x * factor)));
      world.x = before.x - wb.x * world.scale.x;
      world.y = before.y - wb.y * world.scale.y;
    }, { passive: false });
  }

  // ------------------------------------------------------------------
  function applySeason() {
    drawPlantings();
    const tints = [0x8a95b8, 0x96a0be, 0xb8c2a8, 0xd6dfb0, 0xe8e4b8,
      0xfff2c8, 0xfff0b4, 0xffe8a8, 0xf2ddb4, 0xe8c8a0, 0xcfc0b0, 0xb0b6cc];
    lightOverlay.tint = tints[state.month];
    onMonthChange(state.month);
  }

  const api = {
    setMonth(m) {
      state.month = m;
      applySeason();
    },
    resize() {
      app.resize();
      if (grain) { grain.width = app.screen.width + 200; grain.height = app.screen.height + 200; }
      if (lightOverlay) { lightOverlay.width = app.screen.width + 400; lightOverlay.height = app.screen.height + 400; }
      fitGarden();
    },
    destroy() {
      app.destroy(true);
    },
    isReady: () => ready,
  };
  return { init, api };
}
