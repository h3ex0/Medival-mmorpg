"use strict";
/* =====================================================================
   5. ENGINE MODULE (game loop, offline progress, autosave)
   ===================================================================== */
const Engine = {
  intervalId: null,
  lastReal: 0,
  lastSave: 0,

  /** One simulation step of dt seconds. */
  tick(s, dt) {
    s.time += dt;
    s.stats.playSeconds += dt;
    const shortage = Economy.step(s, dt);
    Military.step(s, dt, shortage);
    Research.step(s, dt);
    City.step(s, dt * Climate.season(s).build * (Events.active(s, "blizzard") ? 0.4 : 1));
    Events.step(s);
    Climate.step(s);
    Rivals.step(s, dt);
    World.step(s);
    Life.step(s, dt);
  },

  /** Simulate a long gap in chunks so expeditions and starvation resolve in the right order. */
  simulate(s, seconds) {
    const step = BALANCE.offlineStepSeconds;
    let left = seconds;
    this.simulating = true;
    try {
      while (left > 0) {
        const dt = Math.min(step, left);
        this.tick(s, dt);
        left -= dt;
      }
    } finally { this.simulating = false; }
  },

  /** On load: award progress made while the game was closed (capped). */
  offlineProgress(s) {
    const elapsed = (Date.now() - (s.lastTick || Date.now())) / 1000;
    if (elapsed < 5) return null;
    const secs = Math.min(elapsed, BALANCE.offlineCapSeconds);
    const before = { ...s.resources, pop: Economy.totalPop(s), won: s.stats.won, lost: s.stats.lost, lvl: s.commander.level, rw: s.stats.raidsWon, rl: s.stats.raidsLost };
    const logLen = s.nextId;
    this.simulate(s, secs);
    s.lastTick = Date.now();
    return {
      elapsed, secs, capped: elapsed > BALANCE.offlineCapSeconds,
      delta: Object.fromEntries(Object.keys(RESOURCES).map((r) => [r, s.resources[r] - before[r]])),
      pop: Economy.totalPop(s) - before.pop,
      won: s.stats.won - before.won, lost: s.stats.lost - before.lost, raidsWon: s.stats.raidsWon - before.rw, raidsLost: s.stats.raidsLost - before.rl,
      lvl: s.commander.level - before.lvl,
      events: s.log.filter((l) => l.id >= logLen).length,
    };
  },

  start() {
    this.lastReal = Date.now();
    this.lastSave = Date.now();
    clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.loop(), BALANCE.tickSeconds * 1000);
  },
  loop() {
    const s = GameState.current;
    const now = Date.now();
    let dt = (now - this.lastReal) / 1000;
    this.lastReal = now;
    if (dt <= 0) return;
    dt = Math.min(dt, BALANCE.offlineCapSeconds);
    // Background tabs throttle timers; long gaps go through the chunked simulator.
    if (dt > 3) this.simulate(s, dt); else this.tick(s, dt);
    s.lastTick = now;
    if (now - this.lastSave >= BALANCE.autosaveMs) { this.lastSave = now; UI.markSaved(GameState.save(), true); }
    UI.update();
  },
};
