"use strict";
/* =====================================================================
   CITY LIFE: walkers, day & night, visible seasons, smoke and birds,
   click-to-collect bonuses, surprise events, rush, and the advisor.
   ===================================================================== */
const DAY_LENGTH = 480;               // game seconds for a full day/night cycle
const BAG_RES = { farm: "food", quarry: "stone", lumbercamp: "wood", steelworks: "steel", ranch: "horses", brewery: "ale", magetower: "crystals", temple: "faith", market: "gold", townhall: "gold", house: "gold" };
const SMOKES = ["townhall", "house", "steelworks", "brewery", "barracks", "workshop", "academy"];

const SURPRISES = {
  chest:  { name: "Lost Chest",      icon: "🧰", sprite: "w_chest",  life: 120, desc: "A chest has fallen from a cart! Click it." },
  trader: { name: "Wandering Trader", icon: "🐫", sprite: "w_trader", life: 150, desc: "A trader with rare goods is in town. Click to see the offer." },
  thief:  { name: "Thief!",           icon: "🦹", sprite: "w_thief",  life: 35,  desc: "A thief is running off with gold! Click him before he escapes." },
  fire:   { name: "Fire!",            icon: "🔥", sprite: null,       life: 30,  desc: "A building is on fire! Click the flames 3 times to put it out." },
};

const Life = {
  walkers: [], raf: 0,

  /* ---------------- simulation (runs in Engine.tick) ---------------- */
  step(s, dt) {
    // production bonuses to collect
    for (const sl of s.city.slots) {
      if (!sl || !sl.level || sl.build || !BAG_RES[sl.type] || sl.bag) continue;
      if (sl.bagAt === undefined) sl.bagAt = s.time + randInt(50, 160);
      if (s.time >= sl.bagAt) sl.bag = { res: BAG_RES[sl.type], amt: this.bagAmount(s, sl) };
    }
    // surprises only happen while you are playing, never while away
    if (Engine.simulating) { if (s.surprise && s.time > s.surprise.until) s.surprise = null; return; }
    const sp = s.surprise;
    if (sp && s.time > sp.until) this.expire(s);
    else if (!sp && s.time >= (s.nextSurprise || 0) && !s.battle) this.spawn(s);
  },
  bagAmount(s, sl) {
    const r = Economy.rates(s), res = BAG_RES[sl.type];
    let per = sl.type === "house" ? 0.4 * sl.level : (r.prod[res] || 0) * (sl.level / Math.max(1, s.buildings[sl.type]));
    if (sl.type === "townhall" || sl.type === "market") per = r.prod.gold * 0.12;
    return Math.max(res === "crystals" || res === "horses" ? 1 : 5, Math.round(per * 30 * (1 + 0.04 * sl.level)));
  },
  collect(s, i) {
    const sl = s.city.slots[i];
    if (!sl || !sl.bag) return null;
    const got = Economy.grant(s, { [sl.bag.res]: sl.bag.amt });
    const res = sl.bag.res;
    delete sl.bag; sl.bagAt = s.time + randInt(70, 180);
    s.stats.collected = (s.stats.collected || 0) + 1;
    return { res, amt: got[res] || 0 };
  },
  collectAll(s) {
    let n = 0;
    s.city.slots.forEach((sl, i) => { if (sl && sl.bag && this.collect(s, i)) n++; });
    return n;
  },
  roads() {
    if (this._roads) return this._roads;
    const M = CityMap, out = [];
    for (let r = 0; r < M.rows; r++) for (let c = 0; c < M.cols; c++) if (M.isRoad(r, c) && !M.isPlaza(r, c)) out.push([r, c]);
    return (this._roads = out);
  },
  spawn(s) {
    s.nextSurprise = s.time + randInt(110, 230);
    const opts = ["chest", "chest", "trader", "thief", "thief"];
    const burnable = s.city.slots.map((x, i) => [x, i]).filter(([x, i]) => x && x.level && !x.build && i > 0);
    if (burnable.length && s.time > 900) opts.push("fire");
    const type = opts[Math.floor(Math.random() * opts.length)], S = SURPRISES[type];
    const roads = this.roads(), [r, c] = roads[Math.floor(Math.random() * roads.length)];
    const sp = { type, r, c, until: s.time + S.life, id: s.nextId++ };
    if (type === "fire") { sp.slot = burnable[Math.floor(Math.random() * burnable.length)][1]; sp.clicks = 0; }
    if (type === "thief") sp.loot = Math.max(30, Math.floor(s.resources.gold * 0.06));
    if (type === "trader") {
      const res = ["steel", "horses", "crystals", "ale", "stone", "wood"].filter((k) => Economy.caps(s)[k] > s.resources[k] + 10);
      const k = res[Math.floor(Math.random() * res.length)] || "steel";
      const n = Math.max(5, Math.round((k === "crystals" ? 0.08 : k === "horses" ? 0.12 : 0.25) * Economy.caps(s)[k] / (k === "crystals" || k === "horses" ? 1 : 1)));
      sp.offer = { res: k, n, gold: Math.round(n * TRADE_VALUE[k] * 0.55) };
    }
    s.surprise = sp;
    addLog(s, `${S.icon} ${S.name} ${S.desc}`, type === "fire" || type === "thief" ? "bad" : "info");
    if (typeof Sound !== "undefined") Sound.play(type === "fire" || type === "thief" ? "horn" : "open");
  },
  expire(s) {
    const sp = s.surprise; s.surprise = null;
    if (sp.type === "thief") { const g = Math.min(sp.loot, Math.floor(s.resources.gold)); s.resources.gold -= g; addLog(s, `🦹 The thief got away with ${fmtInt(g)} Gold.`, "bad"); }
    else if (sp.type === "fire") {
      const sl = s.city.slots[sp.slot];
      const w = Math.floor(s.resources.wood * 0.15), st = Math.floor(s.resources.stone * 0.08);
      s.resources.wood -= w; s.resources.stone -= st;
      addLog(s, `🔥 The fire burned out at the ${sl ? BUILDINGS[sl.type].name : "building"}: ${fmtInt(w)} Wood and ${fmtInt(st)} Stone were lost on repairs.`, "bad");
    }
  },
  /** Player clicked the surprise. Returns a short message. */
  interact(s) {
    const sp = s.surprise;
    if (!sp) return null;
    s.stats.surprises = (s.stats.surprises || 0) + (sp.type === "fire" ? 0 : 1);
    if (sp.type === "chest") {
      const gold = Math.max(100, Math.round(Economy.rates(s).prod.gold * 60));
      const other = ["food", "stone", "wood", "steel"][randInt(0, 3)];
      const g = Economy.grant(s, { gold, [other]: Math.round(Economy.caps(s)[other] * 0.05) });
      let msg = `🧰 The chest held ${fmtInt(g.gold)} Gold and ${fmtInt(g[other])} ${RESOURCES[other].name}`;
      if (Math.random() < 0.08) { s.resources.relics++; s.stats.relicsFound++; msg += " and a Relic!"; }
      s.surprise = null; Sound.play("chest");
      addLog(s, msg + ".", "good"); return msg;
    }
    if (sp.type === "thief") {
      const g = Economy.grant(s, { gold: sp.loot * 1.5 });
      s.surprise = null; Sound.play("sword");
      addLog(s, `🦹 Caught the thief! The guards return the gold with a reward: ${fmtInt(g.gold)} Gold.`, "good");
      return `Thief caught! +${fmtInt(g.gold)} Gold`;
    }
    if (sp.type === "fire") {
      sp.clicks++; Sound.play("click");
      if (sp.clicks >= 3) { s.surprise = null; s.stats.surprises = (s.stats.surprises || 0) + 1; Sound.play("collect"); addLog(s, "💧 The fire is out! The citizens cheer.", "good"); return "Fire put out!"; }
      return `Splash! (${sp.clicks}/3)`;
    }
    if (sp.type === "trader") return "trader";
    return null;
  },
  acceptTrade(s) {
    const sp = s.surprise;
    if (!sp || sp.type !== "trader" || s.resources.gold < sp.offer.gold) return false;
    s.resources.gold -= sp.offer.gold;
    Economy.grant(s, { [sp.offer.res]: sp.offer.n });
    s.surprise = null; s.stats.surprises = (s.stats.surprises || 0) + 1; s.stats.trades++;
    Sound.play("coin");
    addLog(s, `🐫 Bought ${fmtInt(sp.offer.n)} ${RESOURCES[sp.offer.res].name} from the wandering trader for ${fmtInt(sp.offer.gold)} Gold.`, "good");
    return true;
  },

  /* ---------------- rush: finish now for gold ---------------- */
  rushCost(s, seconds) { return Math.max(10, Math.ceil(seconds * (3 + s.buildings.townhall * 1.5))); },
  rushBuild(s, i) {
    const sl = s.city.slots[i];
    if (!sl || !sl.build) return false;
    const c = this.rushCost(s, sl.build.remaining);
    if (s.resources.gold < c) return false;
    s.resources.gold -= c; sl.build.remaining = 0; City.step(s, 0);
    Sound.play("built"); return true;
  },
  rushTrain(s) {
    const q = s.queue[0];
    if (!q) return false;
    const c = this.rushCost(s, q.remaining / Military.trainSpeed(s)) * 0.5;
    if (s.resources.gold < c) return false;
    s.resources.gold -= Math.ceil(c); s.queue.shift();
    s.army[q.unit] = (s.army[q.unit] || 0) + 1; s.stats.trained++;
    return true;
  },

  /* ---------------- rendering on the city map ---------------- */
  dayPhase(s) { return (s.time % DAY_LENGTH) / DAY_LENGTH; },
  night(s) { return clamp((-Math.sin(this.dayPhase(s) * Math.PI * 2) - 0.15) * 1.4, 0, 1); },
  geom(i) {
    const M = CityMap, [x, y] = M.center(i), dw = M.cell * Math.SQRT2, dh = dw / 2;
    const foot = i === 0 ? dh : dh / 2, w = i === 0 ? dw * 1.95 : dw;
    return { x, bottom: y + foot * 0.92, w };
  },
  ensureLayers() {
    const map = $("#cityMap");
    if (!map) return false;
    if (!$("#cityLife")) {
      map.insertAdjacentHTML("beforeend", `<div class="lifelayer" id="cityWalk"></div><div class="nightveil" id="nightVeil"></div><div class="lifelayer top" id="cityGlow"></div><div class="lifelayer top" id="cityFx"></div><div class="lifelayer top" id="cityLife"></div>`);
      this.walkers = []; this.fxSig = "";
    }
    return true;
  },
  render(s) {
    if (!this.ensureLayers()) return;
    const host = $("#cityPlots");
    // time of day and season
    const n = this.night(s);
    document.documentElement.style.setProperty("--night", n.toFixed(3));
    const se = Climate.season(s).id, disaster = s.buffs.find((b) => DISASTERS[b.id]);
    host.className = `plots season-${se}${disaster ? " dis-" + disaster.id : ""}${n > 0.5 ? " is-night" : ""}`;
    // static effects (smoke, lights) follow the buildings
    const fxSig = CityView.sig + "|" + s.city.slots.map((x) => (x ? x.type + x.level : "")).join();
    if (fxSig !== this.fxSig) {
      this.fxSig = fxSig;
      let glow = "", fx = "";
      s.city.slots.forEach((sl, i) => {
        if (!sl || !sl.level || i >= City.lots(s)) return;
        const g = this.geom(i);
        glow += `<div class="glow" style="left:${g.x}px;top:${g.bottom - g.w * 0.25}px;--w:${g.w * 1.1}px"></div>`;
        if (SMOKES.includes(sl.type)) fx += `<div class="smoke" style="left:${g.x + g.w * (i === 0 ? 0.12 : 0.18)}px;top:${g.bottom - g.w * (i === 0 ? 0.95 : 0.78)}px"><i></i><i></i><i></i></div>`;
      });
      // street lanterns at the crossroads
      const M = CityMap;
      for (let r = 0; r < M.rows; r += 3) for (let c = 0; c < M.cols; c += 3) { const [x, y] = M.project(c + 0.5, r + 0.5); glow += `<div class="glow lamp" style="left:${x}px;top:${y}px"></div>`; }
      $("#cityGlow").innerHTML = glow;
      $("#cityFx").innerHTML = fx + `<div class="cloud c1"></div><div class="cloud c2"></div>`;
    }
    this.renderBubbles(s);
    this.syncWalkers(s);
    this.maybeBirds();
    if (!this.raf) this.loop();
  },
  renderBubbles(s) {
    const lots = City.lots(s), sp = s.surprise;
    const sig = s.city.slots.map((x) => (x && x.bag ? x.bag.res + x.bag.amt : "")).join() + "|" + (sp ? sp.id + ":" + (sp.clicks || 0) : "") + "|" + CityView.sig;
    if (sig === this.bubSig) return;
    this.bubSig = sig;
    let h = "";
    s.city.slots.forEach((sl, i) => {
      if (!sl || !sl.bag || i >= lots) return;
      const g = this.geom(i);
      h += `<button class="bag" data-action="collect" data-i="${i}" style="left:${g.x}px;top:${g.bottom - g.w * 0.86}px" title="Collect ${fmtInt(sl.bag.amt)} ${RESOURCES[sl.bag.res].name}"><img src="${AssetPipeline.src(RESOURCES[sl.bag.res].asset)}" alt=""><b>+${fmt(sl.bag.amt)}</b></button>`;
    });
    if (sp) {
      const S = SURPRISES[sp.type];
      if (sp.type === "fire") {
        const g = this.geom(sp.slot);
        h += `<button class="surprise fire" data-action="surprise" style="left:${g.x}px;top:${g.bottom - g.w * 0.45}px;--w:${g.w}px" title="Click 3 times to put out the fire"><span>🔥</span><span>🔥</span><span>🔥</span><b>${3 - (sp.clicks || 0)}</b></button>`;
      } else if (sp.type !== "thief") {
        const [x, y] = CityMap.project(sp.c + 0.5, sp.r + 0.5), src = AssetPipeline.hasArt(S.sprite) ? AssetPipeline.src(S.sprite) : null;
        h += `<button class="surprise ${sp.type}" data-action="surprise" style="left:${x}px;top:${y}px" title="${esc(S.name)}">${src ? `<img src="${src}" alt="">` : `<span>${S.icon}</span>`}<i>!</i></button>`;
      }
    }
    $("#cityLife").innerHTML = h;
  },

  /* ---------------- walkers ---------------- */
  desired(s) {
    const pop = Economy.totalPop(s), types = ["w_peasant", "w_peasant"];
    if (s.buildings.farm) types.push("w_farmer", "w_farmer");
    if (Military.homeCount(s) > 0) types.push("w_soldier", "w_soldier");
    if (s.buildings.market) types.push("w_merchant");
    if (s.buildings.warehouse || s.buildings.quarry > 1) types.push("w_cart");
    const n = Math.round(clamp(3 + pop / 10, 3, 18));
    return { n, types };
  },
  syncWalkers(s) {
    const layer = $("#cityWalk");
    if (!layer) return;
    const d = this.desired(s);
    const thief = s.surprise && s.surprise.type === "thief" ? s.surprise : null;
    // the thief is a special walker
    const tw = this.walkers.find((w) => w.thief);
    if (thief && !tw) this.addWalker(layer, "w_thief", { thief: thief.id, speed: 1.5 });
    if (!thief && tw) { tw.el.remove(); this.walkers.splice(this.walkers.indexOf(tw), 1); }
    const normal = this.walkers.filter((w) => !w.thief);
    while (normal.length < d.n) { const t = d.types[Math.floor(Math.random() * d.types.length)]; normal.push(this.addWalker(layer, t)); }
    while (normal.length > d.n) { const w = normal.pop(); w.el.remove(); this.walkers.splice(this.walkers.indexOf(w), 1); }
  },
  addWalker(layer, type, extra = {}) {
    const roads = this.roads(), [r, c] = roads[Math.floor(Math.random() * roads.length)];
    const el = document.createElement(extra.thief ? "button" : "div");
    el.className = "walker" + (type === "w_cart" ? " cart" : "") + (extra.thief ? " thief" : "");
    if (extra.thief) { el.dataset.action = "surprise"; el.title = "Catch the thief!"; }
    const src = AssetPipeline.hasArt(type) ? AssetPipeline.src(type) : null;
    el.innerHTML = src ? `<img src="${src}" alt="">` : `<span>${{ w_peasant: "🧑‍🌾", w_farmer: "👨‍🌾", w_soldier: "💂", w_merchant: "🧔", w_cart: "🛒", w_thief: "🦹" }[type] || "🚶"}</span>`;
    layer.appendChild(el);
    const w = { el, r, c, tr: r, tc: c, t: 1, pr: -1, pc: -1, speed: (type === "w_cart" ? 0.7 : 0.45 + Math.random() * 0.25) * (extra.speed || 1), pause: Math.random() * 3, ...extra };
    this.walkers.push(w);
    return w;
  },
  nextTile(w) {
    const M = CityMap, opts = [];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = w.r + dr, c = w.c + dc;
      if (r < 0 || c < 0 || r >= M.rows || c >= M.cols || !M.isRoad(r, c) || M.isPlaza(r, c)) continue;
      if (r === w.pr && c === w.pc) continue;
      opts.push([r, c]);
    }
    if (!opts.length) return [w.pr, w.pc];
    // prefer going straight
    const straight = opts.find(([r, c]) => r - w.r === w.r - w.pr && c - w.c === w.c - w.pc);
    return straight && Math.random() < 0.7 ? straight : opts[Math.floor(Math.random() * opts.length)];
  },
  loop() {
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      this.raf = requestAnimationFrame(frame);
      if (document.hidden || (typeof BattleUI !== "undefined" && BattleUI.b) || (typeof WorldUI !== "undefined" && WorldUI.open)) return;
      for (const w of this.walkers) {
        if (w.pause > 0) { w.pause -= dt; continue; }
        w.t += dt * w.speed;
        if (w.t >= 1) {
          w.pr = w.r; w.pc = w.c; w.r = w.tr; w.c = w.tc;
          const [nr, nc] = this.nextTile(w); w.tr = nr; w.tc = nc; w.t = 0;
          if (!w.thief && Math.random() < 0.06) w.pause = 1 + Math.random() * 3;
        }
        const [x0, y0] = CityMap.project(w.c + 0.5, w.r + 0.5), [x1, y1] = CityMap.project(w.tc + 0.5, w.tr + 0.5);
        const x = x0 + (x1 - x0) * w.t, y = y0 + (y1 - y0) * w.t;
        // walk on the right-hand side of the street
        const off = (w.tc - w.c) * 6 - (w.tr - w.r) * 6;
        w.el.style.transform = `translate(${x - 0}px, ${y + off * 0.3}px)`;
        w.el.style.zIndex = Math.round((w.r + w.tr + w.c + w.tc) / 2) + 21;
        w.el.classList.toggle("flip", x1 < x0);
      }
    };
    this.raf = requestAnimationFrame(frame);
  },
  maybeBirds() {
    const now = Date.now();
    if (this.nextBirds && now < this.nextBirds) return;
    this.nextBirds = now + 18000 + Math.random() * 25000;
    if (!this.nextBirdsInit) { this.nextBirdsInit = true; return; }
    const fx = $("#cityFx"); if (!fx) return;
    const b = document.createElement("div");
    b.className = "birds";
    b.style.top = 5 + Math.random() * 40 + "%";
    b.innerHTML = "<i></i><i></i><i></i><i></i>";
    fx.appendChild(b);
    setTimeout(() => b.remove(), 16000);
  },
  /** A resource icon that flies from the city to its counter in the top bar. */
  flyTo(fromEl, res) {
    const chip = $(`#res-${res}`);
    if (!fromEl || !chip) return;
    const a = fromEl.getBoundingClientRect(), b = chip.getBoundingClientRect();
    for (let k = 0; k < 5; k++) {
      const img = document.createElement("img");
      img.className = "flyicon"; img.src = AssetPipeline.src(RESOURCES[res].asset);
      img.style.left = a.left + a.width / 2 + "px"; img.style.top = a.top + a.height / 2 + "px";
      document.body.appendChild(img);
      const dx = b.left + 16 - (a.left + a.width / 2), dy = b.top + 14 - (a.top + a.height / 2);
      img.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx * 0.4 + (k - 2) * 18}px), calc(-50% + ${dy * 0.4 - 40}px)) scale(1.2)`, opacity: 1, offset: 0.35 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0.4 }], { duration: 750 + k * 60, easing: "ease-in", fill: "forwards" });
      setTimeout(() => img.remove(), 950 + k * 60);
    }
    setTimeout(() => { chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump"); }, 700);
  },
};

/* =====================================================================
   ADVISOR: a steward who teaches new players and gives timely advice
   ===================================================================== */
const TUTORIAL = [
  { say: "Welcome, my lord! I am Edmund, your steward. Let me show you around. Click the <b>Farm</b> on the map to see who works there.", done: (s) => HUD.open === "building" && s.city.slots[HUD.lot] && s.city.slots[HUD.lot].type === "farm" },
  { say: "Each figure is a worker. Click an empty <b>＋ seat</b> to put an idle citizen to work. Fill the farms first, a hungry city does not grow.", done: (s) => s.jobs.farmer >= 4 || Economy.unemployed(s) === 0 },
  { say: "Now let us grow. Close this window and click a glowing <b>＋ plot</b>, then build a <b>House</b>.", done: (s) => City.total(s, "house") >= 2 },
  { say: "See the bubbles over your buildings? Goods pile up there. <b>Click a bubble</b> to collect a bonus.", start: (s) => { const f = s.city.slots.find((x) => x && x.type === "farm" && x.level); if (f && !f.bag) f.bagAt = s.time; }, done: (s) => (s.stats.collected || 0) >= 1 },
  { say: "Raiders will come for our riches. Build a <b>Barracks</b> on a free plot so we can train soldiers.", done: (s) => City.total(s, "barracks") >= 1 },
  { say: "The King needs us. Open the <b>Campaign</b> (📖, hotkey 5) to see your first quest.", done: () => HUD.open === "campaign" },
  { say: "That is all you need to know. I will whisper advice when it matters. Long live Ironhold!", done: () => true, last: true },
];
const TIPS = [
  { id: "idle", check: (s) => Economy.unemployed(s) >= 5 && `${Economy.unemployed(s)} citizens are idle. Open a farm, quarry or camp and put them to work.` },
  { id: "starve", check: (s) => Economy.rates(s).net.food < 0 && s.resources.food < Economy.caps(s).food * 0.2 && "Our granaries are emptying! Assign more farmers or build another Farm." },
  { id: "full", check: (s) => { const c = Economy.caps(s); const k = ["gold", "stone", "wood", "food"].find((r) => s.resources[r] >= c[r] * 0.98); return k && `Our ${RESOURCES[k].name.toLowerCase()} stores are full and production is being wasted. Spend it, or build a ${k === "food" ? "Granary" : "Warehouse"}.`; } },
  { id: "builders", check: (s) => City.busy(s) === 0 && s.time > 120 && ["house", "farm", "quarry", "lumbercamp", "warehouse"].some((t) => !City.blocker(s, t)) && "Our builders are idle, my lord. There is something we can afford to build." },
  { id: "raid", check: (s) => s.raid && s.raid.phase === "approaching" && "Enemies approach! Prepare the army. You can lead the defense yourself when they reach the gates." },
  { id: "bags", check: (s) => s.city.slots.filter((x) => x && x.bag).length >= 4 && "Goods are piling up in the city. Click the bubbles over the buildings to collect them." },
  { id: "quest", check: (s) => (Quests.ready(s) || Daily.claimable(s)) && "A quest reward is waiting to be claimed (❗, hotkey 6)." },
  { id: "turnin", check: (s) => CAMPAIGN_ORDER.some((id) => Campaign.state(s, id) === "ready") && "A campaign quest is complete. Return to its quest giver to collect your reward (📖)." },
  { id: "gear", check: (s) => s.gear.bag.some((x) => !s.gear.equipped[x.slot]) && "You have new gear in the Armory (🎒, hotkey 0). Equip it!" },
  { id: "surprise", check: (s) => s.surprise && s.surprise.type === "chest" && "Look, a chest lies in the street. Click it before someone else does!" },
];
const Advisor = {
  shown: null, until: 0, cooldown: {}, lastTip: 0,
  muted() { try { return localStorage.getItem("ironhold_advisor") === "off"; } catch { return false; } },
  say(html, ms = 12000, key = "") {
    const box = $("#advisor");
    if (!box) return;
    if (this.shown === key && !box.classList.contains("hidden")) return;
    this.shown = key; this.until = Date.now() + ms;
    $("#advText").innerHTML = html;
    box.classList.remove("hidden");
    box.classList.remove("pop"); void box.offsetWidth; box.classList.add("pop");
  },
  hide() { const box = $("#advisor"); if (box) box.classList.add("hidden"); this.shown = null; },
  update(s) {
    const t = s.tutorial;
    if (t && !t.done) {
      const step = TUTORIAL[t.step];
      if (step) {
        if (t.started !== t.step) { t.started = t.step; if (step.start) step.start(s); }
        this.say(`${step.say}<div class="adv-step">${t.step + 1} / ${TUTORIAL.length} <button class="btn sm" data-action="tutSkip">Skip tutorial</button></div>`, 1e9, "tut" + t.step);
        if (step.done(s) && !step.last) { t.step++; Sound.play("levelup"); }
        if (step.last) { if (!this.lastTimer) this.lastTimer = setTimeout(() => { t.done = true; this.lastTimer = null; this.hide(); }, 9000); }
      }
      return;
    }
    if (this.shown && (Date.now() > this.until || HUD.open)) this.hide();
    if (HUD.open) return;
    if (this.muted() || Date.now() - this.lastTip < 45000 || (this.shown && !this.shown.startsWith("tip"))) return;
    for (const tip of TIPS) {
      if ((this.cooldown[tip.id] || 0) > Date.now()) continue;
      const msg = tip.check(s);
      if (msg) {
        this.cooldown[tip.id] = Date.now() + 300000;
        this.lastTip = Date.now();
        this.say(msg, 12000, "tip" + tip.id);
        return;
      }
    }
  },
};
