"use strict";
/* =====================================================================
   4. MILITARY MODULE (training, upkeep, desertion, raids, expeditions)
      Combat itself lives in js/battle.js (Battle + BattleUI).
   ===================================================================== */
function opts_led(ctx) { return !!(ctx && ctx.led); }

const Military = {
  sum(units) { return Object.values(units || {}).reduce((a, b) => a + b, 0); },
  homeCount(s) { return this.sum(s.army); },
  awayCount(s) { return s.expeditions.reduce((a, e) => a + this.sum(e.units), 0); },
  battleUnits(s) { return s.battle ? Battle.survivors(s.battle, "player") : {}; },
  soldierCount(s) { return this.homeCount(s) + this.awayCount(s) + s.queue.length + this.sum(this.battleUnits(s)); },
  allUnits(s) {
    const t = { ...s.army };
    const add = (u, n) => { t[u] = (t[u] || 0) + n; };
    for (const e of s.expeditions) for (const [u, n] of Object.entries(e.units)) add(u, n);
    for (const q of s.queue) add(q.unit, 1);
    for (const [u, n] of Object.entries(this.battleUnits(s))) add(u, n);
    return t;
  },
  upkeep(s) {
    const out = { food: 0, gold: 0 };
    for (const [u, n] of Object.entries(this.allUnits(s))) {
      if (!UNITS[u]) continue;
      out.food += UNITS[u].upkeep.food * n;
      out.gold += UNITS[u].upkeep.gold * n;
    }
    return out;
  },
  trainSpeed(s) { return (1 + 0.1 * Math.max(0, s.buildings.barracks - 1)) * (1 + 0.15 * Research.lvl(s, "training")); },
  expeditionSlots(s) { return s.buildings.barracks > 0 ? 1 + Math.floor(s.buildings.barracks / 3) : 0; },
  xpForLevel(lvl) { return Math.floor(40 * Math.pow(lvl, 1.6)); },
  /** Attack bonus for your side in battle: commander level and morale. */
  battleBonus(s) { return (1 + Armory.b(s, "armyAtk") / 100) * (1 + 0.03 * (s.commander.level - 1)) * (0.7 + 0.3 * s.morale / 100) * (1 + 0.05 * Research.lvl(s, "drill")) * (s.resources.ale >= 1 ? 1.05 : 1) * (Events.active(s, "holywar") ? 1.15 : 1); },
  defenseBonus(s) { return (1 + Armory.b(s, "armyDef") / 100) * (1 + 0.05 * Research.lvl(s, "plate")) * (Events.active(s, "aegis") ? 1.2 : 1); },
  power(s, units) { return armyPower(units) * this.battleBonus(s); },

  reqText(u) {
    return Object.entries(UNITS[u].req).map(([b, l]) => `${BUILDINGS[b].name} Lv ${l}`).join(" + ");
  },
  trainBlocker(s, id) {
    const u = UNITS[id];
    for (const [b, l] of Object.entries(u.req)) if (s.buildings[b] < l) return `Requires ${this.reqText(id)}`;
    if (s.jobs.recruit < 1) return "Needs a Recruit (assign one in Workforce)";
    if (s.queue.length >= BALANCE.maxQueue) return "Training queue is full";
    if (!Economy.canAfford(s, u.cost)) return "Not enough resources";
    return null;
  },
  train(s, id, count = 1) {
    let made = 0;
    for (let i = 0; i < count; i++) {
      if (this.trainBlocker(s, id)) break;
      Economy.pay(s, UNITS[id].cost);
      s.jobs.recruit--;                 // the recruit leaves civilian life...
      s.population.citizens--;          // ...and becomes a soldier in training
      s.queue.push({ unit: id, remaining: UNITS[id].time, total: UNITS[id].time });
      made++;
    }
    return made;
  },

  /** Dismiss soldiers: they go home as idle citizens (no refund). */
  release(s, id, n) {
    n = Math.min(Math.floor(n), s.army[id] || 0);
    if (n <= 0) return 0;
    s.army[id] -= n;
    s.population.citizens += n;
    addLog(s, `🏳️ ${n} ${plural(UNITS[id].name, n)} were released from service and returned home.`, "info");
    return n;
  },

  /* ---------------- expeditions ---------------- */
  conquestArmy(s) {
    if (!s.conquestArmy || s.conquestArmy.stage !== s.conquest) {
      const power = Math.round(250 * Math.pow(1.22, s.conquest - 1));
      const faction = pickFaction(power);
      const maps = Object.keys(MAP_TYPES);
      s.conquestArmy = { stage: s.conquest, faction, army: composeArmy(faction, power), map: maps[Math.floor(Math.random() * maps.length)], fortified: s.conquest % 4 === 0 ? Math.min(12, 2 + Math.floor(s.conquest / 4)) : 0 };
    }
    return s.conquestArmy;
  },
  /** The mission with its enemy army filled in (the endless conquest is generated per stage). */
  mission(s, id) {
    if (typeof id === "string" && id.startsWith("node:")) {
      World.ensure(s);
      const n = World.node(s, +id.slice(5));
      return n ? World.asMission(s, n) : null;
    }
    const m = MISSIONS[id];
    if (!m.endless) {
      const c = CAMPAIGN[id];
      const army = c && c.general ? { ...m.army, [c.general]: 1 } : m.army;
      return { ...m, id, army, enemyTactic: m.fortified ? "holdline" : "balanced" };
    }
    const c = this.conquestArmy(s), st = s.conquest, g = Math.pow(1.22, st - 1);
    return {
      ...m, id, name: `${m.name}: Stage ${st}`, sub: FACTIONS[c.faction].name, army: c.army, map: c.map, fortified: c.fortified,
      enemyTactic: FACTIONS[c.faction].tactic,
      xp: Math.round(m.xp * Math.pow(1.15, st - 1)),
      loot: { gold: [Math.round(800 * g), Math.round(1200 * g)], steel: [Math.round(120 * g), Math.round(200 * g)], stone: [Math.round(300 * g), Math.round(500 * g)] },
      relic: { chance: Math.min(1, 0.3 + st * 0.05), n: [1, 1 + Math.floor(st / 3)] },
    };
  },
  battleOpts(s, id, units, kind, tactic) {
    const m = this.mission(s, id);
    return {
      title: m.name, mapType: m.map, playerUnits: { ...units }, enemyUnits: { ...m.army },
      attacker: "player", tactic: tactic || s.doctrine, enemyTactic: m.enemyTactic,
      walls: m.fortified ? { side: "enemy", level: m.fortified } : null,
      context: { kind, mission: id, stage: m.endless ? s.conquest : undefined, cmdLevel: s.commander.level, led: kind === "assault" },
      objective: !!(m.node || m.endless),
      bonus: { player: this.battleBonus(s), enemy: Threat.atk(s) }, defBonus: { player: this.defenseBonus(s), enemy: Threat.def(s) }, vet: this.vetRanks(s), morale: Math.min(100, s.morale + Armory.b(s, "morale")),
      season: Climate.season(s).id, captains: Captains.battleLevels(s),
    };
  },
  /** Veteran ranks: each unit type earns experience from the enemies it kills (+6% attack & defense per rank, max 5). */
  vetRank(xp) { return Math.min(5, Math.floor(Math.sqrt((xp || 0) / 150))); },
  vetRanks(s) { return Object.fromEntries(Object.keys(UNITS).map((k) => [k, this.vetRank(s.veterancy[k])])); },
  vetNext(xp) { const r = this.vetRank(xp); return r >= 5 ? null : 150 * (r + 1) * (r + 1); },
  estimate(s, id, units, tactic, n = 8) {
    if (this.sum(units) <= 0) return { chance: 0, losses: 1 };
    return Battle.estimate(this.battleOpts(s, id, units, "estimate", tactic), n);
  },
  deployBlocker(s, id, units, manual) {
    const m = this.mission(s, id);
    if (!m) return "Unknown target";
    if (m.node) { const nb = World.blocker(s, World.node(s, m.node)); if (nb) return nb; }
    if (s.commander.level < m.level) return `Commander level ${m.level} required`;
    if (CAMPAIGN[id] && !Campaign.unlocked(s, id)) return `Finish the quest "${CAMPAIGN[CAMPAIGN_ORDER[CAMPAIGN_ORDER.indexOf(id) - 1]].title}" first`;
    if (s.battle) return "Finish the battle you are leading first";
    if (!manual && s.expeditions.length >= this.expeditionSlots(s)) return s.buildings.barracks ? "No free expedition slots" : "Build a Barracks first";
    if (units && this.sum(units) <= 0) return "Select at least one unit";
    if (units) for (const [u, n] of Object.entries(units)) if (n > s.army[u]) return "Not enough troops at home";
    if (!units && this.homeCount(s) <= 0) return "No troops at home";
    return null;
  },
  take(s, units) {
    const clean = {};
    for (const [u, n] of Object.entries(units)) if (n > 0) { clean[u] = n; s.army[u] -= n; }
    return clean;
  },
  deploy(s, id, units, tactic) {
    if (this.deployBlocker(s, id, units, false)) return false;
    const clean = this.take(s, units);
    const m = this.mission(s, id);
    const dur = m.duration * (1 - 0.06 * Research.lvl(s, "cartography"));
    s.expeditions.push({ id: s.nextId++, mission: id, units: clean, startAt: s.time, endAt: s.time + dur, tactic: tactic || s.doctrine });
    addLog(s, `An army of ${this.sum(clean)} marches on ${m.name}.`, "war");
    return true;
  },
  /** Start a battle you lead in person against a mission's defenders. */
  assault(s, id, units, tactic) {
    if (this.deployBlocker(s, id, units, true)) return null;
    const clean = this.take(s, units);
    s.battle = Battle.create({ ...this.battleOpts(s, id, clean, "assault", tactic), hero: s.commander.level, heroHp: Armory.b(s, "heroHp"), heroAtk: Armory.b(s, "heroAtk") });
    s.stats.battlesLed++;
    addLog(s, `You ride out at the head of ${this.sum(clean)} soldiers to assault ${this.mission(s, id).name}.`, "war");
    return s.battle;
  },
  recall(s, expId) {
    const i = s.expeditions.findIndex((e) => e.id === expId);
    if (i < 0) return;
    const e = s.expeditions[i];
    for (const [u, n] of Object.entries(e.units)) s.army[u] = (s.army[u] || 0) + n;
    s.expeditions.splice(i, 1);
    addLog(s, `The expedition to ${this.mission(s, e.mission).name} was called back. No loot was taken.`, "info");
  },
  resolveExpedition(s, e) {
    const b = Battle.create(this.battleOpts(s, e.mission, e.units, "expedition", e.tactic));
    Battle.simulate(b);
    return this.conclude(s, b);
  },

  /* ---------------- raids on the city ---------------- */
  raidPower(s) {
    // grows with every raid and your Town Hall, and never falls far behind your own army
    const base = 12 * Math.pow(1.15, s.raidCount) * (1 + 0.5 * (s.buildings.townhall - 1));
    return Math.round(Math.max(base, 0.5 * this.power(s, s.army)) * Threat.powerMult(s));
  },
  spawnRaid(s) {
    // sometimes the enemy goes after one of your territories instead of the city
    const terr = World.territories(s);
    if (terr.length && Math.random() < 0.4) {
      const n = terr[Math.floor(Math.random() * terr.length)];
      const power = Math.round(World.power(s, n) * 1.2);
      const faction = pickFaction(power);
      const army = composeArmy(faction, power);
      s.raidCount++;
      s.raid = { id: s.nextId++, faction, army, power: armyPower(army), mapType: World.mapType(s, n), arriveAt: s.time + BALANCE.raidWarning, deadline: 0, phase: "approaching", target: n.id };
      addLog(s, `⚠ ${anA(FACTIONS[faction].name, true)} (power ${fmt(s.raid.power)}) is marching to retake your ${NODE_TYPES[n.type].name}! They arrive in ${fmtTime(BALANCE.raidWarning)}.`, "bad");
      return;
    }
    const power = this.raidPower(s);
    const faction = pickFaction(power);
    const army = composeArmy(faction, power);
    if (power >= 150 && FACTION_GENERALS[faction]) army[FACTION_GENERALS[faction]] = 1;
    const maps = ["plains", "forest", "hills", "river", "valley", "mountain"];
    s.raidCount++;
    s.raid = { id: s.nextId++, faction, army, power: armyPower(army), mapType: maps[Math.floor(Math.random() * maps.length)], arriveAt: s.time + BALANCE.raidWarning, deadline: 0, phase: "approaching" };
    addLog(s, `⚠ Scouts report: ${anA(FACTIONS[faction].name)} (power ${fmt(s.raid.power)}) is marching on the city! They arrive in ${fmtTime(BALANCE.raidWarning)}.`, "bad");
  },
  raidOpts(s) {
    const r = s.raid, f = FACTIONS[r.faction];
    if (r.target) {
      const n = World.node(s, r.target), T = NODE_TYPES[n.type];
      return {
        title: `Defense of the ${T.name} vs the ${f.name}`, mapType: r.mapType,
        playerUnits: { ...s.army }, guards: 4 + (n.fort || 0) * 6, enemyUnits: { ...r.army },
        attacker: "enemy", tactic: s.doctrine, enemyTactic: f.tactic,
        walls: n.fort ? { side: "player", level: n.fort * 2 } : null,
        context: { kind: "raid", raid: r.id, target: n.id, cmdLevel: s.commander.level },
        objective: true,
        bonus: { player: this.battleBonus(s), enemy: Threat.atk(s) }, defBonus: { player: this.defenseBonus(s), enemy: Threat.def(s) }, vet: this.vetRanks(s), morale: Math.min(100, s.morale + Armory.b(s, "morale")),
      season: Climate.season(s).id, captains: Captains.battleLevels(s),
      };
    }
    return {
      title: `Defense of Ironhold vs the ${f.name}`, mapType: r.mapType,
      playerUnits: { ...s.army }, guards: s.buildings.townhall * 4, enemyUnits: { ...r.army },
      attacker: "enemy", tactic: s.doctrine, enemyTactic: f.tactic,
      walls: s.buildings.walls > 0 ? { side: "player", level: s.buildings.walls, hpMult: 1 + 0.25 * Research.lvl(s, "fortification") } : null,
      context: { kind: "raid", raid: r.id, cmdLevel: s.commander.level },
      bonus: { player: this.battleBonus(s), enemy: Threat.atk(s) }, defBonus: { player: this.defenseBonus(s), enemy: Threat.def(s) }, vet: this.vetRanks(s), morale: Math.min(100, s.morale + Armory.b(s, "morale")),
      season: Climate.season(s).id, captains: Captains.battleLevels(s),
    };
  },
  raidEstimate(s) { return s.raid ? Battle.estimate({ ...this.raidOpts(s), context: { kind: "estimate" } }, 6) : null; },
  /** Lead the defense yourself. */
  leadDefense(s) {
    if (!s.raid || s.raid.phase === "fighting" || s.battle) return null;
    const opts = this.raidOpts(s);
    opts.context.led = true;
    opts.hero = s.commander.level; opts.heroHp = Armory.b(s, "heroHp"); opts.heroAtk = Armory.b(s, "heroAtk");
    this.take(s, s.army);
    s.raid.phase = "fighting";
    s.battle = Battle.create(opts);
    s.stats.battlesLed++;
    return s.battle;
  },
  /** Your captains fight the raid automatically. */
  autoDefend(s) {
    if (!s.raid || s.raid.phase === "fighting") return null;
    const opts = this.raidOpts(s);
    this.take(s, s.army);
    const b = Battle.create(opts);
    Battle.simulate(b);
    return this.conclude(s, b);
  },

  /* ---------------- after any battle ---------------- */
  conclude(s, b) {
    const ctx = b.context || {};
    const win = b.result && b.result.winner === "player";
    const survivors = Battle.survivors(b, "player");
    for (const [u, n] of Object.entries(survivors)) s.army[u] = (s.army[u] || 0) + n;
    const lost = this.sum(Battle.losses(b, "player"));
    const slain = this.sum(Battle.losses(b, "enemy"));
    s.stats.fallen += lost;
    s.stats.enemiesSlain += slain;
    const rep = { win, lost, slain, parts: [], kind: ctx.kind, title: b.title };
    if (win && ctx.led) s.stats.battlesLedWon++;
    if (b.heroFell) { s.morale = Math.max(0, s.morale - 15); addLog(s, "Your Lord Commander was wounded in battle and needs time to recover (−15 morale).", "bad"); }
    if (b.generalFell && win) rep.parts.push("Enemy general slain");
    Captains.award(s, b.vetXp);
    // veteran experience
    for (const [t, xp] of Object.entries(b.vetXp || {})) {
      if (!UNITS[t]) continue;
      const before = this.vetRank(s.veterancy[t]);
      s.veterancy[t] = (s.veterancy[t] || 0) + xp;
      const after = this.vetRank(s.veterancy[t]);
      if (after > before) addLog(s, `★ Your ${plural(UNITS[t].name, 2)} reached veteran rank ${after} (+${after * 6}% attack and defense)!`, "war");
    }

    if (ctx.kind === "raid" && s.raid && s.raid.target) {
      const r = s.raid, n = World.node(s, r.target), name = n ? NODE_TYPES[n.type].name : "territory";
      if (win) {
        s.stats.territoriesDefended++;
        const got = Economy.grant(s, { gold: Math.round(r.power * 3) });
        rep.parts.push(`${fmtInt(got.gold)} Gold`);
        addLog(s, `Your ${name} held against the ${FACTIONS[r.faction].name}! Bounty: ${fmtInt(got.gold)} Gold.`, "good");
        this.addXp(s, Math.round(r.power / 5));
      } else {
        s.stats.territoriesLost++;
        if (n) { n.owner = "enemy"; n.garrison = null; n.fort = 0; n.clearedUntil = s.time + 60; }
        rep.parts.push(`${name} lost`);
        addLog(s, `The ${FACTIONS[r.faction].name} retook your ${name}.`, "bad");
      }
      s.raid = null;
      s.nextRaidAt = s.time + randInt(600, 1080);
      return rep;
    }
    if (ctx.kind === "raid") {
      const r = s.raid;
      const f = r ? FACTIONS[r.faction].name : "raiders";
      if (win) {
        s.stats.raidsWon++;
        const bounty = Math.round((r ? r.power : 50) * 5);
        const got = Economy.grant(s, { gold: bounty, steel: Math.round(bounty / 10) });
        for (const [k, v] of Object.entries(got)) if (v >= 1) rep.parts.push(`${fmtInt(v)} ${RESOURCES[k].name}`);
        if (r && r.power > 800 && Math.random() < 0.5) { s.resources.relics++; s.stats.relicsFound++; rep.parts.push("1 Relic"); }
        const it = Armory.drop(s, s.buildings.townhall, opts_led(ctx) ? 0.35 : 0.15);
        if (it) rep.parts.push(`🎁 ${GEAR_RARITY[it.rarity].name} ${it.name}`);
        addLog(s, `The ${f} has been driven off! Bounty: ${rep.parts.join(", ")}. Soldiers lost: ${lost}, enemies slain: ${slain}.`, "good");
        this.addXp(s, Math.round((r ? r.power : 50) / 4));
        if (r && r.rival) Rivals.afterRaid(s, r.rival, true);
      } else {
        s.stats.raidsLost++;
        const frac = (r && r.rival ? 0.35 : 0.25) * (1 - Math.min(0.5, s.buildings.walls * 0.04));
        const took = {};
        for (const res of STORABLE) {
          const take = Math.floor(s.resources[res] * frac);
          s.resources[res] -= take; took[res] = take;
          if (take > 0) rep.parts.push(`${fmt(take)} ${RESOURCES[res].name}`);
        }
        if (r && r.rival) { Rivals.afterRaid(s, r.rival, false, took); rep.parts.push(`carried off to ${RIVAL_LORDS[r.rival].name}`); }
        const dead = Math.ceil(s.population.citizens * 0.08);
        for (let i = 0; i < dead; i++) Economy.removeCitizen(s);
        s.morale = Math.max(0, s.morale - 25);
        rep.parts.push(`${dead} citizens killed`);
        addLog(s, `The ${f} broke through and plundered the city: ${rep.parts.join(", ")}. Soldiers lost: ${lost}.`, "bad");
      }
      s.raid = null;
      s.nextRaidAt = s.time + randInt(600, 1080);
      return rep;
    }

    // expedition or assault
    const m = this.mission(s, ctx.mission);
    if (win) {
      s.stats.won++;
      s.stats.missionWins[ctx.mission] = (s.stats.missionWins[ctx.mission] || 0) + 1;
      if (CAMPAIGN[ctx.mission] && !s.campaign.done[ctx.mission]) {
        s.campaign.done[ctx.mission] = true;
        for (const id of CAMPAIGN_ORDER.slice(0, CAMPAIGN_ORDER.indexOf(ctx.mission))) s.campaign.done[id] = true;
        rep.parts.push(`Quest "${CAMPAIGN[ctx.mission].title}" complete: turn it in!`);
        addLog(s, `📖 Quest objective complete: ${CAMPAIGN[ctx.mission].objective}. Return to ${CAMPAIGN[ctx.mission].giver} to turn it in.`, "war");
      }
      if (CAMPAIGN[ctx.mission] && ctx.led) s.campaign.led[ctx.mission] = true;
      const lm = (1 + 0.05 * (s.commander.level - 1)) * (ctx.kind === "assault" ? BALANCE.manualLootBonus : 1) * (1 + Armory.b(s, "loot") / 100);
      const bundle = {};
      for (const [r, [lo, hi]] of Object.entries(m.loot)) bundle[r] = randInt(lo, hi);
      const got = Economy.grant(s, bundle, lm);
      for (const [r, v] of Object.entries(got)) if (v >= 1) rep.parts.push(`${fmtInt(v)} ${RESOURCES[r].name}`);
      const wasted = Object.entries(bundle).some(([r, v]) => got[r] + 0.5 < v * lm);
      if (m.relic && Math.random() < m.relic.chance) {
        const n = randInt(m.relic.n[0], m.relic.n[1]);
        s.resources.relics += n; s.stats.relicsFound += n;
        rep.parts.push(`${n} Relic${n > 1 ? "s" : ""}`);
      }
      if (m.endless && ctx.stage === s.conquest) { s.conquest++; rep.parts.push(`Conquest stage ${s.conquest} unlocked`); }
      if (m.node && m.rival) {
        const res = Rivals.defeated(s, m.rival);
        rep.parts.push(res === "vassal" ? `${RIVAL_LORDS[m.rival].name} is now your vassal!` : `${RIVAL_LORDS[m.rival].name} sacked (${s.rivals[m.rival].defeats}/3)`);
        const n = World.node(s, m.node); if (n) { n.garrison = null; n.clearedUntil = s.time + 900; }
      } else if (m.node) {
        s.stats.sitesRaided++;
        const res = World.onWin(s, World.node(s, m.node));
        if (res === "captured") { s.stats.sitesCaptured++; rep.parts.push("Territory captured"); }
      }
      addLog(s, `Victory at ${m.name}! Loot: ${rep.parts.join(", ") || "nothing"}. Soldiers lost: ${lost}, enemies slain: ${slain}.${wasted ? " Some loot was lost to full storage." : ""}`, "good");
    } else {
      s.stats.lost++;
      addLog(s, `Defeat at ${m.name}. ${lost} soldiers fell${b.result && b.result.reason === "retreat" ? " before the retreat" : ""}. The survivors return home.`, "bad");
    }
    this.addXp(s, Math.round(m.xp * (win ? 1 : 0.3) * (1 + Armory.b(s, "xp") / 100)));
    if (win) {
      // gear drops: better targets drop better gear; leading in person improves the odds
      const ilvl = m.node ? (World.node(s, m.node) || { level: 1 }).level : m.endless ? 5 + Math.floor(s.conquest / 2) : m.level;
      const first = CAMPAIGN[ctx.mission] && (s.stats.missionWins[ctx.mission] || 0) === 1;
      const it = Armory.drop(s, ilvl, first ? 1 : (ctx.led ? 0.45 : 0.25) + (b.generalFell ? 0.2 : 0), first && m.level >= 8 ? "epic" : first ? "rare" : null);
      if (it) rep.parts.push(`🎁 ${GEAR_RARITY[it.rarity].name} ${it.name}`);
    }
    return rep;
  },
  addXp(s, xp) {
    const c = s.commander;
    c.xp += xp;
    while (c.xp >= this.xpForLevel(c.level)) {
      c.xp -= this.xpForLevel(c.level);
      c.level++;
      const t = Object.values(TACTICS).find((x) => x.lvl === c.level);
      addLog(s, `Your Lord Commander reached level ${c.level}!${t ? ` New tactic unlocked: ${t.name}.` : ""}`, "war");
    }
  },

  desertOne(s) {
    // the weakest unit at home deserts first
    const order = Object.keys(UNITS).sort((a, b) => unitPower(UNITS[a]) - unitPower(UNITS[b]));
    for (const u of order) if (s.army[u] > 0) { s.army[u]--; return UNITS[u].name; }
    return null;
  },

  step(s, dt, shortage) {
    // ---- training queue (overflow time carries over to the next unit)
    let t = dt * this.trainSpeed(s);
    while (s.queue.length && t > 0) {
      const q = s.queue[0];
      q.remaining -= t;
      if (q.remaining <= 0) {
        t = -q.remaining;
        s.queue.shift();
        s.army[q.unit] = (s.army[q.unit] || 0) + 1;
        s.stats.trained++;
        if (!s.queue.length) addLog(s, `Training complete: the last ${UNITS[q.unit].name} has joined the army.`, "war");
      } else t = 0;
    }

    // ---- upkeep penalties: morale and desertion
    const hungry = shortage.food || shortage.gold;
    if (hungry && this.soldierCount(s) > 0) {
      s.morale = clamp(s.morale - 2 * dt, 0, 100);
      s.desert += dt;
      while (s.desert >= BALANCE.desertInterval) {
        s.desert -= BALANCE.desertInterval;
        const who = this.desertOne(s);
        if (!who) { s.desert = 0; break; }
        s.stats.deserted++;
        addLog(s, `Unpaid and hungry, a ${who} deserted the army.`, "bad");
      }
    } else {
      s.desert = 0;
      s.morale = clamp(s.morale + (0.5 + 0.2 * s.buildings.temple) * (s.resources.ale >= 1 ? 1.5 : 1) * dt, 0, 100);
    }

    // ---- expeditions return automatically
    for (const e of s.expeditions.slice()) {
      if (s.time >= e.endAt) {
        s.expeditions.splice(s.expeditions.indexOf(e), 1);
        this.resolveExpedition(s, e);
      }
    }

    // ---- raids on the city
    const r = s.raid;
    if (!r) {
      const eligible = s.buildings.barracks > 0 || s.time > BALANCE.firstRaidAt * 2;
      if (eligible && s.time >= s.nextRaidAt) this.spawnRaid(s);
    } else if (r.phase === "approaching" && s.time >= r.arriveAt) {
      r.phase = "gates";
      r.deadline = s.time + BALANCE.raidDecision;
      addLog(s, `⚔ The ${FACTIONS[r.faction].name} is at the gates! Lead the defense yourself, or your captains will fight in ${fmtTime(BALANCE.raidDecision)}.`, "bad");
    } else if (r.phase === "gates" && s.time >= r.deadline) {
      this.autoDefend(s);
    }
  },
};
