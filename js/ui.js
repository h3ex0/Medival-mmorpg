"use strict";
/* =====================================================================
   7. UI MODULE (DOM building, per-tick updates, events)
   ===================================================================== */
const UI = {
  refs: { res: {}, buildings: {}, jobs: {}, units: {}, missions: {} },
  renderedLogId: 0,
  expSig: "",
  queueSig: "",
  raidSig: "",
  doctrineSig: "",
  lastRes: {},
  raidPrompted: 0,

  costHtml(cost, s) {
    return Object.entries(cost).map(([r, v]) =>
      `<span class="cost ${s && s.resources[r] < v ? "lack" : ""}"><img data-asset="${RESOURCES[r].asset}" alt="">${fmt(v)}</span>`).join("");
  },
  armyChips(units) {
    return Object.entries(units).filter(([, n]) => n > 0).map(([t, n]) =>
      `<span class="chip"><img data-asset="${udef(t).asset}" alt="">${n} ${esc(udef(t).name)}</span>`).join("");
  },
  statLine(d) {
    return `<span title="Hit points per soldier">❤${d.hp}</span><span title="Attack">⚔${d.atk}</span><span title="Defense">🛡${d.def}</span><span title="Range">🎯${d.rng}</span><span title="Movement">👣${d.mv}</span>`;
  },

  build() {
    const s = GameState.current;
    // ---- header resources
    const strip = $("#resStrip");
    strip.innerHTML = Object.entries(RESOURCES).map(([id, r]) => `
      <div class="res-chip" id="res-${id}" style="--c:${r.color}" title="${r.name}">
        <img data-asset="${r.asset}" alt="${r.name}">
        <div class="rv"><span class="v">0</span> <span class="cap"></span></div>
        <div class="rr dim">${id === "relics" ? "" : "+0/s"}</div>
        <div class="fill"></div>
      </div>`).join("") + `
      <div class="res-chip pop-chip" id="res-pop" style="--c:var(--teal)" title="Population">
        <img data-asset="pop" alt="Population">
        <div class="rv"><span class="v">0</span> <span class="cap"></span></div>
        <div class="pop-grid">
          <span>Wkr <b data-p="workers">0</b></span><span>Idle <b data-p="idle">0</b></span>
          <span>Rec <b data-p="recruits">0</b></span><span>Sol <b data-p="soldiers">0</b></span>
        </div>
        <div class="fill"></div>
      </div>`;
    for (const id of [...Object.keys(RESOURCES), "pop"]) {
      const el = $(`#res-${id}`);
      this.refs.res[id] = { el, v: $(".v", el), cap: $(".cap", el), rr: $(".rr", el), fill: $(".fill", el) };
    }

    // ---- buildings
    $("#buildingList").innerHTML = Object.entries(BUILDINGS).map(([id, b]) => `
      <div class="card" id="bld-${id}">
        <img class="thumb" data-asset="${b.asset}" alt="${b.name}">
        <div>
          <div class="title"><h3>${b.name}</h3><span class="badge" data-r="lvl">Lv 0</span></div>
          <div class="desc">${b.desc}</div>
          <div class="effect" data-r="effect"></div>
        </div>
        <div class="foot"><div class="costs" data-r="cost"></div>
          <button class="btn primary sm" data-action="build" data-id="${id}" data-r="btn">Build</button></div>
        <div class="req" data-r="req"></div>
      </div>`).join("");
    for (const id of Object.keys(BUILDINGS)) {
      const el = $(`#bld-${id}`);
      this.refs.buildings[id] = Object.fromEntries($$("[data-r]", el).map((n) => [n.dataset.r, n]));
    }

    // ---- jobs
    $("#jobList").innerHTML = Object.entries(JOBS).map(([id, j]) => `
      <div class="job-row" id="job-${id}">
        <img data-asset="${j.asset}" alt="${j.name}">
        <div><div class="jn">${j.name}</div><div class="jd">${j.desc}</div>
          <div class="slotbar"><i data-r="bar"></i></div></div>
        <div class="ctrl">
          <button class="btn sm" data-action="assign" data-id="${id}" data-d="-max" title="Unassign all">«</button>
          <button class="btn sm" data-action="assign" data-id="${id}" data-d="-1" title="−1 (Shift: −10)">−</button>
          <span class="job-count" data-r="count">0/0</span>
          <button class="btn sm" data-action="assign" data-id="${id}" data-d="1" title="+1 (Shift: +10)">+</button>
          <button class="btn sm" data-action="assign" data-id="${id}" data-d="max" title="Fill all slots">»</button>
        </div>
      </div>`).join("");
    for (const id of Object.keys(JOBS)) {
      const el = $(`#job-${id}`);
      this.refs.jobs[id] = Object.fromEntries($$("[data-r]", el).map((n) => [n.dataset.r, n]));
    }

    // ---- units
    $("#unitList").innerHTML = Object.entries(UNITS).map(([id, u]) => `
      <div class="card" id="unit-${id}">
        <img class="thumb" data-asset="${u.asset}" alt="${u.name}">
        <div>
          <div class="title"><h3>${u.name}</h3><span class="badge war" data-r="count">0</span></div>
          <div class="desc">${u.desc}</div>
          <div class="ustats">${this.statLine(u)}<span title="Power">💪${fmt(unitPower(u))}</span></div>
          <div class="dim" style="font-size:11.5px">${u.time}s · upkeep ${u.upkeep.food} food, ${u.upkeep.gold} gold /s</div>
        </div>
        <div class="foot"><div class="costs" data-r="cost"></div>
          <div class="btn-row">
            <button class="btn sm" data-action="train" data-id="${id}" data-n="1" data-r="b1">Train</button>
            <button class="btn sm" data-action="train" data-id="${id}" data-n="5" data-r="b5">×5</button>
            <button class="btn sm" data-action="train" data-id="${id}" data-n="10" data-r="b10">×10</button>
            <button class="btn sm" data-action="train" data-id="${id}" data-n="max" data-r="bmax" title="Train as many as you can">Max</button>
          </div></div>
        <div class="req" data-r="req"></div>
      </div>`).join("");
    for (const id of Object.keys(UNITS)) {
      const el = $(`#unit-${id}`);
      this.refs.units[id] = { el, ...Object.fromEntries($$("[data-r]", el).map((n) => [n.dataset.r, n])) };
    }

    // ---- research
    $("#techList").innerHTML = Object.entries(TECHS).map(([id, t]) => `
      <div class="card tech" id="tech-${id}">
        <div class="tech-icon">${t.icon}</div>
        <div>
          <div class="title"><h3>${t.name}</h3><span class="badge" data-r="lvl">0/${t.max}</span></div>
          <div class="desc">${t.desc}</div>
          <div class="dim" style="font-size:11.5px" data-r="time"></div>
        </div>
        <div class="foot"><div class="costs" data-r="cost"></div>
          <button class="btn primary sm" data-action="research" data-id="${id}" data-r="btn">Research</button></div>
        <div class="req" data-r="req"></div>
      </div>`).join("");
    this.refs.techs = {};
    for (const id of Object.keys(TECHS)) {
      const el = $(`#tech-${id}`);
      this.refs.techs[id] = { el, ...Object.fromEntries($$("[data-r]", el).map((n) => [n.dataset.r, n])) };
    }
    this.questSig = this.eventSig = this.researchSig = "";

    // ---- missions
    this.buildMissions();

    // ---- forge config fields
    const cfg = AssetPipeline.config();
    $("#apiKey").value = cfg.key;
    $("#apiModel").value = cfg.model;
    $("#apiBase").value = cfg.base;
    for (const id of ["apiKey", "apiModel", "apiBase"]) $("#" + id).onchange = () => this.saveForgeConfig();

    $("#log").innerHTML = "";
    HUD.build();
    this.syncSoundUI();
    this.renderedLogId = 0;
    this.expSig = this.queueSig = this.raidSig = this.doctrineSig = "";
    AssetPipeline.applyAll();
    this.update();
  },

  buildMissions() {
    const s = GameState.current;
    this.missionStage = s.conquest;
    $("#missionList").innerHTML = Object.keys(MISSIONS).map((id) => {
      const m = Military.mission(s, id);
      const pw = armyPower(m.army);
      return `
      <div class="mission" id="mis-${id}">
        <img class="art" data-asset="${m.asset}" alt="">
        <div class="shade"></div>
        <div class="inner">
          <div class="mh"><h3>${esc(m.name)} ${m.fortified ? '<span class="tag">Fortified</span>' : ""} ${m.endless ? '<span class="tag gold">Endless</span>' : ""}</h3>
            <button class="btn teal sm" data-action="openDeploy" data-id="${id}" data-r="btn">Deploy</button></div>
          <div class="meta"><span>Enemy power <b>⚔ ${fmt(pw)}</b></span><span>Terrain <b>${MAP_TYPES[m.map]}</b></span><span>Duration <b>${fmtTime(m.duration)}</b></span>
            <span>XP <b>${m.xp}</b></span><span>Requires <b>Cmdr Lv ${m.level}</b></span></div>
          <div class="chips">${this.armyChips(m.army)}</div>
          <div class="meta">Loot: ${Object.entries(m.loot).map(([r, [lo, hi]]) => `<span class="cost"><img data-asset="${RESOURCES[r].asset}" alt="">${lo === hi ? fmt(lo) : fmt(lo) + "–" + fmt(hi)}</span>`).join("")}
            ${m.relic ? `<span class="cost"><img data-asset="res_relics" alt="">${Math.round(m.relic.chance * 100)}% for ${m.relic.n[0]}${m.relic.n[1] > m.relic.n[0] ? "–" + m.relic.n[1] : ""}</span>` : ""}</div>
          <div class="req" data-r="req"></div>
        </div>
      </div>`;
    }).join("");
    for (const id of Object.keys(MISSIONS)) {
      const el = $(`#mis-${id}`);
      this.refs.missions[id] = { el, ...Object.fromEntries($$("[data-r]", el).map((n) => [n.dataset.r, n])) };
    }
    AssetPipeline.applyAll($("#missionList"));
  },

  saveForgeConfig() {
    AssetPipeline.saveConfig({ key: $("#apiKey").value.trim(), model: $("#apiModel").value, base: $("#apiBase").value.trim() || AssetPipeline.DEFAULT_BASE });
  },

  update() {
    const s = GameState.current;
    const rates = Economy.rates(s);
    const caps = Economy.caps(s);

    // ---- header
    for (const id of Object.keys(RESOURCES)) {
      const r = this.refs.res[id], v = s.resources[id];
      r.v.textContent = id === "relics" ? fmtInt(v) : fmt(v);
      if (id === "relics") {
        r.cap.textContent = "";
        r.rr.textContent = `+${Math.round((Economy.relicMultiplier(s) - 1) * 100)}% output`;
        r.rr.className = "rr muted";
        r.fill.style.width = "0";
      } else {
        r.cap.textContent = "/ " + fmt(caps[id]);
        const net = rates.net[id];
        r.rr.textContent = `${fmtRate(net)}/s`;
        r.rr.className = "rr " + (net > 0.004 ? "good" : net < -0.004 ? "bad" : "dim");
        r.fill.style.width = clamp((v / caps[id]) * 100, 0, 100) + "%";
        r.el.classList.toggle("full", v >= caps[id] - 0.01);
        r.el.title = `${RESOURCES[id].name}: +${rates.prod[id].toFixed(2)}/s produced, −${rates.cons[id].toFixed(2)}/s consumed`;
      }
      if (this.lastRes[id] !== undefined && Math.floor(v) > Math.floor(this.lastRes[id]) + 50) { r.el.classList.remove("bump"); void r.el.offsetWidth; r.el.classList.add("bump"); }
      this.lastRes[id] = v;
    }
    const pop = this.refs.res.pop, total = Economy.totalPop(s), housing = Economy.housing(s);
    pop.v.textContent = fmtInt(total);
    pop.cap.textContent = "/ " + fmtInt(housing) + " housed";
    pop.fill.style.width = clamp((total / Math.max(1, housing)) * 100, 0, 100) + "%";
    const pg = (k) => $(`[data-p="${k}"]`, pop.el);
    pg("workers").textContent = Economy.employed(s);
    pg("idle").textContent = Economy.unemployed(s);
    pg("recruits").textContent = s.jobs.recruit;
    pg("soldiers").textContent = Military.soldierCount(s);

    // ---- buildings
    for (const [id] of Object.entries(BUILDINGS)) {
      const r = this.refs.buildings[id], lvl = s.buildings[id];
      r.lvl.textContent = `Lv ${lvl} / ${Economy.buildingMax(s, id)}`;
      r.effect.textContent = this.buildingEffect(s, id);
      const cost = Economy.buildingCost(id, lvl);
      const maxed = lvl >= Economy.buildingMax(s, id);
      r.cost.innerHTML = maxed ? '<span class="dim">—</span>' : this.costHtml(cost, s);
      const blk = Economy.buildBlocker(s, id);
      r.btn.disabled = !!blk;
      r.btn.textContent = maxed ? "Maxed" : lvl === 0 ? "Build" : "Upgrade";
      r.req.textContent = blk && blk !== "Not enough resources" ? blk : "";
    }

    // ---- workforce
    const growth = Economy.growthPerSecond(s);
    $("#popSummary").innerHTML = `
      <span>Citizens</span><b>${fmtInt(s.population.citizens)}</b>
      <span>Unemployed</span><b class="${Economy.unemployed(s) ? "warn" : ""}">${fmtInt(Economy.unemployed(s))}</b>
      <span>Housing</span><b>${fmtInt(total)} / ${fmtInt(housing)}</b>
      <span>Growth</span><b class="${growth > 0 ? "good" : "dim"}">${growth > 0 ? "1 citizen / " + fmtTime(1 / growth) : total >= housing ? "Housing full" : s.population.starve > 0 ? "Starving!" : "Stalled"}</b>
      <span>Food upkeep</span><b>${(s.population.citizens * BALANCE.foodPerCitizen * (1 - 0.05 * Research.lvl(s, "medicine"))).toFixed(1)}/s</b>
      <span>Production bonus</span><b class="good">+${Math.round((Economy.multiplier(s) - 1) * 100)}%</b>`;
    for (const [id] of Object.entries(JOBS)) {
      const r = this.refs.jobs[id], slots = Economy.jobSlots(s, id), n = s.jobs[id];
      r.count.textContent = `${n}/${slots}`;
      r.bar.style.width = slots ? (n / slots) * 100 + "%" : "0";
    }

    // ---- military: commander
    const soldiers = Military.soldierCount(s);
    $("#armyBadge").textContent = `⚔ ${fmt(Military.power(s, Military.allUnits(s)))}`;
    $("#armyBadge").title = `${fmtInt(soldiers)} soldiers`;
    const c = s.commander, need = Military.xpForLevel(c.level);
    $("#cmdLevel").textContent = c.level;
    $("#cmdXp").textContent = `XP ${fmtInt(c.xp)} / ${fmtInt(need)}`;
    $("#cmdXpBar").style.width = (c.xp / need) * 100 + "%";
    $("#moraleTxt").textContent = `Morale ${Math.round(s.morale)}% · ×${Military.battleBonus(s).toFixed(2)}`;
    const mb = $("#moraleBar"); mb.style.width = s.morale + "%"; mb.parentElement.classList.toggle("low", s.morale < 50);

    this.updateRaid(s);
    this.updateDoctrine(s);
    this.updateResearch(s);
    this.updateAffairs(s);
    HUD.update(s);

    // ---- units
    for (const [id, u] of Object.entries(UNITS)) {
      const r = this.refs.units[id];
      const vr = Military.vetRank(s.veterancy[id]);
      r.count.textContent = `${vr ? "★".repeat(vr) + " " : ""}${s.army[id] || 0} home`;
      r.count.title = vr ? `Veteran rank ${vr}: +${vr * 6}% attack and defense` : "Earn veteran ranks by killing enemies in battle";
      r.cost.innerHTML = this.costHtml(u.cost, s);
      const blk = Military.trainBlocker(s, id);
      r.b1.disabled = r.b5.disabled = r.b10.disabled = r.bmax.disabled = !!blk;
      r.req.textContent = blk && blk !== "Not enough resources" ? blk : "";
      r.el.classList.toggle("locked-card", Object.entries(u.req).some(([b, l]) => s.buildings[b] < l));
    }

    const qSig = s.queue.length + ":" + s.queue.map((q) => q.unit).join(",");
    if (qSig !== this.queueSig) {
      this.queueSig = qSig;
      const box = $("#queueBox");
      if (!s.queue.length) box.innerHTML = `<span class="dim">Training queue is empty.${s.buildings.barracks ? " Assign Recruits, then train units." : " Build a Barracks to train soldiers."}</span>`;
      else {
        const counts = {};
        for (const q of s.queue) counts[q.unit] = (counts[q.unit] || 0) + 1;
        box.innerHTML = `<div class="stat-row"><span>Training <b style="color:var(--text)">${UNITS[s.queue[0].unit].name}</b></span><b data-q="t"></b></div>
          <div class="bar war"><i data-q="bar"></i></div>
          <div class="queue-items">${Object.entries(counts).map(([u, n]) => `<span class="qitem"><img data-asset="${UNITS[u].asset}" alt="">${UNITS[u].name} ×${n}</span>`).join("")}
          <span class="qitem" style="padding-left:6px">${s.queue.length}/${BALANCE.maxQueue}</span></div>`;
        AssetPipeline.applyAll(box);
      }
    }
    if (s.queue.length) {
      const q = s.queue[0];
      $('[data-q="t"]').textContent = fmtTime(q.remaining / Military.trainSpeed(s));
      $('[data-q="bar"]').style.width = (1 - q.remaining / q.total) * 100 + "%";
    }

    const allU = Military.allUnits(s);
    const homePower = Military.power(s, s.army);
    $("#armySummary").innerHTML = Object.entries(UNITS).filter(([id]) => (allU[id] || 0) > 0).map(([id, u]) => `<span>${u.name}</span><b>${s.army[id] || 0} <span class="dim">/ ${allU[id] || 0}</span></b>`).join("") +
      `<span>Home power</span><b class="good">⚔ ${fmt(homePower)}</b><span>Upkeep</span><b class="${rates.upkeep.food + rates.upkeep.gold > 0 ? "warn" : "dim"}">${rates.upkeep.food.toFixed(1)} food · ${rates.upkeep.gold.toFixed(1)} gold /s</b>`;

    const slots = Military.expeditionSlots(s);
    $("#expSlots").textContent = `(${s.expeditions.length}/${slots})`;
    const eSig = s.expeditions.map((e) => e.id).join(",");
    if (eSig !== this.expSig) {
      this.expSig = eSig;
      $("#activeExp").innerHTML = s.expeditions.length ? s.expeditions.map((e) => {
        const m = Military.mission(s, e.mission);
        const units = Object.entries(e.units).map(([u, n]) => `${n} ${UNITS[u].name}`).join(", ");
        return `<div class="exp-active" id="exp-${e.id}">
          <div class="eh"><b>${esc(m.name)}</b><span><span class="muted" data-e="t"></span> <button class="btn sm" data-action="recall" data-id="${e.id}" title="Recall (no loot)">Recall</button></span></div>
          <div class="bar war"><i data-e="bar"></i></div>
          <div class="eu">${units} · ⚔ ${fmt(Military.power(s, e.units))} vs ${fmt(armyPower(m.army))} · ${TACTICS[e.tactic || "balanced"].icon} ${TACTICS[e.tactic || "balanced"].name}</div></div>`;
      }).join("") : `<div class="empty">No armies in the field.</div>`;
    }
    for (const e of s.expeditions) {
      const el = $(`#exp-${e.id}`);
      if (!el) continue;
      $('[data-e="t"]', el).textContent = fmtTime(e.endAt - s.time) + " left";
      $('[data-e="bar"]', el).style.width = clamp(((s.time - e.startAt) / (e.endAt - e.startAt)) * 100, 0, 100) + "%";
    }

    if (this.missionStage !== s.conquest) this.buildMissions();
    for (const [id, m] of Object.entries(MISSIONS)) {
      const r = this.refs.missions[id];
      r.el.classList.toggle("locked", c.level < m.level);
      const blkAuto = Military.deployBlocker(s, id, null, false);
      const blkManual = Military.deployBlocker(s, id, null, true);
      r.btn.disabled = !!(blkAuto && blkManual);
      r.req.textContent = blkAuto && blkManual ? blkAuto : blkAuto ? `${blkAuto}, but you can still lead an assault in person` : "";
    }

    // ---- log (append only new entries)
    const logEl = $("#log");
    const fresh = s.log.filter((l) => l.id > this.renderedLogId);
    for (const l of fresh) {
      const d = new Date(l.t);
      const div = document.createElement("div");
      div.className = "log-entry " + l.type;
      div.innerHTML = `<time>${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}</time>${esc(l.msg)}`;
      logEl.prepend(div);
      this.renderedLogId = l.id;
    }
    while (logEl.children.length > 120) logEl.lastChild.remove();

    // ---- stats
    const st = s.stats;
    $("#statsBox").innerHTML = `
      <span class="muted">Time played</span><b>${fmtTime(st.playSeconds)}</b>
      <span class="muted">Gold earned</span><b>${fmt(st.goldEarned)}</b>
      <span class="muted">Buildings raised</span><b>${fmtInt(st.built)}</b>
      <span class="muted">Soldiers trained</span><b>${fmtInt(st.trained)}</b>
      <span class="muted">Expeditions won / lost</span><b>${st.won} / ${st.lost}</b>
      <span class="muted">Raids repelled / lost</span><b>${st.raidsWon} / ${st.raidsLost}</b>
      <span class="muted">Battles led in person</span><b>${st.battlesLed}</b>
      <span class="muted">Enemies slain</span><b>${fmtInt(st.enemiesSlain)}</b>
      <span class="muted">Fallen · deserted · starved</span><b>${st.fallen} · ${st.deserted} · ${st.starved}</b>
      <span class="muted">Conquest stage</span><b>${s.conquest}</b>
      <span class="muted">Battles led & won</span><b>${st.battlesLedWon}</b>
      <span class="muted">Research levels</span><b>${Research.total(s)}</b>
      <span class="muted">Sites raided · territories</span><b>${st.sitesRaided} · ${World.territories(s).length}</b>
      <span class="muted">Peak population</span><b>${fmtInt(st.peakPop)}</b>`;

    AssetPipeline.applyAll($("#buildingList"));
    AssetPipeline.applyAll($("#unitList"));
    AssetPipeline.applyAll($("#techList"));
  },

  updateRaid(s) {
    const box = $("#raidBox");
    const r = s.raid;
    const sig = (r ? `${r.id}:${r.phase}` : "none") + (s.battle ? ":battle" + (BattleUI.b ? "open" : "") : "");
    if (sig !== this.raidSig) {
      this.raidSig = sig;
      let h = "";
      if (s.battle && !BattleUI.b) {
        h += `<div class="alert war"><div><b>⚔ Battle in progress:</b> ${esc(s.battle.title)}<div class="dim" style="font-size:12px">Your soldiers are waiting for orders on the battlefield.</div></div>
          <button class="btn primary" data-action="resumeBattle">Resume battle</button></div>`;
      }
      if (r) {
        const f = FACTIONS[r.faction];
        const tgt = r.target && World.node(s, r.target);
        const where = tgt ? `your ${NODE_TYPES[tgt.type].name} (Lv ${tgt.level})` : "the city";
        h += `<div class="alert ${r.phase === "approaching" ? "warnbox" : "bad"}">
          <div style="flex:1;min-width:200px"><b>${r.phase === "approaching" ? `⚠ Raid on ${where}` : r.phase === "gates" ? `🔥 Raiders at ${where}!` : `⚔ Defending ${where}`}:</b> ${esc(f.name)} · power ⚔ ${fmt(r.power)} · ${MAP_TYPES[r.mapType]}
            <div class="chips">${this.armyChips(r.army)}</div>
            <div class="dim" style="font-size:12px" data-raid="t"></div></div>
          ${r.phase !== "fighting" ? `<div class="btn-row"><button class="btn primary" data-action="leadDefense" ${s.battle ? "disabled" : ""}>⚔ Lead the defense</button>
            ${r.phase === "gates" ? `<button class="btn" data-action="autoDefend">Let captains fight</button>` : ""}
            <button class="btn sm" data-action="raidOdds">Odds?</button></div>` : ""}</div>`;
      }
      box.innerHTML = h;
      AssetPipeline.applyAll(box);
    }
    if (r) {
      const t = $('[data-raid="t"]', box);
      const tn = r.target && World.node(s, r.target);
      const def = tn ? `Defenders: your home army + ${4 + (tn.fort || 0) * 6} militia guards${tn.fort ? ` behind level ${tn.fort * 2} palisades` : " (fortify it on the World Map)"}. Lose and the territory falls.`
        : `Defenders: your home army + ${s.buildings.townhall * 4} Town Guards${s.buildings.walls ? ` behind level ${s.buildings.walls} walls` : " (no walls yet)"}.`;
      if (t) t.textContent = r.phase === "approaching" ? `Arrives in ${fmtTime(r.arriveAt - s.time)}. ${def}` : r.phase === "gates" ? `Your captains fight on their own in ${fmtTime(r.deadline - s.time)}. ${def}` : "The battle is under way.";
      if (r.phase === "gates" && this.raidPrompted !== r.id && !BattleUI.b && !$("#modalRoot .modal")) {
        this.raidPrompted = r.id;
        this.modal("🔥 Raiders at the gates!", `<p>The <b>${esc(FACTIONS[r.faction].name)}</b> (power ⚔ ${fmt(r.power)}) has reached Ironhold.</p>
          <div class="chips" style="margin-bottom:10px">${this.armyChips(r.army)}</div>
          <p class="muted">Take command on the ${MAP_TYPES[r.mapType]} battlefield and use the terrain to win, or let your captains fight it out with your current doctrine (<b>${TACTICS[s.doctrine].name}</b>). If you lose, the raiders plunder your stores and kill some citizens.</p>`,
          `<button class="btn" data-action="autoDefend">Let captains fight</button><button class="btn primary" data-action="leadDefense">⚔ Lead the defense</button>`);
      }
    }
  },

  updateResearch(s) {
    const c = s.research.current;
    const sig = (c ? c.id : "none") + ":" + (s.buildings.academy > 0);
    if (sig !== this.researchSig) {
      this.researchSig = sig;
      $("#researchNow").innerHTML = s.buildings.academy < 1
        ? `<div class="summary-box" style="display:block">📚 Build an <b>Academy</b> (needs 25 population) to unlock Research: permanent upgrades to your economy and army.</div>`
        : c ? `<div class="queue"><div class="stat-row"><span>Researching <b style="color:var(--text)">${TECHS[c.id].icon} ${TECHS[c.id].name} → level ${Research.lvl(s, c.id) + 1}</b></span><b data-rs="t"></b></div>
            <div class="bar teal"><i data-rs="bar"></i></div><div style="margin-top:6px"><button class="btn sm danger" data-action="cancelResearch">Cancel (50% refund)</button></div></div>`
          : `<div class="summary-box" style="display:block">🎓 Your scholars are idle. Pick a project below. ${Research.total(s)} research levels done so far.</div>`;
    }
    if (c) {
      const fast = Events.active(s, "inspiration");
      const t = $('[data-rs="t"]');
      if (t) t.textContent = fmtTime(c.remaining / (fast ? 2 : 1)) + (fast ? " 💡×2" : "");
      const bar = $('[data-rs="bar"]');
      if (bar) bar.style.width = (1 - c.remaining / c.total) * 100 + "%";
    }
    for (const [id, t] of Object.entries(TECHS)) {
      const r = this.refs.techs[id], lvl = Research.lvl(s, id);
      r.lvl.textContent = `${lvl}/${t.max}`;
      const maxed = lvl >= t.max;
      r.cost.innerHTML = maxed ? '<span class="dim">—</span>' : this.costHtml(Research.cost(id, lvl), s);
      r.time.textContent = maxed ? "Fully researched" : `Takes ${fmtTime(Research.time(s, id, lvl))} · Academy tier ${t.tier}`;
      const blk = Research.blocker(s, id);
      r.btn.disabled = !!blk;
      r.btn.textContent = maxed ? "Done" : c && c.id === id ? "In progress" : "Research";
      r.req.textContent = blk && !["Not enough resources", "Another project is in progress", "Fully researched"].includes(blk) ? blk : "";
      r.el.classList.toggle("locked-card", s.buildings.academy < t.tier);
    }
  },

  updateAffairs(s) {
    const o = s.offer;
    const evSig = s.buffs.map((b) => b.id + b.until).join() + "|" + (o ? o.id + o.expires : "");
    if (evSig !== this.eventSig) {
      this.eventSig = evSig;
      let h = "";
      for (const b of s.buffs) {
        const e = EVENTS[b.id];
        h += `<div class="alert ${e.bad ? "bad" : "good-box"}"><div><b>${e.icon} ${e.name}</b> <span class="dim">${e.desc}</span></div><span class="badge teal" data-buff="${b.id}"></span></div>`;
      }
      if (o) {
        const e = EVENTS[o.id];
        h += `<div class="alert warnbox"><div style="flex:1;min-width:180px"><b>${e.icon} ${e.name}</b><div style="font-size:12.5px">${esc(Events.offerText(s))}</div><div class="dim" style="font-size:11.5px" data-offer="t"></div></div>
          <div class="btn-row"><button class="btn sm primary" data-action="acceptOffer" data-r="offerBtn">Accept</button><button class="btn sm" data-action="declineOffer">Decline</button></div></div>`;
      }
      $("#eventBox").innerHTML = h || `<div class="empty">The realm is quiet. Events happen every 15–25 minutes.</div>`;
    }
    for (const b of s.buffs) { const el = $(`[data-buff="${b.id}"]`); if (el) el.textContent = fmtTime(b.until - s.time); }
    if (o) {
      const t = $('[data-offer="t"]'); if (t) t.textContent = `Leaves in ${fmtTime(o.expires - s.time)}`;
      const btn = $('[data-r="offerBtn"]'); if (btn) btn.disabled = !Economy.canAfford(s, o.cost);
    }

    // temple blessings
    const tSig = s.buildings.temple + ":" + Math.floor(s.resources.faith / 10) + ":" + s.buffs.map((b) => b.id).join();
    if (tSig !== this.templeSig) {
      this.templeSig = tSig;
      $("#templeBox").innerHTML = s.buildings.temple < 1 ? "" : `<div class="section-title">Temple Blessings <span class="dim" style="text-transform:none;letter-spacing:0">(${fmt(s.resources.faith)} Faith)</span></div>
        <div class="btn-row" style="margin-bottom:6px">${Object.entries(BLESSINGS).map(([k, bl]) => { const blk = Temple.blocker(s, k); return `<button class="btn sm" data-action="bless" data-id="${k}" ${blk ? "disabled" : ""} title="${esc(EVENTS[bl.buff].desc)} (${bl.cost} Faith, 10 min)${blk ? " · " + esc(blk) : ""}">${bl.icon} ${bl.cost}</button>`; }).join("")}</div>`;
    }
    // market trading
    if (s.buildings.market >= 1 && !$("#tradeRes")) {
      $("#marketBox").innerHTML = `<div class="section-title">Market Trading</div>
        <div class="trade"><select id="tradeRes">${Object.keys(TRADE_VALUE).map((r) => `<option value="${r}">${RESOURCES[r].name}</option>`).join("")}</select>
        <span class="dim" id="tradeRates"></span></div>
        <div class="btn-row" style="margin:6px 0 8px"><button class="btn sm" data-action="trade" data-op="sell" data-n="100">Sell 100</button><button class="btn sm" data-action="trade" data-op="sell" data-n="1000">Sell 1K</button><button class="btn sm" data-action="trade" data-op="sell" data-n="half">Sell half</button>
        <button class="btn sm" data-action="trade" data-op="buy" data-n="100">Buy 100</button><button class="btn sm" data-action="trade" data-op="buy" data-n="1000">Buy 1K</button></div>`;
    }
    if ($("#tradeRes")) {
      const r = $("#tradeRes").value;
      $("#tradeRates").textContent = `sell ${Market.sellPrice(s, r).toFixed(2)} · buy ${Market.buyPrice(s, r).toFixed(2)} Gold each · you have ${fmt(s.resources[r])}`;
    }

    // quests
    const open = Quests.open(s, 4);
    const qSig = open.map((q) => q.id + (q.check(s) ? "!" : "")).join();
    if (qSig !== this.questSig) {
      this.questSig = qSig;
      $("#questList").innerHTML = open.length ? open.map((q) => {
        const done = q.check(s);
        return `<div class="quest ${done ? "done" : ""}"><div><div>${done ? "✅" : "▫️"} ${esc(q.text)}</div><div class="dim" style="font-size:11.5px">Reward: ${Quests.rewardText(q.reward)}</div></div>
          ${done ? `<button class="btn sm primary" data-action="claimQuest" data-id="${q.id}">Claim</button>` : ""}</div>`;
      }).join("") : `<div class="empty">Every quest is complete. You are a legend!</div>`;
      const ready = Quests.ready(s);
      $("#questBadge").textContent = `${s.quests.length}/${QUESTS.length}${ready ? ` · ${ready} ready!` : ""}`;
      $("#questBadge").className = "badge" + (ready ? " teal" : "");
    }
  },

  updateDoctrine(s) {
    const sig = s.doctrine + ":" + s.commander.level;
    if (sig === this.doctrineSig) return;
    this.doctrineSig = sig;
    $("#doctrineList").innerHTML = Object.entries(TACTICS).map(([k, t]) => {
      const locked = s.commander.level < t.lvl;
      return `<button class="doctrine ${s.doctrine === k ? "active" : ""}" data-action="doctrine" data-id="${k}" ${locked ? "disabled" : ""} title="${esc(t.desc)}">
        <span class="di">${t.icon}</span><span><b>${t.name}</b><small>${locked ? `Commander Lv ${t.lvl}` : esc(t.desc)}</small></span></button>`;
    }).join("");
  },

  buildingEffect(s, id) {
    const b = s.buildings;
    switch (id) {
      case "townhall": return `+${b.townhall} Gold/s · +${Math.round((Math.pow(BALANCE.prodGrowth, b.townhall - 1) - 1) * 100)}% production · storage ×${Economy.storageMultiplier(s).toFixed(1)}`;
      case "farm": return `${b.farm * 4} Farmer slots`;
      case "quarry": return `${b.quarry * 3} Miner slots`;
      case "steelworks": return `${b.steelworks * 2} Blacksmith slots`;
      case "house": return `${b.house * 5} housing from houses (total ${Economy.housing(s)})`;
      case "warehouse": { const c = Economy.caps(s); return `Storage: ${fmt(c.gold)} Gold · ${fmt(c.stone)} Stone · ${fmt(c.wood)} Wood · ${fmt(c.steel)} Steel`; }
      case "granary": return `Food storage: ${fmt(Economy.caps(s).food)}`;
      case "market": return `+${b.market * 3} Gold/s base · +${b.market * 5}% Gold`;
      case "barracks": return `${b.barracks * 10} Recruit slots · ${Military.expeditionSlots(s)} expedition slot(s) · +${Math.round((Military.trainSpeed(s) - 1) * 100)}% training speed`;
      case "stables": return b.stables >= 3 ? "Light Cavalry & Knights unlocked" : b.stables >= 1 ? "Light Cavalry unlocked (Knights at Lv 3)" : "Unlocks cavalry";
      case "workshop": return b.workshop >= 3 ? "Siege Engineers & Catapults unlocked" : b.workshop >= 1 ? "Siege Engineers unlocked (Catapults at Lv 3)" : "Unlocks siege units";
      case "temple": return `${b.temple >= 3 ? "Priests & Paladins" : b.temple >= 1 ? "Priests (Paladins at Lv 3)" : "Unlocks holy units"} · +${(b.temple * 0.2).toFixed(1)} morale/s`;
      case "lumbercamp": return `${b.lumbercamp * 3} Lumberjack slots`;
      case "ranch": return `${b.ranch * 2} Rancher slots · Horse storage ${fmt(Economy.caps(s).horses)}`;
      case "magetower": return `${b.magetower * 2} Arcanist slots · Crystal storage ${fmt(Economy.caps(s).crystals)}`;
      case "brewery": return `${b.brewery * 2} Brewer slots · Ale storage ${fmt(Economy.caps(s).ale)}${s.resources.ale >= 1 ? " · troops well supplied 🍺" : ""}`;
      case "academy": return b.academy ? `Research ${Math.round(15 * (b.academy - 1))}% faster · techs up to tier ${b.academy}` : "Unlocks Research";
      case "walls": return b.walls ? `Wall HP ${Math.round(120 * (1 + 0.5 * b.walls) * (1 + 0.25 * Research.lvl(s, "fortification")))} · ${Math.max(1, 4 - Math.floor(b.walls / 2))} gap(s) · plunder −${Math.round(Math.min(0.5, b.walls * 0.04) * 100)}%` : "No walls: raiders walk straight in";
    }
    return "";
  },

  updateArtCount() {
    const total = AssetPipeline.catalog.assets.length;
    const have = AssetPipeline.allKeys().filter((k) => AssetPipeline.hasArt(k)).length;
    const el = $("#artCount"); if (el) el.textContent = `${have} / ${total} AI art`;
  },

  markSaved(ok, auto) {
    const el = $("#saveStatus");
    const d = new Date();
    el.textContent = ok ? `${auto ? "Autosaved" : "Saved"} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Save failed!";
    el.className = "save-status " + (ok ? "" : "bad");
  },

  syncSoundUI() {
    for (const el of $$("[data-snd]")) el.value = Math.round(Sound.cfg[el.dataset.snd] * 100);
    const m = $("#sndMute"); if (m) m.textContent = Sound.cfg.muted ? "🔊 Unmute" : "🔇 Mute";
    const a = $("#advToggle"); if (a) a.textContent = `Advisor tips: ${Advisor.muted() ? "off" : "on"}`;
  },
  toast(msg, ms = 3200) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    $("#toasts").appendChild(t);
    setTimeout(() => t.remove(), ms);
  },

  modal(title, bodyHtml, footHtml) {
    $("#modalRoot").innerHTML = `<div class="modal-back" data-action="closeModalBg"><div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><h2>${title}</h2><button class="btn sm" data-action="closeModal" aria-label="Close">✕</button></div>
      <div class="modal-body">${bodyHtml}</div>${footHtml ? `<div class="modal-foot">${footHtml}</div>` : ""}</div></div>`;
    AssetPipeline.applyAll($("#modalRoot"));
  },
  closeModal() { $("#modalRoot").innerHTML = ""; },

  // ---------- deploy modal ----------
  openDeploy(missionId) {
    const s = GameState.current, m = Military.mission(s, missionId);
    const rows = Object.entries(UNITS).filter(([id]) => (s.army[id] || 0) > 0).map(([id, u]) => `
      <div class="deploy-row">
        <img data-asset="${u.asset}" alt=""><div><b>${u.name}</b><div class="dim" style="font-size:12px">${s.army[id]} at home · ${this.statLine(u)}</div></div>
        <div class="dc"><button class="btn sm" data-action="dep" data-id="${id}" data-d="0">0</button>
          <input type="number" min="0" max="${s.army[id]}" value="${s.army[id]}" data-unit="${id}">
          <button class="btn sm" data-action="dep" data-id="${id}" data-d="max">All</button></div>
      </div>`).join("");
    const tactics = Object.entries(TACTICS).filter(([, t]) => t.lvl <= s.commander.level)
      .map(([k, t]) => `<option value="${k}" ${k === s.doctrine ? "selected" : ""}>${t.icon} ${t.name}</option>`).join("");
    this.modal(`Deploy: ${esc(m.name)}`, `
      <img data-asset="${m.asset}" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:10px;border:1px solid var(--border)">
      <div class="meta muted" style="display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;margin-bottom:6px">
        <span>Enemy power <b style="color:var(--text)">⚔ ${fmt(armyPower(m.army))}</b></span><span>Terrain <b style="color:var(--text)">${MAP_TYPES[m.map]}</b></span><span>Duration <b style="color:var(--text)">${fmtTime(m.duration)}</b></span>
        ${m.fortified ? '<span class="tag">Fortified: bring siege units</span>' : ""}</div>
      <div class="chips" style="margin-bottom:8px">${this.armyChips(m.army)}</div>
      ${m.node ? `<div class="costs" style="margin-bottom:8px">Loot: ${Object.entries(m.loot).map(([r, [v]]) => `<span class="cost"><img data-asset="${RESOURCES[r].asset}" alt="">${fmt(v)}</span>`).join("")}${m.relic ? `<span class="cost"><img data-asset="res_relics" alt="">${m.relic.n[0]}</span>` : ""} <span class="dim">· ${m.rival ? "sack their castle (3 defeats makes them your vassal)" : "win to capture it as a territory"}</span></div>` : ""}
      ${rows || '<div class="empty">No troops at home.</div>'}
      <label class="field" style="margin-top:10px"><span>Tactic</span><select id="depTactic">${tactics}</select></label>
      <div class="dim" id="depTacticDesc" style="font-size:12px;margin:-4px 0 8px"></div>
      <div style="display:flex;justify-content:space-between;align-items:end;margin-top:6px;gap:10px">
        <div><div class="muted" style="font-size:12px">Your power</div><div class="chance" id="depPower">0</div></div>
        <div style="text-align:right"><div class="muted" style="font-size:12px">Auto-battle win chance <span id="depLoss"></span></div><div class="chance" id="depChance">…</div></div>
      </div>
      <div class="bar good fast" style="margin-top:6px"><i id="depBar"></i></div>
      <p class="note"><b>March</b> sends the army on a timed expedition. Your captains fight with the chosen tactic, and the army comes back by itself.<br>
      <b>Lead the assault</b> starts the battle right now on the battlefield and you give the orders. You get +25% loot and no waiting.</p>`,
      `<button class="btn" data-action="closeModal">Cancel</button>
       <button class="btn teal" data-action="confirmDeploy" data-id="${missionId}" id="depGo">March (${fmtTime(m.duration)})</button>
       <button class="btn primary" data-action="confirmAssault" data-id="${missionId}" id="depLead">⚔ Lead the assault</button>`);
    $$("#modalRoot input[data-unit]").forEach((inp) => inp.addEventListener("input", () => this.refreshDeploy(missionId)));
    $("#depTactic").addEventListener("change", () => this.refreshDeploy(missionId));
    this.refreshDeploy(missionId);
  },
  readDeploy() {
    const s = GameState.current, units = {};
    for (const inp of $$("#modalRoot input[data-unit]")) {
      const id = inp.dataset.unit;
      units[id] = clamp(Math.floor(Number(inp.value) || 0), 0, s.army[id]);
    }
    return units;
  },
  refreshDeploy(missionId) {
    const s = GameState.current, units = this.readDeploy();
    const tactic = $("#depTactic") ? $("#depTactic").value : s.doctrine;
    $("#depTacticDesc").textContent = TACTICS[tactic].desc;
    $("#depPower").textContent = "⚔ " + fmt(Military.power(s, units));
    $("#depGo").disabled = !!Military.deployBlocker(s, missionId, units, false);
    $("#depLead").disabled = !!Military.deployBlocker(s, missionId, units, true);
    $("#depChance").textContent = "…";
    clearTimeout(this._estT);
    this._estT = setTimeout(() => {
      if (!$("#depChance")) return;
      const est = Military.estimate(s, missionId, units, tactic, 10);
      $("#depChance").textContent = Math.round(est.chance * 100) + "%";
      $("#depChance").className = "chance " + (est.chance >= 0.75 ? "good" : est.chance >= 0.45 ? "warn" : "bad");
      $("#depLoss").textContent = `· ~${Math.round(est.losses * 100)}% losses`;
      $("#depBar").style.width = est.chance * 100 + "%";
    }, 200);
  },

  // ---------- battlefield ----------
  openBattle() {
    const s = GameState.current;
    if (!s.battle) return;
    this.closeModal();
    BattleUI.open(s.battle, (b) => this.finishBattle(b));
    this.raidSig = "";
  },
  finishBattle(b) {
    const s = GameState.current;
    if (!s.battle || s.battle !== b) return;
    if (b.phase !== "over") return;
    const rep = Military.conclude(s, b);
    s.battle = null;
    GameState.save();
    this.raidSig = "";
    this.update();
    this.showReport(rep);
  },
  showReport(rep) {
    this.modal(rep.win ? "🏆 Victory!" : "💀 Defeat", `<p><b>${esc(rep.title)}</b></p>
      <div class="kv"><span class="muted">${rep.kind === "raid" ? (rep.win ? "Bounty" : "Plundered") : "Loot"}</span><b>${esc(rep.parts.join(", ") || "none")}</b>
      <span class="muted">Your soldiers lost</span><b class="bad">${rep.lost}</b>
      <span class="muted">Enemies slain</span><b class="good">${rep.slain}</b></div>`, `<button class="btn primary" data-action="closeModal">Onward</button>`);
  },

  // ---------- offline summary ----------
  showOffline(rep) {
    if (!rep) return;
    const lines = Object.entries(rep.delta).filter(([, v]) => Math.abs(v) >= 1).map(([r, v]) =>
      `<span class="cost"><img data-asset="${RESOURCES[r].asset}" alt=""><b class="${v >= 0 ? "good" : "bad"}">${v >= 0 ? "+" : ""}${fmt(v)}</b> ${RESOURCES[r].name}</span>`).join("");
    this.modal("While you were away…", `
      <p>You were gone for <b>${fmtTime(rep.elapsed)}</b>${rep.capped ? ` (progress is capped at ${BALANCE.offlineCapSeconds / 3600}h)` : ""}. Your stewards kept the city running.</p>
      <div class="costs" style="gap:10px 18px;font-size:14px;margin:10px 0">${lines || '<span class="dim">Nothing changed.</span>'}</div>
      <div class="kv">
        <span class="muted">Population change</span><b class="${rep.pop >= 0 ? "good" : "bad"}">${rep.pop >= 0 ? "+" : ""}${rep.pop}</b>
        <span class="muted">Expeditions won / lost</span><b>${rep.won} / ${rep.lost}</b>
        <span class="muted">Raids repelled / lost</span><b>${rep.raidsWon} / ${rep.raidsLost}</b>
        <span class="muted">Commander levels</span><b>+${rep.lvl}</b>
        <span class="muted">Chronicle entries</span><b>${rep.events}</b>
      </div>`, `<button class="btn primary" data-action="closeModal">Rule on</button>`);
  },

  setTab(tab) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    $("#tab-buildings").classList.toggle("hidden", tab !== "buildings");
    $("#tab-workforce").classList.toggle("hidden", tab !== "workforce");
    $("#tab-research").classList.toggle("hidden", tab !== "research");
  },

  async runForge(keys) {
    if (AssetPipeline.busy) return;
    this.saveForgeConfig();
    if (!keys.length) { this.toast("All artwork is already generated."); return; }
    const box = $("#artProgress");
    box.classList.remove("hidden");
    $("#btnGenMissing").disabled = $("#btnGenAll").disabled = true;
    const progress = (done, total, key) => {
      $("#artStatus").textContent = `Generated ${done}/${total} (last: ${key})`;
      $("#artPct").textContent = Math.round((done / total) * 100) + "%";
      $("#artBar").style.width = (done / total) * 100 + "%";
    };
    progress(0, keys.length, "…");
    $("#artStatus").textContent = `Generating ${keys.length} images (10–80 s each)…`;
    try {
      const r = await AssetPipeline.generateBatch(keys, progress);
      const msg = `Artwork Forge: ${r.done - r.failed} images made${r.failed ? `, ${r.failed} failed` : ""}${r.cost ? ` (cost $${r.cost.toFixed(3)})` : ""}.`;
      addLog(GameState.current, msg, r.failed ? "bad" : "good");
      if (r.errors.length) { console.warn(r.errors); this.toast(r.errors[0], 8000); }
      $("#artStatus").textContent = msg;
    } catch (e) {
      this.toast(e.message, 6000);
      $("#artStatus").textContent = e.message;
    } finally {
      $("#btnGenMissing").disabled = $("#btnGenAll").disabled = false;
      this.update();
    }
  },
};

/* ---------- event delegation ---------- */
const Actions = {
  tab: (d) => UI.setTab(d.tab),
  build: (d) => { if (Economy.build(GameState.current, d.id)) UI.update(); },
  assign: (d, e) => {
    const s = GameState.current;
    const delta = d.d === "max" ? 1e9 : d.d === "-max" ? -1e9 : Number(d.d) * (e.shiftKey ? 10 : 1);
    Economy.assign(s, d.id, delta);
    UI.update();
  },
  train: (d) => {
    const s = GameState.current;
    const n = Military.train(s, d.id, d.n === "max" ? 1e6 : Number(d.n));
    if (n) addLog(s, `Began training ${n} ${plural(UNITS[d.id].name, n)}.`, "war");
    UI.update();
  },
  research: (d) => { if (Research.start(GameState.current, d.id)) UI.update(); },
  cancelResearch: () => { Research.cancel(GameState.current); UI.update(); },
  claimQuest: (d) => { if (Quests.claim(GameState.current, d.id)) { UI.toast("Quest reward claimed!"); UI.update(); } },
  bless: (d) => { if (Temple.bless(GameState.current, d.id)) { UI.templeSig = ""; UI.update(); } },
  trade: (d) => {
    const s = GameState.current, r = $("#tradeRes").value;
    const n = d.n === "half" ? s.resources[r] / 2 : Number(d.n);
    const ok = d.op === "sell" ? Market.sell(s, r, n) : Market.buy(s, r, n);
    UI.toast(ok ? `${d.op === "sell" ? "Sold" : "Bought"} ${RESOURCES[r].name}.` : "That trade isn't possible right now (check stock, storage and gold).");
    UI.update();
  },
  acceptOffer: () => { if (Events.accept(GameState.current)) UI.update(); },
  declineOffer: () => { Events.decline(GameState.current); UI.update(); },
  doctrine: (d) => { GameState.current.doctrine = d.id; UI.update(); UI.toast(`Doctrine: ${TACTICS[d.id].name}`); },
  openDeploy: (d) => { UI.openDeploy(d.id); },
  dep: (d) => {
    const inp = $(`#modalRoot input[data-unit="${d.id}"]`);
    inp.value = d.d === "max" ? GameState.current.army[d.id] : 0;
    UI.refreshDeploy($("#depGo").dataset.id);
  },
  confirmDeploy: (d) => {
    if (Military.deploy(GameState.current, d.id, UI.readDeploy(), $("#depTactic").value)) { UI.closeModal(); UI.update(); }
  },
  confirmAssault: (d) => {
    const s = GameState.current;
    if (Military.assault(s, d.id, UI.readDeploy(), $("#depTactic").value)) { UI.closeModal(); UI.update(); UI.openBattle(); }
  },
  leadDefense: () => {
    const s = GameState.current;
    if (Military.leadDefense(s)) { UI.closeModal(); UI.update(); UI.openBattle(); }
  },
  autoDefend: () => {
    const s = GameState.current;
    const rep = Military.autoDefend(s);
    UI.closeModal(); UI.raidSig = ""; UI.update();
    if (rep) UI.showReport(rep);
  },
  raidOdds: () => {
    const est = Military.raidEstimate(GameState.current);
    if (est) UI.toast(`If your captains fight: about ${Math.round(est.chance * 100)}% chance to win, losing about ${Math.round(est.losses * 100)}% of your army.`, 6000);
  },
  resumeBattle: () => UI.openBattle(),
  win: (d) => HUD.openWin(d.win),
  noop: () => {},
  legacyBuy: (d) => { if (Legacy.buy(GameState.current, d.id)) { Sound.play("levelup"); HUD.sig.fame = ""; UI.update(); } },
  ascend: () => {
    const s = GameState.current;
    UI.modal("🔥 Ascend?", `<p>Your realm will be reborn. <b>Your city, army, resources, research, captains, territories and campaign progress are reset.</b></p>
      <p>You keep: <b>👑 ${Legacy.crownsFor(s)} new Crowns</b> (plus ${Legacy.data(s).crowns} unspent), your legacy perks, achievements, titles and equipped gear.</p>`,
      `<button class="btn" data-action="closeModal">Not yet</button><button class="btn primary" data-action="confirmAscend">🔥 Ascend</button>`);
  },
  confirmAscend: () => {
    if (BattleUI.b) BattleUI.close();
    const gain = Legacy.ascend();
    if (gain === false) return;
    UI.closeModal(); HUD.closeWin(); CityView.built = false; CityView.sig = ""; UI.build();
    Sound.play("victory"); UI.toast(`🔥 Reborn! +${gain} Crowns`, 6000);
  },
  letterOpen: (d) => Diplomacy.open(GameState.current, +d.id),
  letterAnswer: (d) => { const m = Diplomacy.answer(GameState.current, +d.id, d.c); if (m) { UI.closeModal(); UI.toast(m, 5000); HUD.sig = {}; UI.update(); } },
  collect: (d, e) => {
    const s = GameState.current, r = Life.collect(s, +d.i);
    if (r) { Sound.play("collect"); Life.flyTo(e.target.closest(".bag"), r.res); Life.bubSig = ""; UI.update(); }
  },
  surprise: (d, e) => {
    const s = GameState.current, r = Life.interact(s);
    if (r === "trader") {
      const o = s.surprise.offer;
      UI.modal("🐫 Wandering Trader", `<div style="display:flex;gap:14px;align-items:center"><img src="${AssetPipeline.src("w_trader")}" alt="" style="width:110px"><p>"Greetings, my lord! Rare goods from the east, cheaper than any market: <b>${fmtInt(o.n)} ${RESOURCES[o.res].name}</b> for only <b>${fmtInt(o.gold)} Gold</b>. Half the market price!"</p></div>`,
        `<button class="btn" data-action="closeModal">No thanks</button><button class="btn primary" data-action="traderBuy" ${s.resources.gold < o.gold ? "disabled" : ""}>Buy</button>`);
    } else if (r) { UI.toast(r); const el = e.target.closest(".surprise,.walker"); if (el && s.surprise === null) el.remove(); }
    Life.bubSig = ""; UI.update();
  },
  traderBuy: () => { if (Life.acceptTrade(GameState.current)) { UI.closeModal(); Life.bubSig = ""; UI.update(); } },
  rushBuild: (d) => { if (Life.rushBuild(GameState.current, +d.i)) { HUD.sig = {}; UI.update(); } },
  rushTrain: () => { if (Life.rushTrain(GameState.current)) { Sound.play("levelup"); HUD.sig.building = ""; UI.update(); } },
  dailyClaim: (d) => { if (Daily.claim(GameState.current, +d.i)) { Sound.play("coin"); HUD.sig.daily = ""; UI.update(); } },
  dailyBonus: () => { if (Daily.claimBonus(GameState.current)) { Sound.play("chest"); HUD.sig.daily = ""; UI.update(); } },
  loginClaim: () => { if (Daily.claimLogin(GameState.current)) { Sound.play("chest"); HUD.sig.daily = ""; UI.update(); } },
  advClose: () => { const t = GameState.current.tutorial; if (t && !t.done && t.step < TUTORIAL.length - 1) return; Advisor.hide(); },
  tutSkip: () => { GameState.current.tutorial.done = true; Advisor.hide(); },
  tutRestart: () => { GameState.current.tutorial = { step: 0, done: false }; HUD.closeWin(); },
  advToggle: () => { try { localStorage.setItem("ironhold_advisor", Advisor.muted() ? "on" : "off"); } catch {} UI.syncSoundUI(); },
  sndMute: () => { Sound.set("muted", !Sound.cfg.muted); UI.syncSoundUI(); },
  capHire: (d) => { if (Captains.hire(GameState.current, d.id)) { HUD.sig.captains = ""; UI.toast(`🎖 ${CAPTAINS[d.id].name} joins you!`); UI.update(); } },
  capToggle: (d) => { if (Captains.toggle(GameState.current, d.id)) { HUD.sig.captains = ""; UI.update(); } },
  rivalBribe: (d) => { if (Rivals.bribe(GameState.current, d.id)) { HUD.sig.rivals = ""; UI.update(); } },
  rivalAttack: (d) => { const s = GameState.current; World.ensure(s); const n = s.world.nodes.find((x) => x.type === "rival" && x.rival === d.id); if (n) { HUD.closeWin(); UI.openDeploy("node:" + n.id); } },
  gearSel: (d) => { HUD.gsel = d.id; HUD.sig.armory = ""; UI.update(); },
  gearEquip: (d) => { if (Armory.equip(GameState.current, d.id)) { HUD.sig.armory = ""; UI.update(); } },
  gearUnequip: (d) => { if (Armory.unequip(GameState.current, d.id)) { HUD.sig.armory = ""; UI.update(); } },
  gearSalvage: (d) => { if (Armory.salvage(GameState.current, d.id)) { HUD.gsel = null; HUD.sig.armory = ""; UI.update(); } },
  closeWin: () => HUD.closeWin(),
  building: (d) => HUD.openBuilding(d.id),
  lot: (d) => HUD.openLot(+d.i),
  mapZoom: (d) => CityView.zoomBy(Number(d.d)),
  buildOn: (d) => { if (City.start(GameState.current, d.id, +d.i)) { HUD.form.pick = null; HUD.openLot(+d.i); UI.update(); } },
  upgradeLot: (d) => { const s = GameState.current; const sl = s.city.slots[+d.i]; if (sl && City.start(s, sl.type, +d.i)) { HUD.sig.building = ""; UI.update(); } },
  demolish: (d) => {
    const i = +d.i, sl = GameState.current.city.slots[i];
    if (!sl) return;
    UI.modal("Demolish?", `<p>Tear down this level ${sl.level} ${BUILDINGS[sl.type].name}? You get nothing back, but the lot becomes free for something else.</p>`,
      `<button class="btn" data-action="closeModal">Cancel</button><button class="btn danger" data-action="confirmDemolish" data-i="${i}">🪓 Demolish</button>`);
  },
  confirmDemolish: (d) => { if (City.demolish(GameState.current, +d.i)) { UI.closeModal(); HUD.closeWin(); HUD.sig = {}; UI.update(); } },
  seat: (d) => { Economy.assign(GameState.current, d.job, Number(d.d)); HUD.sig.building = ""; UI.update(); },
  trainN: (d) => {
    const s = GameState.current, n = Military.train(s, d.id, HUD.form["t_" + d.id] ?? 1);
    if (n) { addLog(s, `Began training ${n} ${plural(UNITS[d.id].name, n)}.`, "war"); UI.toast(`⚔ ${n} ${plural(UNITS[d.id].name, n)} in training`); }
    HUD.sig.building = ""; UI.update();
  },
  release: (d) => { const s = GameState.current; const n = Military.release(s, d.id, HUD.form["r_" + d.id] ?? 1); if (n) UI.toast(`🏳️ ${n} released`); HUD.form["r_" + d.id] = 1; HUD.sig.building = ""; UI.update(); },
  mset: (d) => { HUD.form[d.k] = d.v; HUD.form.mamt = undefined; HUD.sig.building = ""; UI.update(); },
  mdeal: () => {
    const s = GameState.current, r = HUD.form.mres || "food", mode = HUD.form.mmode || "sell", n = HUD.form.mamt ?? 0;
    const ok = mode === "sell" ? Market.sell(s, r, n) : Market.buy(s, r, n);
    UI.toast(ok ? `${mode === "sell" ? "Sold" : "Bought"} ${fmtInt(n)} ${RESOURCES[r].name}` : "That trade isn't possible right now.");
    HUD.form.mamt = undefined; HUD.sig.building = ""; UI.update();
  },
  questOpen: (d) => { HUD.qsel = d.id; if (HUD.open !== "campaign") HUD.openWin("campaign"); else { HUD.sig.campaign = ""; UI.update(); } },
  turnIn: (d) => { if (Campaign.turnIn(GameState.current, d.id)) { const nx = Campaign.current(GameState.current); if (nx) HUD.qsel = nx; HUD.sig = {}; UI.toast("Quest complete! Rewards collected."); UI.update(); } },
  chatTab: (d) => { $$(".chat-tab[data-tab]").forEach((t) => t.classList.toggle("active", t.dataset.tab === d.tab)); const c = $("#chat"); c.classList.remove("f-war", "f-realm"); if (d.tab !== "all") c.classList.add("f-" + d.tab); },
  chatToggle: () => $("#chat").classList.toggle("min"),
  worldMap: () => { UI.closeModal(); WorldUI.show(); },
  recall: (d) => { Military.recall(GameState.current, Number(d.id)); UI.update(); },
  closeModal: () => UI.closeModal(),
  closeModalBg: (d, e) => { if (e.target.classList.contains("modal-back")) UI.closeModal(); },
  clearLog: () => { GameState.current.log = []; $("#log").innerHTML = ""; },
  save: () => { UI.markSaved(GameState.save(), false); UI.toast("Game saved."); },
  export: () => {
    const str = GameState.exportString();
    UI.modal("Export Save", `<p class="muted" style="margin-top:0">Copy this text somewhere safe, or download it as a file. Your API key is never part of the save.</p>
      <textarea readonly id="exportBox">${str}</textarea>`,
      `<button class="btn" data-action="copyExport">Copy</button><button class="btn primary" data-action="downloadExport">Download .txt</button>`);
    $("#exportBox").select();
  },
  copyExport: async () => {
    const box = $("#exportBox");
    try { await navigator.clipboard.writeText(box.value); UI.toast("Save copied to clipboard."); }
    catch { box.select(); document.execCommand("copy"); UI.toast("Save copied."); }
  },
  downloadExport: () => {
    const blob = new Blob([$("#exportBox").value], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ironhold-save-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => {
    UI.modal("Import Save", `<p class="muted" style="margin-top:0">Paste an exported save string below, or choose a save file.</p>
      <textarea id="importBox" placeholder="Paste save here…"></textarea>
      <input type="file" id="importFile" accept=".txt,.json" style="margin-top:8px;font-size:12px;color:var(--muted)">`,
      `<button class="btn" data-action="closeModal">Cancel</button><button class="btn primary" data-action="confirmImport">Import</button>`);
    $("#importFile").addEventListener("change", async (e) => { const f = e.target.files[0]; if (f) $("#importBox").value = await f.text(); });
  },
  confirmImport: () => {
    try {
      const s = GameState.importString($("#importBox").value);
      s.lastTick = Date.now();
      if (BattleUI.b) BattleUI.close();
      GameState.current = s;
      addLog(s, "Save imported. Long live the realm!", "info");
      GameState.save();
      UI.closeModal();
      UI.build();
      UI.toast("Save imported.");
    } catch (e) { UI.toast("Import failed: " + e.message, 5000); }
  },
  reset: () => UI.modal("Reset Realm?", `<p>This deletes your progress for good. Export your save first if you want to keep it.</p>`,
    `<button class="btn" data-action="closeModal">Cancel</button><button class="btn danger" data-action="confirmReset">Reset everything</button>`),
  confirmReset: () => {
    if (BattleUI.b) BattleUI.close();
    GameState.current = GameState.newGame();
    addLog(GameState.current, "A new dominion begins. Assign workers and build up your city!", "info");
    GameState.save();
    UI.closeModal();
    UI.build();
  },
  genMissing: () => UI.runForge(AssetPipeline.missingKeys()),
  genAll: () => UI.runForge(AssetPipeline.allKeys()),
  clearArt: async () => { await AssetPipeline.clearCache(); UI.toast("Browser art cache cleared."); },
};
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const fn = Actions[el.dataset.action];
  if (fn) fn(el.dataset, e);
});
document.addEventListener("keydown", (e) => {
  if (BattleUI.b || (typeof WorldUI !== "undefined" && WorldUI.open)) return;
  if (e.key === "Escape") { if ($("#modalRoot .modal")) UI.closeModal(); else HUD.closeWin(); return; }
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target.tagName || "")) || e.ctrlKey || e.metaKey || e.altKey || $("#modalRoot .modal")) return;
  const a = HUD_ACTIONS.find((x) => x.key === e.key);
  if (a) { e.preventDefault(); HUD.openWin(a.id); }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "titleSel") { Legacy.data(GameState.current).title = e.target.value; UI.update(); }
});
document.addEventListener("input", (e) => {
  const snd = e.target.closest("[data-snd]");
  if (snd) { Sound.set(snd.dataset.snd, Number(snd.value) / 100); return; }
  const el = e.target.closest("[data-form]");
  if (!el) return;
  const k = el.dataset.form, v = Number(el.value);
  HUD.form[k] = v;
  $$(`[data-fv="${k}"],[data-fv2="${k}"]`).forEach((x) => (x.textContent = k === "mamt" ? fmtInt(v) : v));
  if (k === "mamt") {
    const s = GameState.current, r = HUD.form.mres || "food", mode = HUD.form.mmode || "sell";
    const t = $('[data-mtot="1"]'); if (t) t.textContent = fmtInt(v * (mode === "sell" ? Market.sellPrice(s, r) : Market.buyPrice(s, r)));
  }
});
window.addEventListener("beforeunload", () => GameState.save());
document.addEventListener("visibilitychange", () => { if (document.hidden) GameState.save(); });
