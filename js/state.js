"use strict";
/* =====================================================================
   2. GAME STATE SCHEMA
   ===================================================================== */
const SAVE_KEY = "ironhold_save_v1";
const GameState = {
  current: null,
  fresh() {
    return {
      version: 2,
      createdAt: Date.now(),
      lastTick: Date.now(),          // real-time timestamp used for offline progress
      time: 0,                       // game clock (seconds), advances in both online & offline ticks
      resources: { gold: 200, food: 150, stone: 100, steel: 0, wood: 150, horses: 0, crystals: 0, ale: 0, faith: 0, relics: 0 },
      buildings: { townhall: 1, farm: 1, quarry: 1, lumbercamp: 1, ranch: 0, magetower: 0, brewery: 0, steelworks: 0, house: 1, warehouse: 0, granary: 0, market: 0, barracks: 0, stables: 0, workshop: 0, temple: 0, academy: 0, walls: 0 },
      population: { citizens: 6, growth: 0, starve: 0 },
      jobs: { farmer: 3, miner: 1, lumberjack: 1, rancher: 0, arcanist: 0, brewer: 0, monk: 0, blacksmith: 0, recruit: 0 },
      army: Object.fromEntries(Object.keys(UNITS).map((k) => [k, 0])),
      queue: [],                     // [{unit, remaining, total}]
      expeditions: [],               // [{id, mission, units, startAt, endAt, tactic}]
      commander: { level: 1, xp: 0 },
      doctrine: "balanced",          // tactic used in automatic battles (and the default in battles you lead)
      morale: 100,
      desert: 0,
      raid: null,                    // {id, faction, army, power, mapType, arriveAt, deadline, phase}
      nextRaidAt: BALANCE.firstRaidAt,
      raidCount: 0,
      conquest: 1,
      conquestArmy: null,            // {stage, faction, army, map}
      battle: null,                  // a battle you are leading in person (saved so you can resume it)
      research: { levels: {}, current: null },   // current: {id, remaining, total}
      quests: [],                    // ids of claimed quests
      buffs: [],                     // [{id, until}] timed event bonuses
      offer: null,                   // a pending event offer {id, cost, get|unit,n, expires}
      nextEventAt: 600,
      world: null,                   // the world map (generated on first visit)
      campaign: { done: {}, led: {}, turned: {} },   // story quest progress
      gear: { equipped: { weapon: null, armor: null, helm: null, banner: null, relic: null }, bag: [] },
      tutorial: { step: 0, done: false },
      surprise: null, nextSurprise: 90,
      daily: null,
      climate: { season: 0, until: SEASON_LENGTH, nextDisaster: 1800 },
      rivals: null,                  // rival lords (see Rivals.fresh)
      captains: {},                  // captain id -> {hired, level, xp, assigned}
      city: null,                    // building lots: { slots: [{type, level, build?: {to, remaining, total}} | null] }
      veterancy: {},                 // unit type -> battle experience (veteran ranks)
      nextId: 1,
      log: [],                       // [{id, t, msg, type}]
      stats: { goldEarned: 0, built: 0, trained: 0, won: 0, lost: 0, fallen: 0, deserted: 0, starved: 0, relicsFound: 0, playSeconds: 0, peakPop: 6, raidsWon: 0, raidsLost: 0, enemiesSlain: 0, battlesLed: 0, battlesLedWon: 0, missionWins: {}, sitesRaided: 0, sitesCaptured: 0, blessings: 0, trades: 0, territoriesDefended: 0, territoriesLost: 0, collected: 0, surprises: 0 },
    };
  },
  /** A brand-new realm, with its starting buildings placed on lots. */
  newGame() { const s = this.fresh(); s.city = City.fromCounts(s.buildings); City.sync(s); s.rivals = Rivals.fresh(); return s; },
  /** Merge a loaded save onto a fresh template so older saves gain new fields. */
  hydrate(raw) {
    const base = this.fresh();
    const out = { ...base, ...raw };
    for (const k of ["resources", "buildings", "population", "jobs", "army", "commander", "stats"]) out[k] = { ...base[k], ...(raw[k] || {}) };
    for (const k of Object.keys(out.army)) if (!UNITS[k]) delete out.army[k];
    out.queue = Array.isArray(raw.queue) ? raw.queue.filter((q) => UNITS[q.unit]) : [];
    out.expeditions = Array.isArray(raw.expeditions) ? raw.expeditions.filter((e) => MISSIONS[e.mission] || String(e.mission).startsWith("node:")) : [];
    // saves from before wood existed get a lumber camp and some timber to start with
    if (!raw.buildings || raw.buildings.lumbercamp === undefined) { out.buildings.lumbercamp = Math.max(1, out.buildings.townhall * 2); out.resources.wood = Math.max(out.resources.wood, 500); }
    out.veterancy = { ...(raw.veterancy || {}) };
    const rc = raw.campaign || {};
    out.campaign = { done: { ...(rc.done || {}) }, led: { ...(rc.led || {}) }, turned: { ...(rc.turned || {}) } };
    const rg = raw.gear || {};
    out.gear = { equipped: { weapon: null, armor: null, helm: null, banner: null, relic: null, ...(rg.equipped || {}) }, bag: Array.isArray(rg.bag) ? rg.bag.filter((x) => x && GEAR_SLOTS[x.slot] && GEAR_RARITY[x.rarity]) : [] };
    // players who already beat a mission before the campaign existed can turn it in now
    // beating a later mission counts every earlier story quest as done (so veterans needn't replay the start)
    let last = -1;
    CAMPAIGN_ORDER.forEach((id, i) => { if ((out.stats.missionWins[id] || 0) > 0) last = i; });
    for (let i = 0; i <= last; i++) out.campaign.done[CAMPAIGN_ORDER[i]] = true;
    out.log = Array.isArray(raw.log) ? raw.log.slice(-120) : [];
    if (!TACTICS[out.doctrine]) out.doctrine = "balanced";
    out.research = { levels: { ...((raw.research && raw.research.levels) || {}) }, current: (raw.research && raw.research.current && TECHS[raw.research.current.id]) ? raw.research.current : null };
    out.quests = Array.isArray(raw.quests) ? raw.quests.slice() : [];
    out.buffs = Array.isArray(raw.buffs) ? raw.buffs.filter((b) => EVENTS[b.id]) : [];
    if (out.offer && !EVENTS[out.offer.id]) out.offer = null;
    out.stats.missionWins = { ...((raw.stats && raw.stats.missionWins) || {}) };
    out.climate = { ...base.climate, ...(raw.climate || {}) };
    if (out.climate.until < out.time) out.climate.until = out.time + SEASON_LENGTH;
    if (out.climate.nextDisaster < out.time) out.climate.nextDisaster = out.time + 1200;
    out.rivals = raw.rivals && typeof raw.rivals === "object" ? raw.rivals : null;
    out.captains = { ...(raw.captains || {}) };
    if (out.battle && (!out.battle.squads || !out.battle.tiles)) out.battle = null;
    if (out.battle) { try { Battle.repair(out.battle); } catch (e) { console.warn("Saved battle could not be repaired", e); out.battle = null; } }
    for (const k of Object.keys(out.resources)) if (!isFinite(out.resources[k])) out.resources[k] = 0;
    // building lots: older saves get their buildings laid out on lots
    if (raw.city && Array.isArray(raw.city.slots)) {
      out.city = { slots: raw.city.slots.map((x) => (x && BUILDINGS[x.type] ? x : null)) };
      if (!out.city.slots[0] || out.city.slots[0].type !== "townhall") out.city = City.fromCounts(out.buildings);
      while (out.city.slots.length < City.MAX_LOTS) out.city.slots.push(null);
    } else out.city = City.fromCounts(out.buildings);
    City.sync(out);
    if (!out.rivals) { out.rivals = Rivals.fresh(); for (const r of Object.values(out.rivals)) r.nextAttack += out.time; }
    for (const id of Object.keys(RIVAL_LORDS)) if (!out.rivals[id]) out.rivals[id] = Rivals.fresh()[id];
    // players who are past the basics skip the tutorial
    if (!raw.tutorial) out.tutorial = { step: 0, done: out.buildings.townhall >= 2 || (out.stats.built || 0) > 8 };
    if (out.surprise && !SURPRISES[out.surprise.type]) out.surprise = null;
    out.version = 5;
    return out;
  },
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return this.hydrate(JSON.parse(raw));
    } catch (e) { console.warn("Save could not be read, starting fresh", e); }
    return null;
  },
  save(s = this.current) {
    try {
      s.lastTick = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      return true;
    } catch (e) { console.error("Save failed", e); return false; }
  },
  exportString(s = this.current) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
  },
  importString(str) {
    str = str.trim();
    let obj;
    try { obj = JSON.parse(str); }
    catch { obj = JSON.parse(decodeURIComponent(escape(atob(str)))); }
    if (!obj || typeof obj !== "object" || !obj.resources || !obj.buildings) throw new Error("This doesn't look like an Ironhold save.");
    return this.hydrate(obj);
  },
};

function addLog(s, msg, type = "info") {
  s.log.push({ id: s.nextId++, t: Date.now(), msg, type });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}
