<script>
  import { onMount } from "svelte";
  import { createGardenMap } from "#lib/garden-map.js";

  let status = "lädt…";
  let garden = null;
  let canvasEl;
  let map = null;
  let month = new Date().getMonth();

  // Anzucht-Dock
  let dockOpen = false;
  let anzucht = [];
  let draggedCard = null;
  let plantMode = false;

  // Konflikt-Ampel
  let conflicts = [];

  // Toast (Sprechblase nach Drop)
  let toast = null;
  let toastTimer = null;

  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"];

  onMount(async () => {
    try {
      const res = await fetch("/api/garden");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      garden = await res.json();
      status = `${garden.beds.length} Beete · ${garden.plantings.length} Pflanzungen`;
      conflicts = garden.conflicts ?? [];

      const { init, api } = createGardenMap(canvasEl, garden, {
        onBedSelect: (bed) => {
          status = `Ausgewählt: ${bed.title}`;
        },
        onBedDrop: (card, bed) => handleDrop(card, bed),
      });
      map = api;
      await init();

      // Anzucht-Dock-Daten laden (aktuelles Jahr)
      const resA = await fetch(`/api/anzucht?year=${new Date().getFullYear()}`);
      if (resA.ok) {
        const data = await resA.json();
        anzucht = data.items ?? [];
      }
    } catch (e) {
      status = `⚠️ ${e.message}`;
    }
  });

  function onScrub(e) {
    month = parseInt(e.target.value, 10);
    map?.setMonth(month);
  }

  // ---- Transplant-Flow ----
  function startDrag(card) {
    draggedCard = card;
    plantMode = true;
    map?.startPlantMode(card);
  }

  function cancelDrag() {
    if (!plantMode) return;
    draggedCard = null;
    plantMode = false;
    map?.cancelPlantMode();
  }

  async function handleDrop(card, bed) {
    draggedCard = null;
    plantMode = false;
    try {
      const res = await fetch("/api/anzucht/transplant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: card.uri, bed: bed.slug, month: `${new Date().getFullYear()}-${String(month + 1).padStart(2, "0")}` }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✓ ${card.label} → ${bed.title}`, "ok");
        // Karte aus dem Dock entfernen, Karte aktualisieren
        anzucht = anzucht.filter((c) => c.uri !== card.uri);
        const resG = await fetch("/api/garden");
        if (resG.ok) garden = await resG.json();
        map?.refresh?.(garden);
      } else {
        showToast(`⚠ ${data.error}${data.details ? " — " + data.details[0] : ""}`, "warn");
      }
    } catch (e) {
      showToast(`⚠ ${e.message}`, "warn");
    }
  }

  function showToast(msg, kind) {
    toast = { msg, kind };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 4200);
  }

  const conflictCount = $derived(conflicts.length);
</script>

<svelte:window on:pointerup={cancelDrag} on:keydown={(e) => e.key === "Escape" && cancelDrag()} />

<div class="stage">
  <canvas bind:this={canvasEl}></canvas>

  <div class="hud hud-top-left">
    🌱 rotato <span class="sub">Garten 91</span>
  </div>

  <div class="hud hud-top-right">{status}</div>

  {#if conflictCount > 0}
    <div class="hud hud-ampel" title="Fruchtfolge-Konflikte — klicken für Details">
      ⚠ {conflictCount} Konflikt{conflictCount === 1 ? "" : "e"}
    </div>
  {/if}

  {#if toast}
    <div class="hud toast {toast.kind}">{toast.msg}</div>
  {/if}

  <div class="hud hud-bottom">
    <span class="hud-month">{MONTHS[month]}</span>
    <input type="range" min="0" max="11" value={month} oninput={onScrub}
           aria-label="Saison wählen" />
    <span>{new Date().getFullYear()}</span>
  </div>

  <!-- Anzucht-Dock (links unten) -->
  <div class="dock {dockOpen ? 'open' : ''}">
    <button class="dock-toggle" onclick={() => (dockOpen = !dockOpen)}
            aria-expanded={dockOpen}>
      🌿 Anzucht <span class="badge">{anzucht.length}</span>
    </button>
    {#if dockOpen}
      <div class="dock-body">
        {#if plantMode}
          <p class="hint">Jetzt ein Beet auf der Karte antippen… <button onclick={cancelDrag} class="cancel">Abbrechen</button></p>
        {/if}
        {#if anzucht.length === 0}
          <p class="empty">Keine Pflanzen in der Anzucht. 🌱</p>
        {:else}
          <ul>
            {#each anzucht as card (card.uri)}
              <li>
                <button class="card"
                        style="--c: {card.plant?.familyColor ?? '#9ccc8a'}"
                        onpointerdown={() => startDrag(card)}
                        title="Halten & auf ein Beet ziehen">
                  <span class="dot"></span>
                  <span class="name">{card.label}</span>
                  {#if card.menge}<span class="menge">×{card.menge}</span>{/if}
                  <span class="monat">{card.monthAnzucht?.slice(5)} · {MONTHS[parseInt(card.monthAnzucht?.slice(5) ?? '1', 10) - 1]?.slice(0,3) ?? ""}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
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

  .hud-ampel {
    top: 12px; right: 16px;
    transform: translateY(46px);
    background: rgba(255, 234, 200, 0.95);
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    padding: 6px 14px;
    box-shadow: 2px 2px 0 rgba(217,95,67,0.4);
  }

  .toast {
    bottom: 64px; left: 50%; transform: translateX(-50%);
    background: rgba(255,255,255,0.96);
    border: 1.5px solid var(--ink);
    border-radius: 12px;
    padding: 9px 16px;
    box-shadow: 3px 3px 0 rgba(47,42,36,0.18);
    max-width: 60ch;
  }
  .toast.ok { border-color: var(--ok); }
  .toast.warn { border-color: var(--accent); background: rgba(255,234,200,0.96); }

  /* ---------- Anzucht-Dock ---------- */
  .dock {
    position: fixed;
    bottom: 14px; left: 16px;
    z-index: 11;
  }
  .dock-toggle {
    font: inherit; font-weight: 700;
    background: rgba(255,255,255,0.92);
    border: 1.5px solid var(--ink);
    border-radius: 999px;
    padding: 8px 16px;
    cursor: pointer;
    box-shadow: 3px 3px 0 rgba(47,42,36,0.18);
    display: flex; align-items: center; gap: 8px;
  }
  .badge {
    background: var(--ink);
    color: var(--paper);
    border-radius: 999px;
    font-size: 11px;
    padding: 1px 8px;
  }
  .dock-body {
    position: absolute;
    bottom: 44px; left: 0;
    width: 300px;
    max-height: 46vh;
    overflow-y: auto;
    background: rgba(255,255,255,0.96);
    border: 1.5px solid var(--ink);
    border-radius: 14px;
    padding: 10px;
    box-shadow: 4px 4px 0 rgba(47,42,36,0.18);
  }
  .dock-body ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .card {
    font: inherit; text-align: left;
    width: 100%;
    display: flex; align-items: center; gap: 8px;
    background: #fff;
    border: 1.5px solid var(--ink);
    border-radius: 10px;
    padding: 7px 10px;
    cursor: grab;
    transition: transform 0.08s ease;
  }
  .card:active { cursor: grabbing; transform: scale(0.98); }
  .dot { width: 12px; height: 12px; border-radius: 999px; background: var(--c); border: 1.5px solid var(--ink); }
  .name { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .menge { font-size: 11px; color: var(--ink-soft); }
  .monat { font-size: 11px; color: var(--ink-soft); }
  .hint { margin: 0 0 8px; font-size: 12px; display: flex; align-items: center; gap: 8px; }
  .cancel { font: inherit; font-size: 11px; border: 1px solid var(--ink); background: none; border-radius: 999px; padding: 2px 10px; cursor: pointer; }
  .empty { color: var(--ink-soft); margin: 4px; font-size: 12px; }
</style>
