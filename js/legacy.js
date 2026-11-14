"use strict";
/* =====================================================================
   LEGACY: achievements, titles and Ascension (prestige)
   ---------------------------------------------------------------------
   Achievements unlock for good and grant points, rewards and titles.
   Ascension starts a new realm, but your legacy remains: Crowns buy
   permanent perks, and achievements, titles and equipped gear carry over.
   ===================================================================== */
const ACHIEVEMENTS = [
  // city
  { id: "th3", name: "Growing Town", icon: "🏘️", pts: 5, desc: "Raise the Town Hall to level 3", check: (s) => s.buildings.townhall >= 3, reward: { gold: 1000 } },
  { id: "th8", name: "Great City", icon: "🏙️", pts: 15, desc: "Raise the Town Hall to level 8", check: (s) => s.buildings.townhall >= 8, reward: { relics: 2 } },
  { id: "th15", name: "Capital of the Realm", icon: "👑", pts: 40, desc: "Raise the Town Hall to level 15", check: (s) => s.buildings.townhall >= 15, reward: { relics: 10 }, title: "the Builder King" },
  { id: "pop100", name: "Bustling", icon: "👥", pts: 5, desc: "Reach 100 population", check: (s) => s.stats.peakPop >= 100, reward: { food: 2000 } },
  { id: "pop500", name: "Metropolis", icon: "🌆", pts: 20, desc: "Reach 500 population", check: (s) => s.stats.peakPop >= 500, reward: { relics: 3 }, title: "the Populous" },
  { id: "built50", name: "Master Mason", icon: "🧱", pts: 10, desc: "Finish 50 constructions", check: (s) => s.stats.built >= 50, reward: { stone: 5000 } },
  { id: "collect100", name: "Tax Collector", icon: "💰", pts: 10, desc: "Collect 100 building bonuses", check: (s) => (s.stats.collected || 0) >= 100, reward: { gold: 5000 }, title: "the Tax Collector" },
  { id: "gold1m", name: "Treasure Hoard", icon: "🪙", pts: 20, desc: "Earn 1,000,000 Gold in total", check: (s) => s.stats.goldEarned >= 1e6, reward: { relics: 3 }, title: "the Golden" },
  { id: "research25", name: "Scholar", icon: "📜", pts: 15, desc: "Complete 25 research levels", check: (s) => Research.total(s) >= 25, reward: { relics: 2 }, title: "the Wise" },
  // war
  { id: "win1", name: "First Blood", icon: "🗡️", pts: 5, desc: "Win your first battle", check: (s) => s.stats.won + s.stats.raidsWon >= 1, reward: { gold: 500 } },
  { id: "led25", name: "Front-line Commander", icon: "⚔️", pts: 15, desc: "Win 25 battles you lead in person", check: (s) => s.stats.battlesLedWon >= 25, reward: { relics: 3 }, title: "the Bold" },
  { id: "slay1k", name: "Thousand Foes", icon: "💀", pts: 10, desc: "Slay 1,000 enemies", check: (s) => s.stats.enemiesSlain >= 1000, reward: { steel: 2000 } },
  { id: "slay10k", name: "Scourge of Armies", icon: "☠️", pts: 25, desc: "Slay 10,000 enemies", check: (s) => s.stats.enemiesSlain >= 10000, reward: { relics: 5 }, title: "the Scourge" },
  { id: "raids10", name: "Unbreakable Walls", icon: "🛡️", pts: 10, desc: "Repel 10 raids", check: (s) => s.stats.raidsWon >= 10, reward: { stone: 5000 }, title: "the Shield" },
  { id: "raids50", name: "Bulwark", icon: "🏰", pts: 25, desc: "Repel 50 raids", check: (s) => s.stats.raidsWon >= 50, reward: { relics: 5 } },
  { id: "vet5", name: "Elite Corps", icon: "★", pts: 15, desc: "Raise any unit type to veteran rank 5", check: (s) => Object.values(s.veterancy).some((x) => Military.vetRank(x) >= 5), reward: { relics: 2 } },
  { id: "dragon", name: "Dragonslayer", icon: "🐉", pts: 30, desc: "Slay the Elder Dragon", check: (s) => (s.stats.missionWins.dragon || 0) >= 1, reward: { relics: 5 }, title: "the Dragonslayer" },
  { id: "titan", name: "Titanfall", icon: "⚡", pts: 50, desc: "Topple the Storm Titan", check: (s) => (s.stats.missionWins.titan || 0) >= 1, reward: { relics: 10 }, title: "Titanslayer" },
  { id: "campaign", name: "Saviour of the Realm", icon: "📖", pts: 40, desc: "Turn in every campaign quest", check: (s) => CAMPAIGN_ORDER.every((id) => s.campaign.turned[id]), reward: { relics: 10 }, title: "the Saviour" },
  { id: "conq10", name: "Conqueror", icon: "🗺️", pts: 20, desc: "Reach Endless Conquest stage 10", check: (s) => s.conquest >= 10, reward: { relics: 3 }, title: "the Conqueror" },
  { id: "conq30", name: "World Eater", icon: "🌍", pts: 40, desc: "Reach Endless Conquest stage 30", check: (s) => s.conquest >= 30, reward: { relics: 10 } },
  // realm
  { id: "vassal1", name: "Overlord", icon: "🤴", pts: 15, desc: "Make a rival lord your vassal", check: (s) => Object.values(s.rivals || {}).some((r) => r.vassal), reward: { relics: 2 } },
  { id: "vassal4", name: "High King", icon: "👑", pts: 40, desc: "Make all four rival lords your vassals", check: (s) => Object.values(s.rivals || {}).filter((r) => r.vassal).length >= 4, reward: { relics: 10 }, title: "the High King" },
  { id: "terr6", name: "Landholder", icon: "🚩", pts: 15, desc: "Hold 6 territories at once", check: (s) => World.territories(s).length >= 6, reward: { relics: 2 } },
  { id: "capital", name: "Warlord's Bane", icon: "🏯", pts: 25, desc: "Storm the Warlord's Capital", check: (s) => (s.stats.capitalsTaken || 0) >= 1, reward: { relics: 5 } },
  { id: "captain10", name: "Legendary Captain", icon: "🎖️", pts: 20, desc: "Raise a Captain to level 10", check: (s) => Object.values(s.captains).some((c) => c.level >= 10), reward: { relics: 3 } },
  { id: "legend", name: "Legendary Arms", icon: "🔶", pts: 15, desc: "Equip a Legendary item", check: (s) => Object.values(s.gear.equipped).some((x) => x && x.rarity === "legendary"), reward: { relics: 2 } },
  { id: "thief10", name: "Long Arm of the Law", icon: "🦹", pts: 10, desc: "Deal with 25 surprises in town", check: (s) => (s.stats.surprises || 0) >= 25, reward: { gold: 5000 }, title: "the Just" },
  { id: "disaster", name: "Weathered", icon: "🌪️", pts: 10, desc: "Endure 10 natural disasters", check: (s) => (s.stats.disasters || 0) >= 10, reward: { relics: 1 } },
  { id: "ascend1", name: "Reborn", icon: "🔥", pts: 30, desc: "Ascend for the first time", check: (s) => Legacy.data(s).ascensions >= 1, reward: { relics: 5 }, title: "the Reborn" },
];

/* Permanent perks bought with Crowns; they survive every Ascension. */
const LEGACY_PERKS = {
  prosperity: { name: "Prosperity",       icon: "🌾", max: 10, cost: (l) => 1 + l,     desc: (l) => `+${l * 8}% production of every resource` },
  vaults:     { name: "Royal Vaults",     icon: "🏦", max: 10, cost: (l) => 1 + l,     desc: (l) => `+${l * 12}% storage` },
  warlord:    { name: "Warlord's Blood",  icon: "⚔️", max: 10, cost: (l) => 2 + l,     desc: (l) => `+${l * 5}% attack for your armies` },
  masons:     { name: "Guild of Masons",  icon: "🔨", max: 5,  cost: (l) => 2 + l * 2, desc: (l) => `${l * 12}% faster construction` },
  builders:   { name: "Extra Builders",   icon: "👷", max: 2,  cost: (l) => 5 + l * 5, desc: (l) => `+${l} builder${l === 1 ? "" : "s"}` },
  headstart:  { name: "Head Start",       icon: "🎒", max: 5,  cost: (l) => 1 + l,     desc: (l) => `Start each realm with ${l * 2000} of every basic resource` },
  mentors:    { name: "Mentors",          icon: "🎖️", max: 5,  cost: (l) => 2 + l,     desc: (l) => `Captains and the commander earn +${l * 20}% XP` },
};

const Legacy = {
  data(s) {
    if (!s.legacy) s.legacy = { ascensions: 0, crowns: 0, crownsEarned: 0, perks: {}, title: "" };
    return s.legacy;
  },
  lvl(s, perk) { return (s && s.legacy && s.legacy.perks && s.legacy.perks[perk]) || 0; },
  // ---------- achievements ----------
  points(s) { return ACHIEVEMENTS.filter((a) => (s.achievements || {})[a.id]).reduce((x, a) => x + a.pts, 0); },
  step(s) {
    if (Engine.simulating && Math.random() > 0.05) return;   // cheap while catching up offline
    s.achievements = s.achievements || {};
    for (const a of ACHIEVEMENTS) {
      if (s.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.check(s); } catch { ok = false; }
      if (!ok) continue;
      s.achievements[a.id] = Date.now();
      const { relics, ...rest } = a.reward;
      Economy.grant(s, rest);
      if (relics) { s.resources.relics += relics; s.stats.relicsFound += relics; }
      addLog(s, `🏆 Achievement unlocked: ${a.name}! ${a.desc}. Reward: ${Quests.rewardText(a.reward)}${a.title ? `, and the title "${a.title}"` : ""}.`, "good");
      if (!Engine.simulating) {
        if (typeof Sound !== "undefined") Sound.play("victory");
        if (typeof UI !== "undefined" && document.getElementById("toasts")) this.popup(a);
      }
    }
  },
  popup(a) {
    // one at a time: queue popups that unlock together
    const wait = Math.max(0, (this.nextPop || 0) - Date.now());
    this.nextPop = Date.now() + wait + 2600;
    if (wait) { setTimeout(() => this.showPop(a), wait); return; }
    this.showPop(a);
  },
  showPop(a) {
    const el = document.createElement("div");
    el.className = "achpop";
    el.innerHTML = `<span>${a.icon}</span><div><small>Achievement unlocked</small><b>${esc(a.name)}</b><em>${esc(a.desc)}</em></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add("out"), 2200);
    setTimeout(() => el.remove(), 2700);
  },
  titles(s) { return ACHIEVEMENTS.filter((a) => a.title && (s.achievements || {})[a.id]).map((a) => a.title); },
  fullName(s) { const t = this.data(s).title; return t ? `Lord of Ironhold, ${t}` : "Lord of Ironhold"; },

  // ---------- ascension ----------
  minTH: 10,
  crownsFor(s) {
    const turned = Object.keys(s.campaign.turned || {}).length;
    return Math.floor(Math.pow(s.buildings.townhall, 1.4) + turned * 2 + s.conquest * 0.8 + s.stats.raidsWon / 4 + this.points(s) / 15 + Object.values(s.rivals || {}).filter((r) => r.vassal).length * 3);
  },
  canAscend(s) { return s.buildings.townhall >= this.minTH; },
  ascend() {
    const old = GameState.current;
    if (!this.canAscend(old)) return false;
    const L = this.data(old), gain = this.crownsFor(old);
    const s = GameState.newGame();
    s.legacy = { ...L, ascensions: L.ascensions + 1, crowns: L.crowns + gain, crownsEarned: (L.crownsEarned || 0) + gain };
    s.achievements = { ...(old.achievements || {}) };
    s.gear = { equipped: { ...old.gear.equipped }, bag: [] };
    s.tutorial = { step: 0, done: true };
    this.applyHeadStart(s);
    addLog(s, `🔥 Ascension ${s.legacy.ascensions}! A new realm rises from the ashes of the old. You gained ${gain} Crowns (${s.legacy.crowns} to spend).`, "good");
    GameState.current = s;
    GameState.save();
    return gain;
  },
  applyHeadStart(s) {
    const h = this.lvl(s, "headstart") * 2000;
    if (h) for (const r of ["gold", "food", "stone", "wood"]) s.resources[r] = Math.min(Economy.caps(s)[r] * 3, s.resources[r] + h);
  },
  buy(s, perk) {
    const L = this.data(s), P = LEGACY_PERKS[perk], l = this.lvl(s, perk);
    if (l >= P.max || L.crowns < P.cost(l)) return false;
    L.crowns -= P.cost(l);
    L.perks[perk] = l + 1;
    if (perk === "headstart") Economy.grant(s, { gold: 2000, food: 2000, stone: 2000, wood: 2000 });
    addLog(s, `👑 Legacy perk: ${P.name} level ${l + 1} (${P.desc(l + 1)}).`, "good");
    return true;
  },

  // ---------- the Hall of Fame window ----------
  html(s) {
    const L = this.data(s), got = s.achievements || {}, pts = this.points(s);
    const titles = this.titles(s);
    const ach = ACHIEVEMENTS.map((a) => `<div class="ach ${got[a.id] ? "got" : ""}" title="${esc(a.desc)}"><span>${a.icon}</span><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><em>${a.pts} pts · ${Quests.rewardText(a.reward)}${a.title ? ` · title "${esc(a.title)}"` : ""}</em></div></div>`).join("");
    const perks = Object.entries(LEGACY_PERKS).map(([k, P]) => {
      const l = this.lvl(s, k), c = P.cost(l);
      return `<div class="perkcard"><span>${P.icon}</span><div style="flex:1"><b>${P.name}</b> <span class="badge">${l}/${P.max}</span><div class="dim" style="font-size:11.5px">${l ? P.desc(l) : "Not learned"}${l < P.max ? ` → <span class="good">${P.desc(l + 1)}</span>` : ""}</div></div>
        <button class="btn sm primary" data-action="legacyBuy" data-id="${k}" ${l >= P.max || L.crowns < c ? "disabled" : ""}>${l >= P.max ? "Max" : `👑 ${c}`}</button></div>`;
    }).join("");
    const can = this.canAscend(s);
    return `<div class="hof-top">
        <div><div class="dim">Achievement points</div><div class="hof-big">🏆 ${pts}</div><div class="dim" style="font-size:12px">${Object.keys(got).length} / ${ACHIEVEMENTS.length} unlocked</div></div>
        <div><div class="dim">Crowns</div><div class="hof-big">👑 ${L.crowns}</div><div class="dim" style="font-size:12px">${L.ascensions} ascension${L.ascensions === 1 ? "" : "s"} · ${L.crownsEarned || 0} earned in total</div></div>
        <div><div class="dim">Your title</div><select id="titleSel" data-action="noop">${["", ...titles].map((t) => `<option value="${esc(t)}" ${t === L.title ? "selected" : ""}>${t ? esc(t) : "(none)"}</option>`).join("")}</select><div class="dim" style="font-size:11.5px;margin-top:3px">${titles.length ? "Earn more titles from achievements." : "Some achievements grant a title."}</div></div>
      </div>
      <div class="section-title">🔥 Ascension</div>
      <div class="ascend ${can ? "ready" : ""}">
        <div style="flex:1"><b>Start a new realm and keep your legacy.</b><div class="dim" style="font-size:12.5px">Your city, army, resources and progress are reset. You keep your Crowns and perks, achievements, titles and equipped gear. Available from Town Hall level ${this.minTH}.</div>
        <div style="margin-top:4px">Ascending now would earn <b class="good">👑 ${this.crownsFor(s)} Crowns</b> (more for a higher Town Hall, campaign quests, conquest, raids won, vassals and achievements).</div></div>
        <button class="btn ${can ? "primary" : ""}" data-action="ascend" ${can ? "" : "disabled"}>${can ? "🔥 Ascend" : `Town Hall ${this.minTH} needed`}</button>
      </div>
      <div class="section-title">👑 Legacy perks <span class="dim" style="text-transform:none;letter-spacing:0">(permanent, bought with Crowns)</span></div>
      <div class="perkgrid">${perks}</div>
      <div class="section-title">🏆 Achievements</div>
      <div class="achgrid">${ach}</div>`;
  },
};
