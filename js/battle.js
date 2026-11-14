"use strict";
/* =====================================================================
   IRONHOLD: BATTLE MODULE
   ---------------------------------------------------------------------
   Turn-based tactical battles on a terrain grid.
   - The same engine runs automatic battles (expeditions, raids you don't
     command yourself) and battles you lead in person.
   - Terrain: plains, forest, hills, mountains, valleys, rivers, bridges,
     swamps, castle walls and rubble. Each changes movement, defense,
     range and line of sight.
   - Tactics (doctrines) change how your whole army fights.
   Depends on globals from index.html at call time: UNITS, fmt, esc, $, $$.
   ===================================================================== */

/* ---------- terrain ---------- */
const TERRAIN = {
  plains:   { name: "Plains",    move: 1, def: 1.0,  elev: 1, desc: "Open ground. No modifiers." },
  forest:   { name: "Forest",    move: 2, def: 1.3,  elev: 1, cover: 0.7, cavExtra: 1, desc: "+30% defense. Missiles into the trees deal −30%. Cavalry moves slowly." },
  hill:     { name: "Hills",     move: 2, def: 1.25, elev: 2, rangeBonus: 1, desc: "+25% defense. +1 range for missile units. +20% when attacking downhill." },
  mountain: { name: "Mountains", move: Infinity, def: 1.5, elev: 3, blocksLOS: true, desc: "Impassable except for flyers. Blocks line of sight for missiles." },
  valley:   { name: "Valley",    move: 1, def: 0.85, elev: 0, desc: "Low ground: −15% defense, and −15% when attacking uphill." },
  river:    { name: "River",     move: 3, def: 0.75, elev: 0, cavExtra: 1, desc: "Fording costs 3 moves. −25% defense while in the water." },
  bridge:   { name: "Bridge",    move: 1, def: 0.9,  elev: 1, desc: "A narrow crossing. Perfect for holding a chokepoint." },
  swamp:    { name: "Swamp",     move: 3, def: 0.85, elev: 0, cavExtra: 1, desc: "Boggy ground that's slow to cross. −15% defense." },
  wall:     { name: "Wall",      move: 1, def: 1.6,  elev: 2, rangeBonus: 1, desc: "Only the defender can stand on walls: +60% defense and +1 range. Siege units can smash them." },
  ashes:    { name: "Scorched Earth", move: 1, def: 0.9, elev: 1, desc: "A burned-out forest. −10% defense." },
  rubble:   { name: "Rubble",    move: 2, def: 1.1,  elev: 1, desc: "A breached wall. +10% defense." },
};

/* ---------- enemy units ---------- */
const ENEMY_UNITS = {
  bandit:        { name: "Bandit",          asset: "e_bandit",       hp: 9,    atk: 3,   def: 1,  rng: 1, mv: 3, cls: "inf" },
  bandit_archer: { name: "Bandit Archer",   asset: "e_bandit_archer",hp: 7,    atk: 3,   def: 0,  rng: 3, mv: 3, cls: "ranged" },
  goblin:        { name: "Goblin",          asset: "e_goblin",       hp: 7,    atk: 3,   def: 1,  rng: 1, mv: 4, cls: "inf" },
  wolf_rider:    { name: "Wolf Rider",      asset: "e_wolf_rider",   hp: 15,   atk: 5,   def: 1,  rng: 1, mv: 6, cls: "cav", charge: true },
  orc:           { name: "Orc Warrior",     asset: "e_orc",          hp: 18,   atk: 6,   def: 3,  rng: 1, mv: 3, cls: "inf" },
  orc_archer:    { name: "Orc Archer",      asset: "e_orc_archer",   hp: 12,   atk: 5,   def: 1,  rng: 3, mv: 3, cls: "ranged" },
  berserker:     { name: "Orc Berserker",   asset: "e_berserker",    hp: 22,   atk: 10,  def: 1,  rng: 1, mv: 4, cls: "inf" },
  troll:         { name: "Troll",           asset: "e_troll",        hp: 60,   atk: 14,  def: 4,  rng: 1, mv: 2, cls: "inf", big: true, regen: 0.1 },
  ogre:          { name: "Ogre",            asset: "e_ogre",         hp: 70,   atk: 16,  def: 5,  rng: 1, mv: 2, cls: "inf", big: true },
  skeleton:      { name: "Skeleton",        asset: "e_skeleton",     hp: 10,   atk: 4,   def: 3,  rng: 1, mv: 3, cls: "inf" },
  wraith:        { name: "Wraith",          asset: "e_wraith",       hp: 20,   atk: 8,   def: 5,  rng: 1, mv: 5, cls: "cav", flying: true },
  necromancer:   { name: "Necromancer",     asset: "e_necromancer",  hp: 15,   atk: 7,   def: 2,  rng: 4, mv: 3, cls: "ranged", heal: 2 },
  frost_giant:   { name: "Frost Giant",     asset: "e_frost_giant",  hp: 120,  atk: 24,  def: 6,  rng: 1, mv: 2, cls: "inf", big: true },
  dark_knight:   { name: "Dark Knight",     asset: "e_dark_knight",  hp: 40,   atk: 13,  def: 8,  rng: 1, mv: 5, cls: "cav", charge: true },
  demon:         { name: "Demon",           asset: "e_demon",        hp: 80,   atk: 20,  def: 8,  rng: 1, mv: 4, cls: "inf", big: true },
  drake:         { name: "Fire Drake",      asset: "e_drake",        hp: 50,   atk: 14,  def: 5,  rng: 2, mv: 6, cls: "ranged", flying: true, big: true },
  bandit_chief:  { name: "Bandit Chief",    asset: "g_bandit_chief",       hp: 45,   atk: 10,  def: 3,  rng: 1, mv: 4, cls: "inf", general: true },
  goblin_king:   { name: "Goblin King",     asset: "g_goblin_king",       hp: 70,   atk: 14,  def: 3,  rng: 1, mv: 5, cls: "cav", general: true },
  orc_warlord:   { name: "Orc Warlord",     asset: "g_orc_warlord",    hp: 260,  atk: 55,  def: 6,  rng: 1, mv: 4, cls: "inf", general: true },
  lich:          { name: "Lich",            asset: "g_lich",  hp: 300,  atk: 70,  def: 7,  rng: 4, mv: 3, cls: "ranged", general: true, heal: 6 },
  giant_jarl:    { name: "Giant Jarl",      asset: "g_giant_jarl",  hp: 450,  atk: 80,  def: 9,  rng: 1, mv: 3, cls: "inf", general: true, big: true },
  dark_lord:     { name: "Dark Lord",       asset: "g_dark_lord",  hp: 600,  atk: 110, def: 12, rng: 1, mv: 5, cls: "cav", general: true, charge: true },
  dragon:        { name: "Elder Dragon",    asset: "e_dragon",       hp: 1400, atk: 160, def: 12, rng: 2, mv: 5, cls: "ranged", flying: true, big: true, boss: true },
  titan:         { name: "Storm Titan",     asset: "e_titan",        hp: 5000, atk: 500, def: 15, rng: 3, mv: 3, cls: "inf", big: true, boss: true },
};
/* Town guards appear only when defending the city. They're free, and they're never lost from your army. */
const EXTRA_UNITS = {
  guard: { name: "Town Guard", asset: "u_guard", hp: 12, atk: 4, def: 3, rng: 1, mv: 3, cls: "inf" },
};
/** Your Lord Commander on the battlefield: one hero whose stats grow with the commander level. */
function heroType(lvl, hpPct = 0) {
  lvl = Math.max(1, lvl | 0); hpPct = Math.max(0, Math.round(hpPct));
  const k = "hero" + lvl + (hpPct ? "_" + hpPct : "");
  if (!EXTRA_UNITS[k]) EXTRA_UNITS[k] = { name: "Lord Commander", asset: "commander", hp: Math.round((120 + 50 * lvl) * (1 + hpPct / 100)), atk: 25 + 8 * lvl, def: 6 + 0.5 * lvl, rng: 1, mv: 5, cls: "cav", charge: true, hero: true, aura: true, boss: true };
  return k;
}
const udef = (type) => (typeof UNITS !== "undefined" && UNITS[type]) || ENEMY_UNITS[type] || EXTRA_UNITS[type] || (/^hero\d+(_\d+)?$/.test(type) ? EXTRA_UNITS[heroType(+type.slice(4).split("_")[0], +(type.split("_")[1] || 0))] : undefined);
const FACTION_GENERALS = { bandits: "bandit_chief", goblins: "goblin_king", orcs: "orc_warlord", undead: "lich", giants: "giant_jarl", dark: "dark_lord" };

/** One number to compare units by (and armies, as count × this). */
function unitPower(d) {
  return Math.round(Math.sqrt(d.hp * d.atk * (1 + d.def / 8)) * (d.rng > 1 ? 1.15 : 1) * (d.mv >= 5 ? 1.1 : 1) * 10) / 10;
}
function armyPower(units) {
  let p = 0;
  for (const [t, n] of Object.entries(units || {})) if (udef(t)) p += unitPower(udef(t)) * n;
  return p;
}

/* ---------- tactics / doctrines ---------- */
const TACTICS = {
  balanced:  { name: "Balanced Formation", lvl: 1, icon: "⚖️", desc: "No strengths, no weaknesses." },
  shieldwall:{ name: "Shield Wall",       lvl: 2, icon: "🛡️", desc: "Infantry +35% defense. All units −1 movement.", def: { inf: 1.35 }, move: -1 },
  volley:    { name: "Arrow Storm",       lvl: 3, icon: "🏹", desc: "Missile units +25% attack and +1 range. Melee −10% attack.", atk: { ranged: 1.25, inf: 0.9, cav: 0.9 }, range: 1 },
  charge:    { name: "Cavalry Charge",    lvl: 4, icon: "🐎", desc: "Cavalry +25% attack, and charges hit +80% instead of +50%. Infantry −10% defense.", atk: { cav: 1.25 }, charge: 1.8, def: { inf: 0.9 } },
  holdline:  { name: "Hold the Line",     lvl: 5, icon: "🧱", desc: "Squads that don't move get +30% defense. Braced squads strike back at full strength.", hold: 1.3 },
  ambush:    { name: "Ambush",            lvl: 6, icon: "🌲", desc: "+30% attack from forests and hills. You can deploy 2 columns deeper.", ambush: 1.3, deploy: 2 },
  bloodlust: { name: "Bloodlust",         lvl: 8, icon: "🩸", desc: "All units +20% attack but −15% defense.", atkAll: 1.2, defAll: 0.85 },
};

/* ---------- Lord Commander abilities (player side only, used in battles you lead and by your captains) ---------- */
const ABILITIES = {
  rally:   { name: "Rally",         icon: "📯", lvl: 1, cd: 4, desc: "Heal every squad by 15% of its full strength (fallen soldiers get back up)." },
  barrage: { name: "Arrow Barrage", icon: "🎯", lvl: 3, cd: 4, target: true, desc: "Pick a spot anywhere: arrows rain on every enemy squad in a 3×3 area." },
  warcry:  { name: "War Cry",       icon: "🔥", lvl: 5, cd: 5, desc: "All your squads deal +30% damage for the rest of this turn." },
  march:   { name: "Forced March",  icon: "🥾", lvl: 7, cd: 5, desc: "Squads that haven't moved yet get +2 movement this turn." },
};

/* ---------- weather (rolled for every battle) ---------- */
const WEATHER = {
  clear: { name: "Clear Skies", icon: "☀️", weight: 4, desc: "No effects." },
  rain:  { name: "Heavy Rain",  icon: "🌧️", weight: 2, rangedAtk: 0.75, riverExtra: 1, desc: "Missiles deal −25% damage. Rivers cost +1 move." },
  fog:   { name: "Thick Fog",   icon: "🌫️", weight: 2, range: -1, desc: "Missile range −1 (minimum 2). Good for closing in on archers." },
  snow:  { name: "Snowstorm",   icon: "❄️", weight: 1, move: -1, desc: "All units −1 movement." },
  wind:  { name: "Strong Tailwind", icon: "🌬️", weight: 1, range: 1, desc: "Missile range +1 for both sides." },
};
const SEASON_WEATHER = {
  spring: { rain: 2, fog: 1.5 }, summer: { clear: 1.6, wind: 2, snow: 0 },
  autumn: { rain: 2, fog: 2, wind: 1.5 }, winter: { snow: 5, clear: 0.6, rain: 0.4 },
};
function rollWeather(rand = Math.random, season) {
  const sw = SEASON_WEATHER[season] || {};
  const list = Object.entries(WEATHER).map(([k, w]) => [k, { ...w, weight: w.weight * (sw[k] ?? 1) }]), tot = list.reduce((a, [, w]) => a + w.weight, 0);
  let r = rand() * tot;
  for (const [k, w] of list) { r -= w.weight; if (r <= 0) return k; }
  return "clear";
}

/* ---------- squad skills: one active skill per unit class (cooldown in turns) ---------- */
const SKILLS = {
  ranged:  { id: "aimed",      name: "Aimed Volley", icon: "🎯", cd: 3, desc: "This squad's next attack this turn deals +50% damage." },
  siege:   { id: "aimed",      name: "Heavy Shot",   icon: "💥", cd: 3, desc: "This squad's next attack this turn deals +50% damage." },
  inf:     { id: "secondwind", name: "Second Wind",  icon: "💪", cd: 4, desc: "Recover 20% of the squad's full strength and shake off panic." },
  cav:     { id: "sprint",     name: "Sprint",       icon: "💨", cd: 3, desc: "+3 movement this turn (use it before moving)." },
  support: { id: "massheal",   name: "Mass Heal",    icon: "✨", cd: 4, desc: "Heal every friendly squad within 2 tiles by 10% of its strength." },
};

/* ---------- squad stances (free to change during your turn) ---------- */
const STANCES = {
  normal:     { name: "Normal",     icon: "⚖️", atk: 1,    def: 1,   desc: "No modifiers." },
  aggressive: { name: "Aggressive", icon: "🔥", atk: 1.15, def: 0.85, desc: "+15% attack, −15% defense." },
  defensive:  { name: "Defensive",  icon: "🛡️", atk: 0.85, def: 1.2, desc: "+20% defense, −15% attack, and stronger counterattacks." },
};

/* ---------- enemy factions (for raids and the endless conquest) ---------- */
const FACTIONS = {
  bandits: { name: "Bandit Raiders",   minPower: 0,     tactic: "balanced",  roster: { bandit: 3, bandit_archer: 1 } },
  goblins: { name: "Goblin Horde",     minPower: 60,    tactic: "charge",    roster: { goblin: 4, wolf_rider: 1 } },
  orcs:    { name: "Orc Warband",      minPower: 180,   tactic: "bloodlust", roster: { orc: 4, orc_archer: 2, berserker: 1, wolf_rider: 1 } },
  undead:  { name: "Undead Legion",    minPower: 450,   tactic: "shieldwall",roster: { skeleton: 6, wraith: 1, necromancer: 1 } },
  giants:  { name: "Giant-kin Host",   minPower: 1100,  tactic: "bloodlust", roster: { troll: 2, ogre: 2, frost_giant: 1, goblin: 6 } },
  dark:    { name: "Black Legion",     minPower: 2500,  tactic: "charge",    roster: { dark_knight: 3, demon: 1, necromancer: 2, skeleton: 4 } },
  dragons: { name: "Dragonflight",     minPower: 6000,  tactic: "volley",    roster: { drake: 3, dark_knight: 2, demon: 1 } },
};
function pickFaction(power, rand = Math.random) {
  const ok = Object.keys(FACTIONS).filter((k) => FACTIONS[k].minPower <= power);
  // usually the strongest faction available, sometimes one tier lower for variety
  const i = ok.length - 1 - (rand() < 0.3 && ok.length > 1 ? 1 : 0);
  return ok[i];
}
/** Build an army of about `power` from a faction's roster weights. */
function composeArmy(factionId, power) {
  const roster = FACTIONS[factionId].roster;
  const per = Object.entries(roster).reduce((a, [t, w]) => a + unitPower(udef(t)) * w, 0);
  const k = Math.max(power / per, 0.25);
  const army = {};
  for (const [t, w] of Object.entries(roster)) {
    const n = Math.round(w * k);
    if (n > 0) army[t] = n;
  }
  if (!Object.keys(army).length) army[Object.keys(roster)[0]] = 1;
  return army;
}

/* ---------- seeded RNG for maps ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAP_TYPES = {
  plains:   "Open Plains",
  forest:   "Deep Forest",
  hills:    "Rolling Hills",
  valley:   "Mountain Valley",
  river:    "River Crossing",
  mountain: "Mountain Pass",
  swamp:    "Fetid Marsh",
};

const NO_MODS = { atk: 0, def: 0, move: 0, range: 0, heal: 0, charge: 0, splash: 0, breach: 0, counter: 0, by: [] };
const CAP_CACHE = new WeakMap();

const Battle = {
  W: 18, H: 12,

  /* ===================== map generation ===================== */
  generateMap(type, seed, walls) {
    const W = this.W, H = this.H, R = mulberry32(seed);
    const t = new Array(W * H).fill("plains");
    const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) t[y * W + x] = v; };
    const get = (x, y) => t[y * W + x];
    const blob = (v, n, rMin, rMax, prob = 0.85, xMin = 2, xMax = W - 3) => {
      for (let i = 0; i < n; i++) {
        const cx = xMin + R() * (xMax - xMin), cy = R() * H, r = rMin + R() * (rMax - rMin);
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let x = Math.floor(cx - r); x <= cx + r; x++) {
            const d = Math.hypot(x - cx, y - cy);
            if (d <= r && R() < prob * (1 - (d / r) * 0.45)) set(x, y, v);
          }
      }
    };
    switch (type) {
      case "forest": blob("forest", 9, 1.5, 3); blob("hill", 2, 1, 2); blob("swamp", 1, 1, 1.8); break;
      case "hills": blob("hill", 7, 1.5, 2.8); blob("mountain", 2, 0.8, 1.6, 0.9, 5, W - 6); blob("forest", 3, 1, 2); blob("valley", 2, 1.5, 2.5); break;
      case "valley": {
        // mountain ridges along the top and bottom, a valley floor between them, hills on the slopes
        for (let x = 0; x < W; x++) {
          const top = 1 + Math.round(R() * 1.6), bot = H - 2 - Math.round(R() * 1.6);
          for (let y = 0; y < H; y++) {
            if (y < top || y > bot) set(x, y, "mountain");
            else if (y === top || y === bot) set(x, y, R() < 0.8 ? "hill" : "forest");
            else set(x, y, "valley");
          }
        }
        blob("forest", 3, 1, 1.8, 0.7); blob("hill", 2, 0.8, 1.4, 0.8, 5, W - 6);
        break;
      }
      case "river": {
        let rx = Math.floor(W / 2) - 1 + Math.floor(R() * 3);
        const bridges = new Set([2 + Math.floor(R() * 3), H - 3 - Math.floor(R() * 3)]);
        for (let y = 0; y < H; y++) {
          set(rx, y, bridges.has(y) ? "bridge" : "river");
          if (R() < 0.5) set(rx + 1, y, bridges.has(y) ? "bridge" : "river");
          if (R() < 0.35) rx += R() < 0.5 ? -1 : 1;
          rx = Math.max(6, Math.min(W - 8, rx));
        }
        blob("forest", 4, 1, 2.2); blob("hill", 3, 1, 2); blob("swamp", 1, 1, 1.5);
        break;
      }
      case "mountain": blob("mountain", 6, 1, 2.2, 0.95, 4, W - 5); blob("hill", 6, 1, 2.2, 0.7); blob("forest", 2, 1, 1.6); break;
      case "swamp": blob("swamp", 6, 1.5, 2.8); blob("forest", 4, 1, 2); blob("valley", 2, 1.5, 2.5); blob("hill", 1, 1, 1.5); break;
      default: blob("forest", 4, 1.5, 2.6); blob("hill", 3, 1, 2); blob("mountain", 1, 0.8, 1.3, 0.9, 6, W - 7); break;
    }
    // keep deployment zones usable
    for (let y = 0; y < H; y++) for (const x of [0, 1, 2, W - 3, W - 2, W - 1]) {
      const v = get(x, y);
      if (v === "mountain") set(x, y, "hill");
      if (v === "river") set(x, y, "plains");
    }
    // castle walls
    const wallHp = {};
    if (walls) {
      const x = walls.x;
      const gaps = new Set();
      for (let i = 0; i < walls.gaps; i++) gaps.add(Math.round(((i + 1) * H) / (walls.gaps + 1)) - (walls.gaps === 1 ? 0 : 0));
      for (let y = 0; y < H; y++) {
        if (gaps.has(y)) set(x, y, "plains");
        else { set(x, y, "wall"); wallHp[y * W + x] = walls.hp; }
      }
    }
    // make sure there is always a land route between the two armies
    for (let tries = 0; tries < 6 && !this.connected(t, walls); tries++) {
      let y = Math.floor(R() * H);
      for (let x = 0; x < W; x++) {
        const v = get(x, y);
        if (v === "mountain") set(x, y, "hill");
        else if (v === "river") set(x, y, "bridge");
        else if (v === "wall" && tries > 2) { set(x, y, "plains"); delete wallHp[y * W + x]; }
        if (R() < 0.3) y = Math.max(0, Math.min(H - 1, y + (R() < 0.5 ? -1 : 1)));
      }
    }
    return { tiles: t, wallHp };
  },
  connected(t, walls) {
    const W = this.W, H = this.H, seen = new Uint8Array(W * H), q = [];
    for (let y = 0; y < H; y++) if (t[y * W] !== "mountain") { seen[y * W] = 1; q.push(y * W); }
    while (q.length) {
      const i = q.pop(), x = i % W, y = (i / W) | 0;
      if (x === W - 1) return true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (seen[j] || t[j] === "mountain" || t[j] === "wall") continue;
        seen[j] = 1; q.push(j);
      }
    }
    return false;
  },

  /* ===================== setup ===================== */
  /**
   * opts: { title, mapType, seed, playerUnits, enemyUnits, guards, attacker: "player"|"enemy",
   *         tactic, enemyTactic, walls: { side, level } | null, context, maxTurns }
   */
  create(opts) {
    const W = this.W, H = this.H;
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    let walls = null;
    if (opts.walls && opts.walls.level > 0) {
      const lvl = opts.walls.level;
      walls = {
        side: opts.walls.side,
        x: opts.walls.side === "player" ? 4 : W - 5,
        gaps: Math.max(1, 4 - Math.floor(lvl / 2)),
        hp: Math.round(120 * (1 + 0.5 * lvl) * (opts.walls.hpMult || 1)),
      };
    }
    const map = this.generateMap(opts.mapType || "plains", seed, walls);
    const b = {
      title: opts.title || "Battle",
      mapType: opts.mapType || "plains",
      seed, w: W, h: H,
      tiles: map.tiles, wallHp: map.wallHp, wallMax: walls ? walls.hp : 0,
      wallSide: walls ? walls.side : null, wallX: walls ? walls.x : -1,
      squads: [], nextId: 1,
      turn: 1, maxTurns: opts.maxTurns || 30,
      phase: "deploy", active: "player",
      attacker: opts.attacker || "player",
      defender: (opts.attacker || "player") === "player" ? "enemy" : "player",
      engaged: false,
      tactic: opts.tactic || "balanced",
      enemyTactic: opts.enemyTactic || "balanced",
      context: opts.context || {},
      bonus: { player: 1, enemy: 1, ...(opts.bonus || {}) },
      defBonus: { player: 1, enemy: 1, ...(opts.defBonus || {}) },
      weather: opts.weather && WEATHER[opts.weather] ? opts.weather : rollWeather(Math.random, opts.season),
      captains: { ...(opts.captains || {}) },     // captain id -> level (player side)
      vet: { ...(opts.vet || {}) },       // player unit type -> veteran rank (each rank: +6% attack and defense)
      vetXp: {},                          // player unit type -> enemy power destroyed in this battle
      fire: {},                           // tile index -> turns left burning
      heroFell: false, generalFell: false,
      morale: { player: Math.max(40, Math.min(100, 60 + 0.4 * (opts.morale ?? 100))), enemy: 100 },
      stats: { player: { dealt: 0, taken: 0 }, enemy: { dealt: 0, taken: 0 } },
      heroAtk: 1 + (opts.heroAtk || 0) / 100,
      fog: opts.fog !== false,
      objective: null,
      cmd: { level: (opts.context && opts.context.cmdLevel) || 1, power: armyPower(opts.playerUnits), cd: { rally: 0, barrage: 0, warcry: 0, march: 0 }, warcry: 0, march: 0 },
      initial: { player: { ...opts.playerUnits }, enemy: { ...opts.enemyUnits } },
      log: [], result: null,
    };
    this.addSquads(b, "player", opts.playerUnits);
    if (opts.guards) this.addSquads(b, "player", { guard: opts.guards });
    if (opts.hero) this.addSquads(b, "player", { [heroType(opts.hero, opts.heroHp || 0)]: 1 });
    this.addSquads(b, "enemy", opts.enemyUnits);
    // big enemy armies hold a quarter of their squads back as a second wave
    const foes = b.squads.filter((q) => q.side === "enemy" && !udef(q.type).general && !udef(q.type).boss);
    if (!opts.noWaves && foes.length >= 8) {
      const n = Math.floor(foes.length / 4);
      for (const q of foes.slice(-n)) { q.reserve = true; q.arrive = 3 + Math.floor(Math.random() * 2); }
    }
    this.autoDeploy(b, "player");
    this.autoDeploy(b, "enemy");
    this.initMorale(b);
    if (opts.objective) this.placeObjective(b);
    this.addLog(b, `${WEATHER[b.weather].icon} ${WEATHER[b.weather].name}: ${WEATHER[b.weather].desc}`);
    this.addLog(b, `${MAP_TYPES[b.mapType] || "Battlefield"}. ${b.attacker === "player" ? "You are attacking." : "You are defending."} Win before turn ${b.maxTurns} ends, or the defender holds.`);
    return b;
  },
  addSquads(b, side, units) {
    const list = Object.entries(units || {}).filter(([t, n]) => n > 0 && udef(t));
    const MAX_SQUADS = 14;
    let caps = list.map(([t]) => Math.max(1, Math.floor(420 / udef(t).hp)));
    let need = list.reduce((a, [, n], i) => a + Math.ceil(n / caps[i]), 0);
    if (need > MAX_SQUADS) {
      const f = need / MAX_SQUADS;
      caps = caps.map((c) => Math.ceil(c * f));
      need = list.reduce((a, [, n], i) => a + Math.ceil(n / caps[i]), 0);
    }
    list.forEach(([t, n], i) => {
      const parts = Math.ceil(n / caps[i]);
      for (let p = 0; p < parts; p++) {
        const cnt = Math.floor(n / parts) + (p < n % parts ? 1 : 0);
        if (cnt <= 0) continue;
        const hp = cnt * udef(t).hp;
        b.squads.push({ id: b.nextId++, side, type: t, hp, maxHp: hp, start: cnt, x: -1, y: -1, moved: false, acted: false, braced: false, movedDist: 0, skillCd: 0, broken: 0 });
      }
    });
  },
  deployDepth(b, side) {
    let d = 3;
    const t = TACTICS[side === "player" ? b.tactic : b.enemyTactic];
    if (t && t.deploy) d += t.deploy;
    if (b.wallSide === side) d = 4;
    return d;
  },
  inDeployZone(b, side, x, y) {
    const d = this.deployDepth(b, side);
    if (b.wallSide === side && x === b.wallX && this.tile(b, x, y) === "wall") return true;
    return side === "player" ? x < d : x >= b.w - d;
  },
  autoDeploy(b, side) {
    const sq = b.squads.filter((s) => s.side === side && !s.reserve);
    const tiles = [];
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++)
      if (this.inDeployZone(b, side, x, y) && this.canStand(b, { side, type: "militia" }, x, y)) tiles.push([x, y]);
    const order = { inf: 0, cav: 1, support: 2, ranged: 3, siege: 4 };
    sq.sort((a, c) => (order[udef(a.type).cls] ?? 0) - (order[udef(c.type).cls] ?? 0) || unitPower(udef(c.type)) - unitPower(udef(a.type)));
    const taken = new Set();
    const cy = (b.h - 1) / 2;
    for (const s of sq) {
      const d = udef(s.type);
      let best = null, bestScore = -Infinity;
      for (const [x, y] of tiles) {
        const k = y * b.w + x;
        if (taken.has(k)) continue;
        const fx = side === "player" ? x : b.w - 1 - x; // 0 = rear, higher = front
        const tr = TERRAIN[this.tile(b, x, y)];
        let score = -Math.abs(y - cy) * 0.6 + tr.def * 2 + Math.random() * 0.3;
        if (d.cls === "inf") score += fx * 4;
        else if (d.cls === "cav") score += fx * 2 + (Math.abs(y - cy) > 2 ? 2 : 0);
        else if (d.cls === "ranged") score += (tr.rangeBonus ? 8 : 0) + (fx === 1 ? 3 : 0) - (fx > 2 ? 2 : 0);
        else score += -fx * 3; // siege & support at the back
        if (score > bestScore) { bestScore = score; best = [x, y]; }
      }
      if (!best) { s.hp = 0; continue; } // nowhere to stand (shouldn't happen)
      taken.add(best[1] * b.w + best[0]);
      s.x = best[0]; s.y = best[1];
    }
    b.squads = b.squads.filter((s) => s.hp > 0 || s.reserve);
  },

  /* ===================== helpers ===================== */
  tile(b, x, y) { return b.tiles[y * b.w + x]; },
  terrainAt(b, s) { return TERRAIN[this.tile(b, s.x, s.y)]; },
  count(s) { return Math.max(0, Math.ceil(s.hp / udef(s.type).hp - 1e-9)); },
  /** Squads on the field (reserves waiting off the map are not included). */
  alive(b, side) { return b.squads.filter((s) => s.hp > 0 && !s.reserve && (!side || s.side === side)); },
  /** Every living squad, including reserves. */
  living(b, side) { return b.squads.filter((s) => s.hp > 0 && (!side || s.side === side)); },
  reserves(b, side) { return b.squads.filter((s) => s.hp > 0 && s.reserve && s.side === side); },
  sidePower(b, side) { return this.living(b, side).reduce((a, q) => a + unitPower(udef(q.type)) * this.count(q), 0); },
  at(b, x, y) { return b.squads.find((s) => s.hp > 0 && s.x === x && s.y === y); },
  dist(a, c) { return Math.max(Math.abs(a.x - c.x), Math.abs(a.y - c.y)); },
  tac(b, side) { return TACTICS[side === "player" ? b.tactic : b.enemyTactic] || TACTICS.balanced; },
  addLog(b, msg) { b.log.push(msg); if (b.log.length > 60) b.log.shift(); },
  opp(side) { return side === "player" ? "enemy" : "player"; },

  moveCost(b, s, x, y) {
    const t = this.tile(b, x, y), d = udef(s.type);
    if (d.flying) return 1;
    if (t === "wall") return b.wallSide === s.side ? 1 : Infinity;
    let c = TERRAIN[t].move;
    if ((d.cls === "cav" || d.mounted) && TERRAIN[t].cavExtra) c += 1;
    if (t === "river" && b.weather && WEATHER[b.weather].riverExtra) c += WEATHER[b.weather].riverExtra;
    if (d.cls === "siege" && t !== "plains" && t !== "bridge") c += 1;
    return c;
  },
  canStand(b, s, x, y) { return isFinite(this.moveCost(b, s, x, y)); },
  moveRange(b, s) {
    const march = s.side === "player" && b.cmd && b.cmd.march === b.turn && b.active === "player" ? 2 : 0;
    const sprint = s.sprint === b.turn && b.active === s.side ? 3 : 0;
    const w = (b.weather && WEATHER[b.weather].move) || 0;
    const cap = s.side === "player" ? this.capMods(b, s.type).move : 0;
    return Math.max(1, udef(s.type).mv + (this.tac(b, s.side).move || 0) + march + sprint + w + cap);
  },

  /** Tiles a squad can reach this turn: Map(index -> path cost). Enemies block; zone of control stops movement. */
  reachable(b, s) {
    const W = b.w, H = b.h, start = s.y * W + s.x;
    const out = new Map([[start, 0]]);
    if (s.moved || s.acted) return out;
    const mv = this.moveRange(b, s);
    const occ = new Map();
    for (const o of this.alive(b)) occ.set(o.y * W + o.x, o);
    const zoc = new Uint8Array(W * H);
    for (const o of this.alive(b, this.opp(s.side)))
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = o.x + dx, ny = o.y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) zoc[ny * W + nx] = 1;
      }
    const flying = udef(s.type).flying;
    const best = new Map([[start, 0]]);
    const open = [[0, start]];
    while (open.length) {
      let mi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[mi][0]) mi = i;
      const [c, i] = open.splice(mi, 1)[0];
      if (c > (best.get(i) ?? Infinity)) continue;
      if (i !== start && zoc[i] && !flying) continue; // can enter, can't keep going
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const o = occ.get(j);
        if (o && o.side !== s.side) continue;
        const nc = c + this.moveCost(b, s, nx, ny);
        if (nc > mv || nc >= (best.get(j) ?? Infinity)) continue;
        best.set(j, nc);
        open.push([nc, j]);
      }
    }
    for (const [j, c] of best) {
      const o = occ.get(j);
      if (o && o !== s) continue;
      // flyers can cross mountains but can't land on them
      if (this.tile(b, j % W, (j / W) | 0) === "mountain") continue;
      out.set(j, c);
    }
    return out;
  },

  /** Path-cost field from every enemy squad (units ignored). The AI uses it to march toward the enemy. */
  distanceField(b, s) {
    const W = b.w, H = b.h, f = new Float64Array(W * H).fill(Infinity), open = [];
    for (const o of this.alive(b, this.opp(s.side))) { f[o.y * W + o.x] = 0; open.push([0, o.y * W + o.x]); }
    while (open.length) {
      let mi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[mi][0]) mi = i;
      const [c, i] = open.splice(mi, 1)[0];
      if (c > f[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const nc = c + this.moveCost(b, s, x, y); // cost of leaving i toward the enemy
        if (!isFinite(nc) && c !== 0) continue;
        const cc = isFinite(nc) ? nc : c + 1;
        if (cc < f[j]) { f[j] = cc; open.push([cc, j]); }
      }
    }
    return f;
  },

  los(b, x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    let x = x0, y = y0;
    while (true) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && TERRAIN[this.tile(b, x, y)].blocksLOS) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  },
  range(b, s, x = s.x, y = s.y) {
    const d = udef(s.type);
    if (d.rng <= 1) return 1;
    const r = d.rng + (TERRAIN[this.tile(b, x, y)].rangeBonus || 0) + (this.tac(b, s.side).range || 0) + ((b.weather && WEATHER[b.weather].range) || 0) + (s.side === "player" ? this.capMods(b, s.type).range : 0);
    return Math.max(2, r);
  },
  canHit(b, s, x, y, tx, ty) {
    const d = udef(s.type);
    const dist = Math.max(Math.abs(x - tx), Math.abs(y - ty));
    if (dist < 1 || dist > this.range(b, s, x, y)) return false;
    if (d.minRng && dist < d.minRng) return false;
    if (dist > 1 && !this.los(b, x, y, tx, ty)) return false;
    return true;
  },
  targets(b, s) {
    if (s.acted || s.broken) return [];
    return this.alive(b, this.opp(s.side)).filter((o) => this.canHit(b, s, s.x, s.y, o.x, o.y));
  },
  wallTargets(b, s) {
    if (s.acted || s.broken || !b.wallSide || b.wallSide === s.side) return [];
    const out = [];
    for (const k of Object.keys(b.wallHp)) {
      const i = +k, x = i % b.w, y = (i / b.w) | 0;
      if (this.canHit(b, s, s.x, s.y, x, y) && !this.at(b, x, y)) out.push(i);
    }
    return out;
  },

  /* ===================== combat ===================== */
  damage(b, att, def, { retal = false, expected = false } = {}) {
    const A = udef(att.type), D = udef(def.type);
    const at = this.tile(b, att.x, att.y), dt = this.tile(b, def.x, def.y);
    const ta = this.tac(b, att.side), td = this.tac(b, def.side);
    const dist = this.dist(att, def);
    let m = expected ? 1 : 0.85 + Math.random() * 0.3;
    m *= (ta.atk && ta.atk[A.cls]) || 1;
    m *= ta.atkAll || 1;
    m *= (b.bonus && b.bonus[att.side]) || 1;
    if (att.side === "player" && b.cmd && b.cmd.warcry === b.turn && b.active === "player") m *= 1.3;
    if (this.inAura(b, att)) m *= 1.1;
    if (A.hero) m *= b.heroAtk || 1;
    const capA = att.side === "player" ? this.capMods(b, att.type) : NO_MODS;
    m *= 1 + capA.atk;
    m *= (STANCES[att.stance || "normal"] || STANCES.normal).atk;
    if (ta.ambush && (at === "forest" || at === "hill")) m *= ta.ambush;
    const ea = TERRAIN[at].elev, ed = TERRAIN[dt].elev;
    if (ea > ed) m *= 1.2; else if (ea < ed) m *= 0.85;
    if (A.antiCav && D.cls === "cav") m *= 2;
    if (A.cls === "cav" && D.cls === "ranged") m *= 1.5;
    if (A.vsBig && D.big) m *= A.slayer ? 2.5 : 1.6;
    if (att.side === "player" && b.vet) m *= 1 + 0.06 * (b.vet[att.type] || 0);
    if (dist > 1 && TERRAIN[dt].cover) m *= TERRAIN[dt].cover;
    if (!retal && A.charge && att.movedDist >= 3) m *= (ta.charge || 1.5) + capA.charge;
    if ((A.cls === "ranged" || A.cls === "siege") && dist === 1 && A.rng > 1) m *= 0.6;
    if (A.rng > 1 && dist > 1 && b.weather && WEATHER[b.weather].rangedAtk) m *= WEATHER[b.weather].rangedAtk;
    if (att.aimed && !retal) m *= 1.5;
    // flanking: every other squad already pressing the target adds +15% (max +45%)
    if (!retal) {
      let flank = 0;
      for (const o of b.squads) if (o !== att && o.hp > 0 && o.side === att.side && this.dist(o, def) === 1) flank++;
      m *= 1 + 0.15 * Math.min(3, flank);
    }
    let defense = D.def * TERRAIN[dt].def;
    if (def.braced) defense *= 1.5;
    defense *= (td.def && td.def[D.cls]) || 1;
    defense *= td.defAll || 1;
    defense *= (b.defBonus && b.defBonus[def.side]) || 1;
    if (def.side === "player" && b.vet) defense *= 1 + 0.06 * (b.vet[def.type] || 0);
    if (td.hold && !def.moved) defense *= td.hold;
    if (def.broken) defense *= 0.75;
    if (this.inAura(b, def)) defense *= 1.1;
    defense *= (STANCES[def.stance || "normal"] || STANCES.normal).def;
    if (def.side === "player") defense *= 1 + this.capMods(b, def.type).def;
    if (A.armorPierce) defense *= 0.6;
    return this.count(att) * A.atk * m * 8 / (8 + defense);
  },
  retaliationFactor(b, att, def) {
    const A = udef(att.type), D = udef(def.type);
    if (this.dist(att, def) > 1 || def.hp <= 0) return 0;
    if (D.cls === "siege") return 0;
    let f = D.rng > 1 ? 0.3 : 0.5;
    if (def.braced && D.antiCav && A.cls === "cav") f = 1;
    if (def.braced && this.tac(b, def.side).hold) f = 1;
    if (def.stance === "defensive") f = Math.min(1, f + 0.25);
    if (def.side === "player") f = Math.min(1, f + this.capMods(b, def.type).counter);
    return f;
  },
  /** Attack a squad; the defender strikes back if it's in melee. Returns events for animation. */
  attack(b, att, def, events = []) {
    const before = this.count(def);
    const A1 = udef(att.type);
    const kind = A1.splash ? "fireball" : A1.slayer ? "bolt" : A1.cls === "siege" ? "boulder" : A1.rng > 1 && this.dist(att, def) > 1 ? "arrow" : "slash";
    events.push({ proj: kind, from: [att.x, att.y], to: [def.x, def.y], aid: att.id });
    const dmg = this.damage(b, att, def);
    def.hp = Math.max(0, def.hp - dmg);
    const killed = before - this.count(def);
    events.push({ x: def.x, y: def.y, text: `−${killed}`, cls: "hit", id: def.id });
    const an = udef(att.type).name, dn = udef(def.type).name;
    let msg = `${att.side === "player" ? "Your" : "Enemy"} ${an} hit ${dn}: ${killed} killed`;
    if (def.hp <= 0) { msg += ` (squad destroyed)`; events.push({ destroyed: true, general: !!udef(def.type).general, hero: !!udef(def.type).hero }); this.onDestroyed(b, def, events); }
    if (udef(att.type).splash) this.ignite(b, def.x, def.y);
    if (att.side === "player" && killed > 0) b.vetXp[att.type] = (b.vetXp[att.type] || 0) + killed * unitPower(udef(def.type));
    att.aimed = false;
    // a squad that loses 30%+ in one blow while below 40% strength breaks and flees
    if (def.hp > 0 && !udef(def.type).boss && !def.broken && before > 0 && killed / before >= 0.3 && def.hp / def.maxHp < 0.4) {
      def.broken = 2;
      events.push({ x: def.x, y: def.y, text: "ROUT!", cls: "rout" });
      this.addLog(b, `💔 The ${def.side === "player" ? "your" : "enemy"} ${udef(def.type).name} squad breaks and flees!`);
    }
    // splash damage (battle mages): nearby enemy squads take part of the blast
    const A0 = udef(att.type);
    if (A0.splash) {
      let splashKills = 0;
      for (const o of this.alive(b, def.side)) {
        if (o === def || this.dist(o, def) > 1) continue;
        const b4 = this.count(o);
        o.hp = Math.max(0, o.hp - this.damage(b, att, o) * A0.splash * (1 + (att.side === "player" ? this.capMods(b, att.type).splash : 0)));
        const k = b4 - this.count(o);
        splashKills += k;
        if (att.side === "player" && k > 0) b.vetXp[att.type] = (b.vetXp[att.type] || 0) + k * unitPower(udef(o.type));
        if (o.hp <= 0) this.onDestroyed(b, o, events);
        events.push({ x: o.x, y: o.y, text: `−${k}`, cls: "hit", id: o.id });
      }
      if (splashKills) msg += `, +${splashKills} more caught in the blast`;
    }
    const rf = this.retaliationFactor(b, att, def);
    if (rf > 0) {
      const b4 = this.count(att);
      const rd = this.damage(b, def, att, { retal: true }) * rf;
      att.hp = Math.max(0, att.hp - rd);
      const rk = b4 - this.count(att);
      events.push({ x: att.x, y: att.y, text: `−${rk}`, cls: "hit", id: att.id });
      msg += `; ${rk} lost to the counterattack`;
    }
    this.addLog(b, msg + ".");
    att.acted = true;
    att.moved = true;
    this.checkEnd(b);
    return events;
  },
  attackWall(b, att, idx, events = []) {
    const A = udef(att.type);
    const dmg = this.count(att) * A.atk * (A.breach ? 4 : 0.25) * (1 + (att.side === "player" ? this.capMods(b, att.type).breach : 0));
    b.wallHp[idx] -= dmg;
    const x = idx % b.w, y = (idx / b.w) | 0;
    events.push({ x, y, text: `−${Math.round(dmg)}`, cls: "wallhit" });
    if (b.wallHp[idx] <= 0) {
      delete b.wallHp[idx];
      b.tiles[idx] = "rubble";
      this.addLog(b, `The wall has been breached!`);
      events.push({ x, y, text: "BREACH", cls: "breach" });
    }
    att.acted = true; att.moved = true;
    return events;
  },
  /** Move a squad. Leaving melee contact gives each adjacent enemy melee squad a free parting blow. */
  moveTo(b, s, idx, cost, events = []) {
    const nx = idx % b.w, ny = (idx / b.w) | 0;
    if (!udef(s.type).flying && (nx !== s.x || ny !== s.y)) {
      for (const o of this.alive(b, this.opp(s.side))) {
        const od = udef(o.type);
        if (od.rng > 1 || o.broken || this.dist(o, s) !== 1) continue;
        if (Math.max(Math.abs(o.x - nx), Math.abs(o.y - ny)) <= 1) continue; // still in contact
        const b4 = this.count(s);
        s.hp = Math.max(0, s.hp - this.damage(b, o, s, { retal: true }) * 0.35);
        const k = b4 - this.count(s);
        events.push({ x: s.x, y: s.y, text: `−${k}`, cls: "hit", id: s.id });
        this.addLog(b, `⚔ ${s.side === "player" ? "Your" : "Enemy"} ${udef(s.type).name} takes a parting blow from the ${od.name} while disengaging (−${k}).`);
        if (s.hp <= 0) { this.onDestroyed(b, s, events); this.checkEnd(b); return events; }
      }
    }
    s.x = nx; s.y = ny;
    s.moved = true; s.movedDist = cost;
    return events;
  },
  brace(b, s) { s.braced = true; s.acted = true; s.moved = true; },

  startTurn(b, side) {
    b.active = side;
    if (b.phase === "battle") {
      // scheduled waves, or reserves forced in when the field is empty
      const waiting = this.reserves(b, side);
      if (waiting.length) {
        const due = waiting.filter((q) => q.arrive && b.turn >= q.arrive);
        if (!this.alive(b, side).length) this.callReserves(b, side, false);
        else if (due.length) { let n = 0; for (const q of due) if (this.deployReserve(b, q, false)) n++; if (n) this.addLog(b, side === "enemy" ? `🥁 Enemy reinforcements arrive (${n} squad${n > 1 ? "s" : ""})!` : `📯 Reinforcements arrive (${n}).`); }
      }
      if (b.morale) b.morale[side] = Math.min(100, b.morale[side] + 3);
    }
    if (side === "player" && b.cmd && b.phase === "battle") for (const k of Object.keys(b.cmd.cd)) b.cmd.cd[k] = Math.max(0, b.cmd.cd[k] - 1);
    for (const s of this.alive(b, side)) {
      s.moved = false; s.acted = false; s.braced = false; s.movedDist = 0; s.aimed = false;
      if (s.skillCd > 0) s.skillCd--;
      const fi = s.y * b.w + s.x;
      if (b.fire && b.fire[fi]) { const b4 = this.count(s); s.hp = Math.max(1, s.hp - s.maxHp * 0.1); this.addLog(b, `🔥 Flames burn a ${side === "player" ? "friendly" : "enemy"} ${udef(s.type).name} squad (−${b4 - this.count(s)}).`); }
      if (s.broken > 0) { s.broken--; if (!s.broken) this.addLog(b, `The ${side === "player" ? "your" : "enemy"} ${udef(s.type).name} squad has regrouped.`); }
      const d = udef(s.type);
      if (d.regen) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * d.regen);
    }
    // healers mend nearby squads (healing can bring fallen soldiers back)
    for (const h of this.alive(b, side)) {
      const hd = udef(h.type);
      if (!hd.heal) continue;
      const amt = this.count(h) * hd.heal * (1 + (side === "player" ? this.capMods(b, h.type).heal : 0));
      for (const s of this.alive(b, side)) {
        if (s === h || this.dist(s, h) > 2 || s.hp >= s.maxHp) continue;
        s.hp = Math.min(s.maxHp, s.hp + amt);
      }
    }
  },
  begin(b) {
    if (b.phase !== "deploy") return;
    b.phase = "battle";
    this.aiStances(b, "enemy");
    this.startTurn(b, "player");
    this.addLog(b, `Turn 1. ${TACTICS[b.tactic].name} vs ${TACTICS[b.enemyTactic].name}.`);
  },
  checkEnd(b) {
    if (b.phase === "over") return true;
    this.updateMorale(b);
    const p = this.living(b, "player").length, e = this.living(b, "enemy").length;
    if (!e) this.finish(b, "player", "annihilation");
    else if (!p) this.finish(b, "enemy", "annihilation");
    else if (b.morale && b.phase === "battle") {
      if (b.morale.enemy <= 0 && !b.moraleImmune.enemy) this.finish(b, "player", "rout");
      else if (b.morale.player <= 0 && !b.moraleImmune.player) this.finish(b, "enemy", "rout");
    }
    return b.phase === "over";
  },
  finish(b, winner, reason) {
    b.phase = "over";
    b.result = { winner, reason };
    const txt = { annihilation: "The enemy army has been destroyed.", timeout: "Time ran out. The defenders held.", retreat: "You sounded the retreat.",
      rout: winner === "player" ? "The enemy's morale shattered and their army fled the field!" : "Your army's morale broke and it fled the field.",
      objective: winner === "player" ? "Your banner flies over the field. The position is yours!" : "The enemy holds the banner. The position is lost." };
    this.addLog(b, (winner === "player" ? "VICTORY! " : "DEFEAT. ") + (reason === "annihilation" && winner === "enemy" ? "Your army has been wiped out." : txt[reason]));
  },
  retreat(b) { if (b.phase !== "over") this.finish(b, "enemy", "retreat"); },
  /** Finish the current side's turn and start the next. */
  endTurn(b) {
    if (b.phase === "over") return;
    if (this.checkEnd(b)) return;
    if (b.active === "player") this.startTurn(b, "enemy");
    else {
      this.tickObjective(b);
      if (b.phase === "over") return;
      if (b.turn % 3 === 0) this.aiStances(b, "enemy");
      b.turn++;
      for (const k of Object.keys(b.fire || {})) {
        if (--b.fire[k] <= 0) { delete b.fire[k]; b.tiles[+k] = "ashes"; b.burnt = (b.burnt || []).concat(+k); }
      }
      if (b.turn > b.maxTurns) { this.finish(b, b.defender, "timeout"); return; }
      this.startTurn(b, "player");
      this.addLog(b, `— Turn ${b.turn} —`);
    }
  },

  /* ===================== AI ===================== */
  aiOrder(b, side) {
    const o = { ranged: 0, siege: 1, support: 2, cav: 3, inf: 4 };
    return this.alive(b, side).sort((a, c) => (o[udef(a.type).cls] ?? 5) - (o[udef(c.type).cls] ?? 5));
  },
  /** Decide one squad's action: { move: idx, cost, target?, wall?, brace? } */
  decide(b, s) {
    const W = b.w, side = s.side, opp = this.alive(b, this.opp(side));
    if (!opp.length) return null;
    const d = udef(s.type);
    if (d.general) b.generalCharge = this.alive(b, side).length <= 2 || opp.some((o) => this.dist(o, s) <= 3);
    // the defender waits in position until the attacker gets close
    if (side === b.defender && !b.engaged) {
      const near = this.alive(b, side).some((m) => opp.some((o) => this.dist(m, o) <= 6));
      if (near) b.engaged = true;
      else return { move: s.y * W + s.x, cost: 0, brace: true };
    }
    this.aiSkill(b, s);
    if (s.broken) {
      // flee: the reachable tile farthest from the enemy
      const f = this.distanceField(b, s);
      let best = s.y * W + s.x, bv = f[best];
      for (const [idx] of this.reachable(b, s)) if (f[idx] > bv && isFinite(f[idx])) { bv = f[idx]; best = idx; }
      return { move: best, cost: this.reachable(b, s).get(best) || 0, brace: true };
    }
    const reach = this.reachable(b, s);
    const ox = s.x, oy = s.y, om = s.movedDist;
    let best = null, bestScore = 0;
    const meleeOpp = opp.filter((o) => udef(o.type).rng <= 1);
    // danger: how much enemy power can reach each tile next turn (fragile units care more)
    const threats = opp.filter((o) => !o.broken).map((o) => ({ o, r: this.moveRange(b, o) + this.range(b, o), p: unitPower(udef(o.type)) * this.count(o) }));
    const fragile = d.rng > 1 || d.cls === "support" || d.general || d.cls === "siege";
    const dangerAt = (x, y) => threats.reduce((a, t) => a + (Math.max(Math.abs(t.o.x - x), Math.abs(t.o.y - y)) <= t.r ? t.p : 0), 0) * (fragile ? 0.02 : 0.004);
    // leaving melee contact costs a parting blow
    const engagedWith = d.flying ? [] : meleeOpp.filter((o) => !o.broken && this.dist(o, s) === 1);
    const priority = (o) => {
      const D = udef(o.type);
      return (1 + 0.5 * (1 - o.hp / o.maxHp)) * (D.general ? 1.6 : D.hero ? 1.5 : D.heal ? 1.3 : D.cls === "siege" ? 1.2 : 1);
    };
    for (const [idx, cost] of reach) {
      const x = idx % W, y = (idx / W) | 0;
      s.x = x; s.y = y; s.movedDist = cost;
      const tr = TERRAIN[this.tile(b, x, y)];
      let tileBonus = (tr.def - 1) * 4 + (d.rng > 1 && tr.rangeBonus ? 2 : 0) - (b.fire && b.fire[idx] ? 8 : 0) - dangerAt(x, y);
      for (const o of engagedWith) if (Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) > 1) tileBonus -= 3;
      if (d.rng > 1) {
        const threat = meleeOpp.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 2);
        if (threat) tileBonus -= 4;
      }
      for (const o of opp) {
        if (!this.canHit(b, s, x, y, o.x, o.y)) continue;
        const D = udef(o.type);
        const dmg = Math.min(this.damage(b, s, o, { expected: true }), o.hp);
        let value = (dmg / D.hp) * unitPower(D) * priority(o);
        if (dmg >= o.hp) value *= 1.5;
        const rf = this.retaliationFactor(b, s, o);
        if (rf) {
          const left = { ...o, hp: o.hp - dmg };
          const rd = Math.min(this.damage(b, left, s, { retal: true, expected: true }) * rf, s.hp);
          value -= (rd / d.hp) * unitPower(d) * 0.8;
        }
        const score = value + tileBonus;
        if (score > bestScore) { bestScore = score; best = { move: idx, cost, target: o.id }; }
      }
    }
    s.x = ox; s.y = oy; s.movedDist = om;
    if (best) return best;

    // generals hold their ground behind the line instead of charging in alone
    if (d.general && !b.generalCharge) return { move: s.y * W + s.x, cost: 0, brace: true };
    // badly hurt squads fall back toward a friendly healer
    const healer = this.alive(b, side).find((h) => h !== s && udef(h.type).heal);
    if (healer && s.hp < s.maxHp * 0.4) {
      let hb = null, hd = Infinity;
      for (const [idx, cost] of reach) {
        const x = idx % W, y = (idx / W) | 0;
        const dd = Math.max(Math.abs(x - healer.x), Math.abs(y - healer.y)) + dangerAt(x, y) * 0.2;
        if (dd < hd) { hd = dd; hb = { move: idx, cost, brace: true }; }
      }
      if (hb) return hb;
    }

    // siege: smash the enemy's walls if nothing else is in range
    if (d.breach && b.wallSide && b.wallSide !== side) {
      let wb = null, wd = Infinity;
      for (const [idx, cost] of reach) {
        const x = idx % W, y = (idx / W) | 0;
        for (const k of Object.keys(b.wallHp)) {
          const wi = +k, wx = wi % W, wy = (wi / W) | 0;
          if (this.at(b, wx, wy)) continue;
          s.x = x; s.y = y;
          const ok = this.canHit(b, s, x, y, wx, wy);
          s.x = ox; s.y = oy;
          if (!ok) continue;
          const dd = Math.min(...opp.map((o) => Math.hypot(o.x - wx, o.y - wy))) + cost * 0.1;
          if (dd < wd) { wd = dd; wb = { move: idx, cost, wall: wi }; }
        }
      }
      if (wb) return wb;
    }

    // objective battles: some squads march on (or guard) the banner
    const ob = b.objective;
    if (ob && !d.general && d.rng <= 1 && (s.id % 2 === 0 || side === b.attacker && ob.hold > 0)) {
      if (side === b.attacker || this.dist(s, ob) > 1) {
        let mb = null, md = this.dist(s, ob);
        for (const [idx, cost] of reach) {
          const dd = Math.max(Math.abs((idx % W) - ob.x), Math.abs(((idx / W) | 0) - ob.y)) + (side === b.defender && idx === ob.y * W + ob.x ? 1 : 0);
          if (dd < md) { md = dd; mb = { move: idx, cost, brace: side === b.defender }; }
        }
        if (mb) return mb;
        if (side === b.defender) return { move: s.y * W + s.x, cost: 0, brace: true };
      }
    }

    // otherwise advance (missile units try to stay out of melee)
    const f = this.distanceField(b, s);
    let mv = null, mvScore = Infinity;
    for (const [idx, cost] of reach) {
      let v = f[idx];
      if (!isFinite(v)) continue;
      if (d.rng > 1 && v < 2) v = 50;
      v -= TERRAIN[b.tiles[idx]].def * 0.3 - cost * 0.01;
      if (fragile) v += dangerAt(idx % W, (idx / W) | 0) * 0.15;
      for (const o of engagedWith) if (Math.max(Math.abs(o.x - (idx % W)), Math.abs(o.y - ((idx / W) | 0))) > 1) v += 2;
      if (v < mvScore) { mvScore = v; mv = { move: idx, cost }; }
    }
    if (!mv || mv.move === s.y * W + s.x) return { move: s.y * W + s.x, cost: 0, brace: true };
    return mv;
  },
  apply(b, s, dec, events = []) {
    if (!dec || s.hp <= 0) return events;
    const here = s.y * b.w + s.x;
    if (dec.move !== undefined && dec.move !== here) {
      events.push({ move: s.id, from: [s.x, s.y] });
      this.moveTo(b, s, dec.move, dec.cost, events);
      if (s.hp <= 0 || b.phase === "over") return events;
    }
    if (dec.target) {
      const t = b.squads.find((q) => q.id === dec.target && q.hp > 0);
      if (t) this.attack(b, s, t, events);
    } else if (dec.wall !== undefined) this.attackWall(b, s, dec.wall, events);
    else if (dec.brace) this.brace(b, s);
    s.acted = true; s.moved = true;
    return events;
  },
  /* ===================== captains ===================== */
  /** Bonuses your Captains give a unit type: {atk, def, move, range, heal, charge, splash, breach, counter}. */
  capMods(b, type) {
    if (!b.captains || typeof captainMods !== "function") return NO_MODS;
    let cache = CAP_CACHE.get(b);
    if (!cache) { cache = {}; CAP_CACHE.set(b, cache); }
    if (cache[type]) return cache[type];
    const d = udef(type), out = { atk: 0, def: 0, move: 0, range: 0, heal: 0, charge: 0, splash: 0, breach: 0, counter: 0, by: [] };
    for (const [id, lvl] of Object.entries(b.captains)) {
      const m = captainMods(id, lvl, d);
      if (!m) continue;
      for (const k of Object.keys(out)) if (k !== "by") out[k] += m[k] || 0;
      out.by.push(id);
    }
    return (cache[type] = out);
  },

  /* ===================== army morale ===================== */
  initMorale(b) {
    const fearlessTypes = new Set(["skeleton", "wraith", "necromancer", "lich", "demon"]);
    b.startPower = { player: this.sidePower(b, "player"), enemy: this.sidePower(b, "enemy") };
    b.lastPower = { ...b.startPower };
    b.fearless = {}; b.moraleImmune = {};
    for (const side of ["player", "enemy"]) {
      const all = this.living(b, side);
      const tot = all.reduce((a, q) => a + unitPower(udef(q.type)) * this.count(q), 0) || 1;
      b.fearless[side] = all.filter((q) => fearlessTypes.has(q.type)).reduce((a, q) => a + unitPower(udef(q.type)) * this.count(q), 0) / tot;
      b.moraleImmune[side] = all.some((q) => udef(q.type).boss && !udef(q.type).hero);
    }
  },
  /** Losses since the last check drain morale; an army at 0 morale flees the field. */
  updateMorale(b) {
    if (!b.morale || !b.startPower) return;
    for (const side of ["player", "enemy"]) {
      const now = this.sidePower(b, side), lost = (b.lastPower[side] || 0) - now;
      b.lastPower[side] = now;
      if (lost <= 0 || b.moraleImmune[side]) continue;
      b.stats[side].taken += lost;
      b.stats[this.opp(side)].dealt += lost;
      b.morale[side] = Math.max(0, b.morale[side] - (lost / (b.startPower[side] || 1)) * 120 * (1 - 0.5 * (b.fearless[side] || 0)));
    }
  },
  shakeMorale(b, side, amount) { if (b.morale && !b.moraleImmune[side]) b.morale[side] = Math.max(0, b.morale[side] - amount); },

  /* ===================== reserves & reinforcements ===================== */
  /** Bring a reserve squad onto the field at its own edge. tired = it can't act this turn. */
  deployReserve(b, q, tired) {
    const cands = [];
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++)
      if (this.inDeployZone(b, q.side, x, y) && this.canStand(b, q, x, y) && !this.at(b, x, y)) cands.push([x, y]);
    if (!cands.length) return false;
    const cy = (b.h - 1) / 2;
    cands.sort((a, c) => (q.side === "player" ? c[0] - a[0] : a[0] - c[0]) || Math.abs(a[1] - cy) - Math.abs(c[1] - cy));
    q.reserve = false; q.arrive = 0;
    q.x = cands[0][0]; q.y = cands[0][1];
    q.moved = q.acted = !!tired; q.braced = false; q.movedDist = 0;
    return true;
  },
  callReserves(b, side, tired = true) {
    let n = 0;
    for (const q of this.reserves(b, side)) if (this.deployReserve(b, q, tired)) n++;
    if (n) this.addLog(b, side === "player" ? `📯 Your reserves march onto the field (${n} squad${n > 1 ? "s" : ""}).` : `🥁 Enemy reinforcements arrive (${n} squad${n > 1 ? "s" : ""})!`);
    return n;
  },

  /** Make a saved (or older) battle safe to resume: fill missing fields and fix impossible positions. */
  repair(b) {
    if (!b || !b.squads) return b;
    b.fire = b.fire || {}; b.vet = b.vet || {}; b.vetXp = b.vetXp || {};
    b.bonus = { player: 1, enemy: 1, ...(b.bonus || {}) }; b.defBonus = { player: 1, enemy: 1, ...(b.defBonus || {}) };
    b.cmd = b.cmd || { level: 1, power: 0, cd: { rally: 0, barrage: 0, warcry: 0, march: 0 }, warcry: 0, march: 0 };
    b.weather = WEATHER[b.weather] ? b.weather : "clear";
    b.stats = b.stats || { player: { dealt: 0, taken: 0 }, enemy: { dealt: 0, taken: 0 } };
    b.squads = b.squads.filter((q) => udef(q.type));
    for (const q of b.squads) { q.skillCd = q.skillCd || 0; q.broken = q.broken || 0; q.hp = Math.max(0, Math.min(q.hp, q.maxHp)); }
    if (!b.morale) b.morale = { player: 100, enemy: 100 };
    if (!b.startPower) this.initMorale(b);
    const seen = new Set();
    for (const q of b.squads) {
      if (q.hp <= 0 || q.reserve) continue;
      const k = q.y * b.w + q.x;
      if (q.x < 0 || q.y < 0 || q.x >= b.w || q.y >= b.h || seen.has(k) || !this.canStand(b, q, q.x, q.y)) { q.reserve = true; this.deployReserve(b, q, false); }
      if (!q.reserve) seen.add(q.y * b.w + q.x);
    }
    return b;
  },

  /** A squad next to its own hero or general fights +10% better. */
  inAura(b, s) {
    for (const o of b.squads) {
      if (o === s || o.hp <= 0 || o.side !== s.side) continue;
      const d = udef(o.type);
      if ((d.aura || d.general) && this.dist(o, s) <= 1) return true;
    }
    return false;
  },
  /** Called when a squad is wiped out: generals and heroes falling shake the whole army; neighbours may panic. */
  onDestroyed(b, def, events) {
    const D = udef(def.type);
    if (D.general) {
      b.generalFell = def.side === "enemy" || b.generalFell;
      for (const o of this.alive(b, def.side)) if (!udef(o.type).boss) { o.broken = 2; events.push({ x: o.x, y: o.y, text: "ROUT!", cls: "rout" }); }
      this.addLog(b, `👑 The ${D.name} has fallen! The whole ${def.side === "enemy" ? "enemy" : "allied"} army wavers and breaks!`);
      this.shakeMorale(b, def.side, 25);
      return;
    }
    if (D.hero) {
      b.heroFell = true;
      b.bonus.player = (b.bonus.player || 1) * 0.85;
      this.addLog(b, "🩸 Your Lord Commander is struck down and carried from the field! Your army loses heart (−15% attack).");
      this.shakeMorale(b, "player", 20);
      return;
    }
    // panic spreads to nearby, already-battered squads
    for (const o of this.alive(b, def.side)) {
      const od = udef(o.type);
      if (od.boss || od.general || o.broken || this.dist(o, def) > 1 || o.hp > o.maxHp * 0.6) continue;
      if (Math.random() < 0.35) { o.broken = 2; events.push({ x: o.x, y: o.y, text: "PANIC", cls: "rout" }); this.addLog(b, `😱 Seeing their comrades fall, a ${def.side === "player" ? "friendly" : "enemy"} ${od.name} squad panics!`); }
    }
  },
  /** Fireballs set forests ablaze. */
  ignite(b, x, y) {
    const i = y * b.w + x;
    if (b.tiles[i] !== "forest" || b.fire[i]) return false;
    b.fire[i] = 2;
    this.addLog(b, "🔥 The forest catches fire!");
    return true;
  },

  /* ===================== fog of war (what YOUR scouts can see) ===================== */
  sight(b, s) {
    const d = udef(s.type), t = this.tile(b, s.x, s.y);
    let r = 4 + (TERRAIN[t].elev >= 2 ? 1 : 0) + (d.cls === "cav" || d.mounted ? 1 : 0) + (d.flying ? 2 : 0) + (d.hero ? 1 : 0);
    if (b.weather === "fog") r -= 2;
    return Math.max(2, r);
  },
  /** Tiles your army can currently see (Uint8Array). Enemies in forests stay hidden unless a squad is within 2 tiles. */
  visibility(b, side = "player") {
    const v = new Uint8Array(b.w * b.h);
    if (!b.fog || b.phase === "over") return v.fill(1);
    for (const s of this.alive(b, side)) {
      const r = this.sight(b, s);
      for (let y = Math.max(0, s.y - r); y <= Math.min(b.h - 1, s.y + r); y++)
        for (let x = Math.max(0, s.x - r); x <= Math.min(b.w - 1, s.x + r); x++) {
          const i = y * b.w + x;
          if (v[i]) continue;
          if (Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) <= 1 || this.los(b, s.x, s.y, x, y)) v[i] = 1;
        }
    }
    return v;
  },
  canSee(b, vis, o) {
    if (!b.fog || !vis[o.y * b.w + o.x]) return !b.fog;
    if (this.tile(b, o.x, o.y) !== "forest") return true;
    return this.alive(b, this.opp(o.side)).some((s) => this.dist(s, o) <= 2);
  },

  /* ===================== objective: plant and hold the banner ===================== */
  placeObjective(b) {
    const cx = Math.floor(b.w / 2), cy = Math.floor(b.h / 2);
    let best = null, bd = Infinity;
    for (let y = 0; y < b.h; y++) for (let x = 3; x < b.w - 3; x++) {
      if (!this.canStand(b, { side: b.attacker, type: "militia" }, x, y) || !this.canStand(b, { side: b.defender, type: "militia" }, x, y)) continue;
      const d = Math.abs(x - cx) * 1.2 + Math.abs(y - cy);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) {
      b.objective = { x: best[0], y: best[1], hold: 0, need: 3 };
      this.addLog(b, `🚩 Objective: ${b.attacker === "player" ? "you win" : "the enemy wins"} by holding the banner tile for ${b.objective.need} turns in a row.`);
    }
  },
  /** Called once per round: the attacker gains ground by standing on the banner. */
  tickObjective(b) {
    const o = b.objective;
    if (!o || b.phase !== "battle") return;
    const on = this.at(b, o.x, o.y);
    if (on && on.side === b.attacker) {
      o.hold++;
      this.addLog(b, `🚩 The ${b.attacker === "player" ? "your" : "enemy"} banner holds (${o.hold}/${o.need}).`);
      if (o.hold >= o.need) this.finish(b, b.attacker, "objective");
    } else o.hold = 0;
  },
  /** Enemy squads pick a stance that suits their role. */
  aiStances(b, side) {
    for (const q of this.alive(b, side)) {
      const d = udef(q.type);
      q.stance = d.rng > 1 || d.cls === "support" || d.cls === "siege" ? "normal" : side === b.defender || q.hp < q.maxHp * 0.5 ? "defensive" : "aggressive";
    }
  },

  /* ===================== squad skills ===================== */
  skillOf(s) { return SKILLS[udef(s.type).cls] || null; },
  skillBlocker(b, s) {
    const k = this.skillOf(s);
    if (!k) return "No skill";
    if (b.phase !== "battle" || b.active !== s.side) return "Not your turn";
    if (s.acted) return "Already acted";
    if (s.skillCd > 0) return `Ready in ${s.skillCd} turn${s.skillCd > 1 ? "s" : ""}`;
    if (k.id === "sprint" && s.moved) return "Use before moving";
    return null;
  },
  useSkill(b, s, events = []) {
    if (this.skillBlocker(b, s)) return false;
    const k = this.skillOf(s), d = udef(s.type);
    s.skillCd = k.cd + 1;
    const who = `${s.side === "player" ? "Your" : "Enemy"} ${d.name}`;
    if (k.id === "aimed") { s.aimed = true; this.addLog(b, `${k.icon} ${who} takes careful aim.`); }
    else if (k.id === "sprint") { s.sprint = b.turn; this.addLog(b, `${k.icon} ${who} sprints ahead.`); }
    else if (k.id === "secondwind") {
      const b4 = this.count(s);
      s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.2); s.broken = 0;
      events.push({ x: s.x, y: s.y, text: `+${this.count(s) - b4}`, cls: "heal", id: s.id });
      this.addLog(b, `${k.icon} ${who} catches a second wind (+${this.count(s) - b4}).`);
    } else if (k.id === "massheal") {
      for (const o of this.alive(b, s.side)) if (this.dist(o, s) <= 2) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.1); events.push({ x: o.x, y: o.y, text: "+", cls: "heal", id: o.id }); }
      this.addLog(b, `${k.icon} ${who} channels a mass heal.`);
    }
    return events;
  },
  /** AI decides whether a squad should use its skill before acting. */
  aiSkill(b, s) {
    if (this.skillBlocker(b, s)) return;
    const k = this.skillOf(s), foes = this.alive(b, this.opp(s.side));
    if (k.id === "aimed" && foes.some((o) => this.canHit(b, s, s.x, s.y, o.x, o.y))) this.useSkill(b, s);
    else if (k.id === "secondwind" && s.hp < s.maxHp * 0.6) this.useSkill(b, s);
    else if (k.id === "massheal" && this.alive(b, s.side).some((o) => this.dist(o, s) <= 2 && o.hp < o.maxHp * 0.8)) this.useSkill(b, s);
    else if (k.id === "sprint" && !s.moved && !foes.some((o) => this.dist(o, s) <= udef(s.type).mv + 1)) this.useSkill(b, s);
  },

  /* ===================== commander abilities ===================== */
  abilityBlocker(b, id) {
    const a = ABILITIES[id];
    if (!b.cmd || b.phase !== "battle" || b.active !== "player") return "Only during your turn";
    if (b.cmd.level < a.lvl) return `Commander level ${a.lvl}`;
    if (b.cmd.cd[id] > 0) return `Ready in ${b.cmd.cd[id]} turn${b.cmd.cd[id] > 1 ? "s" : ""}`;
    return null;
  },
  barrageDamage(b) { return (30 + 0.08 * b.cmd.power) * (1 + 0.05 * (b.cmd.level - 1)); },
  useAbility(b, id, cx, cy, events = []) {
    if (this.abilityBlocker(b, id)) return false;
    b.cmd.cd[id] = ABILITIES[id].cd + 1; // +1 because it ticks down at the start of your next turn
    if (id === "rally") {
      let healed = 0;
      for (const s of this.alive(b, "player")) {
        const before = this.count(s);
        s.broken = 0;
        s.hp = Math.min(s.maxHp, s.hp + s.maxHp * 0.15);
        healed += this.count(s) - before;
        events.push({ x: s.x, y: s.y, text: "+", cls: "heal", id: s.id });
      }
      this.addLog(b, `📯 Your Lord Commander rallies the troops: ${healed} soldiers return to the line.`);
    } else if (id === "barrage") {
      const dmg = this.barrageDamage(b);
      let killed = 0;
      for (const s of this.alive(b, "enemy")) {
        if (Math.abs(s.x - cx) > 1 || Math.abs(s.y - cy) > 1) continue;
        const D = udef(s.type), t = this.terrainAt(b, s);
        const before = this.count(s);
        s.hp = Math.max(0, s.hp - dmg * (t.cover || 1) * 8 / (8 + D.def * t.def));
        killed += before - this.count(s);
        events.push({ x: s.x, y: s.y, text: `−${before - this.count(s)}`, cls: "hit", id: s.id });
        if (s.hp <= 0) this.onDestroyed(b, s, events);
      }
      for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++)
        if (x >= 0 && y >= 0 && x < b.w && y < b.h) events.push({ x, y, text: "➶", cls: "arrow" });
      this.addLog(b, `🎯 Arrow Barrage! ${killed} enemies fall.`);
      this.checkEnd(b);
    } else if (id === "warcry") {
      b.cmd.warcry = b.turn;
      this.addLog(b, "🔥 War Cry! Your army strikes +30% harder this turn.");
    } else if (id === "march") {
      b.cmd.march = b.turn;
      this.addLog(b, "🥾 Forced March! +2 movement for squads that haven't moved.");
    }
    return events;
  },
  /** Best 3×3 barrage target: [x, y, enemyHpHit]. */
  barrageTarget(b) {
    let best = null, bestV = 0;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      let v = 0;
      for (const s of this.alive(b, "enemy")) if (Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1) v += Math.min(s.hp, this.barrageDamage(b)) / udef(s.type).hp * unitPower(udef(s.type));
      if (v > bestV) { bestV = v; best = [x, y]; }
    }
    return best;
  },
  /** Your captains use the commander's abilities sensibly in auto battles. */
  aiAbilities(b) {
    if (!b.cmd || b.active !== "player") return;
    if (this.reserves(b, "player").length && (b.turn >= 3 || this.alive(b, "player").length <= this.living(b, "player").length / 2)) this.callReserves(b, "player");
    const mine = this.alive(b, "player"), foes = this.alive(b, "enemy");
    const hp = mine.reduce((a, s) => a + s.hp, 0), max = mine.reduce((a, s) => a + s.maxHp, 0);
    if (!this.abilityBlocker(b, "rally") && hp < max * 0.75) this.useAbility(b, "rally");
    if (!this.abilityBlocker(b, "barrage")) { const t = this.barrageTarget(b); if (t) this.useAbility(b, "barrage", t[0], t[1]); }
    const close = mine.some((m) => foes.some((o) => this.dist(m, o) <= 3));
    if (!this.abilityBlocker(b, "warcry") && close) this.useAbility(b, "warcry");
    if (!this.abilityBlocker(b, "march") && b.attacker === "player" && !close && b.turn <= 3) this.useAbility(b, "march");
  },

  /** Run the AI for every squad on `side` that hasn't acted. */
  runSide(b, side) {
    if (side === "player") this.aiAbilities(b);
    for (const s of this.aiOrder(b, side)) {
      if (b.phase === "over") return;
      if (s.hp <= 0 || s.acted) continue;
      this.apply(b, s, this.decide(b, s));
    }
  },
  /** Fight the whole battle automatically (both sides AI). */
  simulate(b) {
    this.begin(b);
    let guard = 0;
    while (b.phase !== "over" && guard++ < 400) {
      this.runSide(b, b.active);
      if (b.phase === "over") break;
      this.endTurn(b);
    }
    if (b.phase !== "over") this.finish(b, b.defender, "timeout");
    return b.result;
  },

  survivors(b, side) {
    const out = {};
    for (const s of b.squads) {
      if (s.side !== side || s.hp <= 0 || s.type === "guard") continue;
      out[s.type] = (out[s.type] || 0) + this.count(s);
    }
    // healing can't raise more soldiers than started
    for (const t of Object.keys(out)) out[t] = Math.min(out[t], b.initial[side][t] || 0);
    return out;
  },
  losses(b, side) {
    const sv = this.survivors(b, side), out = {};
    for (const [t, n] of Object.entries(b.initial[side])) out[t] = n - (sv[t] || 0);
    return out;
  },
  /** Estimate the win chance by simulating `n` auto-battles. */
  estimate(opts, n = 8) {
    let wins = 0, lossFrac = 0;
    const start = Object.values(opts.playerUnits).reduce((a, c) => a + c, 0) || 1;
    for (let i = 0; i < n; i++) {
      const b = this.create({ ...opts, seed: undefined });
      const r = this.simulate(b);
      if (r.winner === "player") wins++;
      const sv = Object.values(this.survivors(b, "player")).reduce((a, c) => a + c, 0);
      lossFrac += 1 - sv / start;
    }
    return { chance: wins / n, losses: lossFrac / n };
  },
};

/* =====================================================================
   BATTLEFIELD UI (you lead the army yourself)
   ===================================================================== */
const BattleUI = {
  b: null,
  sel: null,
  busy: false,
  cell: 48,
  onDone: null,
  speed: (() => { try { return +localStorage.getItem("ironhold_battle_speed") || 1; } catch { return 1; } })(),
  lastMove: null,

  open(b, onDone) {
    Battle.repair(b);
    this.b = b; this.onDone = onDone; this.sel = null; this.busy = false; this.targeting = null;
    if (typeof Sound !== "undefined") { Sound.music("battle"); Sound.play("horn"); }
    let root = document.getElementById("battleRoot");
    if (!root) { root = document.createElement("div"); root.id = "battleRoot"; document.body.appendChild(root); }
    root.innerHTML = `
      <div class="bf">
        <div class="bf-top">
          <div><h2 id="bfTitle"></h2><div class="bf-sub" id="bfSub"></div></div>
          <div class="btn-row" id="bfButtons"></div>
        </div>
        <div class="bf-main">
          <div class="bf-board-wrap" id="bfWrap"><div class="bf-board" id="bfBoard"></div></div>
          <aside class="bf-side">
            <div class="bf-card" id="bfSel"></div>
            <div class="bf-card" id="bfHover"></div>
            <div class="bf-card"><div class="bf-h">Battle log</div><div class="bf-log" id="bfLog"></div></div>
          </aside>
        </div>
      </div>`;
    document.body.classList.add("in-battle");
    this.bindOnce();
    this.layout();
    this.renderTiles();
    this.render();
    this.banner(b.title, `${WEATHER[b.weather || "clear"].icon} ${WEATHER[b.weather || "clear"].name} · ${MAP_TYPES[b.mapType] || ""}`, "intro");
    window.addEventListener("resize", this._resize = () => { this.layout(); this.renderTiles(); this.render(); });
  },
  close() {
    if (typeof Sound !== "undefined") Sound.music("city");
    const root = document.getElementById("battleRoot");
    if (root) root.innerHTML = "";
    document.body.classList.remove("in-battle");
    window.removeEventListener("resize", this._resize);
    this.b = null;
  },
  bindOnce() {
    if (this._bound) return;
    this._bound = true;
    document.addEventListener("click", (e) => {
      if (!this.b) return;
      const btn = e.target.closest("[data-bf]");
      if (btn && !btn.disabled) { this.action(btn.dataset.bf, btn.dataset); return; }
      const cell = e.target.closest("[data-cell]");
      if (cell && e.target.closest("#bfBoard")) this.click(+cell.dataset.cell);
    });
    document.addEventListener("mouseover", (e) => {
      if (!this.b) return;
      const cell = e.target.closest("#bfBoard [data-cell]");
      if (cell) this.hover(+cell.dataset.cell);
    });
    document.addEventListener("contextmenu", (e) => { if (this.b && e.target.closest("#bfBoard")) { e.preventDefault(); this.sel = null; this.targeting = null; this.render(); } });
    document.addEventListener("keydown", (e) => {
      if (!this.b || this.busy) return;
      if (e.key === "Escape") { this.sel = null; this.targeting = null; this.render(); }
      if (e.key === "Enter" && this.b.phase === "battle" && this.b.active === "player") this.action("end", {});
    });
  },
  layout() {
    const b = this.b;
    const narrow = window.innerWidth < 900;
    const availW = window.innerWidth - (narrow ? 24 : 340);
    const availH = window.innerHeight - (narrow ? 260 : 110);
    // phones: keep tiles big enough to tap and let the board scroll sideways
    this.cell = narrow ? Math.max(34, Math.floor(availW / b.w)) : Math.max(26, Math.floor(Math.min(availW / b.w, availH / b.h)));
    const board = document.getElementById("bfBoard");
    board.style.width = b.w * this.cell + "px";
    board.style.height = b.h * this.cell + "px";
    board.style.setProperty("--cell", this.cell + "px");
  },
  /** AI terrain texture for a tile type, if it has been generated. */
  tex(t) {
    const k = "t_" + t;
    return typeof AssetPipeline !== "undefined" && AssetPipeline.hasArt(k) ? AssetPipeline.src(k) : null;
  },
  tileHtml(i) {
    const b = this.b, c = this.cell, x = i % b.w, y = (i / b.w) | 0, t = b.tiles[i], tx = this.tex(t);
    const glyph = tx ? {} : { forest: "🌲", mountain: "⛰️" };
    return `<div class="tile t-${t} elev-${TERRAIN[t].elev}${tx ? " tex" : ""}" data-cell="${i}" style="left:${x * c}px;top:${y * c}px${tx ? `;background-image:url('${tx}')` : ""}">${glyph[t] ? `<span>${glyph[t]}</span>` : ""}</div>`;
  },
  renderTiles() {
    const b = this.b, board = document.getElementById("bfBoard");
    let h = "";
    for (let i = 0; i < b.w * b.h; i++) h += this.tileHtml(i);
    h += `<div id="bfFog"></div><div id="bfMarks"></div><div id="bfUnits"></div><div id="bfFx"></div><div class="weather w-${b.weather || "clear"}" id="bfWeather"></div><div id="bfBanner"></div>`;
    board.innerHTML = h;
  },
  updateTile(i) {
    const el = document.querySelector(`#bfBoard .tile[data-cell="${i}"]`);
    if (el) el.outerHTML = this.tileHtml(i);
  },
  /** Big centred banner: battle start, whose turn it is, victory/defeat. */
  banner(text, sub, cls = "") {
    const el = document.getElementById("bfBanner");
    if (!el) return;
    el.className = "bbanner " + cls;
    el.innerHTML = `<div><b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
    void el.offsetWidth; el.classList.add("show");
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => el.classList.remove("show"), 1400 / Math.max(1, this.speed / 1.5));
  },

  render() {
    const b = this.b, c = this.cell;
    if (!b) return;
    const ctx = b.context || {};
    document.getElementById("bfTitle").textContent = b.title;
    const phaseTxt = b.phase === "deploy" ? "Deployment: click one of your squads, then a tile in the blue zone to move it (or another squad to swap)."
      : b.phase === "over" ? (b.result.winner === "player" ? "Victory!" : "Defeat")
      : this.targeting ? "Arrow Barrage: click the centre of the 3×3 area to hit (Esc to cancel)."
      : b.active === "player" ? "Your turn. Select a squad, move it (blue), attack (red), or Brace. Commander abilities are on the left of the buttons." : "The enemy is moving…";
    const mor = b.morale ? `<span class="mor-wrap" title="Army morale: at 0 the army flees">You <span class="mbar p"><i style="width:${b.morale.player}%"></i></span> ${Math.round(b.morale.player)} · Foe <span class="mbar e"><i style="width:${b.moraleImmune && b.moraleImmune.enemy ? 100 : b.morale.enemy}%"></i></span> ${b.moraleImmune && b.moraleImmune.enemy ? "fearless" : Math.round(b.morale.enemy)}</span> · ` : "";
    const waves = Battle.reserves(b, "enemy").length;
    document.getElementById("bfSub").innerHTML = mor + (waves ? `🥁 ${waves} enemy squads in reserve · ` : "") + `${WEATHER[b.weather || "clear"].icon} ${WEATHER[b.weather || "clear"].name} · ${esc(MAP_TYPES[b.mapType] || "")} · Turn <b>${Math.min(b.turn, b.maxTurns)}</b>/${b.maxTurns} · ${TACTICS[b.tactic].icon} ${TACTICS[b.tactic].name} · <span class="dim">${esc(phaseTxt)}</span>`;

    // buttons
    let btns = "";
    if (b.phase === "deploy") {
      btns = `<select id="bfTactic" class="bf-select">${Object.entries(TACTICS).filter(([, t]) => t.lvl <= (ctx.cmdLevel || 1)).map(([k, t]) => `<option value="${k}" ${k === b.tactic ? "selected" : ""}>${t.icon} ${t.name}</option>`).join("")}</select>
        <button class="btn" data-bf="autodeploy">Auto-deploy</button>
        <button class="btn" data-bf="reserve" ${this.selSquad() ? "" : "disabled"} title="Keep the selected squad off the field; call it in later">⛺ To reserve</button>
        <button class="btn primary" data-bf="begin">⚔ Begin battle</button>`;
    } else if (b.phase === "battle") {
      const my = b.active === "player" && !this.busy;
      const ab = Object.entries(ABILITIES).map(([k, a]) => {
        const blk = this.abilityBlocker(k);
        const cd = b.cmd ? b.cmd.cd[k] : 0;
        return `<button class="btn ability ${this.targeting === k ? "armed" : ""}" data-bf="ability" data-id="${k}" ${my && !blk ? "" : "disabled"} title="${esc(a.name)}: ${esc(a.desc)}${blk ? " (" + esc(blk) + ")" : ""}">${a.icon}${cd > 0 ? `<small>${cd}</small>` : ""}</button>`;
      }).join("");
      const sqs = this.selSquad(), sk = sqs ? Battle.skillOf(sqs) : null;
      const skBlk = sqs && sk ? Battle.skillBlocker(b, sqs) : "Select a squad";
      const skBtn = `<button class="btn" data-bf="skill" ${my && sk && !skBlk ? "" : "disabled"} title="${sk ? esc(sk.name + ": " + sk.desc) : "Select one of your squads to use its skill"}${skBlk && sk ? " (" + esc(skBlk) + ")" : ""}">${sk ? sk.icon + " " + sk.name : "✦ Skill"}${sqs && sqs.skillCd > 0 ? ` <small>${sqs.skillCd}</small>` : ""}</button>`;
      btns = `<span class="abilities" title="Lord Commander abilities">${ab}</span>${skBtn}<button class="btn" data-bf="brace" ${my && this.sel && !this.selSquad()?.acted ? "" : "disabled"} title="Skip this squad's attack: +50% defense until your next turn">🛡 Brace</button>
        <button class="btn" data-bf="auto" ${my ? "" : "disabled"} title="Let your captains finish the battle">Auto-battle</button>
        <button class="btn" data-bf="stance" ${my && this.selSquad() && this.selSquad().side === "player" ? "" : "disabled"} title="Cycle the selected squad's stance: Normal → Aggressive → Defensive">${this.selSquad() ? STANCES[this.selSquad().stance || "normal"].icon + " " + STANCES[this.selSquad().stance || "normal"].name : "⚖️ Stance"}</button>
        <button class="btn" data-bf="callres" ${my && Battle.reserves(b, "player").length ? "" : "disabled"} title="Your reserves march in at your edge (they can act next turn)">📯 Reserves (${Battle.reserves(b, "player").length})</button>
        <button class="btn" data-bf="undo" ${my && this.canUndo() ? "" : "disabled"} title="Take back your last move (if that squad hasn't attacked)">↶ Undo</button>
        <button class="btn" data-bf="speed" title="Enemy turn animation speed">⏩ ${this.speed}×</button>
        <button class="btn danger" data-bf="retreat" ${my ? "" : "disabled"}>Retreat</button>
        <button class="btn primary" data-bf="end" ${my ? "" : "disabled"}>End turn ⏎</button>`;
    } else {
      btns = `<button class="btn primary" data-bf="close">Return to the city</button>`;
    }
    document.getElementById("bfButtons").innerHTML = btns;
    const ts = document.getElementById("bfTactic");
    if (ts) ts.onchange = () => { b.tactic = ts.value; if (TACTICS[b.tactic].deploy) Battle.autoDeploy(b, "player"); this.render(); };

    // fog of war
    const vis = Battle.visibility(b, "player");
    this.vis = vis;
    let fogH = "";
    if (b.fog && b.phase !== "over") for (let i = 0; i < b.w * b.h; i++) if (!vis[i]) fogH += `<div class="fogt" style="left:${(i % b.w) * c}px;top:${((i / b.w) | 0) * c}px"></div>`;
    document.getElementById("bfFog").innerHTML = fogH;

    // marks (deploy zone, reachable, targets)
    let marks = "";
    if (b.objective) {
      const o = b.objective;
      marks += `<div class="mark m-obj" style="left:${o.x * c}px;top:${o.y * c}px"><span>🚩</span>${o.hold ? `<b>${o.hold}/${o.need}</b>` : ""}</div>`;
    }
    const sq = this.selSquad();
    if (b.phase === "deploy") {
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++)
        if (Battle.inDeployZone(b, "player", x, y)) marks += `<div class="mark m-deploy" style="left:${x * c}px;top:${y * c}px"></div>`;
    } else if (sq && b.phase === "battle" && b.active === "player") {
      if (!sq.moved && !sq.acted) for (const [i] of Battle.reachable(b, sq)) {
        if (i === sq.y * b.w + sq.x) continue;
        marks += `<div class="mark m-move" data-cell="${i}" style="left:${(i % b.w) * c}px;top:${((i / b.w) | 0) * c}px"></div>`;
      }
      if (udef(sq.type).rng > 1 && !sq.acted) {
        const r = Battle.range(b, sq);
        for (let y = Math.max(0, sq.y - r); y <= Math.min(b.h - 1, sq.y + r); y++) for (let x = Math.max(0, sq.x - r); x <= Math.min(b.w - 1, sq.x + r); x++)
          if ((x !== sq.x || y !== sq.y) && Battle.canHit(b, sq, sq.x, sq.y, x, y)) marks += `<div class="mark m-range" style="left:${x * c}px;top:${y * c}px"></div>`;
      }
      for (const t of Battle.targets(b, sq).filter((o) => Battle.canSee(b, vis, o))) marks += `<div class="mark m-attack" data-cell="${t.y * b.w + t.x}" style="left:${t.x * c}px;top:${t.y * c}px"></div>`;
      for (const i of Battle.wallTargets(b, sq)) marks += `<div class="mark m-attack" data-cell="${i}" style="left:${(i % b.w) * c}px;top:${((i / b.w) | 0) * c}px"></div>`;
    }
    for (const k of Object.keys(b.fire || {})) {
      const i = +k;
      marks += `<div class="mark m-fire" style="left:${(i % b.w) * c}px;top:${((i / b.w) | 0) * c}px"><span>🔥</span></div>`;
    }
    for (const i of b.burnt || []) this.updateTile(i);
    b.burnt = [];
    for (const [k, hp] of Object.entries(b.wallHp)) {
      const i = +k;
      marks += `<div class="wallbar" style="left:${(i % b.w) * c}px;top:${((i / b.w) | 0) * c}px"><i style="width:${Math.max(0, hp / b.wallMax) * 100}%"></i></div>`;
    }
    document.getElementById("bfMarks").innerHTML = marks;

    // units (keep DOM nodes so moves animate)
    const layer = document.getElementById("bfUnits");
    const seen = new Set();
    for (const s of b.squads) {
      let el = layer.querySelector(`[data-sq="${s.id}"]`);
      if (s.hp <= 0) { if (el) { el.classList.add("dead"); setTimeout(() => el.remove(), 450); } continue; }
      seen.add(String(s.id));
      const d = udef(s.type);
      if (!el) {
        el = document.createElement("div");
        el.dataset.sq = s.id;
        const sk = this.spriteKey(s.type);
        el.innerHTML = sk ? `<i class="base"></i><img class="fig" src="${AssetPipeline.src(sk)}" alt=""><b class="cnt"></b><i class="hpb"><i></i></i>`
          : `<img data-asset="${d.asset}" alt=""><b class="cnt"></b><i class="hpb"><i></i></i>`;
        if (sk) el.classList.add("spr-unit");
        layer.appendChild(el);
        if (typeof AssetPipeline !== "undefined") AssetPipeline.applyAll(el);
      }
      el.dataset.cell = s.y * b.w + s.x;
      el.style.display = s.side === "enemy" && b.phase !== "deploy" && !Battle.canSee(b, vis, s) ? "none" : "";
      if (b.phase === "deploy" && s.side === "enemy" && !Battle.canSee(b, vis, s)) el.style.display = "none";
      el.className = `unit${el.querySelector(".fig") ? " spr-unit" : ""}${d.big ? " big" : ""} side-${s.side} st-${s.stance || "normal"}${s.side === "player" && Battle.capMods(b, s.type).by.length ? " capt" : ""}${d.hero ? " hero" : ""}${d.general ? " general" : ""}${s.broken ? " broken" : ""}${s.aimed ? " aimed" : ""}${sq === s ? " sel" : ""}${s.acted && b.phase === "battle" && s.side === b.active ? " done" : ""}${s.braced ? " braced" : ""}${d.boss ? " boss" : ""}`;
      el.style.left = s.x * c + "px"; el.style.top = s.y * c + "px";
      el.title = `${d.name} ×${Battle.count(s)}`;
      el.querySelector(".cnt").textContent = Battle.count(s);
      el.querySelector(".hpb i").style.width = (s.hp / s.maxHp) * 100 + "%";
    }
    for (const el of [...layer.children]) if (!seen.has(el.dataset.sq) && !el.classList.contains("dead")) el.remove();

    // selected panel
    const resv = Battle.reserves(b, "player");
    const resHtml = resv.length ? `<div class="bf-h" style="margin-top:8px">⛺ Your reserves</div><div class="bf-army">${resv.map((q) => `<span ${b.phase === "deploy" ? `class="res-chip-b" data-bf="unreserve" data-id="${q.id}" title="Put back on the field"` : ""}>${udef(q.type).name} <b>${Battle.count(q)}</b></span>`).join("")}</div>` : "";
    document.getElementById("bfSel").innerHTML = (sq ? this.squadCard(sq, true) : `<div class="bf-h">Your army</div>${this.armySummary("player")}<div class="bf-h" style="margin-top:8px">Enemy</div>${this.armySummary("enemy")}`) + resHtml;
    // log
    document.getElementById("bfLog").innerHTML = b.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join("");

    if (b.phase === "over" && !this._shownEnd) { this._shownEnd = true; this.banner(b.result.winner === "player" ? "Victory!" : "Defeat", "", b.result.winner === "player" ? "win" : "lose"); if (typeof Sound !== "undefined") Sound.play(b.result.winner === "player" ? "victory" : "defeat"); setTimeout(() => this.showEnd(), 900); }
  },
  armySummary(side) {
    const b = this.b, tot = {};
    for (const s of Battle.alive(b, side)) tot[s.type] = (tot[s.type] || 0) + Battle.count(s);
    const p = Object.entries(tot).reduce((a, [t, n]) => a + unitPower(udef(t)) * n, 0);
    return `<div class="bf-army">${Object.entries(tot).map(([t, n]) => `<span>${udef(t).name} <b>${n}</b></span>`).join("") || '<span class="dim">none</span>'}</div><div class="dim" style="font-size:11.5px">Power ⚔ ${fmt(p)}</div>`;
  },
  squadCard(s, mine) {
    const b = this.b, d = udef(s.type), t = Battle.terrainAt(b, s);
    const traits = [d.hero && "Your hero: +10% to adjacent allies. If he falls, the army loses heart", d.general && "General: +10% to adjacent allies. Kill it to rout the whole enemy army!", d.antiCav && "Anti-cavalry ×2", d.charge && "Charge", d.armorPierce && "Armor-piercing", d.heal && `Heals ${d.heal}/soldier`, d.breach && "Breaches walls", d.vsBig && (d.slayer ? "×2.5 vs giants" : "×1.6 vs giants"), d.splash && "Splash damage", d.mounted && "Mounted", d.flying && "Flying", d.regen && "Regenerates", d.minRng && `Min range ${d.minRng}`].filter(Boolean);
    return `<div class="bf-h">${s.side === "player" ? "Your" : "Enemy"} ${esc(d.name)} ×${Battle.count(s)}</div>
      <div class="bf-stats"><span>HP <b>${Math.ceil(s.hp)}/${s.maxHp}</b></span><span>ATK <b>${d.atk}</b></span><span>DEF <b>${d.def}</b></span><span>RNG <b>${Battle.range(b, s)}</b></span><span>MOVE <b>${Battle.moveRange(b, s)}</b></span><span>Power <b>${fmt(unitPower(d) * Battle.count(s))}</b></span></div>
      ${traits.length ? `<div class="dim" style="font-size:11.5px;margin-top:4px">${traits.join(" · ")}</div>` : ""}
      ${s.side === "player" && b.vet && b.vet[s.type] ? `<div style="font-size:11.5px;color:var(--accent-2)">${"★".repeat(b.vet[s.type])} Veteran rank ${b.vet[s.type]} (+${b.vet[s.type] * 6}% attack/defense)</div>` : ""}
      ${this.skillLine(s)}
      ${s.side === "player" && Battle.capMods(b, s.type).by.length ? `<div style="font-size:11.5px;margin-top:3px;color:#ffd94a">🎖 Led by ${Battle.capMods(b, s.type).by.map((id) => esc(CAPTAINS[id].name) + " (Lv " + b.captains[id] + ")").join(", ")}</div>` : ""}
      <div style="font-size:11.5px;margin-top:3px">${STANCES[s.stance || "normal"].icon} <b>${STANCES[s.stance || "normal"].name} stance</b> <span class="dim">${STANCES[s.stance || "normal"].desc} · Sight ${Battle.sight(b, s)}</span></div>
      <div style="font-size:11.5px;margin-top:4px">On <b>${t.name}</b>${s.braced ? " · <b class='good'>Braced</b>" : ""}${s.broken ? " · <b class='bad'>Routed (can't attack)</b>" : ""}${s.aimed ? " · <b class='good'>Aiming (+50%)</b>" : ""}${mine && b.phase === "battle" ? ` · ${s.acted ? "done" : s.moved ? "moved, can still attack" : "ready"}` : ""}</div>`;
  },
  skillLine(s) {
    const k = Battle.skillOf(s);
    return k ? `<div style="font-size:11.5px;margin-top:3px">${k.icon} <b>${k.name}</b>${s.skillCd > 0 ? ` <span class="dim">(ready in ${s.skillCd})</span>` : " <span class='good'>ready</span>"}<span class="dim">: ${esc(k.desc)}</span></div>` : "";
  },
  hover(i) {
    const b = this.b, x = i % b.w, y = (i / b.w) | 0, t = TERRAIN[b.tiles[i]];
    const prev = document.getElementById("bfAim");
    if (prev) prev.remove();
    if (this.targeting === "barrage") {
      const c = this.cell, aim = document.createElement("div");
      aim.id = "bfAim"; aim.className = "aim";
      aim.style.left = (x - 1) * c + "px"; aim.style.top = (y - 1) * c + "px";
      aim.style.width = aim.style.height = 3 * c + "px";
      document.getElementById("bfFx").appendChild(aim);
    }
    let s = Battle.at(b, x, y);
    const seen = !this.vis || this.vis[i];
    if (s && s.side === "enemy" && !Battle.canSee(b, this.vis || Battle.visibility(b), s)) s = null;
    if (!seen) { document.getElementById("bfHover").innerHTML = `<div class="bf-h">Unscouted</div><div style="font-size:12px" class="muted">Your squads can't see this far. Move closer, climb a hill, or send cavalry and flyers to scout. Enemies hiding in forests are only spotted within 2 tiles.</div>`; return; }
    let h = `<div class="bf-h">${t.name}${b.wallHp[i] ? ` <span class="dim">(${Math.ceil(b.wallHp[i])} HP)</span>` : ""}</div><div style="font-size:12px" class="muted">${t.desc}</div>`;
    const sq = this.selSquad();
    if (s && s.side === "enemy") {
      h += `<hr>${this.squadCard(s, false)}`;
      if (sq && sq.side === "player" && Battle.canHit(b, sq, sq.x, sq.y, s.x, s.y) && !sq.acted) {
        const dmg = Math.min(Battle.damage(b, sq, s, { expected: true }), s.hp);
        const kills = Battle.count(s) - Math.max(0, Math.ceil((s.hp - dmg) / udef(s.type).hp - 1e-9));
        const rf = Battle.retaliationFactor(b, sq, s);
        let rk = 0;
        if (rf) {
          const left = { ...s, hp: s.hp - dmg };
          const rd = Battle.damage(b, left, sq, { retal: true, expected: true }) * rf;
          rk = Battle.count(sq) - Math.max(0, Math.ceil((sq.hp - rd) / udef(sq.type).hp - 1e-9));
        }
        h += `<div class="bf-forecast">Attack forecast: about <b class="good">${kills}</b> killed${rf ? `, about <b class="bad">${rk}</b> lost to the counterattack` : ", no counterattack"}</div>`;
      }
    } else if (s) h += `<hr>${this.squadCard(s, true)}`;
    document.getElementById("bfHover").innerHTML = h;
  },
  abilityBlocker(id) {
    const b = this.b;
    if (!b || !b.cmd) return "No commander";
    if (b.cmd.level < ABILITIES[id].lvl) return `Commander level ${ABILITIES[id].lvl}`;
    return Battle.abilityBlocker(b, id);
  },
  canUndo() {
    const m = this.lastMove, b = this.b;
    if (!m || !b || b.phase !== "battle" || b.active !== "player") return false;
    const s = b.squads.find((q) => q.id === m.id && q.hp > 0);
    return !!(s && !s.acted && m.turn === b.turn && !Battle.at(b, m.x, m.y));
  },
  selSquad() { return this.b && this.sel ? this.b.squads.find((s) => s.id === this.sel && s.hp > 0) : null; },

  click(i) {
    const b = this.b;
    if (this.busy || b.phase === "over") return;
    const x = i % b.w, y = (i / b.w) | 0;
    const s = Battle.at(b, x, y), sel = this.selSquad();
    if (b.phase === "deploy") {
      if (s && s.side === "player") {
        if (sel && sel !== s) { [sel.x, s.x] = [s.x, sel.x]; [sel.y, s.y] = [s.y, sel.y]; this.sel = null; }
        else this.sel = s.id;
      } else if (sel && !s && Battle.inDeployZone(b, "player", x, y) && Battle.canStand(b, sel, x, y)) {
        sel.x = x; sel.y = y; this.sel = null;
      }
      this.render(); return;
    }
    if (b.active !== "player") return;
    if (this.targeting) {
      const id = this.targeting;
      this.targeting = null;
      const ev = Battle.useAbility(b, id, x, y);
      if (ev) this.fx(ev);
      this.render(); this.save();
      return;
    }
    // attack?
    if (sel && !sel.acted) {
      if (s && s.side === "enemy" && Battle.canHit(b, sel, sel.x, sel.y, x, y) && Battle.canSee(b, this.vis || Battle.visibility(b), s)) {
        const ev = Battle.attack(b, sel, s);
        this.fx(ev); this.afterPlayerAction(); return;
      }
      if (!s && b.wallHp[i] !== undefined && Battle.wallTargets(b, sel).includes(i)) {
        const ev = Battle.attackWall(b, sel, i);
        if (b.tiles[i] === "rubble") this.updateTile(i);
        this.fx(ev); this.afterPlayerAction(); return;
      }
    }
    if (s && s.side === "player") { this.sel = s.id; this.render(); this.hover(i); return; }
    if (sel && !sel.moved && !s) {
      const r = Battle.reachable(b, sel);
      if (r.has(i)) {
        this.lastMove = { id: sel.id, x: sel.x, y: sel.y, turn: b.turn };
        const path = this.pathTo(b, sel, i, r), from = [sel.x, sel.y];
        const hp0 = sel.hp, ev = Battle.moveTo(b, sel, i, r.get(i));
        this.walk(sel, from, path);
        if (sel.hp < hp0) this.lastMove = null; // no undoing a move that cost blood
        this.fx(ev); this.render(); if (sel.hp > 0) this.hover(i); return;
      }
    }
    this.sel = null; this.render();
  },
  afterPlayerAction() {
    const sel = this.selSquad();
    if (sel && sel.acted) this.sel = null;
    this.render();
    if (this.b.phase === "battle" && Battle.alive(this.b, "player").every((s) => s.acted)) setTimeout(() => this.action("end", {}), 450);
  },
  /** Sprite key for a unit type (sp_<type>, the hero uses sp_hero), or null if not generated. */
  spriteKey(type) {
    const k = /^hero\d/.test(type) ? "sp_hero" : "sp_" + type;
    return typeof AssetPipeline !== "undefined" && AssetPipeline.hasArt(k) ? k : null;
  },
  /** Tile path (list of [x,y]) from the squad to idx through tiles it can reach this turn. */
  pathTo(b, s, idx, reach) {
    const W = b.w, start = s.y * W + s.x, prev = new Map([[start, -1]]), q = [start];
    const ok = (j) => reach.has(j) || j === idx;
    while (q.length) {
      const i = q.shift();
      if (i === idx) break;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= b.h || prev.has(j) || !ok(j)) continue;
        prev.set(j, i); q.push(j);
      }
    }
    const out = [];
    for (let i = idx; i !== undefined && i !== -1; i = prev.get(i)) out.unshift([i % W, (i / W) | 0]);
    return out.length ? out : [[s.x, s.y], [idx % W, (idx / W) | 0]];
  },
  /** Animate a squad walking tile by tile (its final position is already set by render). */
  walk(s, from, path) {
    const el = document.querySelector(`#bfUnits [data-sq="${s.id}"]`);
    if (!el || path.length < 2) return;
    const c = this.cell, step = 110 / this.speed;
    el.classList.add("walking");
    el.classList.toggle("face-left", path[path.length - 1][0] < from[0]);
    const kf = path.map(([x, y]) => ({ left: x * c + "px", top: y * c + "px" }));
    const a = el.animate(kf, { duration: step * (path.length - 1), easing: "linear" });
    a.onfinish = () => el.classList.remove("walking");
  },
  /** Shake the battlefield (and zoom in a little for big moments). */
  shake(strong) {
    const board = document.getElementById("bfBoard");
    if (!board) return;
    board.animate(strong
      ? [{ transform: "scale(1)" }, { transform: "scale(1.045) translate(4px,-3px)" }, { transform: "scale(1.045) translate(-4px,3px)" }, { transform: "scale(1.03) translate(3px,2px)" }, { transform: "scale(1)" }]
      : [{ transform: "translate(0,0)" }, { transform: "translate(-4px,2px)" }, { transform: "translate(4px,-2px)" }, { transform: "translate(-2px,1px)" }, { transform: "translate(0,0)" }],
      { duration: strong ? 650 : 320, easing: "ease-out" });
  },
  fx(events) {
    // melee lunge / missile recoil for the attacker, and shakes for big moments
    for (const e of events) {
      if (e.proj && e.aid) {
        const a = document.querySelector(`#bfUnits [data-sq="${e.aid}"]`);
        if (a) {
          const dx = e.to[0] - e.from[0], dy = e.to[1] - e.from[1], len = Math.hypot(dx, dy) || 1, k = e.proj === "slash" ? 0.38 : -0.08;
          a.classList.toggle("face-left", dx < 0);
          a.animate([{ translate: "0 0" }, { translate: `${(dx / len) * k * this.cell}px ${(dy / len) * k * this.cell}px` }, { translate: "0 0" }], { duration: 260, easing: "ease-out" });
        }
      }
      if (e.destroyed) setTimeout(() => this.shake(e.general || e.hero), 150);
      if (e.text === "BREACH") this.shake(true);
      if (e.general) setTimeout(() => this.banner("General slain!", "The enemy army wavers", "win"), 350);
    }
    const layer = document.getElementById("bfFx");
    if (!layer) return;
    const c = this.cell;
    let delay = 0;
    for (const e of events) {
      if (!e.proj) continue;
      const p = document.createElement("div");
      const [fx0, fy0] = e.from, [tx0, ty0] = e.to;
      if (e.proj === "slash") {
        p.className = "slash";
        if (typeof Sound !== "undefined") Sound.play("sword");
        p.style.left = tx0 * c + "px"; p.style.top = ty0 * c + "px";
        layer.appendChild(p); setTimeout(() => p.remove(), 450);
        delay = Math.max(delay, 120);
        continue;
      }
      p.className = "proj p-" + e.proj;
      if (typeof Sound !== "undefined") Sound.play(e.proj === "bolt" ? "arrow" : e.proj);
      const ang = Math.atan2(ty0 - fy0, tx0 - fx0) * 180 / Math.PI;
      p.style.left = (fx0 + 0.5) * c + "px"; p.style.top = (fy0 + 0.5) * c + "px";
      p.style.setProperty("--ang", ang + "deg");
      layer.appendChild(p);
      const dur = Math.min(520, 160 + 45 * Math.hypot(tx0 - fx0, ty0 - fy0)) / Math.max(1, this.speed / 1.5);
      p.style.transition = `transform ${dur}ms ${e.proj === "boulder" ? "cubic-bezier(.3,-0.4,.7,1)" : "linear"}`;
      requestAnimationFrame(() => { p.style.transform = `translate(${(tx0 - fx0) * c}px, ${(ty0 - fy0) * c}px) rotate(var(--ang))`; });
      setTimeout(() => { p.classList.add("hit"); setTimeout(() => p.remove(), 260); }, dur);
      delay = Math.max(delay, dur);
    }
    for (const e of events) {
      if (!e.text) continue;
      const d = document.createElement("div");
      d.className = "fx " + (e.cls || "");
      if (delay) { d.style.animationDelay = delay + "ms"; d.style.opacity = "0"; }
      d.textContent = e.text;
      d.style.left = e.x * c + "px"; d.style.top = e.y * c + "px";
      layer.appendChild(d);
      setTimeout(() => d.remove(), 1100);
      const u = document.querySelector(`#bfUnits [data-sq="${e.id}"]`);
      if (u) { u.classList.remove("shake"); void u.offsetWidth; u.classList.add("shake"); }
    }
  },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms / this.speed)); },

  async enemyTurn() {
    const b = this.b;
    this.busy = true; this.sel = null;
    Battle.endTurn(b); // -> enemy
    this.render();
    if (b.phase === "battle") this.banner("Enemy Turn", `Turn ${b.turn}`, "enemy");
    await this.sleep(300);
    for (const s of Battle.aiOrder(b, "enemy")) {
      if (!this.b || b.phase === "over") break;
      if (s.hp <= 0 || s.acted) continue;
      const dec = Battle.decide(b, s);
      const moving = dec && dec.move !== undefined && dec.move !== s.y * b.w + s.x;
      const evs = [];
      if (moving) {
        const path = this.pathTo(b, s, dec.move, Battle.reachable(b, s)), from = [s.x, s.y];
        const ev = Battle.moveTo(b, s, dec.move, dec.cost);
        this.walk(s, from, path);
        await this.sleep(Math.max(0, path.length - 2) * 110);
        this.render(); if (ev.length) this.fx(ev); await this.sleep(260);
        if (s.hp <= 0 || b.phase === "over") { s.acted = true; continue; }
      }
      if (dec && dec.target) { const t = b.squads.find((q) => q.id === dec.target && q.hp > 0); if (t) Battle.attack(b, s, t, evs); }
      else if (dec && dec.wall !== undefined) { Battle.attackWall(b, s, dec.wall, evs); if (b.tiles[dec.wall] === "rubble") this.updateTile(dec.wall); }
      else if (dec && dec.brace) Battle.brace(b, s);
      s.acted = true; s.moved = true;
      if (evs.length) { this.render(); this.fx(evs); await this.sleep(380); }
    }
    if (this.b && b.phase !== "over") Battle.endTurn(b); // -> player
    this.busy = false;
    if (this.b) { this.render(); this.save(); if (b.phase === "battle") this.banner("Your Turn", `Turn ${b.turn}`, "player"); }
  },
  save() { if (typeof GameState !== "undefined" && GameState.current) GameState.save(); },

  async action(a, data) {
    const b = this.b;
    switch (a) {
      case "autodeploy": Battle.autoDeploy(b, "player"); this.sel = null; this.render(); break;
      case "begin": Battle.begin(b); this.sel = null; this.render(); this.save(); this.banner("To Battle!", b.objective ? "Plant your banner on the 🚩 and hold it" : "Destroy or rout the enemy", "player"); break;
      case "ability": {
        const id = data && data.id;
        if (!id || this.busy || this.abilityBlocker(id)) break;
        if (ABILITIES[id].target) { this.targeting = this.targeting === id ? null : id; this.sel = null; this.render(); break; }
        const ev = Battle.useAbility(b, id);
        if (ev) this.fx(ev);
        this.render(); this.save();
        break;
      }
      case "skill": {
        const s = this.selSquad();
        if (!s || this.busy) break;
        const ev = Battle.useSkill(b, s);
        if (ev) this.fx(ev);
        this.render(); this.save();
        break;
      }
      case "undo": {
        if (!this.canUndo() || this.busy) break;
        const m = this.lastMove, s = b.squads.find((q) => q.id === m.id);
        s.x = m.x; s.y = m.y; s.moved = false; s.movedDist = 0;
        this.lastMove = null; this.sel = s.id;
        Battle.addLog(b, "↶ Move taken back.");
        this.render();
        break;
      }
      case "speed": {
        this.speed = this.speed >= 4 ? 1 : this.speed * 2;
        try { localStorage.setItem("ironhold_battle_speed", this.speed); } catch {}
        this.render();
        break;
      }
      case "stance": {
        const s = this.selSquad();
        if (!s || s.side !== "player" || this.busy) break;
        const order = ["normal", "aggressive", "defensive"];
        s.stance = order[(order.indexOf(s.stance || "normal") + 1) % 3];
        this.render();
        break;
      }
      case "reserve": {
        const s = this.selSquad();
        if (s && b.phase === "deploy") { s.reserve = true; s.x = -1; s.y = -1; this.sel = null; this.render(); }
        break;
      }
      case "unreserve": {
        const s = b.squads.find((q) => q.id === +data.id);
        if (s && b.phase === "deploy" && Battle.deployReserve(b, s, false)) this.render();
        break;
      }
      case "callres": {
        if (this.busy || b.active !== "player") break;
        Battle.callReserves(b, "player", true);
        this.render(); this.save();
        break;
      }
      case "brace": { const s = this.selSquad(); if (s && !s.acted) { Battle.brace(b, s); this.afterPlayerAction(); } break; }
      case "end": if (!this.busy && b.phase === "battle" && b.active === "player") await this.enemyTurn(); break;
      case "auto":
        if (this.busy) return;
        this.busy = true;
        // finish the player's current turn with the AI, then let both sides fight it out
        Battle.runSide(b, "player");
        if (b.phase !== "over") { Battle.endTurn(b); }
        while (b.phase !== "over") { Battle.runSide(b, b.active); if (b.phase === "over") break; Battle.endTurn(b); }
        this.busy = false;
        this.renderTiles(); this.render();
        break;
      case "retreat": Battle.retreat(b); this.render(); break;
      case "close": {
        const done = this.onDone; const bb = this.b;
        this._shownEnd = false;
        this.close();
        if (done) done(bb);
        break;
      }
    }
  },
  summary(b) {
    const mvp = Object.entries(b.vetXp || {}).sort((a, c) => c[1] - a[1])[0];
    const st = b.stats || { player: { dealt: 0 }, enemy: { dealt: 0 } };
    return `<div class="kv" style="margin:6px 0 10px;font-size:12.5px">
      <span class="muted">Turns fought</span><b>${Math.min(b.turn, b.maxTurns)}</b>
      <span class="muted">Damage dealt / taken (power)</span><b>${fmt(Math.round(st.player.dealt))} / ${fmt(Math.round(st.enemy.dealt))}</b>
      <span class="muted">Final morale (you / foe)</span><b>${Math.round(b.morale ? b.morale.player : 0)} / ${b.moraleImmune && b.moraleImmune.enemy ? "fearless" : Math.round(b.morale ? b.morale.enemy : 0)}</b>
      ${mvp ? `<span class="muted">⭐ MVP</span><b>${esc(udef(mvp[0]).name)}</b>` : ""}
      ${b.generalFell ? `<span class="muted">Enemy general</span><b class="good">slain</b>` : ""}
    </div>`;
  },
  showEnd() {
    const b = this.b, win = b.result.winner === "player";
    const lost = Battle.losses(b, "player"), killed = Battle.losses(b, "enemy");
    const list = (o) => Object.entries(o).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${udef(t).name}`).join(", ") || "none";
    const box = document.createElement("div");
    box.className = "bf-end " + (win ? "win" : "lose");
    box.innerHTML = `<h2>${win ? "🏆 Victory!" : "💀 Defeat"}</h2>
      <p>${esc(b.log[b.log.length - 1] || "")}</p>
      <p><b>Your losses:</b> ${list(lost)}<br><b>Enemies slain:</b> ${list(killed)}</p>
      ${this.summary(b)}
      <p class="dim">${b.context.kind === "raid" ? (win ? "The city is safe. A bounty will be paid." : "The raiders will plunder the city.") : win ? "Loot will be added to your stores (+25% for leading in person)." : "Survivors limp home."}</p>
      <button class="btn primary" data-bf="close">Return to the city</button>`;
    document.querySelector("#battleRoot .bf").appendChild(box);
  },
};
