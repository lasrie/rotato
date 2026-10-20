<script>
  import { onMount } from "svelte";
  import { createGardenMap } from "#lib/garden-map.js";

  let status = "lädt…";
  let garden = null;
  let canvasEl;
  let map = null;
  let month = new Date().getMonth();

  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"];

  onMount(async () => {
    try {
      const res = await fetch("/api/garden");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      garden = await res.json();
      status = `${garden.beds.length} Beete · ${garden.plantings.length} Pflanzungen`;

      const { init, api } = createGardenMap(canvasEl, garden, {
        onBedSelect: (bed) => {
          status = `Ausgewählt: ${bed.title}`;
        },
      });
      map = api;
      await init();
    } catch (e) {
      status = `⚠️ ${e.message}`;
    }
  });

  function onScrub(e) {
    month = parseInt(e.target.value, 10);
    map?.setMonth(month);
  }
</script>

<div class="stage">
  <canvas bind:this={canvasEl}></canvas>

  <div class="hud hud-top-left">
    🌱 rotato <span class="sub">Garten 91</span>
  </div>

  <div class="hud hud-top-right">{status}</div>

  <div class="hud hud-bottom">
    <span class="hud-month">{MONTHS[month]}</span>
    <input type="range" min="0" max="11" value={month} on:input={onScrub}
           aria-label="Saison wählen" />
    <span>2025</span>
  </div>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .hud {
    position: fixed;
    font-size: 13px;
    color: var(--ink);
    user-select: none;
    z-index: 10;
  }
  .hud-top-left {
    top: 14px; left: 16px;
    font-weight: 700;
    display: flex; align-items: center; gap: 10px;
  }
  .hud-top-left .sub { font-weight: 400; color: var(--ink-soft); }
  .hud-top-right {
    top: 12px; right: 16px;
    background: rgba(255,255,255,0.85);
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    padding: 6px 14px;
    box-shadow: 2px 2px 0 rgba(47,42,36,0.25);
  }
  .hud-bottom {
    bottom: 14px; left: 50%; transform: translateX(-50%);
    background: rgba(255,255,255,0.9);
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    padding: 8px 18px;
    display: flex; gap: 14px; align-items: center;
    box-shadow: 3px 3px 0 rgba(47,42,36,0.18);
  }
  .hud-bottom input[type=range] { width: 260px; accent-color: var(--ink); }
  .hud-month { font-weight: 700; min-width: 92px; }
</style>
