"use strict";
/* =====================================================================
   PROGRESSION: daily quests and login rewards
   ===================================================================== */
const DAILY_POOL = {
  collect: { text: (n) => `Collect ${n} building bonuses`, stat: (s) => s.stats.collected || 0, need: (th) => 6 + th },
  battles: { text: (n) => `Win ${n} battles`, stat: (s) => s.stats.won + s.stats.raidsWon, need: (th) => 2 + Math.floor(th / 4) },
  train:   { text: (n) => `Train ${n} soldiers`, stat: (s) => s.stats.trained, need: (th) => 10 + th * 5 },
  build:   { text: (n) => `Finish ${n} constructions`, stat: (s) => s.stats.built, need: (th) => 3 + Math.floor(th / 3) },
  trade:   { text: (n) => `Make ${n} trades`, stat: (s) => s.stats.trades, need: () => 3 },
  surprise:{ text: (n) => `Deal with ${n} surprises in town (chests, thieves, traders, fires)`, stat: (s) => s.stats.surprises || 0, need: () => 2 },
  slay:    { text: (n) => `Slay ${n} enemies`, stat: (s) => s.stats.enemiesSlain, need: (th) => 30 + th * 20 },
};
const LOGIN_REWARDS = [
  { gold: 1 }, { food: 1, wood: 1 }, { stone: 1, steel: 0.5 }, { gold: 2 }, { steel: 1, wood: 1 }, { gold: 2, food: 2 }, { relics: 3, gear: "epic" },
];
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const Daily = {
  /** Make sure today's tasks exist; called every tick (cheap). */
  ensure(s) {
    const today = todayStr();
    const d = s.daily || (s.daily = { date: "", tasks: [], streak: 0, lastLogin: "", loginClaimed: false });
    if (d.date === today) return d;
    const th = s.buildings.townhall;
    const ids = Object.keys(DAILY_POOL).sort(() => Math.random() - 0.5).slice(0, 3);
    d.tasks = ids.map((id) => ({ id, base: DAILY_POOL[id].stat(s), need: DAILY_POOL[id].need(th), claimed: false }));
    const y = new Date(Date.now() - 864e5);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    d.streak = d.lastLogin === yesterday ? (d.streak % 7) + 1 : 1;
    d.lastLogin = today; d.loginClaimed = false; d.date = today; d.bonusClaimed = false;
    return d;
  },
  progress(s, t) { return Math.min(t.need, DAILY_POOL[t.id].stat(s) - t.base); },
  scale(s) { return 150 * Math.pow(1.6, s.buildings.townhall - 1); },
  taskReward(s) { const k = this.scale(s); return { gold: Math.round(k * 2), steel: Math.round(k * 0.15) }; },
  claim(s, i) {
    const t = s.daily.tasks[i];
    if (!t || t.claimed || this.progress(s, t) < t.need) return false;
    t.claimed = true;
    Economy.grant(s, this.taskReward(s));
    addLog(s, `📅 Daily quest complete: ${DAILY_POOL[t.id].text(t.need)}.`, "good");
    return true;
  },
  allDone(s) { return s.daily.tasks.length && s.daily.tasks.every((t) => t.claimed); },
  claimBonus(s) {
    if (!this.allDone(s) || s.daily.bonusClaimed) return false;
    s.daily.bonusClaimed = true;
    s.resources.relics += 1; s.stats.relicsFound++;
    Armory.drop(s, s.buildings.townhall + 2, 1, "rare");
    addLog(s, "📅 All daily quests done! Bonus chest: 1 Relic and a piece of gear.", "good");
    return true;
  },
  loginReward(s, day) {
    const R = LOGIN_REWARDS[day - 1], k = this.scale(s), out = {};
    for (const [r, v] of Object.entries(R)) if (r !== "gear") out[r] = r === "relics" ? v : Math.round(v * k * 2);
    return out;
  },
  claimLogin(s) {
    const d = s.daily;
    if (d.loginClaimed) return false;
    d.loginClaimed = true;
    const rw = this.loginReward(s, d.streak), { relics, ...rest } = rw;
    Economy.grant(s, rest);
    if (relics) { s.resources.relics += relics; s.stats.relicsFound += relics; }
    if (LOGIN_REWARDS[d.streak - 1].gear) Armory.drop(s, s.buildings.townhall + 4, 1, LOGIN_REWARDS[d.streak - 1].gear);
    addLog(s, `🎁 Day ${d.streak} login reward: ${Quests.rewardText(rw)}${LOGIN_REWARDS[d.streak - 1].gear ? " and Epic gear" : ""}.`, "good");
    return true;
  },
  claimable(s) {
    const d = s.daily;
    if (!d || !d.tasks) return 0;
    return (d.loginClaimed ? 0 : 1) + d.tasks.filter((t) => !t.claimed && this.progress(s, t) >= t.need).length + (this.allDone(s) && !d.bonusClaimed ? 1 : 0);
  },
  html(s) {
    const d = s.daily;
    const cal = LOGIN_REWARDS.map((R, k) => {
      const day = k + 1, state = day < d.streak ? "past" : day === d.streak ? (d.loginClaimed ? "past" : "today") : "future";
      const rw = this.loginReward(s, day);
      return `<div class="lday ${state}"><small>Day ${day}</small><div>${Object.entries(rw).map(([r, v]) => `<span><img class="inl" src="${AssetPipeline.src(RESOURCES[r].asset)}" alt="">${fmt(v)}</span>`).join("")}${R.gear ? "<span>🎁</span>" : ""}</div>${state === "past" ? "<i>✓</i>" : ""}</div>`;
    }).join("");
    const tasks = d.tasks.map((t, i) => {
      const p = this.progress(s, t), done = p >= t.need;
      return `<div class="quest ${done ? "done" : ""}"><div style="flex:1"><div>${t.claimed ? "✅" : done ? "⭐" : "▫️"} ${esc(DAILY_POOL[t.id].text(t.need))}</div>
        <div class="bar teal fast" style="margin:4px 0"><i style="width:${(p / t.need) * 100}%"></i></div><div class="dim" style="font-size:11px">${fmtInt(p)} / ${fmtInt(t.need)} · Reward: ${Quests.rewardText(this.taskReward(s))}</div></div>
        ${done && !t.claimed ? `<button class="btn sm primary" data-action="dailyClaim" data-i="${i}">Claim</button>` : ""}</div>`;
    }).join("");
    return `<div class="section-title">🎁 Daily login · day ${d.streak} of 7</div><div class="logincal">${cal}</div>
      ${d.loginClaimed ? "" : `<button class="btn primary" data-action="loginClaim" style="margin:6px 0 10px">Claim today's reward</button>`}
      <div class="section-title">📅 Daily quests <span class="dim" style="text-transform:none;letter-spacing:0">(new ones every day)</span></div>${tasks}
      ${this.allDone(s) && !d.bonusClaimed ? `<button class="btn primary" data-action="dailyBonus">🎁 Open the bonus chest</button>` : `<div class="dim" style="font-size:12px;margin-bottom:8px">Finish all three for a bonus chest (Relic + gear).</div>`}
      <div class="section-title" style="margin-top:12px">❗ Realm quests</div>`;
  },
};
