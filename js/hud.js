"use strict";
/* =====================================================================
   7b. HUD: city scene, action bar, windows, quest tracker, campaign log
   ===================================================================== */
/* =====================================================================
   7a. CITY: building lots, construction with builders & timers
   ---------------------------------------------------------------------
   The city is a set of lots. Each lot holds one building with its own level.
   Farms, quarries, houses etc. can be built many times (each up to a level cap);
   unique buildings (Town Hall, Barracks, Market…) exist once.
   The economy still reads s.buildings[type] = total level of that type,
   so every formula, limit and balance rule keeps working.
   ===================================================================== */
const MULTI_BUILDINGS = ["farm", "quarry", "lumbercamp", "house", "warehouse", "granary", "steelworks", "ranch", "brewery"];
const PRODUCES = { farm: "food", quarry: "stone", lumbercamp: "wood", steelworks: "steel", ranch: "horses", brewery: "ale", magetower: "crystals", temple: "faith", market: "gold", townhall: "gold" };
const TRAINS_AT = { barracks: "Barracks", stables: "Stables", workshop: "Siege Workshop", magetower: "Mage Tower", temple: "Temple" };

const City = {
  MAX_LOTS: 40,
  lots(s) { return Math.min(this.MAX_LOTS, 10 + 2 * s.buildings.townhall); },
  lotUnlockTH(i) { return Math.max(1, Math.ceil((i + 1 - 10) / 2)); },
  builders(s) { return 1 + Math.floor(s.buildings.townhall / 3) + Legacy.lvl(s, "builders"); },
  busy(s) { return s.city.slots.filter((x) => x && x.build).length; },
  isMulti(type) { return MULTI_BUILDINGS.includes(type); },
  instCap(s, type) { return this.isMulti(type) ? 5 + s.buildings.townhall : Economy.buildingMax(s, type); },
  /** Total level of a building type (including levels under construction when pending = true). */
  total(s, type, pending = true) {
    let t = 0;
    for (const sl of s.city.slots) if (sl && sl.type === type) t += pending && sl.build ? sl.build.to : sl.level;
    return t;
  },
  instances(s, type) { return s.city.slots.map((sl, i) => (sl && sl.type === type ? i : -1)).filter((i) => i >= 0); },

  /** Lay out an existing set of building levels onto lots (new games and old saves). */
  fromCounts(b) {
    const th = Math.max(1, b.townhall || 1), cap = 5 + th;
    const slots = [{ type: "townhall", level: th }];
    for (const id of Object.keys(BUILDINGS)) {
      if (id === "townhall") continue;
      let n = b[id] || 0;
      if (!n) continue;
      if (!this.isMulti(id)) { slots.push({ type: id, level: n }); continue; }
      while (n > 0) { const l = Math.min(cap, n); slots.push({ type: id, level: l }); n -= l; }
    }
    while (slots.length < this.MAX_LOTS) slots.push(null);
    return { slots };
  },
  /** Recompute the per-type totals the economy uses. */
  sync(s) {
    for (const id of Object.keys(BUILDINGS)) s.buildings[id] = 0;
    for (const sl of s.city.slots) if (sl && BUILDINGS[sl.type]) s.buildings[sl.type] += sl.level;
    s.buildings.townhall = Math.max(1, s.buildings.townhall);
    // fewer job slots after a demolition: send the extra workers home
    for (const j of Object.keys(JOBS)) s.jobs[j] = Math.min(s.jobs[j] || 0, Economy.jobSlots(s, j));
  },
  buildTime(s, type, to) {
    const base = type === "townhall" ? 30 : this.isMulti(type) ? 6 : 12;
    return Math.round(Math.min(3600, base * Math.pow(1.32, to - 1)) / (1 + 0.12 * Legacy.lvl(s, "masons")));
  },
  /** Where the next level of `type` goes: an instance below its cap, else the first free unlocked lot. */
  target(s, type) {
    const cap = this.instCap(s, type);
    const inst = this.instances(s, type).filter((i) => !s.city.slots[i].build && s.city.slots[i].level < cap)
      .sort((a, b) => s.city.slots[a].level - s.city.slots[b].level);
    if (inst.length) return inst[0];
    if (!this.isMulti(type) && this.instances(s, type).length) return null;
    const free = s.city.slots.findIndex((sl, i) => i > 0 && i < this.lots(s) && !sl);
    return free >= 0 ? free : null;
  },
  /** Why the next level of `type` can't start (null if it can). idx = a specific lot. */
  blocker(s, type, idx) {
    const def = BUILDINGS[type], total = this.total(s, type);
    if (total >= Economy.buildingMax(s, type)) return type === "townhall" ? "Max level reached" : `Upgrade the Town Hall to raise the limit (${Economy.buildingMax(s, type)})`;
    if (idx !== undefined) {
      const sl = s.city.slots[idx];
      if (idx >= this.lots(s)) return `Lot unlocks at Town Hall level ${this.lotUnlockTH(idx)}`;
      if (sl && sl.build) return "Under construction";
      if (sl && sl.type !== type) return "Lot is taken";
      if (sl && sl.level >= this.instCap(s, type)) return `This ${def.name} is at its level cap (${this.instCap(s, type)}). Build another on an empty lot`;
      if (!sl && !this.isMulti(type) && this.instances(s, type).length) return `You can only have one ${def.name}`;
    } else if (this.target(s, type) === null) {
      return this.instances(s, type).some((i) => s.city.slots[i].build) && !this.isMulti(type) ? "Under construction" : "No free building lot. Upgrade the Town Hall for more lots";
    }
    if (def.popReq) { const need = def.popReq(total); if (Economy.totalPop(s) < need) return `Requires ${need} population`; }
    if (this.busy(s) >= this.builders(s)) return `All builders are busy (${this.builders(s)}/${this.builders(s)})`;
    const cost = Economy.buildingCost(type, total);
    const over = Economy.overCap(s, cost);
    if (over) return `${RESOURCES[over].name} storage too small (${fmt(Economy.caps(s)[over])}). Build ${over === "food" ? "Granaries" : "Warehouses"}`;
    if (!Economy.canAfford(s, cost)) return "Not enough resources";
    return null;
  },
  /** Start building or upgrading on a lot. */
  start(s, type, idx = this.target(s, type)) {
    if (idx === null || idx === undefined || this.blocker(s, type, idx)) return false;
    const cost = Economy.buildingCost(type, this.total(s, type));
    Economy.pay(s, cost);
    const sl = s.city.slots[idx] || (s.city.slots[idx] = { type, level: 0 });
    const t = this.buildTime(s, type, sl.level + 1);
    sl.build = { to: sl.level + 1, remaining: t, total: t };
    if (typeof Sound !== "undefined" && !Engine.simulating) Sound.play("build");
    addLog(s, `🔨 Builders start ${sl.level ? `upgrading the ${BUILDINGS[type].name} to level ${sl.level + 1}` : `a new ${BUILDINGS[type].name}`} (${fmtTime(t)}).`, "build");
    return true;
  },
  demolish(s, idx) {
    const sl = s.city.slots[idx];
    if (!sl || idx === 0 || !this.isMulti(sl.type)) return false;
    s.city.slots[idx] = null;
    this.sync(s);
    addLog(s, `🪓 The ${BUILDINGS[sl.type].name} was torn down. The lot is free again.`, "build");
    return true;
  },
  step(s, dt) {
    let changed = false;
    for (const sl of s.city.slots) {
      if (!sl || !sl.build) continue;
      sl.build.remaining -= dt;
      if (sl.build.remaining <= 0) {
        sl.level = sl.build.to; delete sl.build; changed = true;
        s.stats.built++;
        if (typeof Sound !== "undefined" && !Engine.simulating) Sound.play("built");
        addLog(s, sl.type === "townhall" ? `🏰 The Town Hall has been raised to level ${sl.level}! New building lots are open.` : `✅ ${BUILDINGS[sl.type].name} ${sl.level === 1 ? "built" : `upgraded to level ${sl.level}`}.`, "build");
      }
    }
    if (changed) this.sync(s);
  },
  /** Lot positions on the city scene: the Town Hall in the middle, three rings of lots around it. */
  layout(i) {
    if (i === 0) return [50, 52];
    const rings = [[8, 17, 21], [13, 32, 38], [18, 47, 50]];
    let k = i - 1;
    for (const [n, rx, ry] of rings) {
      if (k < n) { const a = -Math.PI / 2 + (k / n) * Math.PI * 2 + (n === 13 ? 0.24 : 0); return [50 + rx * Math.cos(a), 52 + ry * Math.sin(a) * 0.86]; }
      k -= n;
    }
    return [50, 50];
  },
};

/* =====================================================================
   7a-2. CITY MAP: an isometric town ground with roads and building plots
   ---------------------------------------------------------------------
   A 13×10 tile grid: cobblestone roads every third row/column split the
   ground into 2×2 blocks of plots. The Town Hall stands on the central
   block; the 39 building lots are the plots around it, nearest first, so
   the city grows outward as the Town Hall unlocks more. Leftover plots
   become gardens (a well, haystacks, trees).
   The ground is a CSS-rotated grid (rotateX 60° · rotateZ 45°); buildings
   are upright sprites on a flat layer, placed with the same projection.
   ===================================================================== */
const CityMap = {
  cols: 13, rows: 10, cell: 64, margin: 1,
  init() {
    if (this.lots) return;
    const cells = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (this.isRoad(r, c) || this.isPlaza(r, c)) continue;
      const d = Math.hypot(r + 0.5 - 5, c + 0.5 - 5), a = Math.atan2(r + 0.5 - 5, c + 0.5 - 5);
      cells.push({ r, c, d, a });
    }
    cells.sort((x, y) => x.d - y.d || x.a - y.a);
    this.lots = [{ r: 4, c: 4, th: true }, ...cells.slice(0, City.MAX_LOTS - 1)];
    this.gardens = cells.slice(City.MAX_LOTS - 1);
    const W = (this.cols + 2 * this.margin) * this.cell, H = (this.rows + 2 * this.margin) * this.cell;
    this.gw = W; this.gh = H;
    this.head = this.cell * 2.6;                        // room above the ground for tall buildings
    this.bw = (W + H) / Math.SQRT2;
    this.bh = (W + H) / (2 * Math.SQRT2) + this.head;
    this.gcx = this.bw / 2; this.gcy = this.head + (this.bh - this.head) / 2;
  },
  isRoad(r, c) { return r % 3 === 0 || c % 3 === 0; },
  isPlaza(r, c) { return r >= 4 && r <= 5 && c >= 4 && c <= 5; },
  /** Screen position (inside the map box) of a point given in tile units (col, row), measured inside the play area. */
  project(col, row) {
    const x = (col + this.margin) * this.cell - this.gw / 2, y = (row + this.margin) * this.cell - this.gh / 2;
    return [this.gcx + (x - y) / Math.SQRT2, this.gcy + (x + y) / (2 * Math.SQRT2)];
  },
  center(i) { const L = this.lots[i]; return L.th ? this.project(5, 5) : this.project(L.c + 0.5, L.r + 0.5); },
  depth(i) { const L = this.lots[i]; return L.th ? 10 : L.r + L.c + 1; },
};

const CityView = {
  zoom: 1, panX: 0, panY: 0, built: false,
  sprite(key) { return AssetPipeline.hasArt(key) ? AssetPipeline.src(key) : null; },
  // absolute URL: CSS variables resolve relative paths against the stylesheet, not the page
  tex(key) { return AssetPipeline.hasArt(key) ? `url('${new URL(AssetPipeline.src(key), document.baseURI).href}')` : ""; },
  /** Build the ground (once) and the controls. */
  buildGround() {
    CityMap.init();
    const host = $("#cityPlots"), M = CityMap, c = M.cell;
    let g = "";
    for (let r = -M.margin; r < M.rows + M.margin; r++) for (let col = -M.margin; col < M.cols + M.margin; col++) {
      const inside = r >= 0 && col >= 0 && r < M.rows && col < M.cols;
      let cls = "gc";
      if (!inside) cls += " g-edge";
      else if (M.isPlaza(r, col)) cls += " g-plaza";
      else if (M.isRoad(r, col)) cls += " g-road";
      else cls += " g-plot";
      const li = inside ? M.lots.findIndex((L) => !L.th && L.r === r && L.c === col) : -1;
      g += `<div class="${cls}" ${li > 0 ? `id="gc-${li}" data-action="lot" data-i="${li}"` : ""} style="left:${(col + M.margin) * c}px;top:${(r + M.margin) * c}px"></div>`;
    }
    host.innerHTML = `<div class="citymap" id="cityMap" style="width:${M.bw}px;height:${M.bh}px">
        <div class="ground" style="left:${M.gcx - M.gw / 2}px;top:${M.gcy - M.gh / 2}px;width:${M.gw}px;height:${M.gh}px;--cell:${c}px">${g}</div>
        <div class="sprites" id="citySprites"></div>
      </div>
      <div class="map-ctrl"><button data-action="mapZoom" data-d="1.15" title="Zoom in">＋</button><button data-action="mapZoom" data-d="0.87" title="Zoom out">－</button><button data-action="mapZoom" data-d="0" title="Reset view">⟲</button></div>`;
    this.applyTextures();
    this.bindPan();
    this.built = true;
    this.fit();
  },
  applyTextures() {
    const grass = this.tex("t_plains"), road = this.tex("t_cobble"), plot = this.tex("t_dirtplot");
    const root = document.documentElement.style;
    root.setProperty("--tex-grass", grass || "none");
    root.setProperty("--tex-road", road || "none");
    root.setProperty("--tex-plot", plot || "none");
  },
  /** The part of the screen not covered by the HUD (resource bar, quest tracker, action bar). */
  safeArea() {
    const host = $("#cityPlots").getBoundingClientRect();
    const vis = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden";
    const hud = $(".hud-top"), bar = $("#actionBar"), tr = $("#tracker");
    let top = host.top, bottom = host.bottom, left = host.left, right = host.right;
    if (vis(hud)) top = Math.max(top, hud.getBoundingClientRect().bottom + 6);
    if (vis(bar)) bottom = Math.min(bottom, bar.getBoundingClientRect().top - 6);
    const chat = $("#chat");
    if (window.innerWidth < 820 && vis(chat)) bottom = Math.min(bottom, chat.getBoundingClientRect().top - 4);
    if (vis(tr) && tr.textContent.trim()) right = Math.min(right, tr.getBoundingClientRect().left - 8);
    if (right - left < 300) right = host.right;
    return { left, top, w: Math.max(200, right - left), h: Math.max(160, bottom - top), host };
  },
  /** Bounding box (map units) of the unlocked part of the town, with a margin and headroom for tall buildings. */
  focusBox() {
    const M = CityMap, s = GameState.current, n = s ? City.lots(s) : M.lots.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (c, r) => { const [x, y] = M.project(c, r); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (let i = 0; i < Math.min(n, M.lots.length); i++) {
      const L = M.lots[i];
      const r0 = L.th ? 4 : L.r, c0 = L.th ? 4 : L.c, sz = L.th ? 2 : 1;
      // the plot's corners, one tile of breathing room around it
      add(c0 - 1, r0 - 1); add(c0 + sz + 1, r0 - 1); add(c0 - 1, r0 + sz + 1); add(c0 + sz + 1, r0 + sz + 1);
    }
    y0 -= M.cell * 1.4;                        // tall buildings stick up above their plots
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  },
  fit() {
    const host = $("#cityPlots"), map = $("#cityMap");
    if (!host || !map) return;
    const a = this.safeArea(), f = this.focusBox();
    // phones: fill the height and let the sides be panned to; desktop: show the whole unlocked town
    const fitW = a.w / f.w, fitH = a.h / f.h;
    const k = (window.innerWidth < 820 ? Math.min(fitH, fitW * 1.5, 1.9) : Math.min(fitW, fitH, 1.9)) * this.zoom;
    this.k = k;
    // put the centre of the unlocked town at the centre of the free area
    map.style.left = (a.left - a.host.left + a.w / 2) + "px";
    map.style.top = (a.top - a.host.top + a.h / 2) + "px";
    const ox = -(f.cx - CityMap.bw / 2) * k, oy = -(f.cy - CityMap.bh / 2) * k;
    map.style.transform = `translate(-50%, -50%) translate(${ox + this.panX}px, ${oy + this.panY}px) scale(${k})`;
  },
  bindPan() {
    if (this._bound) return;
    this._bound = true;
    const host = $("#cityPlots");
    let drag = null;
    host.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, px: this.panX, py: this.panY, moved: false }; });
    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (drag.moved) { this.panX = drag.px + dx; this.panY = drag.py + dy; this.fit(); host.classList.add("dragging"); }
    });
    window.addEventListener("pointerup", () => { if (drag && drag.moved) { this.justDragged = true; setTimeout(() => (this.justDragged = false), 60); } drag = null; host.classList.remove("dragging"); });
    host.addEventListener("click", (e) => { if (this.justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
    host.addEventListener("wheel", (e) => { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1.1 : 0.91); }, { passive: false });
    window.addEventListener("resize", () => this.fit());
    // the HUD can change height (resource bar wrapping, alerts); re-fit when it does
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => this.fit()); for (const el of [$(".hud-top"), $("#tracker"), $("#actionBar")]) if (el) ro.observe(el); }
  },
  zoomBy(f) {
    if (!f) { this.zoom = 1; this.panX = 0; this.panY = 0; }
    else this.zoom = clamp(this.zoom * f, 0.35, 2.6);
    this.fit();
  },

  /** Draw the buildings, markers and decorations; then live-update timers and badges. */
  update(s) {
    if (!this.built || !$("#cityMap")) this.buildGround();
    const M = CityMap, lots = City.lots(s);
    const sig = lots + "|" + s.city.slots.map((sl) => (sl ? sl.type + sl.level + (sl.build ? "b" + sl.build.to : "") : "-")).join(",") + "|" + Object.keys(AssetPipeline.staticManifest).length + AssetPipeline.memory.size;
    if (sig !== this.sig) {
      this.sig = sig;
      this.applyTextures();
      let h = "";
      // gardens and trees
      // a plot is a diamond dw wide and dh tall on screen; sprites stand on its bottom corner
      const dw = M.cell * Math.SQRT2, dh = dw / 2;
      const deco = ["s_well", "s_hay", "s_tree1", "s_tree2", "s_tree1"];
      M.gardens.forEach((L, k) => {
        const [x, y] = M.project(L.c + 0.5, L.r + 0.5), src = this.sprite(deco[k % deco.length]);
        if (src) h += `<img class="deco" src="${src}" alt="" style="left:${x}px;top:${y + dh * 0.42}px;z-index:${L.r + L.c + 20};--w:${dw * 0.9}px">`;
      });
      for (let r = -1; r <= M.rows; r++) for (let c = -1; c <= M.cols; c++) {
        if (r >= 0 && c >= 0 && r < M.rows && c < M.cols) continue;
        if ((r * 7 + c * 13) % 3) continue;
        const [x, y] = M.project(c + 0.5, r + 0.5), src = this.sprite((r + c) % 2 ? "s_tree1" : "s_tree2");
        if (src) h += `<img class="deco" src="${src}" alt="" style="left:${x}px;top:${y + dh * 0.3}px;z-index:${r + c + 20};--w:${dw * 0.95}px">`;
      }
      s.city.slots.forEach((sl, i) => {
        if (i >= M.lots.length) return;
        const [x, y] = M.center(i), z = M.depth(i) + 20;
        const g = $("#gc-" + i);
        if (g) g.classList.toggle("g-locked", i >= lots);
        if (i >= lots) { h += `<div class="lotmark locked" style="left:${x}px;top:${y}px;z-index:${z}" title="Unlocks at Town Hall level ${City.lotUnlockTH(i)}">🔒</div>`; return; }
        if (!sl) { h += `<div class="lotmark empty" id="lot-${i}" data-action="lot" data-i="${i}" style="left:${x}px;top:${y}px;z-index:${z}" title="Empty plot: click to build">＋</div>`; return; }
        const B = BUILDINGS[sl.type], src = this.sprite("s_" + sl.type);
        const w = i === 0 ? dw * 1.95 : dw * 1.0;          // the sprite's base spans the plot (the Town Hall spans 2×2)
        const foot = i === 0 ? dh : dh / 2;                // distance from plot centre to its bottom corner
        const under = sl.build && sl.level === 0;
        const scaff = this.sprite("s_scaffold");
        h += `<div class="spr ${src ? "" : "badge"} ${under ? "new-build" : ""} ${i === 0 ? "th" : ""}" id="lot-${i}" data-action="lot" data-i="${i}" style="left:${x}px;top:${y + foot * 0.92}px;z-index:${z};--w:${w}px">
          ${under && scaff ? `<img class="body" src="${scaff}" alt="">` : src ? `<img class="body" src="${src}" alt="">` : `<div class="pimg"><img src="${AssetPipeline.src(B.asset)}" alt=""></div>`}
          ${sl.build && !under && scaff ? `<img class="scaf-over" src="${scaff}" alt="">` : ""}
          ${sl.build ? `<div class="cbar"><i data-ring="${i}"></i><b data-bt="${i}"></b></div>` : ""}
          <span class="plvl">${sl.level}</span><span class="pup hidden" data-up="${i}">▲</span>
          ${JOB_OF[sl.type] ? `<span class="pwork" data-work="${i}"></span>` : ""}
          <div class="pname">${B.name}</div><div class="hit" data-action="lot" data-i="${i}"></div></div>`;
      });
      $("#citySprites").innerHTML = h;
      if (this.lastLots !== lots) { this.lastLots = lots; this.fit(); }
    }
    // live parts
    const busyAll = City.busy(s) >= City.builders(s);
    s.city.slots.forEach((sl, i) => {
      if (!sl || i >= lots) return;
      if (sl.build) {
        const r = $(`[data-ring="${i}"]`); if (r) r.style.width = ((1 - sl.build.remaining / sl.build.total) * 100).toFixed(1) + "%";
        const t = $(`[data-bt="${i}"]`); if (t) t.textContent = fmtTime(sl.build.remaining);
      }
      const up = $(`[data-up="${i}"]`);
      if (up) up.classList.toggle("hidden", busyAll || !!City.blocker(s, sl.type, i));
      const wk = $(`[data-work="${i}"]`);
      if (wk) { const j = JOB_OF[sl.type]; wk.textContent = `👷 ${s.jobs[j]}/${Economy.jobSlots(s, j)}`; }
    });
    $$("#citySprites .spr").forEach((el) => el.classList.toggle("active", HUD.open === "building" && +el.dataset.i === HUD.lot));
  },
};

const JOB_OF = Object.fromEntries(Object.entries(JOBS).map(([j, d]) => [d.building, j]));
// (legacy fixed layout, no longer used)
const CITY_LAYOUT = {
  academy: [6, 10], magetower: [28, 10], ranch: [50, 10], workshop: [72, 10], stables: [94, 10],
  temple: [8, 37], townhall: [50, 36, true], barracks: [92, 37],
  lumbercamp: [6, 64], house: [28, 64], steelworks: [50, 66], market: [72, 64], walls: [94, 64],
  farm: [6, 91], granary: [28, 91], brewery: [50, 92], warehouse: [72, 91], quarry: [94, 91],
};
const HUD_ACTIONS = [
  { id: "kingdom",  icon: "🏰", lbl: "Kingdom",  key: "1" },
  { id: "citizens", icon: "👥", lbl: "Citizens", key: "2" },
  { id: "research", icon: "📜", lbl: "Research", key: "3" },
  { id: "army",     icon: "⚔️", lbl: "Army",     key: "4" },
  { id: "campaign", icon: "📖", lbl: "Campaign", key: "5" },
  { id: "quests",   icon: "❗", lbl: "Quests",   key: "6" },
  { id: "world",    icon: "🗺️", lbl: "World",    key: "7" },
  { id: "realm",    icon: "⚖️", lbl: "Realm",    key: "8" },
  { id: "settings", icon: "⚙️", lbl: "Settings", key: "9" },
  { id: "armory",   icon: "🎒", lbl: "Armory",   key: "0" },
  { id: "fame",     icon: "🏆", lbl: "Fame",     key: "-" },
];
const QUEST_MARK = { available: "!", ready: "?", marching: "⚔", complete: "✓", locked: "🔒" };

const HUD = {
  open: null,
  building: null,
  qsel: null,
  sig: {},

  build() {
    // window frames: title bar + scrolling body
    for (const w of $$(".win")) {
      if (w.querySelector(".win-title")) continue;
      const body = document.createElement("div");
      body.className = "win-body";
      while (w.firstChild) body.appendChild(w.firstChild);
      w.innerHTML = `<div class="win-title"><span class="wt">${w.dataset.title}</span><button class="win-x" data-action="closeWin" title="Close (Esc)">✕</button></div>`;
      w.appendChild(body);
    }
    if (window.innerWidth < 820) $("#chat").classList.add("min");
    $("#actionBar").innerHTML = HUD_ACTIONS.map((a) => `<button class="slot" data-action="win" data-win="${a.id}" id="slot-${a.id}" title="${a.lbl} (${a.key})"><span class="key">${a.key}</span>${a.icon}<span class="lbl">${a.lbl}</span></button>`).join("");
    this.sig = {};
    this.form = this.form || {};
  },

  openWin(id) {
    if (id === "world") { this.closeWin(); WorldUI.show(); return; }
    if (this.open === id && id !== "building") { this.closeWin(); return; }
    for (const w of $$(".win")) w.classList.add("hidden");
    const w = $("#win-" + id);
    if (!w) return;
    w.classList.remove("hidden");
    this.open = id;
    $$(".slot").forEach((s) => s.classList.toggle("active", s.dataset.win === id));
    if (id === "campaign" && !this.qsel) this.qsel = Campaign.current(GameState.current) || CAMPAIGN_ORDER[0];
    this.sig = {};
    UI.update();
  },
  closeWin() {
    for (const w of $$(".win")) w.classList.add("hidden");
    this.open = null; this.building = null; this.lot = null;
    $$(".slot").forEach((s) => s.classList.remove("active"));
    $$(".plot").forEach((p) => p.classList.remove("active"));
  },

  update(s) {
    // ---- the city
    this.updateCity(s);
    Daily.ensure(s);
    Advisor.update(s);
    if (typeof WorldUI !== "undefined" && WorldUI.open) WorldMovers.render(s);
    for (const l of s.letters || []) for (const el of $$(`[data-letter-t="${l.id}"]`)) el.textContent = `${fmtTime(Math.max(0, l.expires - s.time))} to answer`;
    if (this.open === "quests") { const sig = JSON.stringify(s.daily) + Daily.claimable(s) + Object.values(DAILY_POOL).map((p) => p.stat(s)).join(); if (sig !== this.sig.daily) { this.sig.daily = sig; $("#dailyBox").innerHTML = Daily.html(s); } }
    // ---- notification dots on the action bar
    const dots = {
      kingdom: Object.keys(BUILDINGS).filter((id) => !Economy.buildBlocker(s, id)).length,
      campaign: CAMPAIGN_ORDER.filter((id) => ["ready"].includes(Campaign.state(s, id))).length,
      quests: Quests.ready(s) + Daily.claimable(s),
      citizens: Economy.unemployed(s) > 0 ? 1 : 0,
      fame: Legacy.canAscend(s) && Legacy.data(s).ascensions === 0 ? 1 : 0,
      realm: (s.offer ? 1 : 0) + (s.letters || []).filter((l) => !l.read).length,
      armory: s.gear.bag.filter((x) => !s.gear.equipped[x.slot] || Armory.score(x) > Armory.score(s.gear.equipped[x.slot])).length,
      army: s.raid ? 1 : 0,
    };
    for (const a of HUD_ACTIONS) {
      const slot = $("#slot-" + a.id);
      let dot = slot.querySelector(".note-dot");
      const n = dots[a.id] || 0;
      if (n && !dot) { dot = document.createElement("span"); dot.className = "note-dot"; slot.appendChild(dot); }
      if (dot) { if (n) dot.textContent = a.id === "citizens" || a.id === "army" || a.id === "realm" ? "!" : n; else dot.remove(); }
    }
    this.renderTracker(s);
    if (this.open === "army") this.renderCaptains(s);
    if (this.open === "realm") this.renderRivals(s);
    if (this.open === "building" && this.lot !== undefined && this.lot !== null) this.renderBuilding(s);
    if (this.open === "campaign") this.renderCampaign(s);
    if (this.open === "armory") this.renderArmory(s);
    if (this.open === "fame") { const sig = JSON.stringify(s.achievements) + JSON.stringify(s.legacy) + Legacy.crownsFor(s); if (sig !== this.sig.fame) { this.sig.fame = sig; $("#fameBody").innerHTML = Legacy.html(s); } }
    const nm = $("#ufName"); if (nm) { const full = Legacy.fullName(s); if (nm.textContent !== full) nm.textContent = full; }
  },

  renderCaptains(s) {
    const sig = JSON.stringify(s.captains) + Captains.slots(s) + Math.floor(s.resources.gold / 500) + s.resources.relics + JSON.stringify(s.buildings);
    if (sig === this.sig.captains) return;
    this.sig.captains = sig;
    $("#capSlots").textContent = `(${Captains.assigned(s).length}/${Captains.slots(s)} leading · more slots at Town Hall 4, 8 and 12)`;
    $("#captainList").innerHTML = Object.entries(CAPTAINS).map(([id, C]) => {
      const c = s.captains[id], hired = c && c.hired, lvl = hired ? c.level : 1, blk = hired ? null : Captains.hireBlocker(s, id);
      const perks = Object.entries(C.perks).map(([L, p]) => `<span class="perk ${hired && lvl >= +L ? "on" : ""}" title="Unlocks at level ${L}">Lv ${L}: ${p.txt}</span>`).join("");
      const need = Captains.xpNeed(lvl);
      return `<div class="capcard ${hired ? "hired" : ""} ${hired && c.assigned ? "leading" : ""}">
        <img src="${AssetPipeline.src(C.asset)}" alt="">
        <div class="cc-body"><div class="cc-h"><b>${C.name}</b>${hired ? `<span class="badge">Lv ${lvl}${lvl >= CAPTAIN_MAX ? " (max)" : ""}</span>` : ""}</div>
          <div class="dim" style="font-size:11.5px">Leads <b style="color:var(--text)">${C.troops}</b> · ${esc(C.bio)}</div>
          <div class="good" style="font-size:12px;margin:3px 0">${Captains.describe(id, lvl)}</div>
          <div class="perks">${perks}</div>
          ${hired ? `${lvl < CAPTAIN_MAX ? `<div class="bar war" style="margin:5px 0 2px" title="Earns XP from enemies their troops kill"><i style="width:${(c.xp / need) * 100}%"></i></div><div class="dim" style="font-size:11px">XP ${fmtInt(c.xp)} / ${fmtInt(need)}</div>` : ""}
            <button class="btn sm ${c.assigned ? "" : "primary"}" data-action="capToggle" data-id="${id}" ${!c.assigned && Captains.assigned(s).length >= Captains.slots(s) ? "disabled" : ""}>${c.assigned ? "🎖 Leading · stand down" : "Assign to lead"}</button>`
          : `<button class="btn sm primary" data-action="capHire" data-id="${id}" ${blk ? "disabled" : ""} title="${esc(blk || "")}">Hire: ${fmt(Captains.hireCost(s).gold)} Gold + ${Captains.hireCost(s).relics} Relic${Captains.hireCost(s).relics > 1 ? "s" : ""}</button>${blk && !blk.startsWith("Costs") ? `<div class="req">${esc(blk)}</div>` : ""}`}
        </div></div>`;
    }).join("");
  },
  renderRivals(s) {
    const sig = JSON.stringify(Object.values(s.rivals).map((r) => [Math.round(r.power), r.defeats, r.vassal, Math.round(r.nextAttack - s.time) > 0])) + Math.floor(s.resources.gold / 200);
    if (sig !== this.sig.rivals) {
      this.sig.rivals = sig;
      $("#rivalList").innerHTML = Object.entries(RIVAL_LORDS).map(([id, L]) => {
        const r = s.rivals[id], bc = Rivals.bribeCost(s, id);
        return `<div class="rivalcard" style="--rc:${L.color}"><div class="rv-ban">🏰</div><div style="flex:1">
          <div class="cc-h"><b>${L.name}</b>${r.vassal ? `<span class="badge teal">👑 Vassal</span>` : `<span class="badge war">Power ⚔ ${fmt(r.power)}</span>`}</div>
          <div class="dim" style="font-size:11.5px">${L.lord} · ${TACTICS[L.tactic].icon} ${TACTICS[L.tactic].name} · defeats ${r.defeats}/3${r.stolen ? ` · stole ${fmt(r.stolen)} from you` : ""}</div>
          <div style="font-size:12px;margin-top:3px">Treasury: ${["gold", "food", "stone", "steel"].map((k) => `<img class="inl" src="${AssetPipeline.src(RESOURCES[k].asset)}" alt=""> ${fmt(r.treasury[k])}`).join(" · ")}</div>
          ${r.vassal ? `<div class="good" style="font-size:12px">Pays you ${(5 + Threat.level(s) * 2 + r.power * 0.01).toFixed(1)} Gold, ${(3 + Threat.level(s)).toFixed(1)} Food and ${(0.5 + Threat.level(s) * 0.15).toFixed(2)} Steel per second.</div>`
            : `<div style="font-size:12px" data-rival-t="${id}"></div>
              <div class="btn-row" style="margin-top:5px"><button class="btn sm" data-action="rivalBribe" data-id="${id}" ${s.resources.gold < bc ? "disabled" : ""}>💰 Bribe for peace (${fmt(bc)} Gold)</button><button class="btn sm primary" data-action="rivalAttack" data-id="${id}">⚔ Storm their castle</button></div>`}
        </div></div>`;
      }).join("");
    }
    for (const [id, r] of Object.entries(s.rivals)) { const t = $(`[data-rival-t="${id}"]`); if (t) t.textContent = s.raid && s.raid.rival === id ? "⚠ Their army is marching on you!" : `Next attack expected in about ${fmtTime(Math.max(0, r.nextAttack - s.time))}`; }
  },
  renderTracker(s) {
    const cur = Campaign.current(s);
    const open = Quests.open(s, 3);
    const sig = (s.letters || []).map((l) => l.id + (l.read ? "r" : "")).join() + (cur ? cur + Campaign.state(s, cur) + !!s.campaign.led[cur] : "") + "|" + open.map((q) => q.id + q.check(s)).join() + "|" + s.expeditions.map((e) => e.id).join() + "|" + s.climate.season + Threat.level(s);
    if (sig !== this.sig.tracker) {
      this.sig.tracker = sig;
      let h = Diplomacy.inboxHtml(s) + `<div class="tr-sec climate"><div class="tr-h"><span>${Climate.season(s).icon} ${Climate.season(s).name}</span><span data-season-t="1"></span></div>
        <div class="tr-obj" style="padding-left:0" title="${esc(Climate.season(s).desc)}">${esc(Climate.season(s).desc)}</div>
        <div class="tr-obj" style="padding-left:0;color:#ff9a8a" title="Enemies grow stronger as your realm rises: +${Math.round((Threat.atk(s) - 1) * 100)}% attack, +${Math.round((Threat.def(s) - 1) * 100)}% defense">☠ World threat: <b>${Threat.tier(s)}</b> (Lv ${Threat.level(s)})</div></div>`;
      if (cur) {
        const c = CAMPAIGN[cur], st = Campaign.state(s, cur);
        h += `<div class="tr-sec"><div class="tr-h"><span>📖 Campaign</span><span>${CHAPTERS[c.chapter].split(" · ")[0]}</span></div>
          <div class="tr-q" data-action="questOpen" data-id="${cur}"><div class="tr-title"><span class="mk">${QUEST_MARK[st]}</span>${esc(c.title)}</div>
          <div class="tr-obj ${s.campaign.done[cur] ? "done" : ""}">${s.campaign.done[cur] ? "✓" : "–"} ${esc(c.objective)}</div>
          <div class="tr-obj ${s.campaign.led[cur] ? "done" : ""}">${s.campaign.led[cur] ? "✓" : "–"} <span class="dim">Bonus: win it leading in person</span></div>
          ${st === "ready" ? `<div class="tr-obj done">➜ Return to ${esc(c.giver)}</div>` : st === "locked" ? `<div class="tr-obj"><span class="dim">Requires Commander Lv ${MISSIONS[cur].level}</span></div>` : ""}</div></div>`;
      }
      if (open.length) {
        h += `<div class="tr-sec"><div class="tr-h"><span>❗ Realm Quests</span><span>${s.quests.length}/${QUESTS.length}</span></div>` +
          open.map((q) => `<div class="tr-q" data-action="win" data-win="quests"><div class="tr-obj ${q.check(s) ? "done" : ""}" style="padding-left:0">${q.check(s) ? "✓" : "▫"} ${esc(q.text)}${q.check(s) ? " <b>(claim!)</b>" : ""}</div></div>`).join("") + `</div>`;
      }
      if (s.expeditions.length) {
        h += `<div class="tr-sec"><div class="tr-h"><span>⚔ Armies in the Field</span></div>` +
          s.expeditions.map((e) => `<div class="tr-q" data-action="win" data-win="army"><div class="tr-obj" style="padding-left:0">${esc(Military.mission(s, e.mission)?.name || "Expedition")} <span class="dim" data-trt="${e.id}"></span></div></div>`).join("") + `</div>`;
      }
      $("#tracker").innerHTML = h;
    }
    for (const e of s.expeditions) { const t = $(`[data-trt="${e.id}"]`); if (t) t.textContent = "· " + fmtTime(e.endAt - s.time); }
    const st = $('[data-season-t="1"]'); if (st) st.textContent = fmtTime(Climate.left(s)) + " left";
  },

  /* ===================== the city scene ===================== */
  updateCity(s) {
    const lots = City.lots(s);
    CityView.update(s);
    Life.render(s);
    // floating production numbers every few seconds
    if (!this.lastPop || s.time - this.lastPop >= 5 || s.time < this.lastPop) {
      this.lastPop = s.time;
      const r = Economy.rates(s);
      s.city.slots.forEach((sl, i) => {
        if (!sl || !sl.level || i >= lots) return;
        const res = PRODUCES[sl.type];
        if (!res) return;
        let amt = r.prod[res] * 5 * (sl.level / Math.max(1, s.buildings[sl.type]));
        if (sl.type === "market" || sl.type === "townhall") amt = (sl.type === "market" ? 3 * sl.level : sl.level) * 5 * Economy.multiplier(s);
        if (amt < 0.5) return;
        const el = $("#lot-" + i);
        if (!el || !el.classList.contains("spr")) return;
        const pop = document.createElement("div");
        pop.className = "prodpop";
        pop.innerHTML = `+${amt < 10 ? amt.toFixed(1) : fmt(amt)} <img src="${AssetPipeline.src(RESOURCES[res].asset)}" alt="">`;
        el.appendChild(pop);
        setTimeout(() => pop.remove(), 2400);
      });
    }
  },

  /* ===================== building forms ===================== */
  openLot(i) {
    const s = GameState.current, sl = s.city.slots[i];
    this.lot = i; this.form = this.form || {};
    $("#win-building .wt").textContent = sl ? BUILDINGS[sl.type].name : "Empty Lot";
    this.sig.building = "";
    this.openWin("building");
  },
  openBuilding(type) {
    const s = GameState.current;
    const i = City.instances(s, type)[0];
    if (i !== undefined) this.openLot(i);
    else { const t = City.target(s, type); if (t !== null) { this.lot = t; this.form = this.form || {}; this.form.pick = type; this.sig.building = ""; $("#win-building .wt").textContent = "Empty Lot"; this.openWin("building"); } }
  },
  seatsHtml(s, job) {
    const J = JOBS[job], slots = Economy.jobSlots(s, job), n = s.jobs[job];
    if (!slots) return `<div class="dim">No ${J.name.toLowerCase()} jobs yet.</div>`;
    const per = Math.max(1, Math.ceil(slots / 30)), seats = Math.ceil(slots / per), filled = Math.ceil(n / per);
    let h = `<div class="seats">`;
    for (let k = 0; k < seats; k++) h += k < filled
      ? `<button class="seat on" data-action="seat" data-job="${job}" data-d="-${per}" title="Send ${per} home"><img src="${AssetPipeline.src(J.asset)}" alt=""></button>`
      : `<button class="seat" data-action="seat" data-job="${job}" data-d="${per}" title="Put ${per} to work">＋</button>`;
    h += `</div>`;
    return `<div class="form-sec"><div class="fs-h"><span>👷 ${J.name}</span><b>${n} / ${slots}</b></div>
      ${h}<div class="dim" style="font-size:11.5px;margin:4px 0 6px">${J.desc}${per > 1 ? ` · each figure = ${per} workers` : ""} · Click a figure to send workers home, or an empty seat to hire. ${fmtInt(Economy.unemployed(s))} citizens are idle.</div>
      <div class="btn-row"><button class="btn sm" data-action="assign" data-id="${job}" data-d="max">Fill every seat</button><button class="btn sm" data-action="assign" data-id="${job}" data-d="-max">Send all home</button></div></div>`;
  },
  gauge(label, v, max, color, extra = "") {
    const p = max ? Math.min(100, (v / max) * 100) : 0;
    return `<div class="gauge"><div class="g-l"><span>${label}</span><b>${fmt(v)} / ${fmt(max)}</b></div><div class="g-b"><i style="width:${p}%;background:${color}"></i></div>${extra}</div>`;
  },
  trainHtml(s, bType) {
    const list = Object.entries(UNITS).filter(([, u]) => u.req[bType] !== undefined);
    if (!list.length) return "";
    const queueRoom = BALANCE.maxQueue - s.queue.length;
    const cards = list.map(([id, u]) => {
      const blk = Military.trainBlocker(s, id);
      const locked = Object.entries(u.req).some(([b, l]) => s.buildings[b] < l);
      let max = Math.min(s.jobs.recruit, queueRoom);
      for (const [r, v] of Object.entries(u.cost)) max = Math.min(max, Math.floor(s.resources[r] / v));
      max = Math.max(0, max);
      const val = Math.min(this.form["t_" + id] ?? 1, max) || (max ? 1 : 0);
      const vr = Military.vetRank(s.veterancy[id]);
      return `<div class="tcard ${locked ? "locked-card" : ""}">
        <img class="tc-img" src="${AssetPipeline.src(u.asset)}" alt="">
        <div class="tc-body"><div class="tc-h"><b>${u.name}</b><span class="badge war">${vr ? "★".repeat(vr) + " " : ""}${s.army[id] || 0} home</span></div>
          <div class="ustats">${UI.statLine(u)}</div>
          <div class="costs">${UI.costHtml(u.cost, s)} <span class="dim">· ${u.time}s each</span></div>
          ${locked ? `<div class="req">${esc(Military.reqText(id))}</div>` : `
          <div class="slider-row"><input type="range" min="0" max="${max}" value="${val}" data-form="t_${id}" ${max ? "" : "disabled"}><b data-fv="t_${id}">${val}</b></div>
          <button class="btn primary sm" data-action="trainN" data-id="${id}" ${!max || blk ? "disabled" : ""} title="${esc(blk || "")}">⚔ Train <span data-fv2="t_${id}">${val}</span></button>
          ${blk && blk !== "Not enough resources" && !max ? `<div class="req">${esc(blk)}</div>` : ""}`}
        </div></div>`;
    }).join("");
    const q = s.queue.filter((x) => list.some(([id]) => id === x.unit));
    return `<div class="form-sec"><div class="fs-h"><span>⚔ Train troops</span><b>${s.jobs.recruit} recruits ready · queue ${s.queue.length}/${BALANCE.maxQueue}</b></div>
      ${s.jobs.recruit ? "" : `<div class="req" style="margin-bottom:6px">Every soldier needs a Recruit. Assign citizens as Recruits at the Barracks.</div>`}
      <div class="tcards">${cards}</div>
      ${q.length ? `<div class="queue"><div class="stat-row"><span>Training ${UNITS[s.queue[0].unit].name}</span><b data-qt="1"></b></div><div class="bar war"><i data-qb="1"></i></div><div class="dim" style="font-size:11.5px;margin-top:4px">${q.length} in this building's queue</div><button class="btn sm primary" style="margin-top:6px" data-action="rushTrain" data-rush="t">⚡ Finish this soldier now</button></div>` : ""}</div>`;
  },
  releaseHtml(s) {
    const list = Object.entries(UNITS).filter(([id]) => (s.army[id] || 0) > 0);
    if (!list.length) return `<div class="form-sec"><div class="fs-h"><span>🏳️ Release soldiers</span></div><div class="dim">No soldiers at home.</div></div>`;
    return `<div class="form-sec"><div class="fs-h"><span>🏳️ Release soldiers</span><b>they return as idle citizens</b></div>
      <div class="tcards">${list.map(([id, u]) => {
        const n = s.army[id], val = Math.min(this.form["r_" + id] ?? 1, n);
        return `<div class="tcard"><img class="tc-img" src="${AssetPipeline.src(u.asset)}" alt=""><div class="tc-body"><div class="tc-h"><b>${u.name}</b><span class="badge">${n} home</span></div>
          <div class="dim" style="font-size:11.5px">Saves ${(u.upkeep.food * val).toFixed(1)} food and ${(u.upkeep.gold * val).toFixed(1)} gold per second</div>
          <div class="slider-row"><input type="range" min="1" max="${n}" value="${val}" data-form="r_${id}"><b data-fv="r_${id}">${val}</b></div>
          <button class="btn danger sm" data-action="release" data-id="${id}">Release <span data-fv2="r_${id}">${val}</span></button></div></div>`;
      }).join("")}</div></div>`;
  },
  marketHtml(s) {
    const r = this.form.mres || "food", mode = this.form.mmode || "sell";
    const price = mode === "sell" ? Market.sellPrice(s, r) : Market.buyPrice(s, r);
    const max = mode === "sell" ? Math.floor(s.resources[r]) : Math.max(0, Math.floor(Math.min(Economy.caps(s)[r] - s.resources[r], s.resources.gold / Market.buyPrice(s, r))));
    const val = Math.min(this.form.mamt ?? Math.floor(max / 2), max);
    return `<div class="form-sec"><div class="fs-h"><span>⚖ Trading desk</span><b>Market level ${s.buildings.market}: better prices with each level</b></div>
      <div class="seg"><button class="${mode === "sell" ? "on" : ""}" data-action="mset" data-k="mmode" data-v="sell">Sell for Gold</button><button class="${mode === "buy" ? "on" : ""}" data-action="mset" data-k="mmode" data-v="buy">Buy with Gold</button></div>
      <div class="restiles">${Object.keys(TRADE_VALUE).map((k) => `<button class="restile ${k === r ? "on" : ""}" data-action="mset" data-k="mres" data-v="${k}"><img src="${AssetPipeline.src(RESOURCES[k].asset)}" alt=""><span>${RESOURCES[k].name}</span><small>${fmt(s.resources[k])}</small></button>`).join("")}</div>
      <div class="trade-box"><div><div class="dim" style="font-size:12px">${mode === "sell" ? "Sell" : "Buy"} ${RESOURCES[r].name} at <b>${price.toFixed(2)}</b> Gold each</div>
        <div class="slider-row"><input type="range" min="0" max="${max}" value="${val}" data-form="mamt" ${max ? "" : "disabled"}><b data-fv="mamt">${fmtInt(val)}</b></div></div>
        <div class="trade-sum">${mode === "sell" ? "You receive" : "You pay"}<b><img src="${AssetPipeline.src("res_gold")}" alt=""> <span data-mtot="1">${fmtInt(val * price)}</span></b></div>
        <button class="btn primary" data-action="mdeal" ${max ? "" : "disabled"}>${mode === "sell" ? "🪙 Sell" : "🛒 Buy"}</button></div></div>`;
  },
  blessHtml(s) {
    return `<div class="form-sec"><div class="fs-h"><span>✨ Blessings</span><b><img class="inl" src="${AssetPipeline.src("res_faith")}" alt=""> ${fmt(s.resources.faith)} Faith</b></div><div class="bless">${Object.entries(BLESSINGS).map(([k, bl]) => {
      const blk = Temple.blocker(s, k), act = s.buffs.find((x) => x.id === bl.buff);
      return `<div class="bcard ${act ? "active" : ""}"><div class="bc-ic">${bl.icon}</div><b>${bl.name}</b><div class="dim" style="font-size:11.5px">${esc(EVENTS[bl.buff].desc.replace(/for \d+ minutes\.?/, "for 10 minutes."))}</div>
        ${act ? `<div class="good" data-bless="${bl.buff}"></div>` : `<button class="btn sm primary" data-action="bless" data-id="${k}" ${blk ? "disabled" : ""} title="${esc(blk || "")}">${bl.cost} Faith</button>`}</div>`;
    }).join("")}</div></div>`;
  },
  formBody(s, sl) {
    const t = sl.type, out = [];
    const job = JOB_OF[t];
    switch (t) {
      case "townhall": {
        const builds = s.city.slots.map((x, i) => [x, i]).filter(([x]) => x && x.build);
        out.push(`<div class="form-sec"><div class="fs-h"><span>🏰 Your city</span></div>
          ${this.gauge("Building lots used", s.city.slots.filter((x, i) => x && i < City.lots(s)).length, City.lots(s), "linear-gradient(90deg,#b07a22,#f2c75e)")}
          ${this.gauge("Builders at work", City.busy(s), City.builders(s), "linear-gradient(90deg,#2f8d3c,#8de38a)", `<div class="dim" style="font-size:11.5px">+1 builder every 3 Town Hall levels · +2 lots per level</div>`)}
          ${builds.length ? `<div class="section-title">Under construction</div>${builds.map(([x, i]) => `<div class="stat-row"><span>${BUILDINGS[x.type].name} → Lv ${x.build.to}</span><b data-cbt="${i}"></b></div>`).join("")}` : ""}
          <div class="btn-row" style="margin-top:8px"><button class="btn" data-action="win" data-win="kingdom">📋 All buildings list</button></div></div>`);
        break;
      }
      case "barracks":
        out.push(this.seatsHtml(s, "recruit"), this.trainHtml(s, "barracks"), this.releaseHtml(s));
        break;
      case "stables": case "workshop":
        out.push(this.trainHtml(s, t)); break;
      case "magetower":
        out.push(this.seatsHtml(s, "arcanist"), this.trainHtml(s, "magetower")); break;
      case "temple":
        out.push(this.blessHtml(s), this.seatsHtml(s, "monk"), this.trainHtml(s, "temple")); break;
      case "market":
        out.push(this.marketHtml(s)); break;
      case "academy": {
        const c = s.research.current;
        out.push(`<div class="form-sec"><div class="fs-h"><span>📜 Research</span><b>${Research.total(s)} levels learned</b></div>
          ${c ? `<div class="stat-row"><span>${TECHS[c.id].icon} ${TECHS[c.id].name} → ${Research.lvl(s, c.id) + 1}</span><b data-rt="1"></b></div><div class="bar teal"><i data-rb="1"></i></div>` : `<div class="dim">The scholars are idle.</div>`}
          <div class="btn-row" style="margin-top:8px"><button class="btn primary" data-action="win" data-win="research">Open the research tree</button></div></div>`);
        break;
      }
      case "warehouse": case "granary": {
        const caps = Economy.caps(s), keys = t === "granary" ? ["food"] : ["gold", "stone", "wood", "steel"];
        out.push(`<div class="form-sec"><div class="fs-h"><span>📦 Storage</span><b>×${Economy.storageMultiplier(s).toFixed(1)} from your Town Hall</b></div>${keys.map((k) => this.gauge(`<img class="inl" src="${AssetPipeline.src(RESOURCES[k].asset)}" alt=""> ${RESOURCES[k].name}`, s.resources[k], caps[k], RESOURCES[k].color)).join("")}</div>`);
        break;
      }
      case "house": {
        const tot = Economy.totalPop(s), housing = Economy.housing(s), g = Economy.growthPerSecond(s);
        out.push(`<div class="form-sec"><div class="fs-h"><span>🏠 Population</span><b>${g > 0 ? "1 newcomer every " + fmtTime(1 / g) : tot >= housing ? "Housing full" : "Not growing"}</b></div>
          ${this.gauge("Housing", tot, housing, "linear-gradient(90deg,#2a998b,#3fc1b0)")}
          <div class="kv"><span class="muted">Workers</span><b>${fmtInt(Economy.employed(s))}</b><span class="muted">Idle citizens</span><b>${fmtInt(Economy.unemployed(s))}</b><span class="muted">Recruits</span><b>${s.jobs.recruit}</b><span class="muted">Soldiers</span><b>${fmtInt(Military.soldierCount(s))}</b></div></div>`);
        break;
      }
      case "walls":
        out.push(`<div class="form-sec"><div class="fs-h"><span>🧱 Defenses</span></div><div>${esc(UI.buildingEffect(s, "walls"))}</div>${s.raid ? `<div class="req" style="margin-top:6px">Raiders are on their way!</div>` : ""}<div class="btn-row" style="margin-top:8px"><button class="btn" data-action="win" data-win="army">⚔ War Council</button></div></div>`);
        break;
      default:
        if (job) out.push(this.seatsHtml(s, job));
    }
    if (job && !["barracks", "magetower", "temple"].includes(t)) {
      const res = PRODUCES[t];
      if (res) {
        const r = Economy.rates(s);
        out.unshift(`<div class="form-sec prod"><img src="${AssetPipeline.src(RESOURCES[res].asset)}" alt=""><div><b>${fmtRate(r.prod[res])} ${RESOURCES[res].name}/s</b><div class="dim" style="font-size:11.5px">from all your ${BUILDINGS[t].name}s (total level ${s.buildings[t]}). Net ${fmtRate(r.net[res])}/s, stock ${fmt(s.resources[res])} / ${fmt(Economy.caps(s)[res])}</div></div></div>`);
      }
    }
    return out.join("");
  },
  renderBuilding(s) {
    const i = this.lot, sl = s.city.slots[i];
    const busy = City.busy(s);
    if (!sl) {
      // empty lot: choose what to build
      const sig = "empty" + i + busy + Object.keys(BUILDINGS).map((t) => City.blocker(s, t, i)).join("|") + this.form.pick;
      if (sig === this.sig.building) return;
      this.sig.building = sig;
      $("#win-building .wt").textContent = "Empty Lot";
      const choices = Object.keys(BUILDINGS).filter((t) => t !== "townhall" && (City.isMulti(t) || !City.instances(s, t).length));
      $("#buildingDetail").innerHTML = `<div class="dim" style="margin-bottom:10px">Choose a building for this lot. Builders: <b>${busy}/${City.builders(s)}</b> busy. Farms, quarries, houses and other production buildings can be built many times. Each copy goes up to level ${5 + s.buildings.townhall}.</div>
        <div class="bchoices">${choices.map((t) => {
          const B = BUILDINGS[t], blk = City.blocker(s, t, i), cost = Economy.buildingCost(t, City.total(s, t));
          return `<div class="bchoice ${blk ? "blocked" : ""} ${this.form.pick === t ? "picked" : ""}"><img src="${AssetPipeline.src(B.asset)}" alt=""><div class="bc-body"><b>${B.name}</b><div class="dim" style="font-size:11.5px">${esc(B.desc)}</div>
            <div class="costs">${UI.costHtml(cost, s)} <span class="dim">· ${fmtTime(City.buildTime(s, t, 1))}</span></div>
            ${blk && blk !== "Not enough resources" ? `<div class="req">${esc(blk)}</div>` : ""}
            <button class="btn primary sm" data-action="buildOn" data-i="${i}" data-id="${t}" ${blk ? "disabled" : ""}>⚒ Build here</button></div></div>`;
        }).join("")}</div>`;
      AssetPipeline.applyAll($("#buildingDetail"));
      return;
    }
    const B = BUILDINGS[sl.type], blk = City.blocker(s, sl.type, i), total = City.total(s, sl.type);
    const cost = Economy.buildingCost(sl.type, total);
    const sig = [i, sl.type, sl.level, !!sl.build, blk, busy, Object.entries(cost).map(([r, v]) => s.resources[r] >= v).join(), s.jobs[JOB_OF[sl.type]], s.jobs.recruit, s.queue.length,
      JSON.stringify(s.army), Math.floor(s.resources.faith / 10), s.buffs.length, this.form.mres, this.form.mmode, Math.floor(s.resources.gold / 200), Economy.unemployed(s) > 0, s.research.current && s.research.current.id].join("|");
    if (sig === this.sig.building) { this.liveBuilding(s); return; }
    this.sig.building = sig;
    $("#win-building .wt").textContent = B.name;
    const cap = City.instCap(s, sl.type);
    $("#buildingDetail").innerHTML = `
      <div class="bhead"><div class="bh-art"><img src="${AssetPipeline.src(B.asset)}" alt="">${sl.build ? `<div class="scaffold big"><div class="ring" data-ring="w"></div><span class="crane">🏗️</span></div>` : ""}</div>
        <div style="flex:1"><div class="ql-title">${B.name}</div>
          <div class="btn-row" style="margin:4px 0"><span class="badge">Level ${sl.level}${City.isMulti(sl.type) ? ` / ${cap}` : ` / ${Economy.buildingMax(s, sl.type)}`}</span>${City.isMulti(sl.type) ? `<span class="badge teal">All ${B.name}s: Lv ${s.buildings[sl.type]} / ${Economy.buildingMax(s, sl.type)}</span>` : ""}</div>
          <div class="desc" style="color:var(--muted)">${B.desc}</div>
          <div class="effect" style="color:#8de3b0;margin-top:4px">${esc(UI.buildingEffect(s, sl.type))}</div></div></div>
      <div class="form-sec upg">${sl.build ? `<div class="fs-h"><span>🏗️ ${sl.level ? `Upgrading to level ${sl.build.to}` : "Under construction"}</span><b data-bt="w"></b></div><div class="bar teal"><i data-bb="w"></i></div>
        <button class="btn sm primary" style="margin-top:8px" data-action="rushBuild" data-i="${i}" data-rush="b">⚡ Finish now</button>`
        : blk === "Max level reached" || (blk && blk.startsWith("This")) || (blk && blk.startsWith("Upgrade the Town Hall")) ? `<div class="dim">${esc(blk)}</div>`
        : `<div class="fs-h"><span>⬆ Upgrade to level ${sl.level + 1}</span><b>${fmtTime(City.buildTime(s, sl.type, sl.level + 1))} · builders ${busy}/${City.builders(s)}</b></div>
          <div class="costs" style="margin-bottom:6px;font-size:13px">${UI.costHtml(cost, s)}</div>
          ${blk && blk !== "Not enough resources" ? `<div class="req" style="margin-bottom:6px">${esc(blk)}</div>` : ""}
          <div class="btn-row"><button class="btn primary" data-action="upgradeLot" data-i="${i}" ${blk ? "disabled" : ""}>⬆ Upgrade</button>
          ${City.isMulti(sl.type) && !sl.build ? `<button class="btn danger sm" data-action="demolish" data-i="${i}" title="Tear it down to free the lot (no refund)">🪓 Demolish</button>` : ""}</div>`}</div>
      ${sl.level ? this.formBody(s, sl) : `<div class="dim">This building opens once construction is finished.</div>`}`;
    AssetPipeline.applyAll($("#buildingDetail"));
    this.liveBuilding(s);
  },
  /** Timers and progress bars inside the open building form. */
  liveBuilding(s) {
    const sl = s.city.slots[this.lot];
    if (sl && sl.build) {
      const p = (1 - sl.build.remaining / sl.build.total) * 100;
      const t = $('[data-bt="w"]'); if (t) t.textContent = fmtTime(sl.build.remaining) + " left";
      const bb = $('[data-bb="w"]'); if (bb) bb.style.width = p + "%";
      const r = $('[data-ring="w"]'); if (r) r.style.setProperty("--p", p.toFixed(1));
      const rb = $('#buildingDetail [data-rush="b"]'); if (rb) { const c = Life.rushCost(s, sl.build.remaining); rb.textContent = `⚡ Finish now (${fmt(c)} Gold)`; rb.disabled = s.resources.gold < c; }
    }
    s.city.slots.forEach((x, i) => { const e = $(`#buildingDetail [data-cbt="${i}"]`); if (e && x && x.build) e.textContent = fmtTime(x.build.remaining); });
    if (s.queue.length) {
      const q = s.queue[0];
      const t = $('#buildingDetail [data-qt="1"]'); if (t) t.textContent = fmtTime(q.remaining / Military.trainSpeed(s));
      const b = $('#buildingDetail [data-qb="1"]'); if (b) b.style.width = (1 - q.remaining / q.total) * 100 + "%";
      const rt = $('#buildingDetail [data-rush="t"]'); if (rt) { const c = Math.ceil(Life.rushCost(s, q.remaining / Military.trainSpeed(s)) * 0.5); rt.textContent = `⚡ Finish this soldier now (${fmt(c)} Gold)`; rt.disabled = s.resources.gold < c; }
    }
    const c = s.research.current;
    if (c) { const t = $('#buildingDetail [data-rt="1"]'); if (t) t.textContent = fmtTime(c.remaining); const b = $('#buildingDetail [data-rb="1"]'); if (b) b.style.width = (1 - c.remaining / c.total) * 100 + "%"; }
    for (const bf of s.buffs) { const e = $(`#buildingDetail [data-bless="${bf.id}"]`); if (e) e.textContent = "Active · " + fmtTime(bf.until - s.time); }
  },

  itemCard(it, slotLabel) {
    if (!it) return `<div class="arm-item empty"><span class="ai-ic">${GEAR_SLOTS[slotLabel].icon}</span><span class="dim">Empty ${GEAR_SLOTS[slotLabel].name}</span></div>`;
    const R = GEAR_RARITY[it.rarity];
    return `<div class="arm-item r-${it.rarity}" style="--rc:${R.color}" data-action="gearSel" data-id="${it.id}" title="${esc(it.name)}: ${esc(Armory.statText(it))}"><span class="ai-ic">${GEAR_SLOTS[it.slot].icon}</span><span><b style="color:${R.color}">${esc(it.name)}</b><small>${R.name} ${GEAR_SLOTS[it.slot].name} · ilvl ${it.ilvl}</small></span></div>`;
  },
  renderArmory(s) {
    const g = s.gear;
    const sig = JSON.stringify(Object.values(g.equipped).map((x) => x && x.id)) + g.bag.map((x) => x.id).join() + this.gsel;
    if (sig === this.sig.armory) return;
    this.sig.armory = sig;
    $("#armSlots").innerHTML = Object.keys(GEAR_SLOTS).map((sl) => `<div class="arm-slot"><div class="dim" style="font-size:11px;margin-bottom:2px">${GEAR_SLOTS[sl].name}</div>${this.itemCard(g.equipped[sl], sl)}</div>`).join("");
    const tot = Armory.bonus(s);
    $("#armTotals").innerHTML = `<div class="section-title" style="margin-top:10px">Total bonuses</div>` + (Object.keys(tot).length ? Object.entries(tot).map(([k, v]) => `<div class="stat-row"><span>${GEAR_STATS[k].label}</span><b class="good">+${Math.round(v * 10) / 10}${GEAR_STATS[k].unit}</b></div>`).join("") : `<div class="dim">Equip gear to empower your Lord Commander and army.</div>`);
    $("#armCount").textContent = `(${g.bag.length}/${Armory.BAG})`;
    const bag = g.bag.slice().sort((a, c) => ["legendary", "epic", "rare", "common"].indexOf(a.rarity) - ["legendary", "epic", "rare", "common"].indexOf(c.rarity) || Armory.score(c) - Armory.score(a));
    $("#armBag").innerHTML = bag.length ? bag.map((it) => `<div class="${this.gsel === it.id ? "sel" : ""}">${this.itemCard(it)}</div>`).join("") : `<div class="dim">Your bag is empty. Gear drops from victories: campaign quests (a guaranteed drop the first time), world map raids, the Endless Conquest and repelled raids. Leading in person and slaying generals improve the odds.</div>`;
    const it = this.gsel && (g.bag.find((x) => x.id === this.gsel) || Object.values(g.equipped).find((x) => x && x.id === this.gsel));
    if (it) {
      const R = GEAR_RARITY[it.rarity], cur = g.equipped[it.slot], equipped = cur && cur.id === it.id;
      const cmp = (k) => { const nv = it.stats[k] || 0, ov = cur && !equipped ? cur.stats[k] || 0 : nv; const d = Math.round((nv - ov) * 10) / 10; return d ? ` <span class="${d > 0 ? "good" : "bad"}">(${d > 0 ? "+" : ""}${d})</span>` : ""; };
      const keys = [...new Set([...Object.keys(it.stats), ...(cur && !equipped ? Object.keys(cur.stats) : [])])];
      $("#armDetail").innerHTML = `<div class="arm-detail" style="--rc:${R.color}"><div style="font-family:var(--font-display);font-size:16px;color:${R.color}">${GEAR_SLOTS[it.slot].icon} ${esc(it.name)}</div>
        <div class="dim" style="font-size:12px">${R.name} ${GEAR_SLOTS[it.slot].name} · item level ${it.ilvl}${equipped ? " · <b class='good'>equipped</b>" : ""}</div>
        ${keys.map((k) => `<div class="stat-row"><span>${GEAR_STATS[k].label}</span><b>+${it.stats[k] || 0}${GEAR_STATS[k].unit}${cmp(k)}</b></div>`).join("")}
        <div class="btn-row" style="margin-top:8px">${equipped ? `<button class="btn" data-action="gearUnequip" data-id="${it.slot}">Unequip</button>` : `<button class="btn primary" data-action="gearEquip" data-id="${it.id}">Equip</button><button class="btn danger" data-action="gearSalvage" data-id="${it.id}">Salvage (${fmt(R.salvage * (1 + it.ilvl * 0.1))} Gold${it.rarity === "legendary" ? " + Relic" : ""})</button>`}</div></div>`;
    } else $("#armDetail").innerHTML = "";
    AssetPipeline.applyAll($("#win-armory"));
  },
  renderCampaign(s) {
    const sel = this.qsel || CAMPAIGN_ORDER[0];
    const sig = CAMPAIGN_ORDER.map((id) => Campaign.state(s, id) + !!s.campaign.led[id]).join() + sel + s.commander.level + s.conquest + s.army.militia + Military.homeCount(s);
    if (sig === this.sig.campaign) return;
    this.sig.campaign = sig;
    let list = "";
    CHAPTERS.forEach((ch, ci) => {
      list += `<div class="ql-ch">Chapter ${ch}</div>`;
      for (const id of CAMPAIGN_ORDER.filter((x) => CAMPAIGN[x].chapter === ci)) {
        const st = Campaign.state(s, id);
        list += `<div class="ql-item ${st === "locked" ? "locked" : ""} ${id === sel ? "sel" : ""}" data-action="questOpen" data-id="${id}"><span class="mk ${st}">${QUEST_MARK[st]}</span><span>${esc(CAMPAIGN[id].title)}</span></div>`;
      }
    });
    list += `<div class="ql-ch">Side Quests</div><div class="ql-item ${sel === "conquest" ? "sel" : ""}" data-action="questOpen" data-id="conquest"><span class="mk available">∞</span><span>Endless Conquest · Stage ${s.conquest}</span></div>
      <div class="ql-item" data-action="win" data-win="world"><span class="mk available">🗺</span><span>Raid the World Map</span></div>`;
    $("#qlList").innerHTML = list;

    let d;
    if (sel === "conquest") {
      const m = Military.mission(s, "conquest"), blk = Military.deployBlocker(s, "conquest", null, true);
      d = `<div class="ql-head"><div class="ql-face">🗺️</div><div><div class="ql-title">${esc(m.name)}</div><div class="ql-giver">Repeatable · ${esc(m.sub || "")}</div></div></div>
        <div class="ql-speech">Beyond the borders, warlord after warlord rises to challenge you. Every stage you conquer brings a stronger foe and richer spoils. How far can the Lord of Ironhold go?</div>
        <div class="section-title">Enemy forces · ⚔ ${fmt(armyPower(m.army))} · ${MAP_TYPES[m.map]}</div><div class="chips">${UI.armyChips(m.army)}</div>
        <div class="section-title">Spoils</div><div class="ql-rewards costs">${Object.entries(m.loot).map(([r, [lo, hi]]) => `<span class="cost"><img data-asset="${RESOURCES[r].asset}" alt="">${fmt(lo)}–${fmt(hi)}</span>`).join("")}</div>
        ${blk ? `<div class="req">${esc(blk)}</div>` : ""}<button class="btn primary" data-action="openDeploy" data-id="conquest" ${blk ? "disabled" : ""}>⚔ March to war</button>`;
    } else {
      const c = CAMPAIGN[sel], st = Campaign.state(s, sel), m = Military.mission(s, sel);
      const blk = Military.deployBlocker(s, sel, null, true);
      const rewardChips = (r) => Object.entries(r).map(([k, v]) => `<span class="cost"><img data-asset="${RESOURCES[k].asset}" alt="">${fmt(v)}</span>`).join("");
      d = `<div class="ql-head"><div class="ql-face">${c.face}</div><div><div class="ql-title">${esc(c.title)}</div><div class="ql-giver">Quest giver: <b>${esc(c.giver)}</b> · Chapter ${CHAPTERS[c.chapter]} · Requires Commander Lv ${m.level}</div></div></div>
        <div class="ql-speech">${esc(st === "ready" || st === "complete" ? c.outro : c.intro)}</div>
        <div class="section-title">Objectives</div>
        <div class="ql-obj"><span class="${s.campaign.done[sel] ? "ok" : "no"}">${s.campaign.done[sel] ? "☑" : "☐"}</span> ${esc(c.objective)}</div>
        <div class="ql-obj"><span class="${s.campaign.led[sel] ? "ok" : "no"}">${s.campaign.led[sel] ? "☑" : "☐"}</span> Bonus: win the battle while leading it in person</div>
        <div class="section-title">Enemy forces · ⚔ ${fmt(armyPower(m.army))} · ${MAP_TYPES[m.map]}${m.fortified ? " · Fortified" : ""}</div><div class="chips">${UI.armyChips(m.army)}</div>
        <div class="section-title">Rewards</div>
        <div class="ql-rewards costs"><span class="dim">Quest:</span> ${rewardChips(c.reward)} <span class="dim">Bonus objective:</span> ${rewardChips(c.bonus)}</div>
        <div class="ql-rewards costs"><span class="dim">Battle spoils (every victory):</span> ${Object.entries(m.loot).map(([r, [lo, hi]]) => `<span class="cost"><img data-asset="${RESOURCES[r].asset}" alt="">${fmt(lo)}–${fmt(hi)}</span>`).join("")}</div>
        <div class="btn-row">
          ${st === "available" ? `<button class="btn primary" data-action="openDeploy" data-id="${sel}" ${blk ? "disabled" : ""}>⚔ Accept quest & deploy</button>` : ""}
          ${st === "ready" ? `<button class="btn primary" data-action="turnIn" data-id="${sel}">📜 Turn in quest</button>` : ""}
          ${st === "complete" ? `<button class="btn" data-action="openDeploy" data-id="${sel}" ${blk ? "disabled" : ""}>⚔ Replay as a bounty</button>` : ""}
          ${st === "marching" ? `<span class="badge war">Your army is on its way…</span>` : ""}
        </div>
        ${st !== "complete" && st !== "ready" && blk ? `<div class="req" style="margin-top:6px">${esc(blk)}</div>` : ""}`;
    }
    $("#qlDetail").innerHTML = d;
    AssetPipeline.applyAll($("#win-campaign"));
  },
};
