"use strict";
/* =====================================================================
   4b. RESEARCH, QUESTS & REALM EVENTS
   ===================================================================== */
const Research = {
  lvl(s, id) { return s.research.levels[id] || 0; },
  total(s) { return Object.values(s.research.levels).reduce((a, b) => a + b, 0); },
  cost(id, level) {
    const out = {};
    for (const [r, v] of Object.entries(TECHS[id].base)) out[r] = Math.ceil(v * Math.pow(r === "relics" ? 1.5 : 1.6, level));
    return out;
  },
  time(s, id, level) { return TECHS[id].time * Math.pow(1.45, level) / (1 + 0.15 * Math.max(0, s.buildings.academy - 1)); },
  blocker(s, id) {
    const t = TECHS[id], lvl = this.lvl(s, id);
    if (s.buildings.academy < 1) return "Build an Academy first";
    if (lvl >= t.max) return "Fully researched";
    if (s.buildings.academy < t.tier) return `Requires Academy level ${t.tier}`;
    if (s.research.current) return "Another project is in progress";
    const cost = this.cost(id, lvl);
    const over = Economy.overCap(s, cost);
    if (over) return `${RESOURCES[over].name} storage too small`;
    if (!Economy.canAfford(s, cost)) return "Not enough resources";
    return null;
  },
  start(s, id) {
    if (this.blocker(s, id)) return false;
    const lvl = this.lvl(s, id);
    Economy.pay(s, this.cost(id, lvl));
    const total = this.time(s, id, lvl);
    s.research.current = { id, remaining: total, total };
    addLog(s, `Scholars begin researching ${TECHS[id].name} (level ${lvl + 1}).`, "info");
    return true;
  },
  cancel(s) {
    const c = s.research.current;
    if (!c) return;
    // refund half
    const cost = this.cost(c.id, this.lvl(s, c.id));
    Economy.grant(s, Object.fromEntries(Object.entries(cost).filter(([r]) => r !== "relics").map(([r, v]) => [r, v / 2])));
    if (cost.relics) s.resources.relics += Math.floor(cost.relics / 2);
    s.research.current = null;
    addLog(s, `Research on ${TECHS[c.id].name} was cancelled (half the cost refunded).`, "info");
  },
  step(s, dt) {
    const c = s.research.current;
    if (!c) return;
    c.remaining -= dt * (Events.active(s, "inspiration") ? 2 : 1);
    if (c.remaining <= 0) {
      s.research.levels[c.id] = this.lvl(s, c.id) + 1;
      s.research.current = null;
      addLog(s, `🎓 Research complete: ${TECHS[c.id].name} level ${s.research.levels[c.id]}.`, "good");
    }
  },
};

const Quests = {
  /** The next unclaimed quests, in order. */
  open(s, n = 4) { return QUESTS.filter((q) => !s.quests.includes(q.id)).slice(0, n); },
  claim(s, id) {
    const q = QUESTS.find((x) => x.id === id);
    if (!q || s.quests.includes(id) || !q.check(s)) return false;
    s.quests.push(id);
    const { relics, ...rest } = q.reward;
    Economy.grant(s, rest);
    if (relics) { s.resources.relics += relics; s.stats.relicsFound += relics; }
    addLog(s, `📜 Quest complete: ${q.text}. Reward: ${Quests.rewardText(q.reward)}.`, "good");
    return true;
  },
  rewardText(r) { return Object.entries(r).map(([k, v]) => amount(k, v)).join(", "); },
  ready(s) { return this.open(s, 4).filter((q) => q.check(s)).length; },
};

const Campaign = {
  unlocked(s, id) { const i = CAMPAIGN_ORDER.indexOf(id); return i <= 0 || !!s.campaign.turned[CAMPAIGN_ORDER[i - 1]]; },
  /** locked | available | marching | ready (turn in) | complete */
  state(s, id) {
    if (s.campaign.turned[id]) return "complete";
    if (s.campaign.done[id]) return "ready";
    if (!this.unlocked(s, id) || s.commander.level < MISSIONS[id].level) return "locked";
    if (s.expeditions.some((e) => e.mission === id) || (s.battle && s.battle.context && s.battle.context.mission === id)) return "marching";
    return "available";
  },
  current(s) { return CAMPAIGN_ORDER.find((id) => !s.campaign.turned[id]) || null; },
  turnIn(s, id) {
    if (this.state(s, id) !== "ready") return false;
    const c = CAMPAIGN[id];
    const bundle = { ...c.reward };
    if (s.campaign.led[id]) for (const [r, v] of Object.entries(c.bonus)) bundle[r] = (bundle[r] || 0) + v;
    const { relics, ...rest } = bundle;
    Economy.grant(s, rest);
    if (relics) { s.resources.relics += relics; s.stats.relicsFound += relics; }
    s.campaign.turned[id] = true;
    Military.addXp(s, Math.round(MISSIONS[id].xp * 1.5));
    addLog(s, `📖 Quest turned in: "${c.title}". ${c.giver}: "${c.outro}" Reward: ${Quests.rewardText(bundle)}.`, "good");
    const next = this.current(s);
    if (next) addLog(s, `📖 New quest from ${CAMPAIGN[next].giver}: "${CAMPAIGN[next].title}"`, "war");
    return true;
  },
};

const Armory = {
  BAG: 30,
  roll(ilvl, minRarity) {
    const order = ["common", "rare", "epic", "legendary"];
    let r = Math.random() * 100, rarity = "common";
    // better sources shift the odds upward
    const boost = Math.min(30, ilvl * 1.5);
    const w = { common: Math.max(10, 60 - boost * 1.5), rare: 28 + boost * 0.6, epic: 10 + boost * 0.6, legendary: 2 + boost * 0.3 };
    const tot = Object.values(w).reduce((a, c) => a + c, 0);
    r = Math.random() * tot;
    for (const k of order) { r -= w[k]; if (r <= 0) { rarity = k; break; } }
    if (minRarity && order.indexOf(rarity) < order.indexOf(minRarity)) rarity = minRarity;
    const slot = Object.keys(GEAR_SLOTS)[Math.floor(Math.random() * 5)];
    const R = GEAR_RARITY[rarity];
    const favoured = Object.keys(GEAR_STATS).filter((k) => GEAR_STATS[k].slots.includes(slot));
    const others = Object.keys(GEAR_STATS).filter((k) => !favoured.includes(k));
    const pool = [...favoured.sort(() => Math.random() - 0.5), ...others.sort(() => Math.random() - 0.5)];
    const stats = {};
    for (const k of pool.slice(0, R.stats)) stats[k] = Math.round(GEAR_STATS[k].base * R.mult * (1 + ilvl * 0.12) * (0.85 + Math.random() * 0.3) * 10) / 10;
    const pre = GEAR_PREFIX[rarity][Math.floor(Math.random() * GEAR_PREFIX[rarity].length)];
    const base = GEAR_SLOTS[slot].bases[Math.floor(Math.random() * GEAR_SLOTS[slot].bases.length)];
    return { id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), slot, rarity, ilvl, name: `${pre} ${base}`, stats };
  },
  /** Chance-based drop after a victory. Returns the item (or null). */
  drop(s, ilvl, chance, minRarity) {
    if (Math.random() > chance) return null;
    const it = this.roll(ilvl, minRarity);
    if (s.gear.bag.length >= this.BAG) { const v = GEAR_RARITY[it.rarity].salvage; Economy.grant(s, { gold: v }); addLog(s, `🎒 Your armory is full: the ${it.name} was sold for ${fmt(v)} Gold.`, "info"); return it; }
    s.gear.bag.push(it);
    addLog(s, `🎁 Loot! ${GEAR_RARITY[it.rarity].name} ${GEAR_SLOTS[it.slot].name}: ${it.name} (${this.statText(it)})`, "good");
    return it;
  },
  statText(it) { return Object.entries(it.stats).map(([k, v]) => `+${v}${GEAR_STATS[k].unit} ${GEAR_STATS[k].label}`).join(", "); },
  /** Sum of every equipped item's bonuses. */
  bonus(s) {
    const out = {};
    for (const it of Object.values(s.gear.equipped)) if (it) for (const [k, v] of Object.entries(it.stats)) out[k] = (out[k] || 0) + v;
    return out;
  },
  b(s, k) { return (this.bonus(s)[k] || 0); },
  equip(s, id) {
    const i = s.gear.bag.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const it = s.gear.bag.splice(i, 1)[0];
    const old = s.gear.equipped[it.slot];
    if (old) s.gear.bag.push(old);
    s.gear.equipped[it.slot] = it;
    addLog(s, `⚔ Your Lord Commander equips the ${it.name}.`, "info");
    return true;
  },
  unequip(s, slot) {
    const it = s.gear.equipped[slot];
    if (!it || s.gear.bag.length >= this.BAG) return false;
    s.gear.equipped[slot] = null; s.gear.bag.push(it);
    return true;
  },
  salvage(s, id) {
    const i = s.gear.bag.findIndex((x) => x.id === id);
    if (i < 0) return false;
    const it = s.gear.bag.splice(i, 1)[0];
    const got = Economy.grant(s, { gold: GEAR_RARITY[it.rarity].salvage * (1 + it.ilvl * 0.1) });
    if (it.rarity === "legendary") { s.resources.relics += 1; }
    addLog(s, `🔨 Salvaged the ${it.name} for ${fmtInt(got.gold)} Gold${it.rarity === "legendary" ? " and a Relic" : ""}.`, "info");
    return true;
  },
  score(it) { return Object.values(it.stats).reduce((a, c) => a + c, 0); },
};

/* =====================================================================
   4c. THREAT, CLIMATE, RIVAL LORDS & CAPTAINS
   ===================================================================== */

/* ---------- Threat: the world answers your rise with stronger enemies ---------- */
const THREAT_TIERS = [[1, "Normal"], [3, "Hardened"], [6, "Veteran"], [9, "Elite"], [12, "Champion"], [16, "Legendary"]];
const Threat = {
  level(s) {
    const turned = Object.keys(s.campaign.turned || {}).length;
    return Math.round((1 + (s.buildings.townhall - 1) * 0.6 + turned * 0.5 + (s.conquest - 1) * 0.3 + s.stats.raidsWon * 0.08) * 10) / 10;
  },
  tier(s) { const l = this.level(s); let t = THREAT_TIERS[0][1]; for (const [min, n] of THREAT_TIERS) if (l >= min) t = n; return t; },
  /** Attack / defense multipliers every enemy army gets. */
  atk(s) { return 1 + 0.035 * (this.level(s) - 1); },
  def(s) { return 1 + 0.025 * (this.level(s) - 1); },
  powerMult(s) { return 1 + 0.05 * (this.level(s) - 1); },
};

/* ---------- Climate: seasons and natural disasters ---------- */
const SEASONS = [
  { id: "spring", name: "Spring", icon: "🌱", food: 1.1, wood: 1, build: 1, growth: 1.25, upkeep: 1, desc: "+10% Food, +25% population growth. Floods are possible." },
  { id: "summer", name: "Summer", icon: "☀️", food: 1.2, wood: 1, build: 1.1, growth: 1, upkeep: 1, desc: "+20% Food, +10% construction speed. Droughts, wildfires and locusts are possible." },
  { id: "autumn", name: "Autumn", icon: "🍂", food: 1.15, wood: 1.15, build: 1, growth: 1, upkeep: 1, desc: "Harvest time: +15% Food and Wood. Wildfires and locusts are possible." },
  { id: "winter", name: "Winter", icon: "❄️", food: 0.7, wood: 0.9, build: 0.75, growth: 0.6, upkeep: 1.2, desc: "−30% Food, −25% construction speed, soldiers eat 20% more. Blizzards are possible." },
];
const SEASON_LENGTH = 600;
const DISASTERS = {
  earthquake: { name: "Earthquake", icon: "🌋", seasons: ["spring", "summer", "autumn", "winter"], weight: 1, desc: "The ground shakes and a building is damaged." },
  flood:      { name: "Great Flood", icon: "🌊", seasons: ["spring"], weight: 3, buff: 240, desc: "Rivers burst their banks: food stores are swept away and farms produce 60% less for 4 minutes." },
  drought:    { name: "Drought", icon: "🏜️", seasons: ["summer"], weight: 3, buff: 300, desc: "No rain: farms produce half as much food for 5 minutes." },
  wildfire:   { name: "Wildfire", icon: "🔥", seasons: ["summer", "autumn"], weight: 2, buff: 180, desc: "Fire sweeps the forests: timber stores burn and lumber camps produce 70% less for 3 minutes." },
  locusts:    { name: "Locust Swarm", icon: "🦗", seasons: ["summer", "autumn"], weight: 2, desc: "A cloud of locusts devours the stored food." },
  blizzard:   { name: "Blizzard", icon: "🌨️", seasons: ["winter"], weight: 4, buff: 240, desc: "Snow buries the city: construction slows to a crawl and soldiers eat 50% more for 4 minutes." },
};
const Climate = {
  season(s) { return SEASONS[s.climate.season % 4]; },
  left(s) { return Math.max(0, s.climate.until - s.time); },
  /** Granaries and the Temple soften disasters (0 = no protection, 0.6 max). */
  shelter(s) { return Math.min(0.6, s.buildings.granary * 0.01 + s.buildings.temple * 0.04 + Research.lvl(s, "medicine") * 0.03); },
  step(s) {
    const c = s.climate;
    if (s.time >= c.until) {
      c.season = (c.season + 1) % 4; c.until = s.time + SEASON_LENGTH;
      const se = this.season(s);
      addLog(s, `${se.icon} ${se.name} has come. ${se.desc}`, "info");
    }
    if (s.time >= c.nextDisaster) {
      c.nextDisaster = s.time + randInt(1500, 2700);
      this.strike(s);
    }
  },
  strike(s, forced) {
    const se = this.season(s).id;
    const pool = Object.entries(DISASTERS).filter(([, d]) => d.seasons.includes(se));
    const tot = pool.reduce((a, [, d]) => a + d.weight, 0);
    let r = Math.random() * tot, id = forced || pool[0][0];
    if (!forced) for (const [k, d] of pool) { r -= d.weight; if (r <= 0) { id = k; break; } }
    const D = DISASTERS[id];
    // the Temple's priests sometimes avert a catastrophe
    if (!forced && Math.random() < Math.min(0.35, s.buildings.temple * 0.04)) { addLog(s, `🙏 The priests' prayers turned aside a ${D.name.toLowerCase()}.`, "good"); return null; }
    const keep = 1 - this.shelter(s);
    let detail = "";
    if (id === "earthquake") {
      const cands = s.city.slots.map((x, i) => [x, i]).filter(([x, i]) => x && i > 0 && x.level > 1 && !x.build);
      if (cands.length) {
        const [x] = cands[Math.floor(Math.random() * cands.length)];
        x.level--; City.sync(s);
        detail = ` Your ${BUILDINGS[x.type].name} was damaged (now level ${x.level}).`;
      } else detail = " Luckily nothing was badly damaged.";
    } else if (id === "flood") { const l = Math.floor(s.resources.food * 0.2 * keep); s.resources.food -= l; detail = ` ${fmtInt(l)} Food lost.`; }
    else if (id === "wildfire") { const l = Math.floor(s.resources.wood * 0.3 * keep); s.resources.wood -= l; detail = ` ${fmtInt(l)} Wood burned.`; }
    else if (id === "locusts") { const l = Math.floor(s.resources.food * 0.25 * keep); s.resources.food -= l; detail = ` ${fmtInt(l)} Food devoured.`; }
    if (D.buff) { s.buffs = s.buffs.filter((b) => b.id !== id); s.buffs.push({ id, until: s.time + Math.round(D.buff * keep + D.buff * 0.4 * (1 - keep)) }); }
    s.stats.disasters = (s.stats.disasters || 0) + 1;
    if (typeof Sound !== "undefined" && !Engine.simulating) Sound.play("rumble");
    addLog(s, `${D.icon} ${D.name}! ${D.desc}${detail}${keep < 1 ? ` (Your granaries and temple softened the blow by ${Math.round((1 - keep) * 100)}%.)` : ""}`, "bad");
    if (typeof UI !== "undefined" && UI.toast && document.getElementById("toasts")) UI.toast(`${D.icon} ${D.name}!`, 5000);
    return id;
  },
};

/* ---------- Rival lords: neighbouring castles that raid you and grow stronger ---------- */
const RIVAL_LORDS = {
  varn:   { name: "House Varn",   lord: "Baron Varn the Grim",  color: "#c0392b", tactic: "shieldwall", roster: { footman: 4, spearman: 3, archer: 3, knight: 1 }, start: 70 },
  morrow: { name: "Morrow Keep",  lord: "Lady Isolde Morrow",   color: "#8e44ad", tactic: "volley",     roster: { archer: 4, longbow: 2, crossbow: 2, pikeman: 3 }, start: 110 },
  drak:   { name: "Drakmoor",     lord: "Warlord Drak",         color: "#d35400", tactic: "charge",     roster: { lightcav: 3, knight: 2, militia: 4, horsearcher: 2 }, start: 160 },
  sable:  { name: "Sable Hold",   lord: "The Sable Prince",     color: "#34495e", tactic: "bloodlust",  roster: { paladin: 1, footman: 3, mage: 1, catapult: 1, archer: 2, priest: 1 }, start: 240 },
};
// rival armies use the same faction machinery as monsters (never picked for random raids)
for (const [id, r] of Object.entries(RIVAL_LORDS)) FACTIONS["rival_" + id] = { name: r.name, minPower: Infinity, tactic: r.tactic, roster: r.roster };

const Rivals = {
  FIRST_ATTACK: 2400,
  fresh() {
    return Object.fromEntries(Object.entries(RIVAL_LORDS).map(([id, r], i) => [id, { power: r.start, treasury: { gold: 500, food: 400, stone: 300, steel: 80 }, defeats: 0, vassal: false, nextAttack: this.FIRST_ATTACK + i * 900 + randInt(0, 600), stolen: 0 }]));
  },
  cap(s) { return 60 * Math.pow(Threat.level(s), 1.7) + 80; },
  state(s, id) { return s.rivals[id]; },
  /** How much a vassal pays per second. */
  tribute(s) {
    const out = {};
    const t = Threat.level(s);
    for (const [id, r] of Object.entries(s.rivals)) if (r.vassal) { out.gold = (out.gold || 0) + 5 + t * 2 + r.power * 0.01; out.steel = (out.steel || 0) + 0.5 + t * 0.15; out.food = (out.food || 0) + 3 + t; }
    return out;
  },
  step(s, dt) {
    for (const [id, r] of Object.entries(s.rivals)) {
      // they grow richer and stronger over time (up to a cap set by the world threat)
      // they grow over time, and never fall too far behind the world threat
      const cap = this.cap(s) * (1 + Object.keys(RIVAL_LORDS).indexOf(id) * 0.25);
      r.power = Math.min(cap, Math.max(r.power * (1 + 0.00008 * dt) + 0.01 * dt, r.vassal ? 0 : cap * 0.18));
      const t = r.treasury, lim = 40 * r.power + 2000;
      t.gold = Math.min(lim, t.gold + r.power * 0.006 * dt); t.food = Math.min(lim, t.food + r.power * 0.005 * dt);
      t.stone = Math.min(lim, t.stone + r.power * 0.004 * dt); t.steel = Math.min(lim / 4, t.steel + r.power * 0.001 * dt);
      if (!r.vassal && !s.raid && s.time >= r.nextAttack && !s.battle) {
        r.nextAttack = s.time + randInt(1500, 2700);
        this.attack(s, id);
      }
    }
  },
  attack(s, id) {
    const L = RIVAL_LORDS[id], r = s.rivals[id];
    const power = Math.round(r.power * 0.75 * Threat.powerMult(s));
    const army = composeArmy("rival_" + id, power);
    s.raidCount++;
    s.raid = { id: s.nextId++, faction: "rival_" + id, rival: id, army, power: armyPower(army), mapType: ["plains", "hills", "forest", "river"][randInt(0, 3)], arriveAt: s.time + BALANCE.raidWarning, deadline: 0, phase: "approaching" };
    addLog(s, `⚔ ${L.lord} of ${L.name} marches on Ironhold with ${fmtInt(Military.sum(army))} soldiers (power ${fmt(s.raid.power)}) to plunder your stores! They arrive in ${fmtTime(BALANCE.raidWarning)}.`, "bad");
  },
  /** After a rival's raid on you is resolved. */
  afterRaid(s, id, won, plundered) {
    const r = s.rivals[id];
    if (!r) return;
    if (won) { r.power *= 0.85; addLog(s, `${RIVAL_LORDS[id].name}'s army limps home, beaten.`, "good"); }
    else {
      r.power *= 1.05;
      for (const [k, v] of Object.entries(plundered || {})) if (r.treasury[k] !== undefined) r.treasury[k] += v;
      r.stolen += Object.values(plundered || {}).reduce((a, b) => a + b, 0);
    }
  },
  bribeCost(s, id) { return Math.round(s.rivals[id].power * 8 + 200); },
  bribe(s, id) {
    const r = s.rivals[id], c = this.bribeCost(s, id);
    if (r.vassal || s.resources.gold < c) return false;
    s.resources.gold -= c; r.treasury.gold += c;
    r.nextAttack = Math.max(r.nextAttack, s.time) + 1800;
    addLog(s, `💰 You sent ${fmtInt(c)} Gold to ${RIVAL_LORDS[id].lord}. ${RIVAL_LORDS[id].name} will leave you in peace for a while.`, "info");
    return true;
  },
  /** You stormed their castle. */
  defeated(s, id) {
    const r = s.rivals[id], L = RIVAL_LORDS[id];
    r.defeats++; r.power *= 0.7;
    for (const k of Object.keys(r.treasury)) r.treasury[k] *= 0.6;
    r.nextAttack = s.time + 2400;
    if (r.defeats >= 3 && !r.vassal) {
      r.vassal = true;
      addLog(s, `👑 ${L.lord} kneels before you! ${L.name} is now your vassal and pays tribute every second.`, "good");
      return "vassal";
    }
    addLog(s, `🏰 You sacked ${L.name}! (${r.defeats}/3: defeat them three times to make them your vassal.)`, "good");
    return "sacked";
  },
};

/* ---------- Captains: unique heroes who lead one kind of troops ---------- */
const CAPTAINS = {
  roland: { name: "Sir Roland the Bold", asset: "c_roland", troops: "Cavalry", match: (d) => d.cls === "cav" && !d.hero, req: { stables: 1 },
            atk: [0.08, 0.025], def: [0.04, 0.015], perks: { 3: { charge: 0.3, txt: "Charges hit 30% harder" }, 6: { move: 1, txt: "+1 movement" }, 9: { atk: 0.15, txt: "+15% attack" } },
            bio: "A champion of the tourney fields who has never lost a joust." },
  elara:  { name: "Elara Swiftbow", asset: "c_elara", troops: "Archers & missile troops", match: (d) => d.cls === "ranged" && !d.splash && !d.hero, req: { barracks: 2 },
            atk: [0.08, 0.025], def: [0.03, 0.01], perks: { 3: { atk: 0.1, txt: "+10% attack" }, 6: { range: 1, txt: "+1 range" }, 9: { def: 0.2, txt: "+20% defense" } },
            bio: "A ranger from the northern woods who can split an arrow at a hundred paces." },
  gorm:   { name: "Gorm Ironwall", asset: "c_gorm", troops: "Infantry", match: (d) => d.cls === "inf" && !d.hero, req: { barracks: 1 },
            atk: [0.05, 0.02], def: [0.08, 0.025], perks: { 3: { def: 0.1, txt: "+10% defense" }, 6: { counter: 0.25, txt: "Stronger counterattacks" }, 9: { atk: 0.15, txt: "+15% attack" } },
            bio: "Thirty years in the shield wall and not one step back." },
  aldous: { name: "Brother Aldous", asset: "c_aldous", troops: "Healers (Priests & Paladins)", match: (d) => !!d.heal && !d.general, req: { temple: 1 },
            atk: [0, 0.01], def: [0.05, 0.02], heal: [0.25, 0.08], perks: { 3: { heal: 0.3, txt: "+30% healing" }, 6: { def: 0.15, txt: "+15% defense" }, 9: { heal: 0.5, txt: "+50% healing" } },
            bio: "A gentle old monk whose prayers close wounds faster than any surgeon." },
  vex:    { name: "Magistra Vex", asset: "c_vex", troops: "Battle Mages", match: (d) => !!d.splash, req: { magetower: 1 },
            atk: [0.1, 0.03], def: [0, 0.01], perks: { 3: { splash: 0.25, txt: "+25% splash damage" }, 6: { range: 1, txt: "+1 range" }, 9: { atk: 0.2, txt: "+20% attack" } },
            bio: "Expelled from the Academy for setting the library on fire. Twice." },
  tobias: { name: "Master Tobias", asset: "c_tobias", troops: "Siege engines", match: (d) => d.cls === "siege", req: { workshop: 1 },
            atk: [0.08, 0.025], def: [0.03, 0.01], breach: [0.25, 0.08], perks: { 3: { range: 1, txt: "+1 range" }, 6: { breach: 0.5, txt: "+50% wall damage" }, 9: { atk: 0.2, txt: "+20% attack" } },
            bio: "He has never met a wall he could not knock down." },
};
const CAPTAIN_MAX = 10;
/** Bonuses captain `id` at `lvl` gives unit def d (or null if they don't lead that kind of troops). Used by the battle engine. */
function captainMods(id, lvl, d) {
  const C = CAPTAINS[id];
  if (!C || !d || !C.match(d)) return null;
  const v = (k) => (C[k] ? C[k][0] + C[k][1] * (lvl - 1) : 0);
  const out = { atk: v("atk"), def: v("def"), heal: v("heal"), breach: v("breach"), move: 0, range: 0, charge: 0, splash: 0, counter: 0 };
  for (const [L, p] of Object.entries(C.perks)) if (lvl >= +L) for (const [k, x] of Object.entries(p)) if (k !== "txt") out[k] = (out[k] || 0) + x;
  return out;
}
const Captains = {
  slots(s) { return Math.min(4, 1 + Math.floor(s.buildings.townhall / 4)); },
  hiredCount(s) { return Object.values(s.captains).filter((c) => c.hired).length; },
  assigned(s) { return Object.entries(s.captains).filter(([, c]) => c.hired && c.assigned).map(([id]) => id); },
  xpNeed(lvl) { return Math.round(220 * Math.pow(lvl, 1.8)); },
  hireCost(s) { const n = this.hiredCount(s); return { gold: 2000 * (1 + n * 1.5), relics: 1 + Math.floor(n / 2) }; },
  hireBlocker(s, id) {
    const C = CAPTAINS[id];
    if (s.captains[id] && s.captains[id].hired) return "Already in your service";
    for (const [b, l] of Object.entries(C.req)) if (s.buildings[b] < l) return `Requires ${BUILDINGS[b].name} level ${l}`;
    const c = this.hireCost(s);
    if (s.resources.gold < c.gold || s.resources.relics < c.relics) return `Costs ${fmt(c.gold)} Gold and ${c.relics} Relic${c.relics > 1 ? "s" : ""}`;
    return null;
  },
  hire(s, id) {
    if (this.hireBlocker(s, id)) return false;
    const c = this.hireCost(s);
    s.resources.gold -= c.gold; s.resources.relics -= c.relics;
    s.captains[id] = { hired: true, level: 1, xp: 0, assigned: this.assigned(s).length < this.slots(s) };
    addLog(s, `🎖 ${CAPTAINS[id].name} has sworn to lead your ${CAPTAINS[id].troops.toLowerCase()}!`, "war");
    return true;
  },
  toggle(s, id) {
    const c = s.captains[id];
    if (!c || !c.hired) return false;
    if (!c.assigned && this.assigned(s).length >= this.slots(s)) return false;
    c.assigned = !c.assigned;
    return true;
  },
  /** Levels of the captains leading this battle. */
  battleLevels(s) { return Object.fromEntries(this.assigned(s).map((id) => [id, s.captains[id].level])); },
  /** Captains earn experience from the enemies their troops kill. */
  award(s, vetXp) {
    for (const id of this.assigned(s)) {
      const c = s.captains[id], C = CAPTAINS[id];
      let xp = 0;
      for (const [t, v] of Object.entries(vetXp || {})) if (UNITS[t] && C.match(UNITS[t])) xp += v;
      if (!xp || c.level >= CAPTAIN_MAX) continue;
      c.xp += Math.round(xp * (1 + 0.2 * Legacy.lvl(s, "mentors")));
      while (c.level < CAPTAIN_MAX && c.xp >= this.xpNeed(c.level)) {
        c.xp -= this.xpNeed(c.level); c.level++;
        const perk = C.perks[c.level];
        addLog(s, `🎖 ${C.name} reached level ${c.level}!${perk ? ` New perk: ${perk.txt}.` : ""}`, "war");
      }
    }
  },
  describe(id, lvl) {
    const C = CAPTAINS[id], m = captainMods(id, lvl, { cls: "inf", heal: 1, splash: 1 }) || {};
    const v = (k) => (C[k] ? C[k][0] + C[k][1] * (lvl - 1) : 0);
    const parts = [];
    if (v("atk")) parts.push(`+${Math.round(v("atk") * 100)}% attack`);
    if (v("def")) parts.push(`+${Math.round(v("def") * 100)}% defense`);
    if (v("heal")) parts.push(`+${Math.round(v("heal") * 100)}% healing`);
    if (v("breach")) parts.push(`+${Math.round(v("breach") * 100)}% wall damage`);
    void m;
    return parts.join(", ");
  },
};

const Temple = {
  blocker(s, id) {
    const bl = BLESSINGS[id];
    if (s.buildings.temple < 1) return "Build a Temple first";
    if (Events.active(s, bl.buff)) return "Already active";
    if (s.resources.faith < bl.cost) return `Needs ${bl.cost} Faith`;
    return null;
  },
  bless(s, id) {
    if (this.blocker(s, id)) return false;
    const bl = BLESSINGS[id];
    s.resources.faith -= bl.cost;
    s.buffs = s.buffs.filter((b) => b.id !== bl.buff);
    s.buffs.push({ id: bl.buff, until: s.time + bl.dur });
    s.stats.blessings++;
    addLog(s, `${bl.icon} The priests invoke the ${bl.name}: ${EVENTS[bl.buff].desc.replace(/for \d+ minutes\.?/, "for 10 minutes.")}`, "good");
    return true;
  },
};

const Market = {
  sellPrice(s, r) { return TRADE_VALUE[r] * Math.min(1, 0.7 + 0.03 * s.buildings.market); },
  buyPrice(s, r) { return TRADE_VALUE[r] * Math.max(1.1, 1.5 - 0.03 * s.buildings.market); },
  sell(s, r, n) {
    if (s.buildings.market < 1) return false;
    n = Math.floor(Math.min(n, s.resources[r]));
    if (n <= 0) return false;
    const got = Economy.grant(s, { gold: n * this.sellPrice(s, r) });
    if (got.gold <= 0) return false;
    const used = Math.ceil(got.gold / this.sellPrice(s, r));
    s.resources[r] -= Math.min(n, used);
    s.stats.trades++;
    return true;
  },
  buy(s, r, n) {
    if (s.buildings.market < 1) return false;
    const room = Economy.caps(s)[r] - s.resources[r];
    n = Math.floor(Math.min(n, room, s.resources.gold / this.buyPrice(s, r)));
    if (n <= 0) return false;
    s.resources.gold -= n * this.buyPrice(s, r);
    s.resources[r] += n;
    s.stats.trades++;
    return true;
  },
};

const Events = {
  active(s, id) { return s.buffs.some((b) => b.id === id && b.until > s.time); },
  pick() {
    const list = Object.entries(EVENTS), total = list.reduce((a, [, e]) => a + e.weight, 0);
    let r = Math.random() * total;
    for (const [id, e] of list) { r -= e.weight; if (r <= 0) return id; }
    return list[0][0];
  },
  fire(s, id = this.pick()) {
    const e = EVENTS[id];
    if (e.kind === "buff") {
      s.buffs = s.buffs.filter((b) => b.until > s.time && b.id !== id);
      s.buffs.push({ id, until: s.time + e.dur });
      addLog(s, `${e.icon} ${e.name}! ${e.desc}`, "good");
    } else if (e.kind === "instant") {
      if (id === "goldvein") {
        const got = Economy.grant(s, { gold: Economy.caps(s).gold * 0.15 });
        addLog(s, got.gold >= 1 ? `${e.icon} ${e.name}! +${fmtInt(got.gold)} Gold.` : `${e.icon} ${e.name}, but your treasury is already full. Build Warehouses to hold more.`, got.gold >= 1 ? "good" : "info");
      } else if (id === "refugees") {
        const room = Math.max(0, Economy.housing(s) - Economy.totalPop(s));
        const n = Math.min(room, randInt(5, 10 + 2 * s.buildings.townhall));
        s.population.citizens += n;
        addLog(s, n ? `${e.icon} ${e.name}: ${n} new citizens settle in Ironhold.` : `${e.icon} Refugees passed through, but there was no free housing for them.`, n ? "good" : "info");
      } else if (id === "plague") {
        const f = 0.06 * Math.max(0.2, 1 - 0.15 * s.buildings.temple - 0.12 * Research.lvl(s, "medicine"));
        const n = Math.ceil(s.population.citizens * f);
        for (let i = 0; i < n; i++) Economy.removeCitizen(s);
        addLog(s, `${e.icon} Plague! ${n} citizens died. (Temples and Medicine reduce plague deaths.)`, "bad");
      }
    } else {
      const offer = { id, expires: s.time + 150 };
      if (id === "mercenaries") {
        const unit = s.buildings.stables >= 3 ? "knight" : s.buildings.barracks >= 2 ? "footman" : "militia";
        const n = 5 + s.buildings.townhall * 2;
        offer.unit = unit; offer.n = n;
        offer.cost = { gold: Math.round(UNITS[unit].cost.gold * n * 1.5) };
      } else if (id === "caravan") {
        const give = Math.max(200, Math.round(s.resources.stone * 0.3));
        offer.cost = { stone: give }; offer.get = { steel: Math.round(give / 3) };
      } else if (id === "relicseller") {
        offer.cost = { gold: Math.round(Economy.caps(s).gold * 0.6) }; offer.get = { relics: 1 };
      }
      s.offer = offer;
      addLog(s, `${e.icon} ${e.name}: ${e.desc} The offer stands for ${fmtTime(150)}.`, "info");
    }
  },
  offerText(s) {
    const o = s.offer;
    if (!o) return "";
    const cost = Object.entries(o.cost).map(([r, v]) => amount(r, v)).join(", ");
    if (o.id === "mercenaries") return `Hire ${o.n} ${plural(UNITS[o.unit].name, o.n)} for ${cost}.`;
    const get = Object.entries(o.get).map(([r, v]) => amount(r, v)).join(", ");
    return `Trade ${cost} for ${get}.`;
  },
  accept(s) {
    const o = s.offer;
    if (!o || !Economy.canAfford(s, o.cost)) return false;
    Economy.pay(s, o.cost);
    if (o.id === "mercenaries") {
      const room = Math.max(0, Economy.housing(s) - Economy.totalPop(s));
      const n = Math.min(o.n, room);
      s.army[o.unit] = (s.army[o.unit] || 0) + n;
      addLog(s, `🗡️ ${n} mercenary ${plural(UNITS[o.unit].name, n)} join your army${n < o.n ? " (the rest found no housing and left)" : ""}.`, "war");
    } else {
      const { relics, ...rest } = o.get;
      Economy.grant(s, rest);
      if (relics) { s.resources.relics += relics; s.stats.relicsFound += relics; }
      addLog(s, `${EVENTS[o.id].icon} Deal struck: ${this.offerText(s)}`, "good");
    }
    s.offer = null;
    return true;
  },
  decline(s) { if (s.offer) { addLog(s, `${EVENTS[s.offer.id].icon} You turned down the ${EVENTS[s.offer.id].name}.`, "info"); s.offer = null; } },
  step(s) {
    s.buffs = s.buffs.filter((b) => b.until > s.time);
    if (s.offer && s.time >= s.offer.expires) { addLog(s, `The ${EVENTS[s.offer.id].name} moved on.`, "info"); s.offer = null; }
    if (s.time >= s.nextEventAt) {
      s.nextEventAt = s.time + randInt(900, 1500);
      let id = this.pick();
      if (EVENTS[id].kind === "offer" && s.offer) id = "harvest";
      this.fire(s, id);
    }
  },
};
