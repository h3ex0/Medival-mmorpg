"use strict";
/* =====================================================================
   IRONHOLD: WORLD MAP MODULE
   ---------------------------------------------------------------------
   A terrain map around your city, dotted with resource sites.
   Each site is held by a garrison. Beat it (marching on a timer, or leading
   the raid yourself) to take its stockpile. You can then keep the site as a
   territory that pays you resources every second.
   Depends on globals: Battle, TERRAIN, mulberry32, pickFaction, composeArmy,
   armyPower, fmt, fmtTime, esc, RESOURCES, $ (all resolved at call time).
   ===================================================================== */

const NODE_TYPES = {
  goldmine: { name: "Gold Mine",         icon: "💰", res: { gold: 400 },                       weight: 4, desc: "A rich vein worked by enemy slaves." },
  forest:   { name: "Old-growth Forest", icon: "🌲", res: { wood: 500 },                       weight: 4, desc: "Towering trees, perfect timber." },
  quarry:   { name: "Stone Quarry",      icon: "🪨", res: { stone: 500 },                      weight: 3, desc: "Cut stone ready for hauling." },
  ironmine: { name: "Iron Mine",         icon: "⚒️", res: { steel: 150 },                      weight: 3, desc: "Iron ore and a crude smelter." },
  ranch:    { name: "Wild Horse Herd",   icon: "🐎", res: { horses: 12 },                      weight: 2, desc: "Wild horses guarded by raiders." },
  crystal:  { name: "Crystal Cavern",    icon: "💎", res: { crystals: 6 },                     weight: 2, desc: "Glowing mana crystals deep underground." },
  village:  { name: "Rebel Village",     icon: "🏘️", res: { food: 500, gold: 150 },            weight: 3, desc: "Granaries and coin, held by rebels." },
  fort:     { name: "Bandit Fortress",   icon: "🏯", res: { gold: 600, steel: 120, wood: 200 }, weight: 2, fortified: 2, power: 1.6, desc: "Walled stronghold full of plunder. Bring siege." },
  roost:    { name: "Wyvern Roost",      icon: "🦅", res: { gold: 800, relics: 1 },            weight: 1, power: 2, far: true, desc: "Monsters nest on ancient treasure." },
};

const World = {
  W: 24, H: 16,
  RESPAWN: 900,          // seconds before a beaten (but not captured) site is re-garrisoned and restocked
  INCOME_WINDOW: 600,    // a territory pays its full stockpile every 10 minutes

  /* ---------- generation ---------- */
  generate(seed = Math.floor(Math.random() * 2 ** 31)) {
    const W = this.W, H = this.H, R = mulberry32(seed);
    const t = new Array(W * H).fill("plains");
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) t[y * W + x] = v; };
    const blob = (v, n, rMin, rMax, prob = 0.85) => {
      for (let i = 0; i < n; i++) {
        const cx = R() * W, cy = R() * H, r = rMin + R() * (rMax - rMin);
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let x = Math.floor(cx - r); x <= cx + r; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d <= r && R() < prob * (1 - (d / r) * 0.4)) set(x, y, v);
          }
      }
    };
    blob("forest", 9, 1.5, 3.2); blob("hill", 7, 1.2, 2.6); blob("valley", 3, 1.5, 2.8);
    blob("swamp", 2, 1.2, 2.2); blob("mountain", 6, 1, 2.2, 0.95);
    // a river winding across the map
    let ry = Math.floor(H * (0.25 + R() * 0.5));
    for (let x = 0; x < W; x++) {
      set(x, ry, x % 7 === 3 ? "bridge" : "river");
      if (R() < 0.35) ry = Math.max(1, Math.min(H - 2, ry + (R() < 0.5 ? -1 : 1)));
    }
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) set(x, y, "plains");

    // place sites
    const nodes = [];
    const types = Object.entries(NODE_TYPES);
    const total = types.reduce((a, [, n]) => a + n.weight, 0);
    const pickType = (dist) => {
      for (let tries = 0; tries < 10; tries++) {
        let r = R() * total;
        for (const [id, n] of types) { r -= n.weight; if (r <= 0) { if (n.far && dist < 7) break; return id; } }
      }
      return "goldmine";
    };
    // guarantee one of each basic type close to home
    const near = ["goldmine", "forest", "quarry", "village", "ranch", "ironmine"];
    let id = 1, guard = 0;
    while (nodes.length < 26 && guard++ < 4000) {
      const x = Math.floor(R() * W), y = Math.floor(R() * H);
      const tt = t[y * W + x];
      if (tt === "mountain" || tt === "river" || tt === "bridge") continue;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < 2.5) continue;
      if (nodes.some((n) => Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 1)) continue;
      let type;
      if (near.length && dist < 6) type = near.shift();
      else if (near.length && nodes.length > 12) continue;
      else type = pickType(dist);
      const level = Math.min(10, 1 + Math.floor(dist / 1.6));
      nodes.push({ id: id++, x, y, type, level, owner: "enemy", garrison: null, stockMult: 1, clearedUntil: 0 });
    }
    return { seed, w: W, h: H, tiles: t, city: [cx, cy], nodes };
  },

  /* ---------- helpers ---------- */
  ensure(s) {
    if (!s.world || !s.world.nodes) s.world = this.generate();
    for (const n of s.world.nodes) if (!n.garrison && n.owner !== "player") this.regarrison(s, n);
    return s.world;
  },
  node(s, id) { return s.world && s.world.nodes.find((n) => n.id === id); },
  dist(s, n) { return Math.hypot(n.x - s.world.city[0], n.y - s.world.city[1]); },
  power(s, n) {
    const T = NODE_TYPES[n.type];
    return Math.round(25 * Math.pow(1.5, n.level - 1) * (T.power || 1) * (1 + 0.25 * (s.buildings.townhall - 1)));
  },
  regarrison(s, n) {
    const p = this.power(s, n);
    const f = pickFaction(p);
    n.faction = f;
    n.garrison = composeArmy(f, p);
  },
  stock(s, n) {
    const out = {};
    for (const [r, v] of Object.entries(NODE_TYPES[n.type].res)) out[r] = r === "relics" ? Math.max(1, Math.floor(n.level / 3)) : Math.round(v * Math.pow(1.5, n.level - 1));
    return out;
  },
  mapType(s, n) {
    const t = s.world.tiles[n.y * s.world.w + n.x];
    let mountains = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = n.x + dx, y = n.y + dy;
      if (x >= 0 && y >= 0 && x < s.world.w && y < s.world.h && s.world.tiles[y * s.world.w + x] === "mountain") mountains++;
    }
    if (mountains >= 4) return "mountain";
    return { forest: "forest", hill: "hills", valley: "valley", swamp: "swamp", rubble: "plains", wall: "plains" }[t] || (mountains >= 2 ? "valley" : "plains");
  },
  travel(s, n) { return Math.round(60 + this.dist(s, n) * 25); },
  territories(s) { return s.world ? s.world.nodes.filter((n) => n.owner === "player") : []; },
  maxTerritories(s) { return 1 + Math.floor(s.buildings.townhall / 2) + (s.research && s.research.levels ? (s.research.levels.cartography || 0) >= 4 ? 1 : 0 : 0); },
  /** Resources per second from all territories. */
  income(s) {
    const out = {};
    for (const n of this.territories(s)) for (const [r, v] of Object.entries(this.stock(s, n))) out[r] = (out[r] || 0) + v / this.INCOME_WINDOW;
    return out;
  },
  /** The node as a mission-like object (used by the deploy dialog, expeditions and battle setup). */
  asMission(s, n) {
    const T = NODE_TYPES[n.type];
    const stock = this.stock(s, n);
    return {
      id: "node:" + n.id, node: n.id, name: `${T.name} (Lv ${n.level})`, sub: n.faction ? FACTIONS[n.faction].name : "",
      asset: "n_" + n.type, map: this.mapType(s, n), duration: this.travel(s, n), level: 1,
      xp: Math.round(15 * Math.pow(1.35, n.level - 1)), army: n.garrison || {}, fortified: T.fortified || 0,
      loot: Object.fromEntries(Object.entries(stock).filter(([r]) => r !== "relics").map(([r, v]) => [r, [v, v]])),
      relic: stock.relics ? { chance: 1, n: [stock.relics, stock.relics] } : null,
      enemyTactic: T.fortified ? "holdline" : "balanced",
    };
  },
  blocker(s, n) {
    if (n.owner === "player") return "This territory is already yours";
    if (n.clearedUntil > s.time) return `Garrison regrouping (${fmtTime(n.clearedUntil - s.time)})`;
    if (s.expeditions.some((e) => e.mission === "node:" + n.id)) return "An army is already marching here";
    return null;
  },
  /** Called after you win against a site. */
  onWin(s, n) {
    const free = this.territories(s).length < this.maxTerritories(s);
    if (free) {
      n.owner = "player";
      n.garrison = null;
      addLog(s, `🚩 ${NODE_TYPES[n.type].name} (Lv ${n.level}) is now your territory! It pays ${Object.entries(this.stock(s, n)).map(([r, v]) => `${(v / this.INCOME_WINDOW).toFixed(2)} ${RESOURCES[r].name}`).join(", ")} per second.`, "good");
      return "captured";
    }
    n.clearedUntil = s.time + this.RESPAWN;
    n.garrison = null;
    addLog(s, `${NODE_TYPES[n.type].name} looted. You have no free territory slots, so the enemy will return in ${fmtTime(this.RESPAWN)}.`, "info");
    return "looted";
  },
  abandon(s, n) {
    if (n.owner !== "player") return;
    n.owner = "enemy";
    n.clearedUntil = s.time + this.RESPAWN;
    n.garrison = null;
    addLog(s, `You abandoned the ${NODE_TYPES[n.type].name}.`, "info");
  },
  step(s) {
    if (!s.world) return;
    for (const n of s.world.nodes) {
      if (n.owner !== "player" && !n.garrison && n.clearedUntil <= s.time) this.regarrison(s, n);
    }
  },
};

/* =====================================================================
   WORLD MAP UI
   ===================================================================== */
const WorldUI = {
  open: false,
  sel: null,
  cell: 32,
  show() {
    const s = GameState.current;
    World.ensure(s);
    this.open = true;
    let root = document.getElementById("worldRoot");
    if (!root) { root = document.createElement("div"); root.id = "worldRoot"; document.body.appendChild(root); }
    root.innerHTML = `<div class="bf wm">
      <div class="bf-top"><div><h2>🗺️ The Known World</h2><div class="bf-sub" id="wmSub"></div></div>
        <div class="btn-row"><button class="btn primary" data-wm="close">Back to the city</button></div></div>
      <div class="bf-main">
        <div class="bf-board-wrap"><div class="bf-board" id="wmBoard"></div></div>
        <aside class="bf-side"><div class="bf-card" id="wmSel"></div><div class="bf-card" id="wmTerr"></div><div class="bf-card" id="wmLegend"></div></aside>
      </div></div>`;
    document.body.classList.add("in-battle");
    if (!this._bound) {
      this._bound = true;
      document.addEventListener("click", (e) => {
        if (!this.open) return;
        const b = e.target.closest("[data-wm]");
        if (b && !b.disabled) { this.action(b.dataset.wm, b.dataset); return; }
        const c = e.target.closest("#wmBoard [data-node]");
        if (c) { this.sel = +c.dataset.node; this.render(); }
      });
      window.addEventListener("resize", () => { if (this.open) { this.layout(); this.renderTiles(); this.render(); } });
      document.addEventListener("keydown", (e) => { if (this.open && e.key === "Escape") this.hide(); });
    }
    this.layout(); this.renderTiles(); this.render();
  },
  hide() {
    this.open = false;
    const root = document.getElementById("worldRoot");
    if (root) root.innerHTML = "";
    if (!BattleUI.b) document.body.classList.remove("in-battle");
  },
  layout() {
    const w = GameState.current.world, narrow = window.innerWidth < 900;
    const availW = window.innerWidth - (narrow ? 24 : 340), availH = window.innerHeight - (narrow ? 260 : 110);
    this.cell = narrow ? Math.max(28, Math.floor(availW / w.w)) : Math.max(22, Math.floor(Math.min(availW / w.w, availH / w.h)));
    const board = document.getElementById("wmBoard");
    board.style.width = w.w * this.cell + "px"; board.style.height = w.h * this.cell + "px";
    board.style.setProperty("--cell", this.cell + "px");
  },
  renderTiles() {
    const w = GameState.current.world, c = this.cell;
    const glyph = { forest: "🌲", mountain: "⛰️" };
    let h = "";
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const t = w.tiles[y * w.w + x];
      h += `<div class="tile t-${t}" style="left:${x * c}px;top:${y * c}px;cursor:default">${glyph[t] ? `<span style="opacity:.55">${glyph[t]}</span>` : ""}</div>`;
    }
    h += `<div class="wm-city" style="left:${(w.city[0] - 0.5) * c}px;top:${(w.city[1] - 0.5) * c}px;width:${c * 2}px;height:${c * 2}px">🏰</div><div id="wmNodes"></div>`;
    document.getElementById("wmBoard").innerHTML = h;
  },
  render() {
    const s = GameState.current, w = s.world, c = this.cell;
    if (!this.open || !w) return;
    World.step(s);
    const terr = World.territories(s);
    document.getElementById("wmSub").innerHTML = `Territories <b>${terr.length}/${World.maxTerritories(s)}</b> (more as the Town Hall grows) · Click a site to see its garrison and riches.`;
    document.getElementById("wmNodes").innerHTML = w.nodes.map((n) => {
      const T = NODE_TYPES[n.type];
      const st = n.owner === "player" ? "mine" : n.clearedUntil > s.time ? "cleared" : s.expeditions.some((e) => e.mission === "node:" + n.id) ? "marching" : "enemy";
      return `<div class="wm-node ${st} ${this.sel === n.id ? "sel" : ""}" data-node="${n.id}" style="left:${n.x * c}px;top:${n.y * c}px" title="${esc(T.name)} Lv ${n.level}">
        <span>${T.icon}</span><b>${n.level}</b></div>`;
    }).join("");
    // selection
    const n = this.sel && World.node(s, this.sel);
    let h = `<div class="bf-h">Select a site</div><div class="dim" style="font-size:12px">Red sites are held by enemies, blue ones are yours, grey ones are recovering after a raid, and purple ones have your army marching on them.</div>`;
    if (n) {
      const T = NODE_TYPES[n.type], m = World.asMission(s, n), blk = World.blocker(s, n);
      const stock = World.stock(s, n);
      h = `<div class="bf-h">${T.icon} ${T.name} <span class="dim">Lv ${n.level}</span></div>
        <div class="dim" style="font-size:12px;margin-bottom:6px">${T.desc} Terrain: ${MAP_TYPES[m.map]}.${T.fortified ? " <b>Fortified.</b>" : ""}</div>
        <div style="font-size:12.5px"><b>${n.owner === "player" ? "Income" : "Stockpile"}:</b> ${Object.entries(stock).map(([r, v]) => n.owner === "player" ? `${(v / World.INCOME_WINDOW).toFixed(2)} ${RESOURCES[r].name}/s` : `${fmt(v)} ${RESOURCES[r].name}`).join(", ")}</div>
        <div style="font-size:12.5px;margin-top:3px"><b>March:</b> ${fmtTime(m.duration)} · <b>XP:</b> ${m.xp}</div>`;
      if (n.owner !== "player" && n.garrison) h += `<div style="font-size:12.5px;margin-top:6px"><b>Garrison</b> (${esc(FACTIONS[n.faction].name)}, power ⚔ ${fmt(armyPower(n.garrison))})</div><div class="chips">${UI.armyChips(n.garrison)}</div>`;
      if (blk) h += `<div class="req" style="margin-top:6px">${esc(blk)}</div>`;
      h += `<div class="btn-row" style="margin-top:8px">`;
      if (n.owner === "player") h += `<button class="btn danger sm" data-wm="abandon" data-id="${n.id}">Abandon territory</button>`;
      else h += `<button class="btn teal" data-wm="raid" data-id="${n.id}" ${blk ? "disabled" : ""}>⚔ Raid this site</button>`;
      h += `</div>`;
    }
    document.getElementById("wmSel").innerHTML = h;
    AssetPipeline.applyAll(document.getElementById("wmSel"));
    const inc = World.income(s);
    document.getElementById("wmTerr").innerHTML = `<div class="bf-h">Your territories</div>${terr.length ? terr.map((t) => `<div style="font-size:12px">${NODE_TYPES[t.type].icon} ${NODE_TYPES[t.type].name} Lv ${t.level}</div>`).join("") : '<div class="dim" style="font-size:12px">None yet. Beat a garrison to claim a site.</div>'}
      ${Object.keys(inc).length ? `<div style="font-size:12px;margin-top:6px"><b>Total income:</b> ${Object.entries(inc).map(([r, v]) => `+${v.toFixed(2)} ${RESOURCES[r].name}/s`).join(", ")}</div>` : ""}`;
    document.getElementById("wmLegend").innerHTML = `<div class="bf-h">Sites</div><div class="bf-army">${Object.values(NODE_TYPES).map((t) => `<span>${t.icon} ${t.name}</span>`).join("")}</div>`;
  },
  action(a, d) {
    const s = GameState.current;
    if (a === "close") this.hide();
    else if (a === "raid") { this.hide(); UI.openDeploy("node:" + d.id); }
    else if (a === "abandon") { const n = World.node(s, +d.id); World.abandon(s, n); this.render(); UI.update(); }
  },
};
