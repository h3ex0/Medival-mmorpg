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
  dragon:        { name: "Elder Dragon",    asset: "e_dragon",       hp: 1400, atk: 160, def: 12, rng: 2, mv: 5, cls: "ranged", flying: true, big: true, boss: true },
  titan:         { name: "Storm Titan",     asset: "e_titan",        hp: 6000, atk: 650, def: 16, rng: 3, mv: 3, cls: "inf", big: true, boss: true },
};
/* Town guards appear only when defending the city. They're free, and they're never lost from your army. */
const EXTRA_UNITS = {
  guard: { name: "Town Guard", asset: "u_guard", hp: 12, atk: 4, def: 3, rng: 1, mv: 3, cls: "inf" },
};
const udef = (type) => (typeof UNITS !== "undefined" && UNITS[type]) || ENEMY_UNITS[type] || EXTRA_UNITS[type];

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
  const per = Object.entries(roster).reduce((a, [t, w]) => a + unitPower(ENEMY_UNITS[t]) * w, 0);
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
        hp: Math.round(120 * (1 + 0.5 * lvl)),
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
      initial: { player: { ...opts.playerUnits }, enemy: { ...opts.enemyUnits } },
      log: [], result: null,
    };
    this.addSquads(b, "player", opts.playerUnits);
    if (opts.guards) this.addSquads(b, "player", { guard: opts.guards });
    this.addSquads(b, "enemy", opts.enemyUnits);
    this.autoDeploy(b, "player");
    this.autoDeploy(b, "enemy");
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
        b.squads.push({ id: b.nextId++, side, type: t, hp, maxHp: hp, start: cnt, x: -1, y: -1, moved: false, acted: false, braced: false, movedDist: 0 });
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
    const sq = b.squads.filter((s) => s.side === side);
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
    b.squads = b.squads.filter((s) => s.hp > 0);
  },

  /* ===================== helpers ===================== */
  tile(b, x, y) { return b.tiles[y * b.w + x]; },
  terrainAt(b, s) { return TERRAIN[this.tile(b, s.x, s.y)]; },
  count(s) { return Math.max(0, Math.ceil(s.hp / udef(s.type).hp - 1e-9)); },
  alive(b, side) { return b.squads.filter((s) => s.hp > 0 && (!side || s.side === side)); },
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
    if (d.cls === "cav" && TERRAIN[t].cavExtra) c += 1;
    if (d.cls === "siege" && t !== "plains" && t !== "bridge") c += 1;
    return c;
  },
  canStand(b, s, x, y) { return isFinite(this.moveCost(b, s, x, y)); },
  moveRange(b, s) { return Math.max(1, udef(s.type).mv + (this.tac(b, s.side).move || 0)); },

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
    return d.rng + (TERRAIN[this.tile(b, x, y)].rangeBonus || 0) + (this.tac(b, s.side).range || 0);
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
    if (s.acted) return [];
    return this.alive(b, this.opp(s.side)).filter((o) => this.canHit(b, s, s.x, s.y, o.x, o.y));
  },
  wallTargets(b, s) {
    if (s.acted || !b.wallSide || b.wallSide === s.side) return [];
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
    if (ta.ambush && (at === "forest" || at === "hill")) m *= ta.ambush;
    const ea = TERRAIN[at].elev, ed = TERRAIN[dt].elev;
    if (ea > ed) m *= 1.2; else if (ea < ed) m *= 0.85;
    if (A.antiCav && D.cls === "cav") m *= 2;
    if (A.cls === "cav" && D.cls === "ranged") m *= 1.5;
    if (A.vsBig && D.big) m *= 1.6;
    if (dist > 1 && TERRAIN[dt].cover) m *= TERRAIN[dt].cover;
    if (!retal && A.charge && att.movedDist >= 3) m *= ta.charge || 1.5;
    if ((A.cls === "ranged" || A.cls === "siege") && dist === 1 && A.rng > 1) m *= 0.6;
    let defense = D.def * TERRAIN[dt].def;
    if (def.braced) defense *= 1.5;
    defense *= (td.def && td.def[D.cls]) || 1;
    defense *= td.defAll || 1;
    if (td.hold && !def.moved) defense *= td.hold;
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
    return f;
  },
  /** Attack a squad; the defender strikes back if it's in melee. Returns events for animation. */
  attack(b, att, def, events = []) {
    const before = this.count(def);
    const dmg = this.damage(b, att, def);
    def.hp = Math.max(0, def.hp - dmg);
    const killed = before - this.count(def);
    events.push({ x: def.x, y: def.y, text: `−${killed}`, cls: "hit", id: def.id });
    const an = udef(att.type).name, dn = udef(def.type).name;
    let msg = `${att.side === "player" ? "Your" : "Enemy"} ${an} hit ${dn}: ${killed} killed`;
    if (def.hp <= 0) msg += ` (squad destroyed)`;
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
    const dmg = this.count(att) * A.atk * (A.breach ? 4 : 0.25);
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
  moveTo(b, s, idx, cost) {
    s.x = idx % b.w; s.y = (idx / b.w) | 0;
    s.moved = true; s.movedDist = cost;
  },
  brace(b, s) { s.braced = true; s.acted = true; s.moved = true; },

  startTurn(b, side) {
    b.active = side;
    for (const s of this.alive(b, side)) {
      s.moved = false; s.acted = false; s.braced = false; s.movedDist = 0;
      const d = udef(s.type);
      if (d.regen) s.hp = Math.min(s.maxHp, s.hp + s.maxHp * d.regen);
    }
    // healers mend nearby squads (healing can bring fallen soldiers back)
    for (const h of this.alive(b, side)) {
      const hd = udef(h.type);
      if (!hd.heal) continue;
      const amt = this.count(h) * hd.heal;
      for (const s of this.alive(b, side)) {
        if (s === h || this.dist(s, h) > 2 || s.hp >= s.maxHp) continue;
        s.hp = Math.min(s.maxHp, s.hp + amt);
      }
    }
  },
  begin(b) {
    if (b.phase !== "deploy") return;
    b.phase = "battle";
    this.startTurn(b, "player");
    this.addLog(b, `Turn 1. ${TACTICS[b.tactic].name} vs ${TACTICS[b.enemyTactic].name}.`);
  },
  checkEnd(b) {
    if (b.phase === "over") return true;
    const p = this.alive(b, "player").length, e = this.alive(b, "enemy").length;
    if (!e) this.finish(b, "player", "annihilation");
    else if (!p) this.finish(b, "enemy", "annihilation");
    return b.phase === "over";
  },
  finish(b, winner, reason) {
    b.phase = "over";
    b.result = { winner, reason };
    const txt = { annihilation: "The enemy army has been destroyed.", timeout: "Time ran out. The defenders held.", retreat: "You sounded the retreat." };
    this.addLog(b, (winner === "player" ? "VICTORY! " : "DEFEAT. ") + (reason === "annihilation" && winner === "enemy" ? "Your army has been wiped out." : txt[reason]));
  },
  retreat(b) { if (b.phase !== "over") this.finish(b, "enemy", "retreat"); },
  /** Finish the current side's turn and start the next. */
  endTurn(b) {
    if (b.phase === "over") return;
    if (b.active === "player") this.startTurn(b, "enemy");
    else {
      b.turn++;
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
    // the defender waits in position until the attacker gets close
    if (side === b.defender && !b.engaged) {
      const near = this.alive(b, side).some((m) => opp.some((o) => this.dist(m, o) <= 6));
      if (near) b.engaged = true;
      else return { move: s.y * W + s.x, cost: 0, brace: true };
    }
    const reach = this.reachable(b, s);
    const ox = s.x, oy = s.y, om = s.movedDist;
    let best = null, bestScore = 0;
    const meleeOpp = opp.filter((o) => udef(o.type).rng <= 1);
    for (const [idx, cost] of reach) {
      const x = idx % W, y = (idx / W) | 0;
      s.x = x; s.y = y; s.movedDist = cost;
      const tr = TERRAIN[this.tile(b, x, y)];
      let tileBonus = (tr.def - 1) * 4 + (d.rng > 1 && tr.rangeBonus ? 2 : 0);
      if (d.rng > 1) {
        const threat = meleeOpp.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= 2);
        if (threat) tileBonus -= 4;
      }
      for (const o of opp) {
        if (!this.canHit(b, s, x, y, o.x, o.y)) continue;
        const D = udef(o.type);
        const dmg = Math.min(this.damage(b, s, o, { expected: true }), o.hp);
        let value = (dmg / D.hp) * unitPower(D);
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

    // otherwise advance (missile units try to stay out of melee)
    const f = this.distanceField(b, s);
    let mv = null, mvScore = Infinity;
    for (const [idx, cost] of reach) {
      let v = f[idx];
      if (!isFinite(v)) continue;
      if (d.rng > 1 && v < 2) v = 50;
      v -= TERRAIN[b.tiles[idx]].def * 0.3 - cost * 0.01;
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
      this.moveTo(b, s, dec.move, dec.cost);
    }
    if (dec.target) {
      const t = b.squads.find((q) => q.id === dec.target && q.hp > 0);
      if (t) this.attack(b, s, t, events);
    } else if (dec.wall !== undefined) this.attackWall(b, s, dec.wall, events);
    else if (dec.brace) this.brace(b, s);
    s.acted = true; s.moved = true;
    return events;
  },
  /** Run the AI for every squad on `side` that hasn't acted. */
  runSide(b, side) {
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

  open(b, onDone) {
    this.b = b; this.onDone = onDone; this.sel = null; this.busy = false;
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
    window.addEventListener("resize", this._resize = () => { this.layout(); this.renderTiles(); this.render(); });
  },
  close() {
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
    document.addEventListener("contextmenu", (e) => { if (this.b && e.target.closest("#bfBoard")) { e.preventDefault(); this.sel = null; this.render(); } });
    document.addEventListener("keydown", (e) => {
      if (!this.b || this.busy) return;
      if (e.key === "Escape") { this.sel = null; this.render(); }
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
  renderTiles() {
    const b = this.b, c = this.cell, board = document.getElementById("bfBoard");
    const glyph = { forest: "🌲", mountain: "⛰️", hill: "", swamp: "", bridge: "", wall: "", rubble: "" };
    let h = "";
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x, t = b.tiles[i];
      h += `<div class="tile t-${t}" data-cell="${i}" style="left:${x * c}px;top:${y * c}px">${glyph[t] ? `<span>${glyph[t]}</span>` : ""}</div>`;
    }
    h += `<div id="bfMarks"></div><div id="bfUnits"></div><div id="bfFx"></div>`;
    board.innerHTML = h;
  },
  updateTile(i) {
    const el = document.querySelector(`#bfBoard .tile[data-cell="${i}"]`);
    if (el) { el.className = `tile t-${this.b.tiles[i]}`; el.innerHTML = ""; }
  },

  render() {
    const b = this.b, c = this.cell;
    if (!b) return;
    const ctx = b.context || {};
    document.getElementById("bfTitle").textContent = b.title;
    const phaseTxt = b.phase === "deploy" ? "Deployment: click one of your squads, then a tile in the blue zone to move it (or another squad to swap)."
      : b.phase === "over" ? (b.result.winner === "player" ? "Victory!" : "Defeat")
      : b.active === "player" ? "Your turn. Select a squad, move it (blue), attack (red), or Brace." : "The enemy is moving…";
    document.getElementById("bfSub").innerHTML = `${esc(MAP_TYPES[b.mapType] || "")} · Turn <b>${Math.min(b.turn, b.maxTurns)}</b>/${b.maxTurns} · ${TACTICS[b.tactic].icon} ${TACTICS[b.tactic].name} · <span class="dim">${esc(phaseTxt)}</span>`;

    // buttons
    let btns = "";
    if (b.phase === "deploy") {
      btns = `<select id="bfTactic" class="bf-select">${Object.entries(TACTICS).filter(([, t]) => t.lvl <= (ctx.cmdLevel || 1)).map(([k, t]) => `<option value="${k}" ${k === b.tactic ? "selected" : ""}>${t.icon} ${t.name}</option>`).join("")}</select>
        <button class="btn" data-bf="autodeploy">Auto-deploy</button>
        <button class="btn primary" data-bf="begin">⚔ Begin battle</button>`;
    } else if (b.phase === "battle") {
      const my = b.active === "player" && !this.busy;
      btns = `<button class="btn" data-bf="brace" ${my && this.sel && !this.selSquad()?.acted ? "" : "disabled"} title="Skip this squad's attack: +50% defense until your next turn">🛡 Brace</button>
        <button class="btn" data-bf="auto" ${my ? "" : "disabled"} title="Let your captains finish the battle">Auto-battle</button>
        <button class="btn danger" data-bf="retreat" ${my ? "" : "disabled"}>Retreat</button>
        <button class="btn primary" data-bf="end" ${my ? "" : "disabled"}>End turn ⏎</button>`;
    } else {
      btns = `<button class="btn primary" data-bf="close">Return to the city</button>`;
    }
    document.getElementById("bfButtons").innerHTML = btns;
    const ts = document.getElementById("bfTactic");
    if (ts) ts.onchange = () => { b.tactic = ts.value; if (TACTICS[b.tactic].deploy) Battle.autoDeploy(b, "player"); this.render(); };

    // marks (deploy zone, reachable, targets)
    let marks = "";
    const sq = this.selSquad();
    if (b.phase === "deploy") {
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++)
        if (Battle.inDeployZone(b, "player", x, y)) marks += `<div class="mark m-deploy" style="left:${x * c}px;top:${y * c}px"></div>`;
    } else if (sq && b.phase === "battle" && b.active === "player") {
      if (!sq.moved && !sq.acted) for (const [i] of Battle.reachable(b, sq)) {
        if (i === sq.y * b.w + sq.x) continue;
        marks += `<div class="mark m-move" data-cell="${i}" style="left:${(i % b.w) * c}px;top:${((i / b.w) | 0) * c}px"></div>`;
      }
      for (const t of Battle.targets(b, sq)) marks += `<div class="mark m-attack" data-cell="${t.y * b.w + t.x}" style="left:${t.x * c}px;top:${t.y * c}px"></div>`;
      for (const i of Battle.wallTargets(b, sq)) marks += `<div class="mark m-attack" data-cell="${i}" style="left:${(i % b.w) * c}px;top:${((i / b.w) | 0) * c}px"></div>`;
    }
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
        el.innerHTML = `<img data-asset="${d.asset}" alt=""><b class="cnt"></b><i class="hpb"><i></i></i>`;
        layer.appendChild(el);
        if (typeof AssetPipeline !== "undefined") AssetPipeline.applyAll(el);
      }
      el.dataset.cell = s.y * b.w + s.x;
      el.className = `unit side-${s.side}${sq === s ? " sel" : ""}${s.acted && b.phase === "battle" && s.side === b.active ? " done" : ""}${s.braced ? " braced" : ""}${d.boss ? " boss" : ""}`;
      el.style.left = s.x * c + "px"; el.style.top = s.y * c + "px";
      el.title = `${d.name} ×${Battle.count(s)}`;
      el.querySelector(".cnt").textContent = Battle.count(s);
      el.querySelector(".hpb i").style.width = (s.hp / s.maxHp) * 100 + "%";
    }
    for (const el of [...layer.children]) if (!seen.has(el.dataset.sq) && !el.classList.contains("dead")) el.remove();

    // selected panel
    document.getElementById("bfSel").innerHTML = sq ? this.squadCard(sq, true) : `<div class="bf-h">Your army</div>${this.armySummary("player")}<div class="bf-h" style="margin-top:8px">Enemy</div>${this.armySummary("enemy")}`;
    // log
    document.getElementById("bfLog").innerHTML = b.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join("");

    if (b.phase === "over" && !this._shownEnd) { this._shownEnd = true; this.showEnd(); }
  },
  armySummary(side) {
    const b = this.b, tot = {};
    for (const s of Battle.alive(b, side)) tot[s.type] = (tot[s.type] || 0) + Battle.count(s);
    const p = Object.entries(tot).reduce((a, [t, n]) => a + unitPower(udef(t)) * n, 0);
    return `<div class="bf-army">${Object.entries(tot).map(([t, n]) => `<span>${udef(t).name} <b>${n}</b></span>`).join("") || '<span class="dim">none</span>'}</div><div class="dim" style="font-size:11.5px">Power ⚔ ${fmt(p)}</div>`;
  },
  squadCard(s, mine) {
    const b = this.b, d = udef(s.type), t = Battle.terrainAt(b, s);
    const traits = [d.antiCav && "Anti-cavalry ×2", d.charge && "Charge", d.armorPierce && "Armor-piercing", d.heal && `Heals ${d.heal}/soldier`, d.breach && "Breaches walls", d.vsBig && "×1.6 vs giants", d.flying && "Flying", d.regen && "Regenerates", d.minRng && `Min range ${d.minRng}`].filter(Boolean);
    return `<div class="bf-h">${s.side === "player" ? "Your" : "Enemy"} ${esc(d.name)} ×${Battle.count(s)}</div>
      <div class="bf-stats"><span>HP <b>${Math.ceil(s.hp)}/${s.maxHp}</b></span><span>ATK <b>${d.atk}</b></span><span>DEF <b>${d.def}</b></span><span>RNG <b>${Battle.range(b, s)}</b></span><span>MOVE <b>${Battle.moveRange(b, s)}</b></span><span>Power <b>${fmt(unitPower(d) * Battle.count(s))}</b></span></div>
      ${traits.length ? `<div class="dim" style="font-size:11.5px;margin-top:4px">${traits.join(" · ")}</div>` : ""}
      <div style="font-size:11.5px;margin-top:4px">On <b>${t.name}</b>${s.braced ? " · <b class='good'>Braced</b>" : ""}${mine && b.phase === "battle" ? ` · ${s.acted ? "done" : s.moved ? "moved, can still attack" : "ready"}` : ""}</div>`;
  },
  hover(i) {
    const b = this.b, x = i % b.w, y = (i / b.w) | 0, t = TERRAIN[b.tiles[i]];
    const s = Battle.at(b, x, y);
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
    // attack?
    if (sel && !sel.acted) {
      if (s && s.side === "enemy" && Battle.canHit(b, sel, sel.x, sel.y, x, y)) {
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
      if (r.has(i)) { Battle.moveTo(b, sel, i, r.get(i)); this.render(); this.hover(i); return; }
    }
    this.sel = null; this.render();
  },
  afterPlayerAction() {
    const sel = this.selSquad();
    if (sel && sel.acted) this.sel = null;
    this.render();
    if (this.b.phase === "battle" && Battle.alive(this.b, "player").every((s) => s.acted)) setTimeout(() => this.action("end", {}), 450);
  },
  fx(events) {
    const layer = document.getElementById("bfFx");
    if (!layer) return;
    const c = this.cell;
    for (const e of events) {
      if (!e.text) continue;
      const d = document.createElement("div");
      d.className = "fx " + (e.cls || "");
      d.textContent = e.text;
      d.style.left = e.x * c + "px"; d.style.top = e.y * c + "px";
      layer.appendChild(d);
      setTimeout(() => d.remove(), 1100);
      const u = document.querySelector(`#bfUnits [data-sq="${e.id}"]`);
      if (u) { u.classList.remove("shake"); void u.offsetWidth; u.classList.add("shake"); }
    }
  },
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },

  async enemyTurn() {
    const b = this.b;
    this.busy = true; this.sel = null;
    Battle.endTurn(b); // -> enemy
    this.render();
    await this.sleep(300);
    for (const s of Battle.aiOrder(b, "enemy")) {
      if (!this.b || b.phase === "over") break;
      if (s.hp <= 0 || s.acted) continue;
      const dec = Battle.decide(b, s);
      const moving = dec && dec.move !== undefined && dec.move !== s.y * b.w + s.x;
      const evs = [];
      if (moving) { Battle.moveTo(b, s, dec.move, dec.cost); this.render(); await this.sleep(260); }
      if (dec && dec.target) { const t = b.squads.find((q) => q.id === dec.target && q.hp > 0); if (t) Battle.attack(b, s, t, evs); }
      else if (dec && dec.wall !== undefined) { Battle.attackWall(b, s, dec.wall, evs); if (b.tiles[dec.wall] === "rubble") this.updateTile(dec.wall); }
      else if (dec && dec.brace) Battle.brace(b, s);
      s.acted = true; s.moved = true;
      if (evs.length) { this.render(); this.fx(evs); await this.sleep(380); }
    }
    if (this.b && b.phase !== "over") Battle.endTurn(b); // -> player
    this.busy = false;
    if (this.b) { this.render(); this.save(); }
  },
  save() { if (typeof GameState !== "undefined" && GameState.current) GameState.save(); },

  async action(a) {
    const b = this.b;
    switch (a) {
      case "autodeploy": Battle.autoDeploy(b, "player"); this.sel = null; this.render(); break;
      case "begin": Battle.begin(b); this.sel = null; this.render(); this.save(); break;
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
  showEnd() {
    const b = this.b, win = b.result.winner === "player";
    const lost = Battle.losses(b, "player"), killed = Battle.losses(b, "enemy");
    const list = (o) => Object.entries(o).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${udef(t).name}`).join(", ") || "none";
    const box = document.createElement("div");
    box.className = "bf-end " + (win ? "win" : "lose");
    box.innerHTML = `<h2>${win ? "🏆 Victory!" : "💀 Defeat"}</h2>
      <p>${esc(b.log[b.log.length - 1] || "")}</p>
      <p><b>Your losses:</b> ${list(lost)}<br><b>Enemies slain:</b> ${list(killed)}</p>
      <p class="dim">${b.context.kind === "raid" ? (win ? "The city is safe. A bounty will be paid." : "The raiders will plunder the city.") : win ? "Loot will be added to your stores (+25% for leading in person)." : "Survivors limp home."}</p>
      <button class="btn primary" data-bf="close">Return to the city</button>`;
    document.querySelector("#battleRoot .bf").appendChild(box);
  },
};
