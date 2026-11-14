"use strict";
/* =====================================================================
   3. ECONOMY MODULE (production, consumption, caps, population)
   ===================================================================== */
const Economy = {
  employed(s) { return Object.keys(JOBS).reduce((a, k) => a + (k === "recruit" ? 0 : s.jobs[k] || 0), 0); },
  assigned(s) { return this.employed(s) + (s.jobs.recruit || 0); },
  unemployed(s) { return Math.max(0, s.population.citizens - this.assigned(s)); },
  housing(s) { const b = s.buildings; return b.townhall * 8 + b.house * 5 + b.barracks * 8; },
  totalPop(s) { return s.population.citizens + Military.soldierCount(s); },
  jobSlots(s, job) { return s.buildings[JOBS[job].building] * JOBS[job].slots; },

  storageMultiplier(s) { return Math.pow(BALANCE.storageGrowth, s.buildings.townhall - 1) * (1 + 0.15 * Research.lvl(s, "logistics")); },
  caps(s) {
    const b = s.buildings, m = this.storageMultiplier(s);
    return {
      gold:  Math.floor((1000 + b.warehouse * 600) * m),
      food:  Math.floor((800 + b.granary * 700) * m),
      stone: Math.floor((1000 + b.warehouse * 600) * m),
      steel: Math.floor((500 + b.warehouse * 300) * m),
      wood:  Math.floor((1000 + b.warehouse * 600) * m),
      horses: Math.floor((40 + b.ranch * 60 + b.stables * 40) * m),
      crystals: Math.floor((30 + b.magetower * 60) * m),
      ale: Math.floor((200 + b.brewery * 300) * m),
      faith: Math.floor((100 + b.temple * 200) * m),
      relics: Infinity,
    };
  },
  relicMultiplier(s) {
    const lore = Research.lvl(s, "relicLore");
    return 1 + Math.min(BALANCE.relicBonusCap + 0.2 * lore, s.resources.relics * (BALANCE.relicBonus + 0.005 * lore));
  },
  multiplier(s) { return Math.pow(BALANCE.prodGrowth, s.buildings.townhall - 1) * this.relicMultiplier(s); },

  /**
   * Per-second production & consumption.
   * dt is only used to work out how efficient Blacksmiths are when stone runs out.
   */
  rates(s, dt = 1) {
    const j = s.jobs, m = this.multiplier(s), cit = s.population.citizens, b = s.buildings;
    const up = Military.upkeep(s);
    const prod = {
      gold: (b.townhall * 1.0 + b.market * 3 + cit * BALANCE.goldPerCitizen + this.employed(s) * BALANCE.goldPerWorker) * m * (1 + 0.05 * b.market) * (1 + 0.1 * Research.lvl(s, "taxation")) * (Events.active(s, "fair") ? 1.3 : 1),
      food: j.farmer * 1.1 * m * (1 + 0.1 * Research.lvl(s, "agriculture")) * (Events.active(s, "harvest") ? 1.5 : 1) * Climate.season(s).food * (Events.active(s, "drought") ? 0.5 : 1) * (Events.active(s, "flood") ? 0.4 : 1),
      stone: j.miner * 0.75 * m * (1 + 0.1 * Research.lvl(s, "masonry")),
      steel: j.blacksmith * 0.35 * m * (1 + 0.1 * Research.lvl(s, "metallurgy")),
      wood: (j.lumberjack || 0) * 0.8 * m * Climate.season(s).wood * (Events.active(s, "wildfire") ? 0.3 : 1),
      horses: (j.rancher || 0) * 0.08 * m,
      crystals: (j.arcanist || 0) * 0.03 * m,
      ale: (j.brewer || 0) * 0.25 * m,
      faith: (b.temple * 0.15 + (j.monk || 0) * 0.06) * m,
      relics: 0,
    };
    // territories on the world map pay out every second
    for (const [r, v] of Object.entries(World.income(s))) prod[r] = (prod[r] || 0) + v;
    for (const [r, v] of Object.entries(Rivals.tribute(s))) prod[r] = (prod[r] || 0) + v;
    const soldiers = Military.soldierCount(s);
    const cons = { wood: 0, horses: 0, crystals: 0, faith: 0, ale: s.resources.ale > 0 || (j.brewer || 0) > 0 ? soldiers * 0.005 : 0, gold: up.gold + (j.arcanist || 0) * 0.5, food: cit * BALANCE.foodPerCitizen * (1 - 0.05 * Research.lvl(s, "medicine")) + up.food * Climate.season(s).upkeep * (Events.active(s, "blizzard") ? 1.5 : 1) + (j.rancher || 0) * 0.3 + (j.brewer || 0) * 0.4, stone: j.blacksmith * 0.5, steel: 0, relics: 0 };
    // Blacksmiths can only smelt the stone that exists.
    let smeltEff = 1;
    if (cons.stone > 0) {
      const avail = s.resources.stone + prod.stone * dt;
      smeltEff = clamp(avail / (cons.stone * dt), 0, 1);
      cons.stone *= smeltEff; prod.steel *= smeltEff;
    }
    const net = {};
    for (const r of Object.keys(prod)) net[r] = prod[r] - cons[r];
    return { prod, cons, net, smeltEff, upkeep: up };
  },

  /** Add resources while respecting storage caps. Returns what was actually added. */
  grant(s, bundle, mult = 1) {
    const caps = this.caps(s), got = {};
    for (const [r, v] of Object.entries(bundle)) {
      const before = s.resources[r];
      s.resources[r] = Math.max(before, Math.min(caps[r], before + Math.floor(v * mult)));
      got[r] = Math.max(0, s.resources[r] - before);
    }
    return got;
  },
  canAfford(s, cost) { return Object.entries(cost).every(([r, v]) => s.resources[r] >= v); },
  /** The first resource whose cost can never fit in current storage (or null). */
  overCap(s, cost) {
    const caps = this.caps(s);
    for (const [r, v] of Object.entries(cost)) if (v > caps[r]) return r;
    return null;
  },
  pay(s, cost) { for (const [r, v] of Object.entries(cost)) s.resources[r] -= v; },

  buildingCost(id, level) {
    const def = BUILDINGS[id];
    const exp = id === "townhall" ? level - 1 : level;
    const out = {};
    for (const [r, v] of Object.entries(def.base)) out[r] = Math.ceil(v * Math.pow(def.mult, exp));
    return out;
  },
  buildingMax(s, id) {
    const def = BUILDINGS[id];
    if (def.max) return def.max;
    return s.buildings.townhall * (def.maxPerTH || 5);
  },
  /** Why a building can't be built right now (null if it can). Construction goes through City (lots, builders, timers). */
  buildBlocker(s, id) { return s.city ? City.blocker(s, id) : this.legacyBlocker(s, id); },
  legacyBlocker(s, id) {
    const def = BUILDINGS[id], lvl = s.buildings[id];
    if (lvl >= this.buildingMax(s, id)) return id === "townhall" ? "Max level reached" : `Upgrade the Town Hall to raise the limit (${this.buildingMax(s, id)})`;
    if (def.popReq) {
      const need = def.popReq(lvl);
      if (this.totalPop(s) < need) return `Requires ${need} population`;
    }
    const cost = this.buildingCost(id, lvl);
    const over = this.overCap(s, cost);
    if (over) return `${RESOURCES[over].name} storage too small (${fmt(this.caps(s)[over])}). Build ${over === "food" ? "Granaries" : "Warehouses"}`;
    if (!this.canAfford(s, cost)) return "Not enough resources";
    return null;
  },
  build(s, id) { return City.start(s, id); },
  legacyBuild(s, id) {
    if (this.legacyBlocker(s, id)) return false;
    const lvl = s.buildings[id];
    this.pay(s, this.buildingCost(id, lvl));
    s.buildings[id]++;
    s.stats.built++;
    const name = BUILDINGS[id].name;
    addLog(s, id === "townhall" ? `The Town Hall has been raised to level ${s.buildings[id]}!` : `Built ${name} (level ${s.buildings[id]}).`, "build");
    return true;
  },

  assign(s, job, delta) {
    const cur = s.jobs[job];
    const slotsFree = this.jobSlots(s, job) - cur;
    if (delta > 0) delta = Math.max(0, Math.min(delta, slotsFree, this.unemployed(s)));
    else delta = Math.max(delta, -cur);
    s.jobs[job] = cur + delta;
    return delta;
  },

  /** Remove one citizen (starvation, raids): unemployed first, then the largest workforce. */
  removeCitizen(s) {
    if (s.population.citizens <= 0) return false;
    if (this.unemployed(s) <= 0) {
      const job = Object.keys(s.jobs).filter((k) => s.jobs[k] > 0).sort((a, b) => s.jobs[b] - s.jobs[a])[0];
      if (job) s.jobs[job]--;
    }
    s.population.citizens--;
    return true;
  },

  growthPerSecond(s) {
    const caps = this.caps(s);
    if (this.totalPop(s) >= this.housing(s) || s.resources.food <= 0) return 0;
    const r = this.rates(s);
    const fill = clamp(s.resources.food / caps.food, 0, 1);
    const surplus = r.net.food >= 0 ? 1 : 0.25;
    return 0.06 * (0.5 + fill * 1.5) * surplus * (1 + 0.15 * (s.buildings.townhall - 1)) * (1 + 0.2 * Research.lvl(s, "medicine")) * Climate.season(s).growth;
  },

  step(s, dt) {
    const r = this.rates(s, dt);
    const caps = this.caps(s);
    const shortage = {};
    for (const res of STORABLE) {
      let v = s.resources[res] + r.net[res] * dt;
      if (v < 0) { shortage[res] = true; v = 0; }
      // A loot windfall can sit above the cap; production then just stops adding.
      s.resources[res] = r.net[res] > 0 ? Math.max(s.resources[res], Math.min(caps[res], v)) : v;
    }
    s.stats.goldEarned += r.prod.gold * dt;

    // ---- Population growth / starvation
    const pop = s.population;
    if (shortage.food) {
      pop.growth = 0;
      pop.starve += dt;
      while (pop.starve >= BALANCE.starveInterval && pop.citizens > 0) {
        pop.starve -= BALANCE.starveInterval;
        this.removeCitizen(s);
        s.stats.starved++;
        addLog(s, "A citizen has starved to death. Get more farmers working!", "bad");
      }
    } else {
      pop.starve = 0;
      pop.growth += this.growthPerSecond(s) * dt;
      while (pop.growth >= 1) {
        pop.growth -= 1;
        if (this.totalPop(s) >= this.housing(s)) { pop.growth = 0; break; }
        pop.citizens++;
        if (pop.citizens % 25 === 0) addLog(s, `Your city has grown to ${pop.citizens} citizens.`, "good");
      }
    }
    s.stats.peakPop = Math.max(s.stats.peakPop, this.totalPop(s));
    return shortage;
  },

  /**
   * Self-test for the "can't afford the Town Hall because storage is too small" bug: with every building
   * at its limit for a Town Hall level, every next upgrade must fit in storage. Returns a list of problems.
   */
  verifyStorage() {
    const problems = [];
    for (let th = 1; th <= BUILDINGS.townhall.max; th++) {
      const s = GameState.fresh();
      s.buildings.townhall = th;
      for (const id of Object.keys(BUILDINGS)) if (id !== "townhall") s.buildings[id] = this.buildingMax(s, id);
      for (const id of Object.keys(BUILDINGS)) {
        const lvl = id === "townhall" ? th : this.buildingMax(s, id) - 1;
        if (id === "townhall" && th >= BUILDINGS.townhall.max) continue;
        const probe = { ...s, buildings: { ...s.buildings, [id]: lvl } };
        const over = this.overCap(probe, this.buildingCost(id, lvl));
        if (over) problems.push(`TH${th} ${id} lvl ${lvl}: ${over}`);
      }
    }
    return problems;
  },
};
