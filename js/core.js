"use strict";
/* =====================================================================
   0. UTILITIES
   ===================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const randInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmt(n) {
  if (!isFinite(n)) return "∞";
  const neg = n < 0; const a = Math.abs(n);
  let out;
  if (a < 1000) out = a < 100 && a % 1 !== 0 ? (Math.floor(a * 10) / 10).toString() : Math.floor(a).toString();
  else {
    const units = ["K", "M", "B", "T", "Qa", "Qi"];
    let i = -1, v = a;
    while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
    out = (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v).toString()) + units[i];
  }
  return (neg ? "-" : "") + out;
}
const fmtInt = (n) => Math.floor(n).toLocaleString("en-US");
const anA = (w, cap) => (/^[aeiou]/i.test(w) ? (cap ? "An " : "an ") : (cap ? "A " : "a ")) + w;
/** "1 Relic", "3 Relics", "2 Footmen", "1 Footman" */
function plural(name, n) {
  if (Math.round(n) === 1) return name.replace(/s$/, "");
  if (/man$/.test(name)) return name.replace(/man$/, "men");
  return /s$/.test(name) ? name : name + "s";
}
const amount = (r, v) => `${fmt(v)} ${r === "relics" && Math.round(v) === 1 ? "Relic" : RESOURCES[r].name}`;
function fmtRate(r) {
  const a = Math.abs(r);
  const s = a < 10 ? a.toFixed(2) : a < 1000 ? a.toFixed(1) : fmt(a);
  return (r >= 0 ? "+" : "−") + s;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/* =====================================================================
   1. STATIC GAME DATA (definitions / formulas)
   ===================================================================== */
const RESOURCES = {
  gold:   { name: "Gold",   asset: "res_gold",   color: "var(--gold)" },
  food:   { name: "Food",   asset: "res_food",   color: "var(--food)" },
  stone:  { name: "Stone",  asset: "res_stone",  color: "var(--stone)" },
  steel:  { name: "Steel",  asset: "res_steel",  color: "var(--steel)" },
  wood:   { name: "Wood",   asset: "res_wood",   color: "#c58b4f" },
  horses: { name: "Horses", asset: "res_horses", color: "#d9a066" },
  crystals: { name: "Crystals", asset: "res_crystals", color: "#5fd4f0" },
  ale:    { name: "Ale",    asset: "res_ale",    color: "#e8b04a" },
  faith:  { name: "Faith",  asset: "res_faith",  color: "#f3e6a0" },
  relics: { name: "Relics", asset: "res_relics", color: "var(--relics)" },
};
const STORABLE = ["gold", "food", "stone", "steel", "wood", "horses", "crystals", "ale", "faith"];

/*
 * Cost formula: Cost = BaseCost * mult ^ Level (Level = current level; the Town Hall starts at 1, so it uses Level-1).
 * Each building's level limit is Town Hall level × maxPerTH. Storage grows ×1.4 per Town Hall level,
 * so the most expensive allowed upgrade always fits in fully built storage (the self-test checks this on boot).
 */
const BUILDINGS = {
  townhall:   { name: "Town Hall",      asset: "b_townhall",   base: { gold: 400, stone: 300, steel: 40 },   mult: 1.9,  max: 15,
                desc: "Seat of power. Each level: +1 Gold/s, +8 housing, +10% production, ×1.4 storage, and higher limits for other buildings.",
                popReq: (lvl) => 15 * lvl },
  farm:       { name: "Farm",           asset: "b_farm",       base: { gold: 40, wood: 15 },   mult: 1.15, maxPerTH: 5, desc: "Adds 4 Farmer jobs. Each Farmer grows food." },
  quarry:     { name: "Quarry",         asset: "b_quarry",     base: { gold: 50, food: 25 },    mult: 1.15, maxPerTH: 5, desc: "Adds 3 Miner jobs. Each Miner cuts stone." },
  steelworks: { name: "Steelworks",     asset: "b_steelworks", base: { gold: 120, stone: 80 },  mult: 1.16, maxPerTH: 4, desc: "Adds 2 Blacksmith jobs. Blacksmiths smelt stone into steel.", popReq: () => 10 },
  lumbercamp: { name: "Lumber Camp",    asset: "b_lumbercamp", base: { gold: 40, stone: 10 },   mult: 1.15, maxPerTH: 5, desc: "Adds 3 Lumberjack jobs. Each Lumberjack cuts wood." },
  house:      { name: "House",          asset: "b_house",      base: { gold: 30, wood: 25 },   mult: 1.08, maxPerTH: 8, desc: "Shelter for 5 more people." },
  warehouse:  { name: "Warehouse",      asset: "b_warehouse",  base: { gold: 80, stone: 60 },   mult: 1.15, maxPerTH: 5, desc: "+600 Gold, +600 Stone and +300 Steel base storage (×Town Hall storage bonus)." },
  granary:    { name: "Granary",        asset: "b_granary",    base: { gold: 60, stone: 40 },   mult: 1.15, maxPerTH: 5, desc: "+700 Food base storage (×Town Hall storage bonus)." },
  brewery:    { name: "Brewery",        asset: "b_brewery",    base: { gold: 150, wood: 120, food: 100 }, mult: 1.2, maxPerTH: 2, desc: "Adds 2 Brewer jobs that turn food into Ale. Well-supplied soldiers fight +5% harder and recover morale 50% faster.", popReq: () => 20 },
  market:     { name: "Market",         asset: "b_market",     base: { gold: 150, stone: 100 }, mult: 1.2,  maxPerTH: 2, desc: "+3 Gold/s and +5% Gold income per level.", popReq: () => 20 },
  barracks:   { name: "Barracks",       asset: "b_barracks",   base: { gold: 150, wood: 100, stone: 60, steel: 15 }, mult: 1.22, maxPerTH: 2, desc: "+10 Recruit jobs, +8 housing, +10% training speed. Unlocks infantry & archers, and more expedition slots.", popReq: () => 12 },
  stables:    { name: "Stables",        asset: "b_stables",    base: { gold: 250, food: 200, wood: 150 }, mult: 1.3, maxPerTH: 1, desc: "Unlocks Light Cavalry (Lv 1), Horse Archers (Lv 2) and Knights (Lv 3). Cavalry needs Horses.", popReq: () => 30 },
  ranch:      { name: "Horse Ranch",    asset: "b_ranch",      base: { gold: 200, wood: 150, food: 200 }, mult: 1.25, maxPerTH: 2, desc: "Adds 2 Rancher jobs. Ranchers breed horses for your cavalry (they eat extra food).", popReq: () => 30 },
  workshop:   { name: "Siege Workshop", asset: "b_workshop",   base: { gold: 300, wood: 300, steel: 60 }, mult: 1.3, maxPerTH: 1, desc: "Unlocks Siege Engineers (Lv 1), Ballistae (Lv 2) and Catapults (Lv 3).", popReq: () => 40 },
  magetower:  { name: "Mage Tower",     asset: "b_magetower",  base: { gold: 500, stone: 400, wood: 200 }, mult: 1.3, maxPerTH: 1, desc: "Adds 2 Arcanist jobs that distill Mana Crystals (they cost gold). Unlocks Battle Mages (Lv 1) and Griffon Riders (Lv 3).", popReq: () => 60 },
  temple:     { name: "Temple",         asset: "b_temple",     base: { gold: 400, stone: 350 }, mult: 1.3, maxPerTH: 1, desc: "Unlocks Battle Priests (Lv 1) and Paladins (Lv 3). +0.2 morale/s and +0.15 Faith/s per level, plus 2 Monk jobs. Spend Faith on Blessings.", popReq: () => 50 },
  academy:    { name: "Academy",        asset: "b_academy",    base: { gold: 300, stone: 250 }, mult: 1.3, maxPerTH: 1, desc: "Unlocks Research. Higher levels unlock advanced techs and research 15% faster per level.", popReq: () => 25 },
  walls:      { name: "City Walls",     asset: "b_walls",      base: { gold: 100, stone: 200, wood: 50 }, mult: 1.25, maxPerTH: 1, desc: "Stone walls on the battlefield when raiders attack. Higher levels mean stronger walls with fewer gaps.", popReq: () => 15 },
};

const JOBS = {
  farmer:     { name: "Farmers",     asset: "job_farmer",     building: "farm",       slots: 4,  desc: "+1.1 Food/s each" },
  miner:      { name: "Miners",      asset: "job_miner",      building: "quarry",     slots: 3,  desc: "+0.75 Stone/s each" },
  lumberjack: { name: "Lumberjacks", asset: "job_lumberjack", building: "lumbercamp", slots: 3, desc: "+0.8 Wood/s each" },
  rancher:    { name: "Ranchers",    asset: "job_rancher",    building: "ranch",      slots: 2, desc: "+0.08 Horses/s each (eats 0.3 extra Food/s)" },
  arcanist:   { name: "Arcanists",   asset: "job_arcanist",   building: "magetower",  slots: 2, desc: "+0.03 Crystals/s each (costs 0.5 Gold/s)" },
  brewer:     { name: "Brewers",     asset: "job_brewer",     building: "brewery",    slots: 2, desc: "−0.4 Food → +0.25 Ale/s each" },
  monk:       { name: "Monks",       asset: "job_monk",       building: "temple",     slots: 2, desc: "+0.06 Faith/s each" },
  blacksmith: { name: "Blacksmiths", asset: "job_blacksmith", building: "steelworks", slots: 2,  desc: "−0.5 Stone → +0.35 Steel/s each" },
  recruit:    { name: "Recruits",    asset: "job_recruit",    building: "barracks",   slots: 10, desc: "Drilled citizens. Each unit you train uses up one Recruit." },
};

/*
 * Units. Battle stats: hp/atk/def per soldier, rng (1 = melee), mv (movement points), cls (inf/ranged/cav/siege/support).
 * Traits: antiCav, charge, armorPierce, breach (wall damage), vsBig, heal, minRng.
 * req: building levels needed to train the unit.
 */
const UNITS = {
  militia:   { name: "Militia",         asset: "u_militia",  cost: { gold: 25, food: 10 },               time: 5,  upkeep: { food: 0.10, gold: 0.02 }, req: { barracks: 1 },
               hp: 10, atk: 3,  def: 1, rng: 1, mv: 3, cls: "inf", desc: "Cheap levy troops. Good for soaking up hits." },
  spearman:  { name: "Spearman",        asset: "u_spearman", cost: { gold: 35, steel: 4 },               time: 7,  upkeep: { food: 0.10, gold: 0.04 }, req: { barracks: 2 },
               hp: 12, atk: 4,  def: 3, rng: 1, mv: 3, cls: "inf", antiCav: true, desc: "Deals ×2 damage to cavalry. When braced, strikes back at full strength." },
  archer:    { name: "Archer",          asset: "u_archer",   cost: { gold: 40, wood: 8, steel: 3 },               time: 8,  upkeep: { food: 0.12, gold: 0.05 }, req: { barracks: 2 },
               hp: 8,  atk: 4,  def: 1, rng: 4, mv: 3, cls: "ranged", desc: "Shoots 4 tiles (5 from hills or walls)." },
  footman:   { name: "Footman",         asset: "u_footman",  cost: { gold: 60, steel: 15 },              time: 10, upkeep: { food: 0.15, gold: 0.08 }, req: { barracks: 2 },
               hp: 16, atk: 6,  def: 4, rng: 1, mv: 3, cls: "inf", desc: "Disciplined chainmail infantry. The core of the battle line." },
  crossbow:  { name: "Crossbowman",     asset: "u_crossbow", cost: { gold: 70, steel: 20 },              time: 12, upkeep: { food: 0.14, gold: 0.10 }, req: { barracks: 4 },
               hp: 10, atk: 7,  def: 2, rng: 3, mv: 2, cls: "ranged", armorPierce: true, desc: "Bolts ignore 40% of armor. Slow to move." },
  pikeman:   { name: "Pikeman",         asset: "u_pikeman",  cost: { gold: 80, steel: 25 },              time: 12, upkeep: { food: 0.15, gold: 0.10 }, req: { barracks: 5 },
               hp: 15, atk: 6,  def: 5, rng: 1, mv: 2, cls: "inf", antiCav: true, desc: "A wall of pikes: ×2 damage to cavalry and very tough." },
  longbow:   { name: "Longbowman",      asset: "u_longbow",  cost: { gold: 90, wood: 15, steel: 8 },              time: 14, upkeep: { food: 0.14, gold: 0.12 }, req: { barracks: 6 },
               hp: 10, atk: 6,  def: 1, rng: 5, mv: 3, cls: "ranged", desc: "Range 5 (6 from high ground). Deadly behind a wall." },
  lightcav:  { name: "Light Cavalry",   asset: "u_lightcav", cost: { gold: 110, steel: 20, horses: 1 },   time: 14, upkeep: { food: 0.25, gold: 0.15 }, req: { stables: 1 },
               hp: 18, atk: 6,  def: 2, rng: 1, mv: 6, cls: "cav", charge: true, desc: "Fast flanker. +50% vs missile units. Charges after moving 3+ tiles." },
  horsearcher:{ name: "Horse Archer",   asset: "u_horsearcher", cost: { gold: 130, wood: 10, horses: 1 }, time: 16, upkeep: { food: 0.25, gold: 0.15 }, req: { stables: 2 },
               hp: 14, atk: 5,  def: 1, rng: 3, mv: 6, cls: "ranged", mounted: true, desc: "Mounted archer: shoots 3 tiles and moves 6. Hit-and-run." },
  knight:    { name: "Knight",          asset: "u_knight",   cost: { gold: 200, steel: 60, horses: 2 },   time: 25, upkeep: { food: 0.30, gold: 0.30 }, req: { stables: 3 },
               hp: 32, atk: 11, def: 6, rng: 1, mv: 5, cls: "cav", charge: true, desc: "Elite heavy cavalry with a devastating charge." },
  priest:    { name: "Battle Priest",   asset: "u_priest",   cost: { gold: 150, food: 50 },              time: 18, upkeep: { food: 0.12, gold: 0.20 }, req: { temple: 1 },
               hp: 10, atk: 2,  def: 2, rng: 2, mv: 3, cls: "support", heal: 3, desc: "Each turn, heals squads within 2 tiles by 3 HP per priest." },
  mage:      { name: "Battle Mage",     asset: "u_mage",     cost: { gold: 180, crystals: 2 },        time: 20, upkeep: { food: 0.12, gold: 0.30 }, req: { magetower: 1 },
               hp: 9,  atk: 9,  def: 1, rng: 4, mv: 3, cls: "ranged", splash: 0.5, desc: "Fireballs: range 4, and enemy squads next to the target take 50% splash damage." },
  siege:     { name: "Siege Engineer",  asset: "u_siege",    cost: { gold: 100, wood: 60, steel: 30 },  time: 20, upkeep: { food: 0.15, gold: 0.15 }, req: { workshop: 1 },
               hp: 14, atk: 5,  def: 2, rng: 2, mv: 2, cls: "siege", breach: true, desc: "Deals ×4 damage to walls. Needed against fortresses." },
  ballista:  { name: "Ballista",        asset: "u_ballista", cost: { gold: 160, wood: 120, steel: 30 }, time: 25, upkeep: { food: 0.15, gold: 0.25 }, req: { workshop: 2 },
               hp: 20, atk: 12, def: 2, rng: 5, minRng: 2, mv: 1, cls: "siege", vsBig: true, slayer: true, desc: "Giant-slayer: ×2.5 damage to trolls, giants, demons and dragons. Range 2–5." },
  catapult:  { name: "Catapult",        asset: "u_catapult", cost: { gold: 300, wood: 200, stone: 150, steel: 80 }, time: 35, upkeep: { food: 0.20, gold: 0.40 }, req: { workshop: 3 },
               hp: 40, atk: 18, def: 1, rng: 6, minRng: 2, mv: 1, cls: "siege", breach: true, vsBig: true, desc: "Range 2–6. Smashes walls and deals ×1.6 damage to giants and monsters." },
  griffon:   { name: "Griffon Rider",   asset: "u_griffon",  cost: { gold: 400, crystals: 6, food: 100 }, time: 40, upkeep: { food: 0.40, gold: 0.50 }, req: { magetower: 3, stables: 5 },
               hp: 30, atk: 12, def: 5, rng: 1, mv: 7, cls: "cav", flying: true, charge: true, desc: "Flies over mountains, rivers and walls. Charges from the sky." },
  paladin:   { name: "Paladin",         asset: "u_paladin",  cost: { gold: 450, steel: 150, food: 60 },  time: 40, upkeep: { food: 0.35, gold: 0.50 }, req: { temple: 3, barracks: 8 },
               hp: 34, atk: 12, def: 9, rng: 1, mv: 3, cls: "inf", heal: 1, desc: "Holy champion. Very hard to kill, and heals nearby allies." },
};

/*
 * Expeditions. army = the enemy force that defends the location. map = the battlefield terrain.
 * fortified = enemy walls (bring siege). The "conquest" entry is endless and gets stronger each stage you win.
 */
const MISSIONS = {
  bandits:    { name: "Bandit Camp",          asset: "m_bandits",    map: "forest",   duration: 60,    level: 1,  xp: 15,   army: { bandit: 6, bandit_archer: 3 },                 loot: { gold: [150, 260], steel: [8, 20] } },
  goblins:    { name: "Goblin Warrens",       asset: "m_goblins",    map: "hills",    duration: 180,   level: 2,  xp: 35,   army: { goblin: 14, wolf_rider: 4 },                   loot: { gold: [320, 520], steel: [30, 70], food: [80, 160] }, relic: { chance: 0.1, n: [1, 1] } },
  abbey:      { name: "Haunted Abbey",        asset: "m_abbey",      map: "swamp",    duration: 420,   level: 3,  xp: 70,   army: { skeleton: 16, necromancer: 2 },                loot: { gold: [500, 800], stone: [250, 450] }, relic: { chance: 0.3, n: [1, 1] } },
  orcs:       { name: "Orc Stronghold",       asset: "m_orcs",       map: "plains",   duration: 900,   level: 5,  xp: 150,  army: { orc: 16, orc_archer: 8, berserker: 4 },        fortified: 3, loot: { gold: [1100, 1600], steel: [180, 280] }, relic: { chance: 0.5, n: [1, 2] } },
  trollbridge:{ name: "Troll Bridge",         asset: "m_trolls",     map: "river",    duration: 1200,  level: 6,  xp: 220,  army: { troll: 6, ogre: 3, goblin: 24 },               loot: { gold: [1800, 2600], stone: [800, 1200], steel: [200, 320] }, relic: { chance: 0.5, n: [1, 2] } },
  giants:     { name: "Frostfang Pass",       asset: "m_giants",     map: "mountain", duration: 1800,  level: 7,  xp: 300,  army: { frost_giant: 4, wolf_rider: 16, orc: 12 },     loot: { gold: [2800, 4000], steel: [400, 650] }, relic: { chance: 0.7, n: [1, 3] } },
  necropolis: { name: "The Necropolis",       asset: "m_necropolis", map: "swamp",    duration: 3600,  level: 9,  xp: 600,  army: { skeleton: 60, wraith: 12, necromancer: 8 },    fortified: 5, loot: { gold: [7000, 10000], stone: [3000, 5000], steel: [1000, 1500] }, relic: { chance: 1, n: [3, 6] } },
  dragon:     { name: "Dragon's Lair",        asset: "m_dragon",     map: "valley",   duration: 2700,  level: 10, xp: 700,  army: { dragon: 1, drake: 4 },                         loot: { gold: [4500, 6500], steel: [600, 900] }, relic: { chance: 1, n: [3, 5] } },
  citadel:    { name: "Shadow Citadel",       asset: "m_citadel",    map: "mountain", duration: 5400,  level: 12, xp: 1000, army: { dark_knight: 20, demon: 6, necromancer: 10 },   fortified: 7, loot: { gold: [11000, 15000], steel: [1800, 2600] }, relic: { chance: 1, n: [6, 10] } },
  abyss:      { name: "Abyssal Gate",         asset: "m_abyss",      map: "valley",   duration: 7200,  level: 15, xp: 1800, army: { demon: 24, dark_knight: 20, drake: 8 },        loot: { gold: [22000, 30000], steel: [4000, 6000] }, relic: { chance: 1, n: [10, 15] } },
  titan:      { name: "Throne of the Storm Titan", asset: "m_titan", map: "mountain", duration: 10800, level: 18, xp: 3500, army: { titan: 1, frost_giant: 10, demon: 12 },       fortified: 9, loot: { gold: [50000, 70000], steel: [9000, 12000] }, relic: { chance: 1, n: [20, 30] } },
  conquest:   { name: "Endless Conquest",     asset: "m_conquest",   map: "plains",   duration: 900,   level: 6,  xp: 120,  army: null, loot: null, endless: true },
};

const BALANCE = {
  tickSeconds: 1,
  autosaveMs: 5000,
  offlineCapSeconds: 12 * 3600,
  offlineStepSeconds: 10,
  foodPerCitizen: 0.1,
  goldPerCitizen: 0.06,
  goldPerWorker: 0.06,
  starveInterval: 10,
  desertInterval: 6,
  relicBonus: 0.02,
  relicBonusCap: 2.0,
  maxQueue: 50,
  storageGrowth: 1.4,     // storage multiplier per Town Hall level
  prodGrowth: 1.1,        // production multiplier per Town Hall level
  firstRaidAt: 1500,      // game seconds before the first raid can appear
  raidWarning: 180,       // seconds between "spotted" and "at the gates"
  raidDecision: 90,       // seconds you have to choose how to defend before your captains fight on their own
  manualLootBonus: 1.25,
};

/*
 * Research (needs an Academy). One project at a time. Cost = base × 1.6^level, time = base × 1.45^level ÷ Academy speed.
 * tier = Academy level needed.
 */
const TECHS = {
  agriculture:  { name: "Crop Rotation",    icon: "🌾", tier: 1, max: 10, base: { gold: 300, food: 200 },   time: 60,  desc: "+10% Food production per level." },
  masonry:      { name: "Masonry",          icon: "🪨", tier: 1, max: 10, base: { gold: 300, stone: 150 },  time: 60,  desc: "+10% Stone production per level." },
  taxation:     { name: "Taxation",         icon: "🪙", tier: 1, max: 10, base: { gold: 400, stone: 100 },  time: 75,  desc: "+10% Gold income per level." },
  drill:        { name: "Military Drill",   icon: "⚔️", tier: 1, max: 10, base: { gold: 500, steel: 50 },   time: 90,  desc: "+5% attack for all your soldiers per level." },
  training:     { name: "Drill Sergeants",  icon: "📣", tier: 1, max: 10, base: { gold: 400, food: 200 },   time: 75,  desc: "+15% training speed per level." },
  metallurgy:   { name: "Metallurgy",       icon: "⚙️", tier: 2, max: 10, base: { gold: 600, steel: 100 },  time: 120, desc: "+10% Steel production per level." },
  logistics:    { name: "Logistics",        icon: "📦", tier: 2, max: 10, base: { gold: 500, stone: 400 },  time: 120, desc: "+15% storage for every resource per level." },
  medicine:     { name: "Medicine",         icon: "⚕️", tier: 2, max: 5,  base: { gold: 500, food: 500 },   time: 150, desc: "+20% population growth and −5% food eaten per citizen, per level. Softens plagues." },
  plate:        { name: "Plate Armor",      icon: "🛡️", tier: 2, max: 10, base: { gold: 700, steel: 150 },  time: 150, desc: "+5% defense for all your soldiers per level." },
  fortification:{ name: "Fortification",    icon: "🏰", tier: 3, max: 5,  base: { gold: 800, stone: 800 },  time: 180, desc: "+25% City Wall HP per level." },
  cartography:  { name: "Cartography",      icon: "🗺️", tier: 3, max: 8,  base: { gold: 900, food: 400 },   time: 180, desc: "Expeditions take 6% less time per level." },
  relicLore:    { name: "Relic Lore",       icon: "🔮", tier: 5, max: 5,  base: { gold: 2000, relics: 3 },  time: 300, desc: "Each Relic gives +0.5% more production per level, and the relic bonus cap rises by +20%." },
};

/* Quests: completed in order. The first few unclaimed ones are shown, and you claim each reward by hand. */
const QUESTS = [
  { id: "farm3",      text: "Build Farms up to level 3",              check: (s) => s.buildings.farm >= 3,               reward: { gold: 150 } },
  { id: "house3",     text: "Build Houses up to level 3",             check: (s) => s.buildings.house >= 3,              reward: { gold: 150, stone: 100 } },
  { id: "pop25",      text: "Reach 25 population",                    check: (s) => Economy.totalPop(s) >= 25,           reward: { food: 300 } },
  { id: "storage",    text: "Build a Warehouse and a Granary",        check: (s) => s.buildings.warehouse >= 1 && s.buildings.granary >= 1, reward: { gold: 300 } },
  { id: "steel",      text: "Build Steelworks",                       check: (s) => s.buildings.steelworks >= 1,         reward: { steel: 50 } },
  { id: "barracks",   text: "Build a Barracks",                       check: (s) => s.buildings.barracks >= 1,           reward: { gold: 400, steel: 40 } },
  { id: "th2",        text: "Upgrade the Town Hall to level 2",       check: (s) => s.buildings.townhall >= 2,           reward: { gold: 500, stone: 300 } },
  { id: "army10",     text: "Command 10 soldiers",                    check: (s) => Military.soldierCount(s) >= 10,      reward: { gold: 400 } },
  { id: "exp1",       text: "Win an expedition",                      check: (s) => s.stats.won >= 1,                    reward: { steel: 100 } },
  { id: "walls",      text: "Build City Walls",                       check: (s) => s.buildings.walls >= 1,              reward: { stone: 500 } },
  { id: "academy",    text: "Build an Academy",                       check: (s) => s.buildings.academy >= 1,            reward: { gold: 600 } },
  { id: "raid1",      text: "Repel a raid",                           check: (s) => s.stats.raidsWon >= 1,               reward: { gold: 800 } },
  { id: "lead1",      text: "Win a battle you lead in person",        check: (s) => s.stats.battlesLedWon >= 1,          reward: { relics: 1 } },
  { id: "research3",  text: "Complete 3 research levels",             check: (s) => Research.total(s) >= 3,              reward: { gold: 1000, food: 500 } },
  { id: "th4",        text: "Upgrade the Town Hall to level 4",       check: (s) => s.buildings.townhall >= 4,           reward: { relics: 1 } },
  { id: "pop100",     text: "Reach 100 population",                   check: (s) => Economy.totalPop(s) >= 100,          reward: { gold: 1500 } },
  { id: "cmd5",       text: "Raise your Commander to level 5",        check: (s) => s.commander.level >= 5,              reward: { steel: 500 } },
  { id: "stables",    text: "Build Stables",                          check: (s) => s.buildings.stables >= 1,            reward: { food: 1000 } },
  { id: "army50",     text: "Command 50 soldiers",                    check: (s) => Military.soldierCount(s) >= 50,      reward: { gold: 2500 } },
  { id: "site1",      text: "Capture a territory on the World Map",   check: (s) => s.stats.sitesCaptured >= 1,          reward: { gold: 800, wood: 500 } },
  { id: "vet1",       text: "Earn a veteran rank for any unit type",  check: (s) => Object.values(s.veterancy).some((x) => Military.vetRank(x) >= 1), reward: { steel: 300 } },
  { id: "ranch",      text: "Build a Horse Ranch",                    check: (s) => s.buildings.ranch >= 1,              reward: { horses: 10 } },
  { id: "orcs",       text: "Conquer the Orc Stronghold",             check: (s) => (s.stats.missionWins.orcs || 0) >= 1, reward: { relics: 2 } },
  { id: "raid5",      text: "Repel 5 raids",                          check: (s) => s.stats.raidsWon >= 5,               reward: { gold: 5000, steel: 800 } },
  { id: "brewery",    text: "Build a Brewery and brew 50 Ale",        check: (s) => s.buildings.brewery >= 1 && s.resources.ale >= 50, reward: { gold: 1500 } },
  { id: "bless1",     text: "Invoke a Temple Blessing",               check: (s) => s.stats.blessings >= 1,              reward: { faith: 100 } },
  { id: "trade5",     text: "Make 5 trades at the Market",            check: (s) => s.stats.trades >= 5,                 reward: { gold: 2000 } },
  { id: "fort1",      text: "Fortify a territory",                    check: (s) => World.territories(s).some((n) => (n.fort || 0) >= 1), reward: { stone: 2000 } },
  { id: "defend1",    text: "Defend a territory from a counterattack",check: (s) => s.stats.territoriesDefended >= 1,   reward: { relics: 2 } },
  { id: "sites3",     text: "Hold 3 territories at once",             check: (s) => World.territories(s).length >= 3,    reward: { relics: 2 } },
  { id: "magetower",  text: "Build a Mage Tower",                     check: (s) => s.buildings.magetower >= 1,          reward: { crystals: 20 } },
  { id: "lead10",     text: "Win 10 battles you lead in person",      check: (s) => s.stats.battlesLedWon >= 10,         reward: { relics: 3 } },
  { id: "conq5",      text: "Reach Endless Conquest stage 5",         check: (s) => s.conquest >= 5,                     reward: { relics: 3 } },
  { id: "th8",        text: "Upgrade the Town Hall to level 8",       check: (s) => s.buildings.townhall >= 8,           reward: { relics: 3 } },
  { id: "research25", text: "Complete 25 research levels",            check: (s) => Research.total(s) >= 25,             reward: { relics: 3 } },
  { id: "vet5",       text: "Raise any unit type to veteran rank 5",  check: (s) => Object.values(s.veterancy).some((x) => Military.vetRank(x) >= 5), reward: { relics: 5 } },
  { id: "sites6",     text: "Hold 6 territories at once",             check: (s) => World.territories(s).length >= 6,    reward: { relics: 6 } },
  { id: "captain1",   text: "Hire a Captain",                         check: (s) => Captains.hiredCount(s) >= 1,          reward: { gold: 2500 } },
  { id: "rivalwin",   text: "Sack a rival lord's castle",             check: (s) => Object.values(s.rivals || {}).some((r) => r.defeats >= 1), reward: { relics: 2 } },
  { id: "captain5",   text: "Raise a Captain to level 5",             check: (s) => Object.values(s.captains).some((c) => c.level >= 5), reward: { relics: 3 } },
  { id: "vassal",     text: "Make a rival lord your vassal",          check: (s) => Object.values(s.rivals || {}).some((r) => r.vassal), reward: { relics: 5 } },
  { id: "capital",    text: "Storm the Warlord's Capital on the World Map", check: (s) => World.territories(s).some((n) => n.type === "capital") || (s.stats.capitalsTaken || 0) >= 1, reward: { relics: 10 } },
  { id: "dragon",     text: "Slay the Elder Dragon",                  check: (s) => (s.stats.missionWins.dragon || 0) >= 1, reward: { relics: 5 } },
  { id: "pop500",     text: "Reach 500 population",                   check: (s) => Economy.totalPop(s) >= 500,          reward: { relics: 5 } },
  { id: "citadel",    text: "Conquer the Shadow Citadel",             check: (s) => (s.stats.missionWins.citadel || 0) >= 1, reward: { relics: 8 } },
  { id: "th12",       text: "Upgrade the Town Hall to level 12",      check: (s) => s.buildings.townhall >= 12,          reward: { relics: 8 } },
  { id: "conq20",     text: "Reach Endless Conquest stage 20",        check: (s) => s.conquest >= 20,                    reward: { relics: 15 } },
  { id: "titan",      text: "Topple the Storm Titan",                 check: (s) => (s.stats.missionWins.titan || 0) >= 1, reward: { relics: 25 } },
  { id: "th15",       text: "Raise the Town Hall to level 15",        check: (s) => s.buildings.townhall >= 15,          reward: { relics: 25 } },
];

/*
 * The Campaign: every expedition is a story quest with a quest giver, dialogue, objectives and a one-time reward
 * you collect by turning the quest in. Quests unlock in order. Completed quests can be replayed as bounties.
 */
const CAMPAIGN_ORDER = ["bandits", "goblins", "abbey", "orcs", "trollbridge", "giants", "necropolis", "dragon", "citadel", "abyss", "titan"];
const CHAPTERS = ["I · The Borderlands", "II · The Orc War", "III · Shadows Rising", "IV · The End of Days"];
const CAMPAIGN = {
  bandits:    { chapter: 0, giver: "Captain Aldric", face: "🧔", title: "Trouble on the King's Road", general: "bandit_chief",
                intro: "My lord, the merchants won't travel the King's Road anymore. A gang of cutthroats has made camp in the Darkwood and their chief takes a toll in blood. Clear them out and the trade will flow again.",
                outro: "The road is safe once more. The merchants are already singing your name in the taverns, and they sent this as thanks.",
                objective: "Defeat the bandits in the Darkwood and slay their Chief", reward: { gold: 400, wood: 200 }, bonus: { steel: 60 } },
  goblins:    { chapter: 0, giver: "Ranger Tamsin", face: "🏹", title: "The Warren Beneath the Hills", general: "goblin_king",
                intro: "Goblins have been stealing sheep from the hill farms, my lord. I tracked them to a warren in the hills. Their king rides a great warg. Kill him and the rest will scatter like rats.",
                outro: "The warren is silent. We found the farmers' stolen goods and a little more besides.",
                objective: "Storm the Goblin Warrens and kill the Goblin King", reward: { gold: 700, food: 500 }, bonus: { horses: 5 } },
  abbey:      { chapter: 0, giver: "Sister Maren", face: "🕯️", title: "The Restless Dead", general: null,
                intro: "The old abbey in the marsh... the dead walk there now. Two necromancers are raising my brothers and sisters from their graves. Please, my lord, let them rest.",
                outro: "The bells of the abbey rang tonight for the first time in years. The dead sleep again. Take these offerings from a grateful temple.",
                objective: "Cleanse the Haunted Abbey of the undead", reward: { gold: 900, stone: 600 }, bonus: { faith: 80 } },
  orcs:       { chapter: 1, giver: "King Osric", face: "👑", title: "The Iron Tusk Warband", general: "orc_warlord",
                intro: "Lord of Ironhold, the Iron Tusk orcs have built a stronghold on our border and their Warlord dreams of burning my kingdom. You have proven yourself. Break their walls and bring me his head.",
                outro: "The Warlord is dead and the orc tribes fight among themselves. The crown will remember this, and rewards you handsomely.",
                objective: "Breach the Orc Stronghold and slay the Warlord", reward: { gold: 2000, steel: 300 }, bonus: { relics: 1 } },
  trollbridge:{ chapter: 1, giver: "Guildmaster Bren", face: "💰", title: "Toll of the Troll Bridge", general: null,
                intro: "Trolls have taken the old stone bridge over the river and they eat anyone who can't pay the toll. My caravans need that crossing, my lord. I'll pay well.",
                outro: "The bridge is ours again. My caravans are already rolling. As promised, your share.",
                objective: "Drive the trolls off the bridge", reward: { gold: 3000, wood: 1500 }, bonus: { steel: 400 } },
  giants:     { chapter: 1, giver: "Ranger Tamsin", face: "🏹", title: "Winter's Teeth", general: "giant_jarl",
                intro: "The frost giants came down from the peaks with an orc host behind them. Their Jarl holds Frostfang Pass. If he isn't stopped, the snows will bury our northern farms.",
                outro: "The pass is open and the Jarl's hammer hangs in your hall. The north is safe.",
                objective: "Win the battle at Frostfang Pass and slay the Giant Jarl", reward: { gold: 4000, steel: 600 }, bonus: { relics: 1 } },
  necropolis: { chapter: 2, giver: "Sister Maren", face: "🕯️", title: "City of the Dead", general: "lich",
                intro: "The necromancers from the abbey served a greater master. A Lich has woken the Necropolis in the marsh, and an army of the dead marches behind its walls. Only you can end this.",
                outro: "The Lich's phylactery is shattered. The marsh is quiet. The temple gives you its holiest relics.",
                objective: "Break into the Necropolis and destroy the Lich", reward: { gold: 8000, crystals: 30 }, bonus: { relics: 2 } },
  dragon:     { chapter: 2, giver: "Archmage Velor", face: "🧙", title: "The Ember Wyrm", general: null,
                intro: "An Elder Dragon has woken in the valley, and its drakes burn everything in sight. Bring ballistae and the bravest soldiers you have. Its hoard could fill a kingdom's treasury.",
                outro: "The Ember Wyrm is dead! Its hoard is beyond counting, and the scales alone will armor a hundred knights.",
                objective: "Slay the Elder Dragon in its lair", reward: { gold: 10000, steel: 1500 }, bonus: { relics: 3 } },
  citadel:    { chapter: 2, giver: "King Osric", face: "👑", title: "The Shadow Citadel", general: "dark_lord",
                intro: "Everything leads back to the Shadow Citadel. The Dark Lord there sent the orcs, woke the Lich and stirred the dragon. Take his fortress, my lord, and end this war.",
                outro: "The Dark Lord has fallen and his citadel burns. The realm is saved, but the archmage brings grave news...",
                objective: "Storm the Shadow Citadel and defeat the Dark Lord", reward: { gold: 15000, steel: 2500 }, bonus: { relics: 4 } },
  abyss:      { chapter: 3, giver: "Archmage Velor", face: "🧙", title: "The Gate Below", general: null,
                intro: "The Dark Lord's death broke a seal. An Abyssal Gate has opened and demons pour out of it. We must fight through them so I can close it.",
                outro: "The gate is sealed. The demons are gone. But the mountains tremble, and the storm is coming...",
                objective: "Fight through the Abyssal Gate", reward: { gold: 25000, crystals: 80 }, bonus: { relics: 5 } },
  titan:      { chapter: 3, giver: "King Osric", face: "👑", title: "Throne of the Storm", general: null,
                intro: "The Storm Titan, oldest of the giants, has claimed the mountain throne. This is the final battle, Lord of Ironhold. Win it, and your name will be sung for a thousand years.",
                outro: "The Titan has fallen and the storm is over. You are the greatest hero this realm has ever known. All hail the Lord of Ironhold!",
                objective: "Topple the Storm Titan", reward: { gold: 60000, steel: 10000 }, bonus: { relics: 10 } },
};

/*
 * The Armory: gear for your Lord Commander, dropped as loot. Rarity decides how many bonuses an item rolls
 * and how strong they are. Equip one item per slot.
 */
const GEAR_SLOTS = {
  weapon: { name: "Weapon", icon: "⚔️", bases: ["Longsword", "Warhammer", "Greatsword", "Battleaxe", "Lance", "Morningstar"] },
  armor:  { name: "Armor",  icon: "🛡️", bases: ["Hauberk", "Plate Cuirass", "Brigandine", "Scale Mail", "Gilded Plate"] },
  helm:   { name: "Helm",   icon: "⛑️", bases: ["Great Helm", "Barbute", "Crowned Helm", "Visored Sallet"] },
  banner: { name: "Banner", icon: "🚩", bases: ["War Banner", "Standard", "Battle Flag", "Gonfalon"] },
  relic:  { name: "Relic",  icon: "💍", bases: ["Signet Ring", "Amulet", "Talisman", "Reliquary"] },
};
const GEAR_RARITY = {
  common:    { name: "Common",    color: "#c9c3b5", stats: 1, mult: 1,   weight: 60, salvage: 150 },
  rare:      { name: "Rare",      color: "#4fa3ff", stats: 2, mult: 1.5, weight: 28, salvage: 600 },
  epic:      { name: "Epic",      color: "#c27bff", stats: 3, mult: 2.2, weight: 10, salvage: 2500 },
  legendary: { name: "Legendary", color: "#ff9a2e", stats: 4, mult: 3.2, weight: 2,  salvage: 10000 },
};
// stat id -> [label, base value per item level, which slots favour it]
const GEAR_STATS = {
  heroAtk: { label: "Hero attack",      unit: "%", base: 4,   slots: ["weapon", "relic"] },
  heroHp:  { label: "Hero health",      unit: "%", base: 5,   slots: ["armor", "helm"] },
  armyAtk: { label: "Army attack",      unit: "%", base: 1.2, slots: ["weapon", "banner"] },
  armyDef: { label: "Army defense",     unit: "%", base: 1.2, slots: ["armor", "helm", "banner"] },
  morale:  { label: "Starting morale",  unit: "",  base: 2,   slots: ["banner", "helm"] },
  loot:    { label: "Battle loot",      unit: "%", base: 2.5, slots: ["relic", "banner"] },
  xp:      { label: "Commander XP",     unit: "%", base: 3,   slots: ["relic", "helm"] },
};
const GEAR_PREFIX = { common: ["Iron", "Sturdy", "Worn", "Soldier's"], rare: ["Runed", "Knight's", "Tempered", "Silvered"], epic: ["Dragonbone", "Starforged", "Warlord's", "Abyssal"], legendary: ["Ironhold's", "Titanslayer", "Eternal", "Kingmaker"] };

/* Temple blessings: spend Faith on timed buffs. */
const BLESSINGS = {
  harvest:     { buff: "harvest",     cost: 60,  dur: 600, name: "Blessing of Plenty",  icon: "🌽" },
  fair:        { buff: "fair",        cost: 80,  dur: 600, name: "Blessing of Fortune", icon: "🪙" },
  inspiration: { buff: "inspiration", cost: 100, dur: 600, name: "Blessing of Wisdom",  icon: "💡" },
  holywar:     { buff: "holywar",     cost: 120, dur: 600, name: "Blessing of War",     icon: "⚔️" },
  aegis:       { buff: "aegis",       cost: 120, dur: 600, name: "Blessing of the Aegis", icon: "🛡️" },
};
/* Market trade values in gold per unit (you sell for less and buy for more). */
const TRADE_VALUE = { food: 0.5, stone: 0.6, wood: 0.6, steel: 3, ale: 1.5, horses: 25, crystals: 40 };

/* Random realm events. buff = timed bonus, instant = happens at once, offer = you choose (it expires). */
const EVENTS = {
  harvest:     { name: "Bountiful Harvest",   icon: "🌽", kind: "buff",    dur: 300, weight: 3, desc: "+50% Food production for 5 minutes." },
  fair:        { name: "Trade Fair",          icon: "🎪", kind: "buff",    dur: 300, weight: 3, desc: "+30% Gold income for 5 minutes." },
  inspiration: { name: "Age of Inspiration",  icon: "💡", kind: "buff",    dur: 300, weight: 2, desc: "Research runs twice as fast for 5 minutes." },
  goldvein:    { name: "Gold Vein Discovered",icon: "⛏️", kind: "instant", weight: 2, desc: "Miners strike gold: +15% of your Gold storage." },
  refugees:    { name: "Refugees Arrive",     icon: "🧳", kind: "instant", weight: 2, desc: "Families flee a burned village and settle in your free housing." },
  plague:      { name: "Plague",              icon: "🦠", kind: "instant", weight: 1, desc: "Sickness sweeps the streets. Temples and Medicine reduce the toll." },
  mercenaries: { name: "Mercenary Company",   icon: "🗡️", kind: "offer",   weight: 2, desc: "Sellswords offer their service. No Recruits needed." },
  caravan:     { name: "Merchant Caravan",    icon: "🐫", kind: "offer",   weight: 2, desc: "Traders offer to swap your Stone for Steel." },
  flood:       { name: "Great Flood",         icon: "🌊", kind: "buff", dur: 240, weight: 0, bad: true, desc: "Farms produce 60% less food." },
  drought:     { name: "Drought",             icon: "🏜️", kind: "buff", dur: 300, weight: 0, bad: true, desc: "Farms produce half as much food." },
  wildfire:    { name: "Wildfire",            icon: "🔥", kind: "buff", dur: 180, weight: 0, bad: true, desc: "Lumber camps produce 70% less wood." },
  blizzard:    { name: "Blizzard",            icon: "🌨️", kind: "buff", dur: 240, weight: 0, bad: true, desc: "Construction is 60% slower and soldiers eat 50% more." },
  holywar:     { name: "Blessing of War",     icon: "⚔️", kind: "buff", dur: 600, weight: 0, desc: "+15% attack in every battle for 10 minutes." },
  aegis:       { name: "Blessing of the Aegis",icon: "🛡️", kind: "buff", dur: 600, weight: 0, desc: "+20% defense in every battle for 10 minutes." },
  relicseller: { name: "Mysterious Peddler",  icon: "🧙", kind: "offer",   weight: 1, desc: "A hooded stranger sells an ancient Relic." },
};
